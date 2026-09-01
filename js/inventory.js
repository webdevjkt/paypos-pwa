/**
 * PayPOS - Inventory & Stock Management Module
 * Sub-modules:
 * 1. Barang Masuk (Restock / Inbound Goods)
 * 2. Barang Keluar (Write-off / Damaged / Return)
 * 3. Stock Opname (Physical Inventory Adjustment)
 * 4. Kartu Stok (Stock Card Movement Ledger)
 */

class InventoryManager {
  constructor() {
    this.currentSubTab = 'inbound';
    this.products = [];
    this.mutations = [];
    this.selectedStockCardProductId = null;
  }

  async init() {
    this.bindEvents();
    await this.loadData();
  }

  bindEvents() {
    // Sub-tab Navigation
    document.querySelectorAll('.inv-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-inv-tab');
        this.switchSubTab(tab);
      });
    });

    // Form Barang Masuk
    const formInbound = document.getElementById('form-stock-inbound');
    if (formInbound) {
      formInbound.addEventListener('submit', (e) => this.handleSaveInbound(e));
    }

    // Form Barang Keluar
    const formOutbound = document.getElementById('form-stock-outbound');
    if (formOutbound) {
      formOutbound.addEventListener('submit', (e) => this.handleSaveOutbound(e));
    }

    // Form Stock Opname
    const formOpname = document.getElementById('form-stock-opname');
    if (formOpname) {
      formOpname.addEventListener('submit', (e) => this.handleSaveOpname(e));
    }

    // Filter Kartu Stok Produk
    const cardProdSelect = document.getElementById('stock-card-product-select');
    if (cardProdSelect) {
      cardProdSelect.addEventListener('change', (e) => {
        this.selectedStockCardProductId = e.target.value ? parseInt(e.target.value, 10) : null;
        this.renderStockCardTable();
      });
    }

    // Realtime calculation for Stock Opname difference
    const opnameSelect = document.getElementById('opname-product-select');
    const opnameRealInput = document.getElementById('opname-real-stock');
    if (opnameSelect && opnameRealInput) {
      const updateOpnameDiff = () => {
        const prodId = parseInt(opnameSelect.value, 10);
        const prod = this.products.find((p) => p.id === prodId);
        const systemStockEl = document.getElementById('opname-system-stock');
        const diffStockEl = document.getElementById('opname-diff-stock');

        if (prod) {
          const sysStock = Number(prod.stock) || 0;
          if (systemStockEl) systemStockEl.textContent = `${sysStock} pcs`;

          const realStock = parseFloat(opnameRealInput.value);
          if (!isNaN(realStock) && diffStockEl) {
            const diff = realStock - sysStock;
            diffStockEl.textContent = `${diff > 0 ? '+' : ''}${diff} pcs`;
            diffStockEl.style.color = diff === 0 ? '#059669' : diff > 0 ? '#0284c7' : '#ef4444';
          }
        }
      };

      opnameSelect.addEventListener('change', updateOpnameDiff);
      opnameRealInput.addEventListener('input', updateOpnameDiff);
    }
  }

  switchSubTab(tabName) {
    this.currentSubTab = tabName;
    document.querySelectorAll('.inv-subtab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-inv-tab') === tabName);
    });

    document.querySelectorAll('.inv-subtab-panel').forEach((panel) => {
      panel.style.display = panel.id === `inv-panel-${tabName}` ? 'block' : 'none';
    });

    if (tabName === 'card') {
      this.renderStockCardTable();
    }
  }

  async loadData() {
    this.products = await window.payposDB.getAll('products');
    this.mutations = await window.payposDB.getAll('stock_mutations');
    this.populateProductDropdowns();
    this.renderInboundTable();
    this.renderOutboundTable();
    this.renderOpnameTable();
    this.renderStockCardTable();
  }

  populateProductDropdowns() {
    const selects = [
      document.getElementById('inbound-product-select'),
      document.getElementById('outbound-product-select'),
      document.getElementById('opname-product-select'),
      document.getElementById('stock-card-product-select')
    ];

    const sorted = [...this.products].sort((a, b) => a.name.localeCompare(b.name));

    selects.forEach((sel) => {
      if (!sel) return;
      const isFilter = sel.id === 'stock-card-product-select';
      let html = isFilter ? '<option value="">-- Semua Produk (Pilih Produk) --</option>' : '<option value="">-- Pilih Produk --</option>';

      sorted.forEach((p) => {
        html += `<option value="${p.id}">${p.name} (Stok Saat Ini: ${p.stock})</option>`;
      });

      sel.innerHTML = html;
    });
  }

  /* -------------------------------------------------------------
   * 1. BARANG MASUK (RESTOCK / INBOUND)
   * ----------------------------------------------------------- */
  async handleSaveInbound(e) {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('inbound-product-select').value, 10);
    const qty = parseFloat(document.getElementById('inbound-qty').value);
    const notes = document.getElementById('inbound-notes').value.trim() || 'Barang Masuk / Pembelian Supplier';
    const supplier = document.getElementById('inbound-supplier').value.trim() || 'Supplier Umum';

    if (!prodId || isNaN(qty) || qty <= 0) {
      window.payposApp.showToast('Pilih produk dan masukkan jumlah yang valid', 'error');
      return;
    }

    const prod = await window.payposDB.getById('products', prodId);
    if (!prod) return;

    const initialStock = Number(prod.stock) || 0;
    const finalStock = initialStock + qty;

    // 1. Update stock di produk
    prod.stock = finalStock;
    await window.payposDB.update('products', prod);

    // 2. Simpan riwayat mutasi
    const mutation = {
      productId: prod.id,
      productName: prod.name,
      type: 'INBOUND',
      typeLabel: '📥 Barang Masuk',
      qty: qty,
      initialStock,
      finalStock,
      reference: supplier,
      notes,
      timestamp: new Date().toISOString(),
      user: (window.payposApp.currentUser ? window.payposApp.currentUser.name : 'Staff')
    };

    await window.payposDB.add('stock_mutations', mutation);

    window.payposAudio.playSuccess();
    window.payposApp.showToast(`✅ Berhasil restock ${qty} pcs untuk ${prod.name}!`, 'success');

    document.getElementById('form-stock-inbound').reset();
    await this.loadData();
    if (window.productManager) window.productManager.loadData();
  }

  renderInboundTable() {
    const tbody = document.getElementById('inbound-table-body');
    if (!tbody) return;

    const inbounds = this.mutations.filter((m) => m.type === 'INBOUND').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (inbounds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Belum ada riwayat barang masuk.</td></tr>';
      return;
    }

    tbody.innerHTML = inbounds.slice(0, 15).map((m) => {
      const dateStr = new Date(m.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td><small style="color: var(--text-muted);">${dateStr}</small></td>
          <td><strong>${m.productName}</strong></td>
          <td><span class="status-badge" style="background: #ecfdf5; color: #065f46; font-weight: 800;">+${m.qty} pcs</span></td>
          <td>${m.initialStock} ➔ <strong>${m.finalStock}</strong></td>
          <td>${m.reference || '-'}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${m.notes || '-'}</span></td>
        </tr>
      `;
    }).join('');
  }

  /* -------------------------------------------------------------
   * 2. BARANG KELUAR (OUTBOUND / DAMAGED / RETURN)
   * ----------------------------------------------------------- */
  async handleSaveOutbound(e) {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('outbound-product-select').value, 10);
    const qty = parseFloat(document.getElementById('outbound-qty').value);
    const reason = document.getElementById('outbound-reason').value || 'Rusak / Kadaluarsa';
    const notes = document.getElementById('outbound-notes').value.trim() || reason;

    if (!prodId || isNaN(qty) || qty <= 0) {
      window.payposApp.showToast('Pilih produk dan masukkan jumlah yang valid', 'error');
      return;
    }

    const prod = await window.payposDB.getById('products', prodId);
    if (!prod) return;

    const initialStock = Number(prod.stock) || 0;
    if (qty > initialStock) {
      window.payposApp.showToast(`Jumlah keluar (${qty}) melebihi stok saat ini (${initialStock})`, 'error');
      return;
    }

    const finalStock = Math.max(0, initialStock - qty);

    // 1. Update stock
    prod.stock = finalStock;
    await window.payposDB.update('products', prod);

    // 2. Simpan mutasi
    const mutation = {
      productId: prod.id,
      productName: prod.name,
      type: 'OUTBOUND',
      typeLabel: '📤 Barang Keluar',
      qty: -qty,
      initialStock,
      finalStock,
      reference: reason,
      notes,
      timestamp: new Date().toISOString(),
      user: (window.payposApp.currentUser ? window.payposApp.currentUser.name : 'Staff')
    };

    await window.payposDB.add('stock_mutations', mutation);

    window.payposAudio.playSuccess();
    window.payposApp.showToast(`✅ Barang keluar ${qty} pcs dicatat untuk ${prod.name}`, 'success');

    document.getElementById('form-stock-outbound').reset();
    await this.loadData();
    if (window.productManager) window.productManager.loadData();
  }

  renderOutboundTable() {
    const tbody = document.getElementById('outbound-table-body');
    if (!tbody) return;

    const outbounds = this.mutations.filter((m) => m.type === 'OUTBOUND').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (outbounds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Belum ada riwayat barang keluar.</td></tr>';
      return;
    }

    tbody.innerHTML = outbounds.slice(0, 15).map((m) => {
      const dateStr = new Date(m.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <tr>
          <td><small style="color: var(--text-muted);">${dateStr}</small></td>
          <td><strong>${m.productName}</strong></td>
          <td><span class="status-badge" style="background: #fee2e2; color: #b91c1c; font-weight: 800;">${m.qty} pcs</span></td>
          <td>${m.initialStock} ➔ <strong>${m.finalStock}</strong></td>
          <td>${m.reference || '-'}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${m.notes || '-'}</span></td>
        </tr>
      `;
    }).join('');
  }

  /* -------------------------------------------------------------
   * 3. STOCK OPNAME (PHYSICAL STOCK ADJUSTMENT)
   * ----------------------------------------------------------- */
  async handleSaveOpname(e) {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('opname-product-select').value, 10);
    const realStock = parseFloat(document.getElementById('opname-real-stock').value);
    const notes = document.getElementById('opname-notes').value.trim() || 'Penyesuaian Fisik Stock Opname';

    if (!prodId || isNaN(realStock) || realStock < 0) {
      window.payposApp.showToast('Pilih produk dan masukkan jumlah fisik stok yang valid', 'error');
      return;
    }

    const prod = await window.payposDB.getById('products', prodId);
    if (!prod) return;

    const initialStock = Number(prod.stock) || 0;
    const diff = realStock - initialStock;

    // 1. Update stock produk
    prod.stock = realStock;
    await window.payposDB.update('products', prod);

    // 2. Simpan mutasi opname
    const mutation = {
      productId: prod.id,
      productName: prod.name,
      type: 'OPNAME',
      typeLabel: '📋 Stock Opname',
      qty: diff,
      initialStock,
      finalStock: realStock,
      reference: `Penyesuaian (${diff >= 0 ? '+' : ''}${diff})`,
      notes,
      timestamp: new Date().toISOString(),
      user: (window.payposApp.currentUser ? window.payposApp.currentUser.name : 'Staff')
    };

    await window.payposDB.add('stock_mutations', mutation);

    window.payposAudio.playSuccess();
    window.payposApp.showToast(`✅ Stock Opname berhasil! Stok fisik ${prod.name} disesuaikan ke ${realStock} pcs`, 'success');

    document.getElementById('form-stock-opname').reset();
    document.getElementById('opname-system-stock').textContent = '-';
    document.getElementById('opname-diff-stock').textContent = '-';

    await this.loadData();
    if (window.productManager) window.productManager.loadData();
  }

  renderOpnameTable() {
    const tbody = document.getElementById('opname-table-body');
    if (!tbody) return;

    const opnames = this.mutations.filter((m) => m.type === 'OPNAME').sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (opnames.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">Belum ada riwayat stock opname.</td></tr>';
      return;
    }

    tbody.innerHTML = opnames.slice(0, 15).map((m) => {
      const dateStr = new Date(m.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const diffColor = m.qty === 0 ? '#059669' : m.qty > 0 ? '#0284c7' : '#ef4444';
      return `
        <tr>
          <td><small style="color: var(--text-muted);">${dateStr}</small></td>
          <td><strong>${m.productName}</strong></td>
          <td>${m.initialStock} pcs</td>
          <td><strong>${m.finalStock} pcs</strong></td>
          <td><strong style="color: ${diffColor};">${m.qty >= 0 ? '+' : ''}${m.qty} pcs</strong></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${m.notes || '-'}</span></td>
        </tr>
      `;
    }).join('');
  }

  /* -------------------------------------------------------------
   * 4. KARTU STOK (STOCK CARD LEDGER)
   * ----------------------------------------------------------- */
  renderStockCardTable() {
    const tbody = document.getElementById('stock-card-table-body');
    if (!tbody) return;

    let filtered = [...this.mutations];
    if (this.selectedStockCardProductId) {
      filtered = filtered.filter((m) => m.productId === this.selectedStockCardProductId);
    }

    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">Tidak ada riwayat mutasi stok untuk produk yang dipilih.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map((m) => {
      const dateStr = new Date(m.timestamp).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

      let badge = `<span class="status-badge" style="background: #e0e7ff; color: #4338ca;">${m.typeLabel || m.type}</span>`;
      let inQty = '-';
      let outQty = '-';

      if (m.type === 'INBOUND') {
        badge = `<span class="status-badge" style="background: #ecfdf5; color: #065f46;">📥 Masuk</span>`;
        inQty = `<strong style="color: #059669;">+${m.qty}</strong>`;
      } else if (m.type === 'OUTBOUND') {
        badge = `<span class="status-badge" style="background: #fee2e2; color: #b91c1c;">📤 Keluar</span>`;
        outQty = `<strong style="color: #dc2626;">${Math.abs(m.qty)}</strong>`;
      } else if (m.type === 'SALE' || m.type === 'POS_SALE') {
        badge = `<span class="status-badge" style="background: #eff6ff; color: #1d4ed8;">🛒 Penjualan POS</span>`;
        outQty = `<strong style="color: #dc2626;">${Math.abs(m.qty)}</strong>`;
      } else if (m.type === 'OPNAME') {
        badge = `<span class="status-badge" style="background: #fef3c7; color: #b45309;">📋 Opname</span>`;
        if (m.qty > 0) inQty = `<strong style="color: #059669;">+${m.qty}</strong>`;
        else if (m.qty < 0) outQty = `<strong style="color: #dc2626;">${Math.abs(m.qty)}</strong>`;
      }

      return `
        <tr>
          <td><small style="color: var(--text-muted);">${dateStr}</small></td>
          <td><strong>${m.productName}</strong></td>
          <td>${badge}</td>
          <td>${m.initialStock}</td>
          <td style="text-align: center;">${inQty}</td>
          <td style="text-align: center;">${outQty}</td>
          <td><strong>${m.finalStock}</strong></td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${m.notes || m.reference || '-'}</span></td>
        </tr>
      `;
    }).join('');
  }
}

window.inventoryManager = new InventoryManager();
