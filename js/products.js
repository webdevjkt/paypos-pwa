/**
 * PayPOS - Product Management Controller
 * Handles CRUD for products, categories, and inventory stock tracking.
 */

class ProductManager {
  constructor() {
    this.products = [];
    this.categories = [];
    this.currentEditId = null;
  }

  async init() {
    await this.loadData();
    this.bindEvents();
  }

  async loadData() {
    this.products = await window.payposDB.getAll('products');
    this.categories = await window.payposDB.getAll('categories');
    this.renderProductTable();
    this.renderCategoryOptions();
  }

  bindEvents() {
    const searchInput = document.getElementById('product-table-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.renderProductTable(e.target.value);
      });
    }

    const catFilter = document.getElementById('product-table-cat-filter');
    if (catFilter) {
      catFilter.addEventListener('change', () => {
        this.renderProductTable(searchInput ? searchInput.value : '');
      });
    }

    const productForm = document.getElementById('product-form');
    if (productForm) {
      productForm.addEventListener('submit', (e) => this.handleSaveProduct(e));
    }

    // Auto format ribuan dengan titik untuk input harga beli & harga jual
    const bindThousandFormatter = (inputId) => {
      const el = document.getElementById(inputId);
      if (!el) return;
      el.addEventListener('input', (e) => {
        const raw = e.target.value.replace(/\D/g, '');
        if (!raw) {
          e.target.value = '';
          return;
        }
        e.target.value = parseInt(raw, 10).toLocaleString('id-ID');
      });
    };

    bindThousandFormatter('product-cost');
    bindThousandFormatter('product-price');
  }

  renderCategoryOptions() {
    const selects = ['product-category-select', 'product-table-cat-filter'];
    selects.forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;

      const isFilter = id.includes('filter');
      let options = isFilter ? '<option value="">Semua Kategori</option>' : '';

      this.categories.forEach((cat) => {
        options += `<option value="${cat.name}">${cat.icon || '🏷️'} ${cat.name}</option>`;
      });

      select.innerHTML = options;
    });
  }

  renderProductTable(searchQuery = '') {
    const tbody = document.getElementById('product-table-body');
    const filterCat = document.getElementById('product-table-cat-filter')?.value;
    if (!tbody) return;

    let filtered = this.products;

    if (filterCat) {
      filtered = filtered.filter((p) => p.category === filterCat);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
            Tidak ada produk ditemukan.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered
      .map((p) => {
        const isLowStock = Number(p.stock) <= (Number(p.minStock) || 5);
        const margin = p.price - (p.costPrice || 0);
        const marginPercent = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;

        return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <img src="${p.image || 'https://via.placeholder.com/40'}" alt="${p.name}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; background: var(--bg-subtle);">
              <div>
                <strong style="font-size: 13px;">${p.name}</strong>
                <div style="font-size: 11px; color: var(--text-muted);">${p.barcode ? '#' + p.barcode : '-'}</div>
              </div>
            </div>
          </td>
          <td><span class="status-badge" style="background: var(--bg-subtle); color: var(--text-main);">${p.category}</span></td>
          <td>Rp ${(p.costPrice || 0).toLocaleString('id-ID')}</td>
          <td><strong>Rp ${(p.price || 0).toLocaleString('id-ID')}</strong></td>
          <td>
            <span class="status-badge ${isLowStock ? 'offline' : ''}">
              <span class="status-dot"></span>
              ${p.stock} pcs
            </span>
          </td>
          <td><span style="color: var(--success); font-weight: 700;">+${marginPercent}%</span></td>
          <td>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 13px; font-weight: 700; white-space: nowrap;" onclick="window.productManager.openEditModal(${p.id})">✏️ Edit</button>
              <button type="button" class="btn-secondary" style="padding: 6px 12px; font-size: 13px; font-weight: 700; color: var(--danger); white-space: nowrap;" onclick="window.productManager.deleteProduct(${p.id})">🗑️ Hapus</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  openAddModal() {
    this.currentEditId = null;
    document.getElementById('modal-product-title').textContent = 'Tambah Produk Baru';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').value = '';
    document.getElementById('product-cost').value = '';
    document.getElementById('product-price').value = '';
    
    // Auto generate sample barcode if empty
    document.getElementById('product-barcode').value = '899' + Math.floor(1000 + Math.random() * 9000);
    document.getElementById('modal-product').classList.add('active');
  }

  async openEditModal(id) {
    const product = await window.payposDB.getById('products', id);
    if (!product) return;

    this.currentEditId = id;
    document.getElementById('modal-product-title').textContent = 'Edit Produk';
    document.getElementById('product-id').value = product.id;
    document.getElementById('product-name').value = product.name;
    document.getElementById('product-barcode').value = product.barcode || '';
    document.getElementById('product-category-select').value = product.category;
    document.getElementById('product-cost').value = (product.costPrice || 0).toLocaleString('id-ID');
    document.getElementById('product-price').value = (product.price || 0).toLocaleString('id-ID');
    document.getElementById('product-stock').value = product.stock || 0;
    document.getElementById('product-min-stock').value = product.minStock || 5;
    document.getElementById('product-image').value = product.image || '';

    document.getElementById('modal-product').classList.add('active');
  }

  async handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const name = document.getElementById('product-name').value.trim();
    const barcode = document.getElementById('product-barcode').value.trim();
    const category = document.getElementById('product-category-select').value;
    
    // Parse angka bersih dari string bertitik
    const costPrice = parseFloat((document.getElementById('product-cost').value || '').replace(/\D/g, '')) || 0;
    const price = parseFloat((document.getElementById('product-price').value || '').replace(/\D/g, '')) || 0;
    const stock = parseInt(document.getElementById('product-stock').value, 10) || 0;
    const minStock = parseInt(document.getElementById('product-min-stock').value, 10) || 5;
    let image = document.getElementById('product-image').value.trim();

    // VALIDASI: Harga jual wajib lebih tinggi dari harga modal / beli
    if (price <= costPrice) {
      window.payposApp.showToast(`Harga jual (Rp ${price.toLocaleString('id-ID')}) harus lebih tinggi dari harga beli/modal (Rp ${costPrice.toLocaleString('id-ID')})!`, 'error');
      if (window.payposAudio) window.payposAudio.playError();
      const priceInput = document.getElementById('product-price');
      if (priceInput) priceInput.focus();
      return;
    }

    if (!image) {
      image = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=60';
    }

    const payload = {
      name,
      barcode,
      category,
      costPrice,
      price,
      stock,
      minStock,
      image
    };

    if (id) {
      payload.id = parseInt(id, 10);
      await window.payposDB.update('products', payload);
      window.payposApp.showToast('Produk berhasil diperbarui!', 'success');
    } else {
      await window.payposDB.add('products', payload);
      window.payposApp.showToast('Produk baru berhasil disimpan!', 'success');
    }

    // Instantly Sync to Cloudflare D1
    if (window.cloudSync && window.cloudSync.getApiUrl() && navigator.onLine) {
      window.cloudSync.syncProducts().catch((e) => console.warn('[Online Product Sync]', e.message));
    }

    document.getElementById('modal-product').classList.remove('active');
    await this.loadData();
    // Refresh POS catalog as well
    if (window.payposApp) {
      window.payposApp.loadCatalog();
    }
  }

  async deleteProduct(id) {
    if (confirm('Yakin ingin menghapus produk ini?')) {
      await window.payposDB.delete('products', id);
      window.payposApp.showToast('Produk telah dihapus', 'success');

      // Instantly Sync to Cloudflare D1
      if (window.cloudSync && window.cloudSync.getApiUrl() && navigator.onLine) {
        window.cloudSync.syncProducts().catch((e) => console.warn('[Online Product Sync]', e.message));
      }

      await this.loadData();
      if (window.payposApp) {
        window.payposApp.loadCatalog();
      }
    }
  }
}

window.productManager = new ProductManager();
