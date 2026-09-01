/**
 * PayPOS - Settings & Store Configuration Controller
 * Handles Store Profile, Tax & Service setup, Receipt Customization, and Full JSON Backup & Restore.
 */

class SettingsManager {
  constructor() {
    this.settings = {};
  }

  async init() {
    await this.loadSettings();
    this.bindEvents();
  }

  async loadSettings() {
    this.settings = await window.payposDB.getAllSettings();

    // Populate Form Inputs
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val !== undefined ? val : '';
    };

    setVal('setting-store-name', this.settings.storeName || 'PayPOS Coffee & Kitchen');
    setVal('setting-store-phone', this.settings.storePhone || '081234567890');
    setVal('setting-store-address', this.settings.storeAddress || 'Jl. Boulevard No. 88, Manado');
    setVal('setting-receipt-header', this.settings.receiptHeader || 'Terima kasih atas kunjungan Anda!');
    setVal('setting-receipt-footer', this.settings.receiptFooter || 'Barang yang dibeli tidak dapat ditukar/dikembalikan.');
    setVal('setting-tax', this.settings.taxPercentage !== undefined ? this.settings.taxPercentage : 0);
    setVal('setting-service', this.settings.servicePercentage !== undefined ? this.settings.servicePercentage : 0);
    setVal('setting-paper-size', this.settings.paperSize || '58mm');
    setVal('setting-qris', this.settings.qrisContent || '');

    // Telegram Bot Settings
    const teleEnabledCheckbox = document.getElementById('setting-telegram-enabled');
    if (teleEnabledCheckbox) {
      teleEnabledCheckbox.checked = this.settings.telegramEnabled === true || this.settings.telegramEnabled === 'true' || this.settings.telegramEnabled === 'yes';
    }
    setVal('setting-telegram-token', this.settings.telegramBotToken || '');
    setVal('setting-telegram-chatid', this.settings.telegramChatId || '');

    // Update Brand Title in sidebar & navbar
    this.updateBrandUI();
  }

  updateBrandUI() {
    const brandName = this.settings.storeName || 'PayPOS';
    const brandEl = document.getElementById('sidebar-brand-name');
    if (brandEl) brandEl.textContent = brandName;
  }

  bindEvents() {
    const form = document.getElementById('settings-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveSettings(e));
    }

    const testTeleBtn = document.getElementById('btn-test-telegram');
    if (testTeleBtn) {
      testTeleBtn.addEventListener('click', () => this.handleTestTelegram());
    }

    const backupBtn = document.getElementById('btn-backup-db');
    if (backupBtn) {
      backupBtn.addEventListener('click', () => this.exportBackupFile());
    }

    const restoreInput = document.getElementById('restore-file-input');
    if (restoreInput) {
      restoreInput.addEventListener('change', (e) => this.handleRestoreFile(e));
    }

    const resetBtn = document.getElementById('btn-reset-db');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.handleResetData());
    }
  }

  async handleTestTelegram() {
    const token = document.getElementById('setting-telegram-token').value.trim();
    const chatId = document.getElementById('setting-telegram-chatid').value.trim();

    if (!token || !chatId) {
      window.payposApp.showToast('Masukkan Bot Token dan Chat ID terlebih dahulu!', 'error');
      return;
    }

    window.payposApp.showToast('Mengirim pesan uji ke Telegram...', 'info');
    try {
      if (window.telegramNotifier) {
        await window.telegramNotifier.testConnection(token, chatId);
        window.payposApp.showToast('✅ Berhasil! Pesan notifikasi masuk ke Telegram.', 'success');
      }
    } catch (err) {
      window.payposApp.showToast('❌ Gagal: ' + err.message, 'error');
    }
  }

  async handleSaveSettings(e) {
    e.preventDefault();

    const storeName = document.getElementById('setting-store-name').value.trim();
    const storePhone = document.getElementById('setting-store-phone').value.trim();
    const storeAddress = document.getElementById('setting-store-address').value.trim();
    const receiptHeader = document.getElementById('setting-receipt-header').value.trim();
    const receiptFooter = document.getElementById('setting-receipt-footer').value.trim();
    const taxPercentage = parseFloat(document.getElementById('setting-tax').value) || 0;
    const servicePercentage = parseFloat(document.getElementById('setting-service').value) || 0;
    const paperSize = document.getElementById('setting-paper-size').value;
    const qrisContent = document.getElementById('setting-qris').value.trim();

    const telegramEnabled = document.getElementById('setting-telegram-enabled')?.checked || false;
    const telegramBotToken = document.getElementById('setting-telegram-token')?.value.trim() || '';
    const telegramChatId = document.getElementById('setting-telegram-chatid')?.value.trim() || '';

    await window.payposDB.setSetting('storeName', storeName);
    await window.payposDB.setSetting('storePhone', storePhone);
    await window.payposDB.setSetting('storeAddress', storeAddress);
    await window.payposDB.setSetting('receiptHeader', receiptHeader);
    await window.payposDB.setSetting('receiptFooter', receiptFooter);
    await window.payposDB.setSetting('taxPercentage', taxPercentage);
    await window.payposDB.setSetting('servicePercentage', servicePercentage);
    await window.payposDB.setSetting('paperSize', paperSize);
    await window.payposDB.setSetting('qrisContent', qrisContent);

    await window.payposDB.setSetting('telegramEnabled', telegramEnabled);
    await window.payposDB.setSetting('telegramBotToken', telegramBotToken);
    await window.payposDB.setSetting('telegramChatId', telegramChatId);

    await this.loadSettings();
    window.payposApp.showToast('Pengaturan toko & Telegram berhasil disimpan!', 'success');
  }

  async exportBackupFile() {
    try {
      const backupData = await window.payposDB.exportBackup();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `PayPOS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      window.payposApp.showToast('File backup berhasil diunduh!', 'success');
    } catch (err) {
      console.error(err);
      window.payposApp.showToast('Gagal membuat backup data', 'error');
    }
  }

  async handleRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        if (confirm('Restore data akan menggantikan seluruh produk dan transaksi saat ini. Lanjutkan?')) {
          await window.payposDB.restoreBackup(jsonData);
          window.payposApp.showToast('Data berhasil dipulihkan!', 'success');
          // Reload everything
          setTimeout(() => location.reload(), 1000);
        }
      } catch (err) {
        console.error(err);
        window.payposApp.showToast('File backup rusak atau tidak kompatibel', 'error');
      }
    };
    reader.readAsText(file);
  }

  async handleResetData() {
    const answer = prompt('Ketik "RESET" untuk mengembalikan database ke data awal:');
    if (answer === 'RESET') {
      await window.payposDB.resetToDefault();
      window.payposApp.showToast('Database berhasil di-reset!', 'success');
      setTimeout(() => location.reload(), 800);
    }
  }
}

window.settingsManager = new SettingsManager();
