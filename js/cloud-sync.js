/**
 * PayPOS - Cloudflare Workers Cloud Sync Manager
 * Automatically syncs local IndexedDB products & transactions with Cloudflare D1
 */

class CloudflareSyncManager {
  constructor() {
    this.apiUrl = localStorage.getItem('paypos_cf_api_url') || 'https://paypos-api.wahyuhermawan788.workers.dev';
    this.isSyncing = false;
    this.autoSyncInterval = null;
  }

  init() {
    // Start auto sync if API URL is configured
    if (this.apiUrl) {
      this.startAutoSync();
    }
  }

  setApiUrl(url) {
    this.apiUrl = url.replace(/\/+$/, '');
    localStorage.setItem('paypos_cf_api_url', this.apiUrl);
    if (this.apiUrl) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  getApiUrl() {
    return this.apiUrl;
  }

  startAutoSync() {
    if (this.autoSyncInterval) clearInterval(this.autoSyncInterval);
    // Auto sync every 3 minutes when online
    this.autoSyncInterval = setInterval(() => {
      if (navigator.onLine && this.apiUrl) {
        this.syncAll(false);
      }
    }, 180000);
  }

  stopAutoSync() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
  }

  async testConnection(url) {
    const targetUrl = (url || this.apiUrl).replace(/\/+$/, '');
    if (!targetUrl) throw new Error('URL Cloudflare Worker belum diisi.');

    const res = await fetch(`${targetUrl}/api/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) throw new Error(`Server merespon dengan status ${res.status}`);
    const data = await res.json();
    return data;
  }

  getTenantCode() {
    return (localStorage.getItem('paypos_tenant_code') || 'DEMO').toUpperCase();
  }

  async syncTransactions() {
    if (!this.apiUrl || !navigator.onLine) return 0;
    const tenantCode = this.getTenantCode();

    const transactions = await window.payposDB.getAll('transactions');
    if (transactions.length === 0) return 0;

    const res = await fetch(`${this.apiUrl}/api/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Code': tenantCode },
      body: JSON.stringify({ tenantCode, transactions })
    });

    if (!res.ok) throw new Error('Gagal sync transaksi ke Cloudflare');
    return transactions.length;
  }

  async syncProducts() {
    if (!this.apiUrl || !navigator.onLine) return 0;
    const tenantCode = this.getTenantCode();

    const products = await window.payposDB.getAll('products');
    const res = await fetch(`${this.apiUrl}/api/products/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Code': tenantCode },
      body: JSON.stringify({ tenantCode, products })
    });

    if (!res.ok) throw new Error('Gagal sync produk ke Cloudflare');
    return products.length;
  }

  async fetchProductsFromCloud() {
    if (!this.apiUrl || !navigator.onLine) return [];
    const tenantCode = this.getTenantCode();

    const res = await fetch(`${this.apiUrl}/api/products?tenant=${encodeURIComponent(tenantCode)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Code': tenantCode }
    });

    if (!res.ok) throw new Error('Gagal mengunduh produk dari Cloudflare');
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      for (const p of result.data) {
        const existing = await window.payposDB.getById('products', p.id);
        if (existing) {
          await window.payposDB.update('products', p);
        } else {
          await window.payposDB.add('products', p);
        }
      }
      if (window.productManager) await window.productManager.loadData();
      if (window.payposApp) await window.payposApp.loadCatalog();
      return result.data;
    }
    return [];
  }

  async syncAll(showToast = true) {
    if (this.isSyncing) return;
    if (!this.apiUrl) {
      if (showToast && window.payposApp) {
        window.payposApp.showToast('URL Cloudflare Worker belum dikonfigurasi di Pengaturan', 'error');
      }
      return;
    }

    if (!navigator.onLine) {
      if (showToast && window.payposApp) {
        window.payposApp.showToast('Anda sedang offline. Data tersimpan lokal di HP/PC', 'info');
      }
      return;
    }

    try {
      this.isSyncing = true;
      if (showToast && window.payposApp) {
        window.payposApp.showToast('Menyinkronkan data ke Cloudflare...', 'info');
      }

      const txCount = await this.syncTransactions();
      const prodCount = await this.syncProducts();

      if (showToast && window.payposApp) {
        window.payposApp.showToast(`✅ Sinkronisasi Berhasil! (${txCount} tx, ${prodCount} produk)`, 'success');
      }
    } catch (err) {
      console.error('[CloudflareSync] Error:', err);
      if (showToast && window.payposApp) {
        window.payposApp.showToast('Gagal sinkron: ' + err.message, 'error');
      }
    } finally {
      this.isSyncing = false;
    }
  }
}

window.cloudflareSync = new CloudflareSyncManager();
window.cloudSync = window.cloudflareSync;
window.cloudflareSync.init();
