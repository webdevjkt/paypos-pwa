/**
 * PayPOS - IndexedDB Database Engine
 * Handles offline persistence for Users, Products, Categories, Transactions, and Store Settings.
 */

const DB_NAME = 'paypos_db';
const DB_VERSION = 4;

class PayPOSDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Users Store
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          userStore.createIndex('username', 'username', { unique: true });
        }

        // Outlets / Branches Store
        if (!db.objectStoreNames.contains('outlets')) {
          const outletStore = db.createObjectStore('outlets', { keyPath: 'id', autoIncrement: true });
          outletStore.createIndex('name', 'name', { unique: false });
        }

        // Products Store
        if (!db.objectStoreNames.contains('products')) {
          const productStore = db.createObjectStore('products', { keyPath: 'id', autoIncrement: true });
          productStore.createIndex('barcode', 'barcode', { unique: false });
          productStore.createIndex('category', 'category', { unique: false });
          productStore.createIndex('name', 'name', { unique: false });
        }

        // Stock Mutations Store (Barang Masuk, Barang Keluar, Stock Opname, Kartu Stok)
        if (!db.objectStoreNames.contains('stock_mutations')) {
          const mutationStore = db.createObjectStore('stock_mutations', { keyPath: 'id', autoIncrement: true });
          mutationStore.createIndex('productId', 'productId', { unique: false });
          mutationStore.createIndex('type', 'type', { unique: false });
          mutationStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Categories Store
        if (!db.objectStoreNames.contains('categories')) {
          const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
          categoryStore.createIndex('name', 'name', { unique: true });
        }

        // Transactions Store
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
          txStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
          txStore.createIndex('timestamp', 'timestamp', { unique: false });
          txStore.createIndex('paymentMethod', 'paymentMethod', { unique: false });
        }

        // Settings Store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.seedInitialData();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('[DB] Failed to open IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async seedInitialData() {
    // Seed Default Users if empty
    const users = await this.getAll('users');

    // 1. User Admin: Tri (user: Tri / pass: admin)
    let triUser = users.find((u) => u.username.toLowerCase() === 'tri');
    if (!triUser) {
      await this.add('users', {
        name: 'Tri (Owner)',
        username: 'Tri',
        pin: 'admin',
        role: 'admin',
        storeName: 'PayPOS Demo Store'
      });
    } else {
      triUser.pin = 'admin';
      await this.update('users', triUser);
    }

    // 2. User Demo (perusahaan: DEMO, user: demo, pass: demo)
    let demoUser = users.find((u) => u.username.toLowerCase() === 'demo');
    if (!demoUser) {
      await this.add('users', {
        name: 'User Demo',
        username: 'demo',
        pin: 'demo',
        role: 'admin',
        storeName: 'PayPOS Demo Store'
      });
    } else {
      demoUser.pin = 'demo';
      await this.update('users', demoUser);
    }

    // 3. User Kasir
    let cashierUser = users.find((u) => u.username === 'kasir1');
    if (!cashierUser) {
      await this.add('users', {
        name: 'Kasir 1',
        username: 'kasir1',
        pin: '1234',
        role: 'cashier',
        storeName: 'PayPOS Demo Store'
      });
    }

    // Check if products exist, otherwise seed defaults
    const products = await this.getAll('products');
    if (products.length === 0) {
      const defaultCategories = [
        { name: 'Makanan', icon: '🍲' },
        { name: 'Minuman', icon: '☕' },
        { name: 'Snack & Cemilan', icon: '🍟' },
        { name: 'Retail / Sembako', icon: '🛒' },
        { name: 'Jasa & Lainnya', icon: '⚡' }
      ];

      for (const cat of defaultCategories) {
        await this.add('categories', cat);
      }

      const defaultProducts = [
        {
          name: 'Kopi Susu Gula Aren',
          barcode: '8991001',
          category: 'Minuman',
          costPrice: 8000,
          price: 18000,
          stock: 45,
          minStock: 10,
          image: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Ice Americano',
          barcode: '8991002',
          category: 'Minuman',
          costPrice: 5000,
          price: 15000,
          stock: 60,
          minStock: 10,
          image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Matcha Latte Ice',
          barcode: '8991003',
          category: 'Minuman',
          costPrice: 10000,
          price: 22000,
          stock: 30,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Caramel Macchiato',
          barcode: '8991004',
          category: 'Minuman',
          costPrice: 11000,
          price: 24000,
          stock: 25,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1485808191679-5f86510681a2?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Lemon Tea Ice',
          barcode: '8991005',
          category: 'Minuman',
          costPrice: 4000,
          price: 12000,
          stock: 50,
          minStock: 10,
          image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Nasi Goreng Spesial',
          barcode: '8992001',
          category: 'Makanan',
          costPrice: 12000,
          price: 25000,
          stock: 25,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Ayam Geprek Sambal Matah',
          barcode: '8992002',
          category: 'Makanan',
          costPrice: 14000,
          price: 26000,
          stock: 20,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Mie Goreng Seafood',
          barcode: '8992003',
          category: 'Makanan',
          costPrice: 13000,
          price: 24000,
          stock: 30,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Kentang Goreng Crispy',
          barcode: '8993001',
          category: 'Snack & Cemilan',
          costPrice: 7000,
          price: 15000,
          stock: 35,
          minStock: 8,
          image: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Roti Bakar Keju Cokelat',
          barcode: '8993002',
          category: 'Snack & Cemilan',
          costPrice: 8000,
          price: 16000,
          stock: 18,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1584776296944-ab6fb57b0bdd?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Pisang Goreng Keju',
          barcode: '8993003',
          category: 'Snack & Cemilan',
          costPrice: 6000,
          price: 14000,
          stock: 22,
          minStock: 5,
          image: 'https://images.unsplash.com/photo-1528736235302-52922df5c122?w=300&auto=format&fit=crop&q=60'
        },
        {
          name: 'Air Mineral 600ml',
          barcode: '8994001',
          category: 'Retail / Sembako',
          costPrice: 2500,
          price: 5000,
          stock: 100,
          minStock: 20,
          image: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=300&auto=format&fit=crop&q=60'
        }
      ];

      for (const prod of defaultProducts) {
        await this.add('products', prod);
      }
    }

    // Default Settings
    const defaultSettings = {
      storeName: 'PayPOS Coffee & Kitchen',
      storePhone: '081234567890',
      storeAddress: 'Jl. Boulevard No. 88, Manado',
      receiptHeader: 'Terima kasih atas kunjungan Anda!',
      receiptFooter: 'Barang yang dibeli tidak dapat ditukar/dikembalikan.',
      taxPercentage: 0,
      servicePercentage: 0,
      paperSize: '58mm',
      qrisContent: '00020101021126580011ID.CO.QRIS.WWW936000100000000000000005204581253033605802ID5914PAYPOS STORE6007MANADO6304ABCD',
      currency: 'IDR'
    };

    for (const [key, value] of Object.entries(defaultSettings)) {
      const existing = await this.getSetting(key);
      if (existing === undefined) {
        await this.setSetting(key, value);
      }
    }
  }

  // User Authentication methods
  async getUserByUsername(username) {
    const users = await this.getAll('users');
    return users.find((u) => u.username.toLowerCase() === username.toLowerCase().trim());
  }

  async authenticate(username, pin) {
    const user = await this.getUserByUsername(username);
    if (!user) {
      throw new Error('Username / ID Kasir tidak ditemukan.');
    }
    if (user.pin !== pin.trim()) {
      throw new Error('PIN atau Password salah.');
    }
    return user;
  }

  async register(name, username, pin, storeName = 'PayPOS Store') {
    const existing = await this.getUserByUsername(username);
    if (existing) {
      throw new Error('Username ini sudah digunakan, silakan pilih username lain.');
    }

    const newUser = {
      name,
      username: username.toLowerCase().trim(),
      pin: pin.trim(),
      role: 'admin',
      storeName
    };

    const id = await this.add('users', newUser);
    newUser.id = id;

    // Update store name setting if provided
    if (storeName) {
      await this.setSetting('storeName', storeName);
    }

    return newUser;
  }

  // Generic DB methods
  async getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getById(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async add(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async update(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getSetting(key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async setSetting(key, value) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('settings', 'readwrite');
      const store = tx.objectStore('settings');
      const request = store.put({ key, value });
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllSettings() {
    const raw = await this.getAll('settings');
    const settings = {};
    raw.forEach((item) => {
      settings[item.key] = item.value;
    });
    return settings;
  }

  // Export full DB to JSON
  async exportBackup() {
    const users = await this.getAll('users');
    const products = await this.getAll('products');
    const categories = await this.getAll('categories');
    const transactions = await this.getAll('transactions');
    const settings = await this.getAllSettings();

    return {
      version: DB_VERSION,
      exportDate: new Date().toISOString(),
      users,
      products,
      categories,
      transactions,
      settings
    };
  }

  // Restore DB from JSON
  async restoreBackup(data) {
    if (!data.products || !data.categories || !data.transactions) {
      throw new Error('Format file backup tidak valid.');
    }

    const clearStore = (storeName) =>
      new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

    if (data.users) await clearStore('users');
    await clearStore('products');
    await clearStore('categories');
    await clearStore('transactions');
    await clearStore('settings');

    if (data.users) {
      for (const u of data.users) await this.add('users', u);
    }
    for (const p of data.products) await this.add('products', p);
    for (const c of data.categories) await this.add('categories', c);
    for (const t of data.transactions) await this.add('transactions', t);
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        await this.setSetting(k, v);
      }
    }
    return true;
  }

  // Reset database to initial seed
  async resetToDefault() {
    const clearStore = (storeName) =>
      new Promise((resolve, reject) => {
        const tx = this.db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

    await clearStore('users');
    await clearStore('products');
    await clearStore('categories');
    await clearStore('transactions');
    await clearStore('settings');
    await this.seedInitialData();
    return true;
  }
}

window.payposDB = new PayPOSDB();
