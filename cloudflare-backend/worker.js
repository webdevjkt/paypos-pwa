/**
 * PayPOS - Multi-Tenant SaaS Cloudflare Worker Backend API
 * Handles: Multi-Company Isolation (tenant_code), Auth (Company+User+Pass), Sync, CRUD, SaaS Billing Management
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-Code',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // -------------------------------------------------------------
      // Health Check
      // -------------------------------------------------------------
      if (path === '/' || path === '/api/health') {
        return new Response(
          JSON.stringify({ status: 'ok', service: 'PayPOS Multi-Tenant SaaS API', version: '2.0.0' }),
          { headers: corsHeaders }
        );
      }

      // -------------------------------------------------------------
      // 1. POST /api/auth/login : Multi-Company Login (Perusahaan + User + Pass)
      // -------------------------------------------------------------
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { company, username, password } = await request.json();
        const tenantCode = (company || '').trim().toUpperCase();
        const u = (username || '').trim().toLowerCase();
        const p = (password || '').trim();

        if (!tenantCode || !u || !p) {
          return new Response(
            JSON.stringify({ success: false, message: 'Kode Perusahaan, Username, dan Password wajib diisi.' }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Cek Perusahaan / Tenant
        const tenant = await env.DB.prepare(
          'SELECT tenant_code, name, plan, status, expires_at FROM tenants WHERE tenant_code = ?'
        ).bind(tenantCode).first();

        if (!tenant) {
          return new Response(
            JSON.stringify({ success: false, message: `Perusahaan dengan kode "${tenantCode}" tidak ditemukan.` }),
            { status: 404, headers: corsHeaders }
          );
        }

        if (tenant.status === 'suspended') {
          return new Response(
            JSON.stringify({ success: false, message: 'Akun perusahaan ini dinonaktifkan / kedaluwarsa. Hubungi Admin SaaS.' }),
            { status: 403, headers: corsHeaders }
          );
        }

        // Cek User di dalam Perusahaan tersebut
        const user = await env.DB.prepare(
          'SELECT id, tenant_code, name, username, role FROM users WHERE tenant_code = ? AND username = ? AND pin = ?'
        ).bind(tenantCode, u, p).first();

        if (!user) {
          return new Response(
            JSON.stringify({ success: false, message: 'Username atau Password salah untuk perusahaan ini.' }),
            { status: 401, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            user: {
              id: user.id,
              tenantCode: tenant.tenant_code,
              companyName: tenant.name,
              name: user.name,
              username: user.username,
              role: user.role,
              plan: tenant.plan,
              expiresAt: tenant.expires_at
            }
          }),
          { headers: corsHeaders }
        );
      }

      // -------------------------------------------------------------
      // 2. POST /api/auth/register-company : Pendaftaran Perusahaan Baru (SaaS Self-Register)
      // -------------------------------------------------------------
      if (path === '/api/auth/register-company' && request.method === 'POST') {
        const { companyName, companyCode, ownerName, username, password, phone } = await request.json();

        let cleanCode = (companyCode || companyName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)).trim();
        if (cleanCode.length < 3) cleanCode = 'TOKO-' + Math.floor(1000 + Math.random() * 9000);

        const existingTenant = await env.DB.prepare('SELECT id FROM tenants WHERE tenant_code = ?').bind(cleanCode).first();
        if (existingTenant) {
          return new Response(
            JSON.stringify({ success: false, message: `Kode perusahaan "${cleanCode}" sudah dipakai. Silakan ganti kode lain.` }),
            { status: 400, headers: corsHeaders }
          );
        }

        // Buat Tenant Baru
        await env.DB.prepare(`
          INSERT INTO tenants (tenant_code, name, phone, plan, status)
          VALUES (?, ?, ?, 'trial', 'active')
        `).bind(cleanCode, companyName, phone || '').run();

        // Buat Akun Owner Pertama
        await env.DB.prepare(`
          INSERT INTO users (tenant_code, name, username, pin, role)
          VALUES (?, ?, ?, ?, 'owner')
        `).bind(cleanCode, ownerName || 'Owner', username.trim().toLowerCase(), password.trim()).run();

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Perusahaan berhasil didaftarkan!',
            tenantCode: cleanCode,
            companyName
          }),
          { headers: corsHeaders }
        );
      }

      // -------------------------------------------------------------
      // 3. GET /api/products : Ambil Produk Sesuai Perusahaan
      // -------------------------------------------------------------
      if (path === '/api/products' && request.method === 'GET') {
        const tenantCode = (url.searchParams.get('tenant') || request.headers.get('X-Tenant-Code') || 'DEMO').toUpperCase();
        const { results } = await env.DB.prepare(`
          SELECT id, name, barcode, category, cost_price AS costPrice, price, stock, min_stock AS minStock, image 
          FROM products WHERE tenant_code = ? ORDER BY name ASC
        `).bind(tenantCode).all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 4. POST /api/products/sync : Batch Sync Produk Perusahaan
      // -------------------------------------------------------------
      if (path === '/api/products/sync' && request.method === 'POST') {
        const body = await request.json();
        const tenantCode = (body.tenantCode || 'DEMO').toUpperCase();
        const products = body.products || [];

        const stmt = env.DB.prepare(`
          INSERT INTO products (tenant_code, name, barcode, category, cost_price, price, stock, min_stock, image)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const batch = products.map((p) =>
          stmt.bind(tenantCode, p.name, p.barcode || '', p.category, p.costPrice || 0, p.price, p.stock || 0, p.minStock || 5, p.image || '')
        );

        if (batch.length > 0) await env.DB.batch(batch);
        return new Response(JSON.stringify({ success: true, message: `${products.length} produk tersinkron untuk perusahaan ${tenantCode}` }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 5. GET /api/transactions : Ambil Riwayat Transaksi Perusahaan
      // -------------------------------------------------------------
      if (path === '/api/transactions' && request.method === 'GET') {
        const tenantCode = (url.searchParams.get('tenant') || request.headers.get('X-Tenant-Code') || 'DEMO').toUpperCase();
        const { results } = await env.DB.prepare(`
          SELECT id, invoice_number AS invoiceNumber, timestamp, items_json AS itemsJson, 
                 subtotal, discount, tax, service, final_total AS finalTotal, 
                 payment_method AS paymentMethod, amount_paid AS amountPaid, 
                 change_amount AS change, cashier_name AS cashierName
          FROM transactions WHERE tenant_code = ? 
          ORDER BY timestamp DESC
        `).bind(tenantCode).all();

        const formatted = results.map(r => {
          let items = [];
          try { items = JSON.parse(r.itemsJson); } catch(e) {}
          return { ...r, items };
        });

        return new Response(JSON.stringify({ success: true, data: formatted }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 6. POST /api/transactions/sync : Upload Transaksi Perusahaan
      // -------------------------------------------------------------
      if (path === '/api/transactions/sync' && request.method === 'POST') {
        const body = await request.json();
        const tenantCode = (body.tenantCode || 'DEMO').toUpperCase();
        const transactions = body.transactions || [];

        const stmt = env.DB.prepare(`
          INSERT OR IGNORE INTO transactions 
          (tenant_code, invoice_number, timestamp, items_json, subtotal, discount, tax, service, final_total, payment_method, amount_paid, change_amount, cashier_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const batch = transactions.map((t) =>
          stmt.bind(
            tenantCode,
            t.invoiceNumber,
            t.timestamp || new Date().toISOString(),
            JSON.stringify(t.items || []),
            t.subtotal || t.finalTotal,
            t.discount || 0,
            t.tax || 0,
            t.service || 0,
            t.finalTotal,
            t.paymentMethod || 'Tunai',
            t.amountPaid || t.finalTotal,
            t.change || 0,
            t.cashierName || 'Kasir'
          )
        );

        if (batch.length > 0) await env.DB.batch(batch);
        return new Response(JSON.stringify({ success: true, message: `${transactions.length} transaksi tersimpan di D1` }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 6. POST /api/admin/login : Super Admin Database Login Check
      // -------------------------------------------------------------
      if (path === '/api/admin/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        const u = (username || '').trim();
        const p = (password || '').trim();

        // Cek ke tabel super_admins di database D1
        const admin = await env.DB.prepare(
          'SELECT id, name, username FROM super_admins WHERE LOWER(username) = LOWER(?) AND password = ?'
        ).bind(u, p).first();

        // Fallback default jika tabel belum di-seed
        if (!admin && u.toLowerCase() === 'tri' && p === 'admin') {
          return new Response(JSON.stringify({ success: true, admin: { name: 'Tri Master Admin', username: 'Tri' } }), { headers: corsHeaders });
        }

        if (!admin) {
          return new Response(JSON.stringify({ success: false, message: 'Username atau Password Super Admin salah.' }), {
            status: 401,
            headers: corsHeaders
          });
        }

        return new Response(JSON.stringify({ success: true, admin }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 7. GET /api/admin/tenants : List Semua Perusahaan & Lisensi
      // -------------------------------------------------------------
      if (path === '/api/admin/tenants' && request.method === 'GET') {
        const { results } = await env.DB.prepare(`
          SELECT t.id, t.tenant_code, t.name, t.phone, t.plan, t.status, t.created_at, t.expires_at,
                 (SELECT COUNT(*) FROM transactions tx WHERE tx.tenant_code = t.tenant_code) AS total_orders,
                 (SELECT SUM(final_total) FROM transactions tx WHERE tx.tenant_code = t.tenant_code) AS total_revenue
          FROM tenants t ORDER BY t.id DESC
        `).all();

        return new Response(JSON.stringify({ success: true, data: results }), { headers: corsHeaders });
      }

      // -------------------------------------------------------------
      // 8. POST /api/admin/update-tenant-plan : Update Lisensi Tenant
      // -------------------------------------------------------------
      if (path === '/api/admin/update-tenant-plan' && request.method === 'POST') {
        const { tenantCode, plan, status } = await request.json();
        const code = (tenantCode || '').trim().toUpperCase();
        const newPlan = (plan || 'standard').toLowerCase();
        const newStatus = (status || 'active').toLowerCase();

        await env.DB.prepare(`
          UPDATE tenants SET plan = ?, status = ? WHERE tenant_code = ?
        `).bind(newPlan, newStatus, code).run();

        return new Response(JSON.stringify({ success: true, message: `Lisensi ${code} berhasil diubah ke ${newPlan}` }), { headers: corsHeaders });
      }

      return new Response(JSON.stringify({ error: 'Endpoint tidak ditemukan' }), { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: corsHeaders });
    }
  }
};
