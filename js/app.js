/**
 * PayPOS - Core Cashier Application Controller (pos.html)
 * Handles POS Terminal, Cart, Calculations, Payments, Receipts, WhatsApp, and PWA setup.
 */

class PayPOSApp {
  constructor() {
    this.currentUser = null;
    this.cart = [];
    this.selectedCategory = 'all';
    this.selectedPaymentMethod = 'Tunai';
    this.activeDiscount = 0;
    this.activeDiscountType = 'idr';
    this.deferredPrompt = null;
    this.currentReceiptTx = null;
  }

  async init() {
    // 1. Check Session & Auth Guard
    if (!this.checkAuthGuard()) return;

    // 2. Initialize DB
    await window.payposDB.init();

    // 3. Initialize Sub-modules
    if (window.productManager) await window.productManager.init();
    if (window.inventoryManager) await window.inventoryManager.init();
    if (window.reportsManager) await window.reportsManager.init();
    if (window.settingsManager) await window.settingsManager.init();

    // 4. Setup Navigation & Views
    this.initNavigation();
    this.initPWA();
    this.initNetworkStatus();
    this.initClock();

    // 5. Load Initial Data
    await this.loadCatalog();

    // 6. Setup Event Listeners
    this.bindEvents();
  }

  /* -------------------------------------------------------------
   * Auth Guard & Session
   * ----------------------------------------------------------- */
  checkAuthGuard() {
    const savedUser = localStorage.getItem('paypos_current_user');
    if (!savedUser) {
      window.location.href = 'index.html';
      return false;
    }
    try {
      this.currentUser = JSON.parse(savedUser);
      this.applyUserSession();
      return true;
    } catch (e) {
      localStorage.removeItem('paypos_current_user');
      window.location.href = 'index.html';
      return false;
    }
  }

  applyUserSession() {
    const userNameEl = document.getElementById('sidebar-user-name');
    const userRoleEl = document.getElementById('sidebar-user-role');
    const userAvatarEl = document.getElementById('sidebar-user-avatar');
    const menuGreeting = document.getElementById('menu-user-greeting');

    if (this.currentUser) {
      const companyName = this.currentUser.companyName || this.currentUser.storeName || 'PayPOS Store';
      const tenantCode = this.currentUser.tenantCode || localStorage.getItem('paypos_tenant_code') || 'DEMO';
      const userRole = (this.currentUser.role || 'cashier').toLowerCase();

      let roleLabel = '🛒 Kasir';
      if (userRole === 'admin' || userRole === 'owner') roleLabel = '👑 Owner';
      else if (userRole === 'supervisor') roleLabel = '👔 Supervisor';
      else if (userRole === 'inventory') roleLabel = '📦 Gudang';

      if (userNameEl) userNameEl.textContent = this.currentUser.name;
      if (userRoleEl) userRoleEl.textContent = `${roleLabel} • ${tenantCode}`;
      if (userAvatarEl) userAvatarEl.textContent = this.currentUser.name.charAt(0).toUpperCase();
      if (menuGreeting) menuGreeting.textContent = `${this.currentUser.name} (${companyName})`;

      const brandEl = document.getElementById('sidebar-brand-name');
      if (brandEl) brandEl.textContent = companyName;

      // HIDE / SHOW menu sesuai Role User
      this.filterMenuByRole(userRole);
    }
  }

  filterMenuByRole(userRole) {
    const isOwner = userRole === 'admin' || userRole === 'owner';

    // Filter elemen yang memiliki data-access-role
    document.querySelectorAll('[data-access-role]').forEach((el) => {
      const allowedRoles = el.getAttribute('data-access-role').split(',').map(r => r.trim().toLowerCase());
      
      let hasAccess = false;
      if (isOwner) {
        hasAccess = true; // Owner selalu bisa akses semua
      } else if (allowedRoles.includes(userRole)) {
        hasAccess = true;
      }

      el.style.display = hasAccess ? '' : 'none';
    });
  }

  logout() {
    if (confirm('Apakah Anda yakin ingin keluar (Logout)?')) {
      localStorage.removeItem('paypos_current_user');
      window.location.href = 'index.html';
    }
  }

  /* -------------------------------------------------------------
   * Navigation & Routing
   * ----------------------------------------------------------- */
  initNavigation() {
    const navButtons = document.querySelectorAll('[data-nav-target]');
    navButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-nav-target');
        this.switchView(target);
      });
    });

    const mobileToggle = document.getElementById('mobile-nav-toggle');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    const toggleSidebar = () => {
      if (sidebar) sidebar.classList.toggle('open');
      if (backdrop) backdrop.classList.toggle('active');
    };

    const closeSidebar = () => {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    };

    if (mobileToggle) mobileToggle.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', closeSidebar);

    // Hardware / Browser Back button handling (popstate)
    window.addEventListener('popstate', (event) => {
      // Selalu arahkan ke view yang ada di state, default ke main-menu
      const targetView = event.state?.view;
      if (targetView) {
        this.switchView(targetView, false);
      } else {
        // Jika tidak ada state (misal: history habis), paksa ke main-menu
        this.switchView('main-menu', false);
      }
    });

    // KRITIS: Gunakan replaceState untuk set main-menu sebagai DASAR history
    // Ini mencegah tombol back HP balik ke index.html (halaman login)
    history.replaceState({ view: 'main-menu' }, '', '#main-menu');
    this.switchView('main-menu', false);

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        themeBtn.innerHTML = newTheme === 'dark' ? '☀️ Light' : '🌙 Dark';
      });
    }

    // Dashboard Period Filter change listener
    const dashFilter = document.getElementById('dashboard-period-filter');
    if (dashFilter) {
      dashFilter.addEventListener('change', () => {
        this.updateMainMenuDashboard();
      });
    }
  }

  navigateBack() {
    // Selalu navigasi langsung ke main-menu
    // Tidak menggunakan history.back() karena bisa keluar ke halaman login
    this.switchView('main-menu');
  }

  switchView(viewId, pushState = true) {
    const validViews = ['main-menu', 'pos', 'products', 'inventory', 'printer', 'reports', 'users', 'outlets', 'settings'];
    if (!validViews.includes(viewId)) viewId = 'main-menu';

    // Role-Based Access Control Guard
    const currentUser = JSON.parse(localStorage.getItem('paypos_current_user') || '{}');
    const role = (currentUser.role || 'cashier').toLowerCase();

    // Batasan Role:
    // Kasir murni: dilarang masuk ke Users, Outlets, Settings
    if (role === 'cashier' && ['users', 'outlets', 'settings'].includes(viewId)) {
      this.showToast('⛔ Akses Ditolak: Hanya Owner/Supervisor yang dapat membuka menu ini.', 'error');
      viewId = 'main-menu';
    }

    // Staff Gudang: hanya boleh buka Produk/Stok, Inventori, dan Printer
    if (role === 'inventory' && ['users', 'outlets', 'settings', 'reports'].includes(viewId)) {
      this.showToast('⛔ Akses Ditolak: Staff Gudang hanya dapat mengelola Produk & Stok Inventori.', 'error');
      viewId = 'main-menu';
    }

    document.querySelectorAll('.view-section').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));

    const targetSection = document.getElementById(`view-${viewId}`);
    const targetNav = document.querySelector(`[data-nav-target="${viewId}"]`);

    if (targetSection) targetSection.classList.add('active');
    if (targetNav) targetNav.classList.add('active');

    // Close mobile sidebar and backdrop if open
    document.getElementById('app-sidebar')?.classList.remove('open');
    document.getElementById('sidebar-backdrop')?.classList.remove('active');

    // Close mobile cart panel if navigating away from POS
    if (viewId !== 'pos') {
      document.getElementById('app-cart-panel')?.classList.remove('mobile-open');
    }

    // Top bar title & Back button update
    const titleMap = {
      'main-menu': 'Main Menu',
      pos: 'Terminal Kasir (POS)',
      products: 'Manajemen Produk & Katalog',
      inventory: 'Stok & Inventori (Mutasi & Opname)',
      printer: 'Setting Printer Bluetooth',
      reports: 'Laporan & Riwayat Penjualan',
      users: 'Manajemen User & Kasir',
      outlets: 'Kelola Cabang & Outlet',
      settings: 'Pengaturan Toko & Struk'
    };
    const titleEl = document.getElementById('topbar-page-title');
    if (titleEl) titleEl.textContent = titleMap[viewId] || 'PayPOS';

    const topbarBackBtn = document.getElementById('topbar-back-btn');
    if (topbarBackBtn) {
      if (viewId === 'main-menu') {
        topbarBackBtn.style.display = 'none';
      } else {
        topbarBackBtn.style.display = 'inline-flex';
      }
    }

    // Push/Replace browser history state
    if (pushState) {
      const currentHash = window.location.hash.replace('#', '');
      if (viewId === 'main-menu') {
        history.replaceState({ view: 'main-menu' }, '', '#main-menu');
      } else if (currentHash !== viewId) {
        history.pushState({ view: viewId }, '', '#' + viewId);
      }
    }

    // Scroll view to top
    if (targetSection) {
      targetSection.scrollTop = 0;
    }

    // Refresh sub-views
    if (viewId === 'main-menu') this.updateMainMenuDashboard();
    if (viewId === 'pos') this.loadCatalog();
    if (viewId === 'products' && window.productManager) window.productManager.loadData();
    if (viewId === 'inventory' && window.inventoryManager) window.inventoryManager.loadData();
    if (viewId === 'reports' && window.reportsManager) window.reportsManager.loadData();
    if (viewId === 'users' && window.userManager) window.userManager.loadUsers();
    if (viewId === 'outlets' && window.outletManager) window.outletManager.loadOutlets();
    if (viewId === 'settings' && window.settingsManager) window.settingsManager.loadSettings();
    if (viewId === 'printer' && window.bluetoothPrinter) window.bluetoothPrinter.updateUIStatus();
  }

  async updateMainMenuDashboard() {
    const transactions = await window.payposDB.getAll('transactions');
    const periodSelect = document.getElementById('dashboard-period-filter');
    const period = periodSelect ? periodSelect.value : 'today';

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const filteredTx = transactions.filter((t) => {
      const txTime = new Date(t.timestamp).getTime();
      if (period === 'today') return txTime >= startOfToday;
      if (period === 'week') return txTime >= startOfWeek;
      if (period === 'month') return txTime >= startOfMonth;
      return true; // 'all'
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalItems = 0;

    filteredTx.forEach((tx) => {
      totalRevenue += tx.finalTotal || tx.total || 0;
      if (Array.isArray(tx.items)) {
        tx.items.forEach((item) => {
          totalCost += (Number(item.costPrice) || 0) * (Number(item.qty) || 1);
          totalItems += Number(item.qty) || 1;
        });
      }
    });

    const totalProfit = totalRevenue - totalCost;

    const elRev = document.getElementById('dash-stat-revenue');
    const elProfit = document.getElementById('dash-stat-profit');
    const elOrders = document.getElementById('dash-stat-orders');
    const elItems = document.getElementById('dash-stat-items');

    if (elRev) elRev.textContent = `Rp ${totalRevenue.toLocaleString('id-ID')}`;
    if (elProfit) elProfit.textContent = `Rp ${totalProfit.toLocaleString('id-ID')}`;
    if (elOrders) elOrders.textContent = `${filteredTx.length} Pesanan`;
    if (elItems) elItems.textContent = `${totalItems} pcs`;
  }

  /* -------------------------------------------------------------
   * PWA Setup
   * ----------------------------------------------------------- */
  initPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => console.log('[PWA] Service Worker registered:', reg.scope))
        .catch((err) => console.warn('[PWA] Service Worker failed:', err));
    }

    const pwaBtnSidebar = document.getElementById('pwa-install-btn');

    const setupPrompt = (e) => {
      this.deferredPrompt = e;
      window.deferredPWAInstallPrompt = e;
      if (pwaBtnSidebar) {
        pwaBtnSidebar.style.display = 'flex';
      }
    };

    if (window.deferredPWAInstallPrompt) {
      setupPrompt(window.deferredPWAInstallPrompt);
    }

    if (pwaBtnSidebar) {
      pwaBtnSidebar.addEventListener('click', async () => {
        const promptEvent = this.deferredPrompt || window.deferredPWAInstallPrompt;
        if (promptEvent) {
          promptEvent.prompt();
          const { outcome } = await promptEvent.userChoice;
          console.log(`[PWA] User choice: ${outcome}`);
          this.deferredPrompt = null;
          window.deferredPWAInstallPrompt = null;
          pwaBtnSidebar.style.display = 'none';
        }
      });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setupPrompt(e);
    });

    window.addEventListener('appinstalled', () => {
      this.showToast('PayPOS berhasil diinstall di perangkat Anda!', 'success');
      this.deferredPrompt = null;
      window.deferredPWAInstallPrompt = null;
      if (pwaBtnSidebar) pwaBtnSidebar.style.display = 'none';
    });
  }

  initNetworkStatus() {
    const badge = document.getElementById('system-status-badge');
    const updateStatus = () => {
      if (!badge) return;
      if (navigator.onLine) {
        badge.className = 'status-badge';
        badge.innerHTML = '<span class="status-dot"></span> Online / Siap';
      } else {
        badge.className = 'status-badge offline';
        badge.innerHTML = '<span class="status-dot"></span> Mode Offline';
      }
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  initClock() {
    const clockEl = document.getElementById('topbar-clock');
    if (!clockEl) return;
    const updateTime = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    };
    setInterval(updateTime, 1000);
    updateTime();
  }

  /* -------------------------------------------------------------
   * POS Catalog & Search
   * ----------------------------------------------------------- */
  async loadCatalog(searchQuery = '') {
    // 1. Ambil data lokal terlebih dahulu agar instan (offline-first)
    let products = await window.payposDB.getAll('products');
    const categories = await window.payposDB.getAll('categories');

    this.renderCategoryPills(categories);
    this.renderProductCards(products, searchQuery);

    // 2. Jika online dan Cloud Sync aktif, tarik update produk terbaru dari Cloudflare D1
    if (navigator.onLine && window.cloudSync && window.cloudSync.getApiUrl() && !this._hasSyncedCloudProducts) {
      this._hasSyncedCloudProducts = true;
      try {
        const cloudProducts = await window.cloudSync.fetchProductsFromCloud();
        if (cloudProducts && cloudProducts.length > 0) {
          products = await window.payposDB.getAll('products');
          this.renderProductCards(products, searchQuery);
        }
      } catch (err) {
        console.warn('[Cloud Product Sync]', err.message);
      }
    }
  }

  renderCategoryPills(categories) {
    const catContainer = document.getElementById('pos-category-pills');
    if (!catContainer) return;

    let html = `
      <button class="cat-pill ${this.selectedCategory === 'all' ? 'active' : ''}" onclick="window.payposApp.selectCategory('all')">
        Semua Produk
      </button>
    `;

    categories.forEach((cat) => {
      const isActive = this.selectedCategory === cat.name;
      html += `
        <button class="cat-pill ${isActive ? 'active' : ''}" onclick="window.payposApp.selectCategory('${cat.name}')">
          ${cat.icon || '🏷️'} ${cat.name}
        </button>
      `;
    });

    catContainer.innerHTML = html;
  }

  selectCategory(catName) {
    this.selectedCategory = catName;
    const searchVal = document.getElementById('pos-search-input')?.value || '';
    this.loadCatalog(searchVal);
  }

  renderProductCards(products, searchQuery = '') {
    const grid = document.getElementById('pos-product-grid');
    if (!grid) return;

    let filtered = products;

    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.category === this.selectedCategory);
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
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 8px;">🔍</div>
          <p>Tidak ada produk yang cocok dengan pencarian.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered
      .map((p) => {
        const isOutOfStock = Number(p.stock) <= 0;
        const isLowStock = Number(p.stock) <= (Number(p.minStock) || 5);

        return `
        <div class="product-card" onclick="window.payposApp.addToCart(${p.id})">
          <div class="product-image-wrap">
            <img src="${p.image || 'https://via.placeholder.com/180'}" alt="${p.name}" loading="lazy">
            <div class="stock-tag ${isLowStock ? 'low' : ''}">
              ${isOutOfStock ? 'Habis' : `Stok: ${p.stock}`}
            </div>
          </div>
          <div class="product-info">
            <div>
              <div class="product-title">${p.name}</div>
              <div class="product-category">${p.category}</div>
            </div>
            <div class="product-price-row">
              <div class="product-price">Rp ${(p.price || 0).toLocaleString('id-ID')}</div>
              <button class="add-btn-mini" ${isOutOfStock ? 'disabled' : ''}>+</button>
            </div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  /* -------------------------------------------------------------
   * Cart Operations
   * ----------------------------------------------------------- */
  async addToCart(productId) {
    const product = await window.payposDB.getById('products', productId);
    if (!product) return;

    if (product.stock <= 0) {
      this.showToast(`Stok ${product.name} habis!`, 'error');
      window.payposAudio.playError();
      return;
    }

    const existing = this.cart.find((it) => it.id === product.id);

    if (existing) {
      if (existing.qty + 1 > product.stock) {
        this.showToast(`Maksimal stok tersedia (${product.stock})`, 'error');
        window.payposAudio.playError();
        return;
      }
      existing.qty += 1;
    } else {
      this.cart.push({
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        category: product.category,
        price: product.price,
        costPrice: product.costPrice || 0,
        maxStock: product.stock,
        qty: 1,
        note: ''
      });
    }

    window.payposAudio.playBeep();
    this.renderCart();
  }

  updateQty(productId, delta) {
    const item = this.cart.find((it) => it.id === productId);
    if (!item) return;

    const newQty = item.qty + delta;
    if (newQty <= 0) {
      this.removeFromCart(productId);
      return;
    }

    if (newQty > item.maxStock) {
      this.showToast(`Maksimal stok tersedia (${item.maxStock})`, 'error');
      window.payposAudio.playError();
      return;
    }

    item.qty = newQty;
    window.payposAudio.playBeep();
    this.renderCart();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter((it) => it.id !== productId);
    this.renderCart();
  }

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm('Kosongkan keranjang transaksi?')) {
      this.cart = [];
      this.renderCart();
    }
  }

  async calculateTotals() {
    const settings = await window.payposDB.getAllSettings();
    const taxPercent = parseFloat(settings.taxPercentage) || 0;
    const servicePercent = parseFloat(settings.servicePercentage) || 0;

    let subtotal = 0;
    this.cart.forEach((it) => {
      subtotal += it.price * it.qty;
    });

    let discountAmount = 0;
    if (this.activeDiscountType === 'percent') {
      discountAmount = Math.round((subtotal * this.activeDiscount) / 100);
    } else {
      discountAmount = this.activeDiscount;
    }
    if (discountAmount > subtotal) discountAmount = subtotal;

    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.round((taxableAmount * taxPercent) / 100);
    const serviceAmount = Math.round((taxableAmount * servicePercent) / 100);
    const finalTotal = taxableAmount + taxAmount + serviceAmount;

    return {
      subtotal,
      discountAmount,
      taxPercent,
      taxAmount,
      servicePercent,
      serviceAmount,
      finalTotal
    };
  }

  async renderCart() {
    const itemsList = document.getElementById('cart-items-list');
    const countBadge = document.getElementById('cart-badge-count');
    const checkoutBtn = document.getElementById('btn-checkout-cart');

    const totalItemCount = this.cart.reduce((sum, it) => sum + it.qty, 0);

    if (countBadge) countBadge.textContent = `${totalItemCount} item`;

    if (this.cart.length === 0) {
      if (itemsList) {
        itemsList.innerHTML = `
          <div class="empty-cart-state">
            <div class="icon">🛒</div>
            <p><strong>Keranjang Masih Kosong</strong></p>
            <p style="font-size: 12px;">Pilih produk di sebelah kiri untuk memulai transaksi.</p>
          </div>
        `;
      }
      if (checkoutBtn) {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<span>Bayar</span> <span>Rp 0</span>';
      }
      this.updateCartSummary(0, 0, 0, 0, 0);
      return;
    }

    if (itemsList) {
      itemsList.innerHTML = this.cart
        .map((it) => {
          const itemSubtotal = it.price * it.qty;
          return `
          <div class="cart-item">
            <div class="cart-item-main">
              <div>
                <div class="cart-item-title">${it.name}</div>
                <div class="cart-item-unit-price">Rp ${it.price.toLocaleString('id-ID')}</div>
              </div>
              <div class="cart-item-subtotal">Rp ${itemSubtotal.toLocaleString('id-ID')}</div>
            </div>
            <div class="cart-item-controls">
              <div class="qty-control">
                <button class="qty-btn" onclick="window.payposApp.updateQty(${it.id}, -1)">-</button>
                <span class="qty-number">${it.qty}</span>
                <button class="qty-btn" onclick="window.payposApp.updateQty(${it.id}, 1)">+</button>
              </div>
              <div class="item-actions">
                <button class="btn-item-del" onclick="window.payposApp.removeFromCart(${it.id})">🗑️</button>
              </div>
            </div>
          </div>
        `;
        })
        .join('');
    }

    const calc = await this.calculateTotals();
    this.updateCartSummary(calc.subtotal, calc.discountAmount, calc.taxAmount, calc.serviceAmount, calc.finalTotal);

    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = `<span>Bayar (${totalItemCount})</span> <span>Rp ${calc.finalTotal.toLocaleString('id-ID')}</span>`;
    }
  }

  updateCartSummary(subtotal, discount, tax, service, total) {
    const elSubtotal = document.getElementById('cart-summary-subtotal');
    const elDiscount = document.getElementById('cart-summary-discount');
    const elTax = document.getElementById('cart-summary-tax');
    const elService = document.getElementById('cart-summary-service');
    const elTotal = document.getElementById('cart-summary-total');

    const totalItemCount = this.cart.reduce((sum, it) => sum + it.qty, 0);
    const mobileBadge = document.getElementById('mobile-cart-badge');
    const mobileTotalText = document.getElementById('mobile-cart-total-text');
    const topbarCartCount = document.getElementById('topbar-cart-count');

    if (mobileBadge) mobileBadge.textContent = totalItemCount;
    if (topbarCartCount) topbarCartCount.textContent = totalItemCount;
    if (mobileTotalText) mobileTotalText.textContent = `Rp ${total.toLocaleString('id-ID')}`;

    if (elSubtotal) elSubtotal.textContent = `Rp ${subtotal.toLocaleString('id-ID')}`;
    if (elDiscount) elDiscount.textContent = `- Rp ${discount.toLocaleString('id-ID')}`;
    if (elTax) elTax.textContent = `Rp ${tax.toLocaleString('id-ID')}`;
    if (elService) elService.textContent = `Rp ${service.toLocaleString('id-ID')}`;
    if (elTotal) elTotal.textContent = `Rp ${total.toLocaleString('id-ID')}`;
  }

  /* -------------------------------------------------------------
   * Payment & Checkout Modal
   * ----------------------------------------------------------- */
  async openPaymentModal() {
    if (this.cart.length === 0) return;

    const calc = await this.calculateTotals();
    const modal = document.getElementById('modal-payment');
    const totalDisplay = document.getElementById('pay-modal-total-display');
    const cashInput = document.getElementById('pay-cash-input');

    if (totalDisplay) totalDisplay.textContent = `Rp ${calc.finalTotal.toLocaleString('id-ID')}`;
    if (cashInput) {
      cashInput.value = calc.finalTotal.toLocaleString('id-ID');
    }

    this.selectPaymentMethod('Tunai');
    this.updatePaymentCalculations(calc.finalTotal);
    modal.classList.add('active');
  }

  selectPaymentMethod(method) {
    this.selectedPaymentMethod = method;
    document.querySelectorAll('.pay-method-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-method') === method);
    });

    const cashSection = document.getElementById('pay-cash-section');
    const nonCashSection = document.getElementById('pay-noncash-section');
    const qrisDisplay = document.getElementById('pay-qris-display');

    if (method === 'Tunai') {
      if (cashSection) cashSection.style.display = 'flex';
      if (nonCashSection) nonCashSection.style.display = 'none';
      if (qrisDisplay) qrisDisplay.style.display = 'none';
    } else if (method === 'QRIS') {
      if (cashSection) cashSection.style.display = 'none';
      if (nonCashSection) nonCashSection.style.display = 'none';
      if (qrisDisplay) {
        qrisDisplay.style.display = 'flex';
        this.renderQRISCode();
      }
    } else {
      if (cashSection) cashSection.style.display = 'none';
      if (qrisDisplay) qrisDisplay.style.display = 'none';
      if (nonCashSection) {
        nonCashSection.style.display = 'block';
        document.getElementById('pay-noncash-title').textContent = `Pembayaran via ${method}`;
      }
    }
  }

  async renderQRISCode() {
    const qrContainer = document.getElementById('qris-canvas-wrapper');
    if (!qrContainer) return;
    const settings = await window.payposDB.getAllSettings();
    const qrisData = settings.qrisContent || 'PAYPOS-STATIC-QRIS';

    qrContainer.innerHTML = `
      <div style="background: #fff; padding: 16px; border-radius: 12px; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrisData)}" 
             alt="QRIS Code" 
             style="width: 180px; height: 180px; display: block;"
             onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'180\\' height=\\'180\\' viewBox=\\'0 0 100 100\\'><rect width=\\'100\\' height=\\'100\\' fill=\\'%23f1f5f9\\'/><text x=\\'50\\' y=\\'50\\' font-size=\\'12\\' text-anchor=\\'middle\\' fill=\\'%2364748b\\'>QRIS Siap</text></svg>'">
        <div style="font-size: 11px; font-weight: 800; color: #0f172a; margin-top: 8px; text-align: center;">SCAN DENGAN APLIKASI APAPUN</div>
      </div>
    `;
  }

  setQuickCash(amountType) {
    const cashInput = document.getElementById('pay-cash-input');
    if (!cashInput) return;

    this.calculateTotals().then((calc) => {
      let val = 0;
      if (amountType === 'exact') {
        val = calc.finalTotal;
      } else if (typeof amountType === 'number') {
        val = amountType;
      } else if (amountType.startsWith('+')) {
        const add = parseInt(amountType.replace('+', ''), 10);
        const current = parseFloat((cashInput.value || '').replace(/\D/g, '')) || 0;
        val = current + add;
      }
      cashInput.value = val ? val.toLocaleString('id-ID') : '';
      this.updatePaymentCalculations(calc.finalTotal);
    });
  }

  updatePaymentCalculations(total) {
    const cashInput = document.getElementById('pay-cash-input');
    const changeAmountEl = document.getElementById('pay-change-amount');
    const changeBox = document.getElementById('pay-change-box');
    const submitBtn = document.getElementById('btn-confirm-payment');

    if (!submitBtn) return;

    if (this.selectedPaymentMethod === 'Tunai') {
      const rawCash = (cashInput?.value || '').replace(/\D/g, '');
      const paid = parseFloat(rawCash) || 0;
      const change = paid - total;

      if (change >= 0) {
        if (changeAmountEl) {
          changeAmountEl.textContent = `Rp ${change.toLocaleString('id-ID')}`;
          changeAmountEl.style.color = '#059669';
          changeAmountEl.style.fontWeight = '800';
        }
        if (changeBox) {
          changeBox.className = 'change-display-box positive';
          changeBox.style.background = '#ecfdf5';
          changeBox.style.border = '2px solid #10b981';
          const labelEl = changeBox.querySelector('span:first-child');
          if (labelEl) {
            labelEl.textContent = 'Kembalian:';
            labelEl.style.color = '#065f46';
          }
        }
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.background = 'var(--primary)';
        submitBtn.innerHTML = '✅ Selesaikan Transaksi';
      } else {
        const shortAmount = Math.abs(change);
        if (changeAmountEl) {
          changeAmountEl.textContent = `Kurang Rp ${shortAmount.toLocaleString('id-ID')}`;
          changeAmountEl.style.color = '#dc2626';
          changeAmountEl.style.fontWeight = '900';
          changeAmountEl.style.fontSize = '19px';
        }
        if (changeBox) {
          changeBox.className = 'change-display-box';
          changeBox.style.background = '#fef2f2';
          changeBox.style.border = '2px solid #ef4444';
          const labelEl = changeBox.querySelector('span:first-child');
          if (labelEl) {
            labelEl.textContent = '⚠️ Uang Kurang:';
            labelEl.style.color = '#b91c1c';
          }
        }
        submitBtn.disabled = true; // Kunci tombol agar tidak bisa diklik sama sekali
        submitBtn.style.opacity = '0.4';
        submitBtn.style.cursor = 'not-allowed';
        submitBtn.style.background = '#94a3b8';
        submitBtn.innerHTML = `⛔ Uang Kurang (Rp ${shortAmount.toLocaleString('id-ID')})`;
      }
    } else {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
      submitBtn.style.background = 'var(--primary)';
      submitBtn.innerHTML = '✅ Selesaikan Transaksi';
    }
  }

  async processPayment() {
    if (this.cart.length === 0) {
      this.showToast('Keranjang belanja kosong!', 'error');
      return;
    }

    const calc = await this.calculateTotals();
    const settings = await window.payposDB.getAllSettings();
    const cashInput = document.getElementById('pay-cash-input');

    let amountPaid = calc.finalTotal;
    let change = 0;

    if (this.selectedPaymentMethod === 'Tunai') {
      const rawVal = (cashInput?.value || '').replace(/\D/g, '');
      amountPaid = parseFloat(rawVal) || 0;
      if (amountPaid === 0) amountPaid = calc.finalTotal; // Default uang pas jika kosong
      change = amountPaid - calc.finalTotal;
      if (change < 0) {
        this.showToast(`Uang pembayaran kurang Rp ${Math.abs(change).toLocaleString('id-ID')}!`, 'error');
        window.payposAudio.playError();
        return;
      }
    }

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNumber = `INV-${dateStr}-${randomSuffix}`;

    const transaction = {
      invoiceNumber,
      timestamp: new Date().toISOString(),
      items: [...this.cart],
      subtotal: calc.subtotal,
      discount: calc.discountAmount,
      tax: calc.taxAmount,
      service: calc.serviceAmount,
      finalTotal: calc.finalTotal,
      paymentMethod: this.selectedPaymentMethod,
      amountPaid,
      change,
      cashierName: this.currentUser ? this.currentUser.name : 'Kasir',
      storeName: settings.storeName || 'PayPOS Store',
      storePhone: settings.storePhone || '',
      storeAddress: settings.storeAddress || '',
      receiptHeader: settings.receiptHeader || '',
      receiptFooter: settings.receiptFooter || ''
    };

    // Save Transaction & Deduct Stock
    await window.payposDB.add('transactions', transaction);

    for (const item of this.cart) {
      const product = await window.payposDB.getById('products', item.id);
      if (product) {
        const initialStock = Number(product.stock) || 0;
        const finalStock = Math.max(0, initialStock - item.qty);
        product.stock = finalStock;
        await window.payposDB.update('products', product);

        // Catat ke Kartu Stok (stock_mutations)
        try {
          await window.payposDB.add('stock_mutations', {
            productId: product.id,
            productName: product.name,
            type: 'SALE',
            typeLabel: '🛒 Penjualan Kasir',
            qty: -item.qty,
            initialStock,
            finalStock,
            reference: invoiceNumber,
            notes: `Penjualan Kasir #${invoiceNumber}`,
            timestamp: new Date().toISOString(),
            user: this.currentUser ? this.currentUser.name : 'Kasir'
          });
        } catch (e) {
          console.warn('[Stock Card Mutation Log]', e.message);
        }
      }
    }

    // Instantly Upload Transaction to Cloudflare D1 Database
    if (window.cloudSync && window.cloudSync.getApiUrl() && navigator.onLine) {
      window.cloudSync.syncTransactions().catch((e) => console.warn('[Online DB Sync]', e.message));
    }

    // Trigger Telegram Notification Alert jika diaktifkan oleh Owner
    if (window.telegramNotifier && navigator.onLine) {
      window.telegramNotifier.sendTransactionAlert(transaction).catch((e) => console.warn('[Telegram Alert]', e.message));
    }

    window.payposAudio.playSuccess();
    this.showToast('Transaksi Berhasil!', 'success');

    document.getElementById('modal-payment').classList.remove('active');
    this.cart = [];
    this.renderCart();
    await this.loadCatalog();

    this.showReceiptModal(transaction);
  }

  /* -------------------------------------------------------------
   * Receipt & Print Modal
   * ----------------------------------------------------------- */
  showReceiptModal(tx, isReprint = false) {
    this.currentReceiptTx = tx;
    this.isCurrentReceiptReprint = isReprint;
    const modal = document.getElementById('modal-receipt');
    const container = document.getElementById('receipt-print-area');

    const dateFormatted = new Date(tx.timestamp).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const itemsRows = tx.items
      .map(
        (it) => `
      <tr>
        <td colspan="2" class="bold">${it.name}</td>
      </tr>
      <tr>
        <td style="color: #475569;">${it.qty} x ${it.price.toLocaleString('id-ID')}</td>
        <td class="text-right bold">Rp ${(it.qty * it.price).toLocaleString('id-ID')}</td>
      </tr>
    `
      )
      .join('');

    const reprintBadge = isReprint ? `
      <div style="margin: 8px 0; padding: 4px; border: 2px dashed #0284c7; background: #e0f2fe; color: #0369a1; text-align: center; font-size: 11px; font-weight: 900; letter-spacing: 1px;">
        *** REPRINT / CETAK ULANG ***
      </div>
    ` : '';

    container.innerHTML = `
      <div class="receipt-paper">
        ${reprintBadge}
        <div class="text-center bold" style="font-size: 16px; margin-bottom: 2px;">${tx.storeName}</div>
        <div class="text-center" style="font-size: 11px; color: #475569;">${tx.storeAddress}</div>
        <div class="text-center" style="font-size: 11px; color: #475569;">Telp: ${tx.storePhone}</div>
        
        <div class="divider"></div>
        
        <table class="receipt-table" style="font-size: 11px;">
          <tr>
            <td>No: ${tx.invoiceNumber}</td>
            <td class="text-right">${dateFormatted}</td>
          </tr>
          <tr>
            <td>Kasir: ${tx.cashierName || 'Kasir'}</td>
            <td class="text-right bold">${tx.paymentMethod}</td>
          </tr>
        </table>
        
        <div class="divider-double"></div>
        
        <table class="receipt-table">
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        
        <div class="divider"></div>
        
        <table class="receipt-table">
          <tr>
            <td>Subtotal:</td>
            <td class="text-right">Rp ${(tx.subtotal || tx.finalTotal).toLocaleString('id-ID')}</td>
          </tr>
          ${tx.discount ? `<tr><td>Diskon:</td><td class="text-right">- Rp ${tx.discount.toLocaleString('id-ID')}</td></tr>` : ''}
          ${tx.tax ? `<tr><td>Pajak (PPN):</td><td class="text-right">Rp ${tx.tax.toLocaleString('id-ID')}</td></tr>` : ''}
          ${tx.service ? `<tr><td>Layanan:</td><td class="text-right">Rp ${tx.service.toLocaleString('id-ID')}</td></tr>` : ''}
          <tr class="bold" style="font-size: 14px;">
            <td>TOTAL:</td>
            <td class="text-right">Rp ${tx.finalTotal.toLocaleString('id-ID')}</td>
          </tr>
          <tr>
            <td>Bayar:</td>
            <td class="text-right">Rp ${(tx.amountPaid || tx.finalTotal).toLocaleString('id-ID')}</td>
          </tr>
          <tr>
            <td>Kembalian:</td>
            <td class="text-right">Rp ${(tx.change || 0).toLocaleString('id-ID')}</td>
          </tr>
        </table>
        
        <div class="divider"></div>
        
        <div class="text-center" style="font-size: 11px; margin-top: 6px;">${tx.receiptHeader}</div>
        <div class="text-center" style="font-size: 10px; color: #64748b; margin-top: 4px;">${tx.receiptFooter}</div>
        <div class="text-center bold" style="font-size: 9px; color: #94a3b8; margin-top: 8px;">--- POWERED BY PAYPOS PWA ---</div>
      </div>
    `;

    modal.classList.add('active');
  }

  startNewTransaction() {
    const modal = document.getElementById('modal-receipt');
    if (modal) modal.classList.remove('active');

    this.cart = [];
    this.renderCart();
    this.switchView('pos');
    this.showToast('Siap untuk transaksi baru!', 'info');

    // Fokus ke kotak pencarian atau scanner
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 200);
    }
  }

  async toggleBluetoothPrinter() {
    if (!window.bluetoothPrinter) return;
    if (window.bluetoothPrinter.isConnected) {
      window.bluetoothPrinter.disconnect();
      this.showToast('Printer Bluetooth diputuskan', 'info');
    } else {
      try {
        const name = await window.bluetoothPrinter.connect();
        this.showToast(`Berhasil terhubung ke: ${name}`, 'success');
        window.payposAudio.playSuccess();
      } catch (err) {
        this.showToast(err.message, 'error');
        window.payposAudio.playError();
      }
    }
  }

  async testPrintBluetooth() {
    if (!window.bluetoothPrinter || !window.bluetoothPrinter.isConnected) {
      this.showToast('Silakan hubungkan printer Bluetooth terlebih dahulu', 'error');
      window.payposAudio.playError();
      return;
    }
    try {
      this.showToast('Mengirim perintah uji cetak ke printer...', 'info');
      await window.bluetoothPrinter.printTest();
      this.showToast('Uji cetak berhasil!', 'success');
      window.payposAudio.playSuccess();
    } catch (err) {
      this.showToast('Gagal mencetak: ' + err.message, 'error');
      window.payposAudio.playError();
    }
  }

  async printReceiptBluetoothDirect() {
    if (!this.currentReceiptTx) return;
    if (!window.bluetoothPrinter || !window.bluetoothPrinter.isConnected) {
      this.showToast('Printer Bluetooth belum terhubung. Buka menu Setting Printer untuk menghubungkan.', 'error');
      window.payposAudio.playError();
      return;
    }

    try {
      const paperSize = document.getElementById('setting-paper-size')?.value || '58mm';
      this.showToast('Mencetak struk ke printer Bluetooth...', 'info');
      await window.bluetoothPrinter.printReceipt(this.currentReceiptTx, paperSize, !!this.isCurrentReceiptReprint);
      this.showToast('Struk berhasil dicetak ke Bluetooth!', 'success');
      window.payposAudio.playSuccess();
    } catch (err) {
      this.showToast('Gagal mencetak: ' + err.message, 'error');
      window.payposAudio.playError();
    }
  }

  printReceiptBrowser() {
    window.print();
  }

  printAirPrint() {
    // AirPrint di iOS Safari: cukup panggil window.print()
    // CSS @media print di pos.html sudah memastikan hanya receipt-print-area yang dicetak
    if (!this.currentReceiptTx) {
      this.showToast('Tidak ada struk untuk dicetak', 'error');
      return;
    }
    this.showToast('Membuka dialog AirPrint...', 'info');
    // Beri sedikit delay agar toast sempat tampil
    setTimeout(() => {
      window.print();
    }, 300);
  }

  printReceipt() {
    // Default to Bluetooth if connected, otherwise browser print
    if (window.bluetoothPrinter && window.bluetoothPrinter.isConnected) {
      this.printReceiptBluetoothDirect();
    } else {
      this.printReceiptBrowser();
    }
  }

  shareWhatsAppReceipt() {
    // Legacy text share — kept as fallback
    this.shareWhatsAppReceiptAsImage();
  }

  async shareWhatsAppReceiptAsImage() {
    if (!this.currentReceiptTx) return;

    const btn = document.getElementById('btn-modal-share-wa');
    const originalHTML = btn ? btn.innerHTML : '';

    try {
      // Show loading state on button
      if (btn) {
        btn.innerHTML = '<span>⏳</span> Memproses...';
        btn.disabled = true;
      }

      const receiptEl = document.getElementById('receipt-print-area');
      if (!receiptEl) throw new Error('Elemen struk tidak ditemukan');

      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas belum dimuat');
      }

      // Capture receipt element as canvas
      const canvas = await html2canvas(receiptEl, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
      });

      const tx = this.currentReceiptTx;

      // Try to use Web Share API with file (best for Android)
      if (navigator.canShare && navigator.share) {
        try {
          canvas.toBlob(async (blob) => {
            if (!blob) throw new Error('Gagal membuat gambar');
            const file = new File([blob], `struk-${tx.invoiceNumber}.png`, { type: 'image/png' });

            if (navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `Struk ${tx.storeName}`,
                text: `Struk transaksi ${tx.invoiceNumber}`
              });
              this.showToast('Struk berhasil dibagikan!', 'success');
            } else {
              // Fallback: download image then open WhatsApp
              this._downloadAndOpenWA(canvas, tx);
            }
          }, 'image/png');
          return;
        } catch (shareErr) {
          // If user cancelled share, don't fall through to WA url
          if (shareErr.name === 'AbortError') {
            if (btn) { btn.innerHTML = originalHTML; btn.disabled = false; }
            return;
          }
          // Other errors: fall through to download+WA
        }
      }

      // Fallback for browsers without Web Share API file support
      this._downloadAndOpenWA(canvas, tx);

    } catch (err) {
      this.showToast('Gagal buat gambar struk: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
      }
    }
  }

  _downloadAndOpenWA(canvas, tx) {
    // Download image to device
    const link = document.createElement('a');
    link.download = `struk-${tx.invoiceNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // Open WhatsApp after short delay (image download triggers first)
    setTimeout(() => {
      const text = `Berikut struk transaksi ${tx.invoiceNumber} dari ${tx.storeName}. Terima kasih! 🙏`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
      this.showToast('Gambar struk diunduh. Kirim via WhatsApp!', 'success');
    }, 500);
  }

  /* -------------------------------------------------------------
   * UI Toast Helper
   * ----------------------------------------------------------- */
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  /* -------------------------------------------------------------
   * Global Event Bindings
   * ----------------------------------------------------------- */
  bindEvents() {
    // Logout button
    const logoutBtn = document.getElementById('btn-user-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }

    // POS Catalog Search
    const posSearch = document.getElementById('pos-search-input');
    if (posSearch) {
      posSearch.addEventListener('input', (e) => {
        this.loadCatalog(e.target.value);
      });
    }

    // Modal Close buttons
    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });

    // Cashier Checkout trigger
    const checkoutBtn = document.getElementById('btn-checkout-cart');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => this.openPaymentModal());
    }

    // Payment Confirm Trigger
    const confirmPayBtn = document.getElementById('btn-confirm-payment');
    if (confirmPayBtn) {
      confirmPayBtn.addEventListener('click', () => this.processPayment());
    }

    // Cash input realtime calculation with auto thousand separator dots
    const cashInput = document.getElementById('pay-cash-input');
    if (cashInput) {
      const updateCashCalc = (e) => {
        const raw = (cashInput.value || '').replace(/\D/g, '');
        if (raw) {
          cashInput.value = parseInt(raw, 10).toLocaleString('id-ID');
        } else {
          cashInput.value = '';
        }
        this.calculateTotals().then((calc) => {
          this.updatePaymentCalculations(calc.finalTotal);
        });
      };
      cashInput.addEventListener('input', updateCashCalc);
    }

    // Method buttons
    document.querySelectorAll('.pay-method-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const method = btn.getAttribute('data-method');
        this.selectPaymentMethod(method);
      });
    });

    // Mobile cart drawer open/close
    const mobileCartTrigger = document.getElementById('mobile-cart-trigger');
    const mobileTopCartBtn = document.getElementById('mobile-open-cart-btn');
    const btnCloseCartMobile = document.getElementById('btn-close-cart-mobile');
    const cartPanel = document.getElementById('app-cart-panel');

    const openCartDrawer = () => {
      if (cartPanel) cartPanel.classList.add('mobile-open');
    };

    const closeCartDrawer = () => {
      if (cartPanel) cartPanel.classList.remove('mobile-open');
    };

    if (mobileCartTrigger) mobileCartTrigger.addEventListener('click', openCartDrawer);
    if (mobileTopCartBtn) mobileTopCartBtn.addEventListener('click', openCartDrawer);
    if (btnCloseCartMobile) btnCloseCartMobile.addEventListener('click', closeCartDrawer);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.payposApp = new PayPOSApp();
  window.payposApp.init();
});
