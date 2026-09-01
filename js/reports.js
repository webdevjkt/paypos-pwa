/**
 * PayPOS - Reports & Analytics Controller
 * Computes Sales, Gross Profit, Top Items, and Transaction History with CSV Export.
 */

class ReportsManager {
  constructor() {
    this.transactions = [];
    this.filterPeriod = 'today';
    this.currentPage = 1;
    this.pageSize = 10;
    this.searchQuery = '';
  }

  async init() {
    await this.loadData();
    this.bindEvents();
  }

  async loadData() {
    // 1. Ambil transaksi dari IndexedDB lokal
    this.transactions = await window.payposDB.getAll('transactions');

    // 2. Jika online, tarik data transaksi terbaru dari Cloudflare D1 Database
    const cfUrl = localStorage.getItem('paypos_cf_api_url') || 'https://paypos-api.wahyuhermawan788.workers.dev';
    const tenantCode = localStorage.getItem('paypos_tenant_code') || 'DEMO';

    if (navigator.onLine && cfUrl) {
      try {
        const res = await fetch(`${cfUrl}/api/transactions?tenant=${encodeURIComponent(tenantCode)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Code': tenantCode }
        });
        const result = await res.json();
        if (res.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
          for (const tx of result.data) {
            const existing = this.transactions.find(t => t.invoiceNumber === tx.invoiceNumber);
            if (!existing) {
              await window.payposDB.add('transactions', tx);
              this.transactions.push(tx);
            }
          }
        }
      } catch (err) {
        console.warn('[Reports Cloud Sync]', err.message);
      }
    }

    // Sort newest first
    this.transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    this.renderSummary();
    this.renderTransactionTable();
  }

  bindEvents() {
    const periodSelect = document.getElementById('report-period-filter');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.filterPeriod = e.target.value;
        this.currentPage = 1;
        this.renderSummary();
        this.renderTransactionTable();
      });
    }

    const txSearch = document.getElementById('tx-search-input');
    if (txSearch) {
      txSearch.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.currentPage = 1;
        this.renderTransactionTable();
      });
    }
  }

  getFilteredTransactions() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay(), 0, 0, 0, 0).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();

    let list = this.transactions.filter((tx) => {
      const txTime = new Date(tx.timestamp).getTime();
      if (this.filterPeriod === 'today') return txTime >= startOfToday;
      if (this.filterPeriod === 'week') return txTime >= startOfWeek;
      if (this.filterPeriod === 'month') return txTime >= startOfMonth;
      return true; // 'all'
    });

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(
        (tx) =>
          tx.invoiceNumber.toLowerCase().includes(q) ||
          tx.paymentMethod.toLowerCase().includes(q) ||
          (tx.cashierName && tx.cashierName.toLowerCase().includes(q))
      );
    }

    return list;
  }

  renderSummary() {
    const filtered = this.getFilteredTransactions();

    let totalRevenue = 0;
    let totalCost = 0;
    let totalItemsSold = 0;

    filtered.forEach((tx) => {
      totalRevenue += tx.finalTotal || tx.total || 0;
      if (tx.items) {
        tx.items.forEach((item) => {
          totalCost += (item.costPrice || 0) * (item.qty || 1);
          totalItemsSold += item.qty || 1;
        });
      }
    });

    const totalProfit = totalRevenue - totalCost;

    const elRevenue = document.getElementById('stat-total-revenue');
    const elProfit = document.getElementById('stat-total-profit');
    const elOrders = document.getElementById('stat-total-orders');
    const elItems = document.getElementById('stat-total-items');

    if (elRevenue) elRevenue.textContent = `Rp ${totalRevenue.toLocaleString('id-ID')}`;
    if (elProfit) elProfit.textContent = `Rp ${totalProfit.toLocaleString('id-ID')}`;
    if (elOrders) elOrders.textContent = filtered.length;
    if (elItems) elItems.textContent = `${totalItemsSold} pcs`;
  }

  renderTransactionTable() {
    const tbody = document.getElementById('transaction-table-body');
    if (!tbody) return;

    const list = this.getFilteredTransactions();
    const totalItems = list.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));

    if (this.currentPage > totalPages) this.currentPage = totalPages;

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, totalItems);
    const paginatedList = list.slice(startIndex, endIndex);

    // Update Pagination UI
    const paginationInfo = document.getElementById('tx-pagination-info');
    const pageIndicator = document.getElementById('tx-page-indicator');
    const btnPrev = document.getElementById('btn-tx-prev');
    const btnNext = document.getElementById('btn-tx-next');

    if (paginationInfo) {
      paginationInfo.textContent = totalItems > 0 
        ? `Menampilkan ${startIndex + 1}-${endIndex} dari total ${totalItems} transaksi`
        : `Belum ada transaksi pada periode ini`;
    }
    if (pageIndicator) pageIndicator.textContent = `Hal ${this.currentPage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = this.currentPage <= 1;
    if (btnNext) btnNext.disabled = this.currentPage >= totalPages;

    if (paginatedList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
            Belum ada transaksi pada periode ini.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = paginatedList
      .map((tx) => {
        const dateObj = new Date(tx.timestamp);
        const formattedDate = dateObj.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const itemCount = tx.items ? tx.items.reduce((sum, it) => sum + it.qty, 0) : 0;

        return `
        <tr>
          <td><strong style="color: var(--primary); font-family: monospace;">${tx.invoiceNumber}</strong></td>
          <td style="font-size: 13px; color: var(--text-muted);">${formattedDate}</td>
          <td><span class="status-badge" style="background: var(--bg-subtle); color: var(--text-main); font-weight: 700;">${tx.paymentMethod}</span></td>
          <td>${itemCount} item</td>
          <td><strong style="font-size: 15px;">Rp ${(tx.finalTotal || tx.total).toLocaleString('id-ID')}</strong></td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn-primary" style="padding: 6px 12px; font-size: 12px; background: linear-gradient(135deg, #0284c7, #0369a1); font-weight: 700;" onclick="window.reportsManager.viewReceipt('${tx.invoiceNumber}')">
                🖨️ Reprint
              </button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderTransactionTable();
    }
  }

  nextPage() {
    const totalPages = Math.ceil(this.getFilteredTransactions().length / this.pageSize);
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.renderTransactionTable();
    }
  }

  async viewReceipt(invoiceNumber) {
    const tx = this.transactions.find((t) => t.invoiceNumber === invoiceNumber);
    if (!tx) return;
    window.payposApp.showReceiptModal(tx, true); // true = isReprint
  }

  exportCSV() {
    const filtered = this.getFilteredTransactions();
    if (filtered.length === 0) {
      window.payposApp.showToast('Tidak ada data transaksi untuk diekspor', 'error');
      return;
    }

    const headers = ['No Invoice', 'Tanggal & Waktu', 'Metode Bayar', 'Jumlah Item', 'Subtotal', 'Diskon', 'Pajak', 'Total Akhir', 'Uang Diterima', 'Kembalian'];
    const rows = filtered.map((tx) => {
      const itemCount = tx.items ? tx.items.reduce((sum, it) => sum + it.qty, 0) : 0;
      return [
        `"${tx.invoiceNumber}"`,
        `"${new Date(tx.timestamp).toLocaleString('id-ID')}"`,
        `"${tx.paymentMethod}"`,
        itemCount,
        tx.subtotal || tx.total,
        tx.discount || 0,
        tx.tax || 0,
        tx.finalTotal || tx.total,
        tx.amountPaid || tx.finalTotal || tx.total,
        tx.change || 0
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PayPOS_Laporan_${this.filterPeriod}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.payposApp.showToast('Laporan CSV berhasil diunduh!', 'success');
  }
}

window.reportsManager = new ReportsManager();
