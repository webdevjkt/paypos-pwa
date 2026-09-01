/**
 * PayPOS - Web Bluetooth Thermal Printer Controller (ESC/POS)
 * Connects directly to Bluetooth 58mm / 80mm POS Thermal Printers.
 */

class BluetoothPrinterManager {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.deviceName = 'Belum Terhubung';
  }

  isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  isSupported() {
    // Web Bluetooth API tidak tersedia di iOS Safari / iOS Chrome / iOS Firefox
    // Apple memblokir akses Web Bluetooth di semua browser berbasis WebKit di iOS
    if (this.isIOS()) return false;
    return 'bluetooth' in navigator;
  }

  async connect() {
    // Cek iOS terlebih dahulu — beri pesan yang lebih spesifik
    if (this.isIOS()) {
      throw new Error(
        'iOS (iPhone/iPad) tidak mendukung Web Bluetooth API.\n\n' +
        'Alternatif cetak di iPhone:\n' +
        '• Gunakan tombol "Kirim WhatsApp" untuk kirim struk sebagai gambar\n' +
        '• Gunakan AirPrint jika printer mendukung\n' +
        '• Atau hubungkan printer via HP Android/Desktop Chrome'
      );
    }

    if (!this.isSupported()) {
      throw new Error('Web Bluetooth tidak didukung di browser ini. Gunakan Google Chrome di Android atau Desktop (Chrome/Edge).');
    }

    try {
      console.log('[Bluetooth] Requesting Bluetooth Device...');
      // Request any bluetooth device with standard SPP / Printer services or acceptAllDevices
      this.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // PosBank / Generic POS
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Serial Port
          '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 common BLE
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '0000af00-0000-1000-8000-00805f9b34fb'
        ]
      });

      this.deviceName = this.device.name || 'Printer Bluetooth';
      console.log('[Bluetooth] Connected to device name:', this.deviceName);

      this.device.addEventListener('gattserverdisconnected', () => {
        this.onDisconnected();
      });

      this.server = await this.device.gatt.connect();
      console.log('[Bluetooth] GATT Server connected. Looking for printer services...');

      const services = await this.server.getPrimaryServices();
      if (services.length === 0) {
        throw new Error('Layanan printer Bluetooth tidak ditemukan pada perangkat ini.');
      }

      // Find first writeable characteristic
      for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            this.characteristic = char;
            break;
          }
        }
        if (this.characteristic) break;
      }

      if (!this.characteristic) {
        throw new Error('Karakteristik write untuk printer thermal tidak ditemukan.');
      }

      this.isConnected = true;
      this.updateUIStatus();
      return this.deviceName;
    } catch (err) {
      console.error('[Bluetooth] Connection error:', err);
      this.isConnected = false;
      this.updateUIStatus();
      throw err;
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.onDisconnected();
  }

  onDisconnected() {
    this.isConnected = false;
    this.characteristic = null;
    this.server = null;
    this.deviceName = 'Belum Terhubung';
    this.updateUIStatus();
    console.log('[Bluetooth] Printer disconnected');
    if (window.payposApp) {
      window.payposApp.showToast('Printer Bluetooth terputus', 'info');
    }
  }

  updateUIStatus() {
    const statusBadges = document.querySelectorAll('.bluetooth-status-badge');
    const deviceNameEls = document.querySelectorAll('.bluetooth-device-name');
    const connectBtns = document.querySelectorAll('.btn-connect-bluetooth');

    statusBadges.forEach((badge) => {
      badge.className = `status-badge bluetooth-status-badge ${this.isConnected ? '' : 'offline'}`;
      badge.innerHTML = `<span class="status-dot"></span> ${this.isConnected ? 'Terhubung' : 'Terputus'}`;
    });

    deviceNameEls.forEach((el) => {
      el.textContent = this.deviceName;
    });

    connectBtns.forEach((btn) => {
      if (this.isConnected) {
        btn.textContent = 'Putuskan Bluetooth';
        btn.style.background = '#e11d48';
      } else {
        btn.textContent = 'Hubungkan Printer Bluetooth';
        btn.style.background = '';
      }
    });
  }

  // Send raw bytes chunks to Bluetooth characteristic
  async sendData(bytes) {
    if (!this.isConnected || !this.characteristic) {
      throw new Error('Printer Bluetooth belum terhubung.');
    }

    // Gunakan CHUNK_SIZE 64/128 bytes agar kompatibel dengan chipset printer thermal murah (VSC, Panda, Iware, MPT-II, dll.)
    // Chunk 512 terlalu besar untuk buffer internal printer thermal BLE dan sering menyebabkan item terpotong / ter-drop di tengah jalan.
    const CHUNK_SIZE = 64;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.slice(i, i + CHUNK_SIZE);
      const buffer = new Uint8Array(chunk);
      if (this.characteristic.properties.writeWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(buffer);
      } else {
        await this.characteristic.writeValue(buffer);
      }
      // Delay 30ms per chunk agar buffer mikrokontroler printer sempat memproses cetakan
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  /* ESC/POS Raw Command Helpers */
  buildReceiptBytes(tx, paperSize = '58mm', isReprint = false) {
    const cols = paperSize === '80mm' ? 48 : 32;
    const encoder = new TextEncoder();
    let bytes = [];

    const add = (arr) => bytes.push(...arr);
    const addStr = (str) => {
      // Pastikan string hanya ASCII murni agar tidak merusak perintah ESC/POS printer
      const cleanStr = (str || '').replace(/[^\x00-\x7F]/g, '');
      const encoded = encoder.encode(cleanStr);
      for (let i = 0; i < encoded.length; i++) bytes.push(encoded[i]);
    };
    const addLine = (str = '') => {
      addStr(str + '\n');
    };

    // ESC @ : Initialize printer
    add([0x1B, 0x40]);

    // Center Align
    add([0x1B, 0x61, 0x01]);

    // Reprint Watermark for Thermal Paper
    if (isReprint) {
      add([0x1D, 0x21, 0x01]); // Emphasized
      addLine('*** REPRINT / CETAK ULANG ***');
      add([0x1D, 0x21, 0x00]);
      addLine('-'.repeat(cols));
    }

    // Double Height & Width for Store Name
    add([0x1D, 0x21, 0x11]);
    addLine(tx.storeName || 'PayPOS Store');
    
    // Normal size
    add([0x1D, 0x21, 0x00]);
    if (tx.storeAddress) addLine(tx.storeAddress);
    if (tx.storePhone) addLine('Telp: ' + tx.storePhone);
    
    // Divider
    addLine('-'.repeat(cols));

    // Left Align
    add([0x1B, 0x61, 0x00]);
    addLine(`No  : ${tx.invoiceNumber || '-'}`);
    addLine(`Tgl : ${new Date(tx.timestamp || Date.now()).toLocaleString('id-ID')}`);
    addLine(`Ksr : ${tx.cashierName || 'Kasir'}`);
    addLine(`Bayar: ${tx.paymentMethod || 'Tunai'}`);
    
    // Double line divider
    addLine('='.repeat(cols));

    // Items List - Tangani semua item dengan rapi tanpa overflow
    const itemsList = Array.isArray(tx.items) ? tx.items : [];
    itemsList.forEach((it, idx) => {
      const itemName = (it.name || `Item ${idx + 1}`).trim();
      addLine(itemName);

      const qty = Number(it.qty) || 1;
      const price = Number(it.price) || 0;
      const priceStr = `Rp ${price.toLocaleString('id-ID')}`;
      const totalStr = `Rp ${(qty * price).toLocaleString('id-ID')}`;
      const qtyStr = ` ${qty} x ${priceStr}`;
      
      const spaceCount = Math.max(1, cols - qtyStr.length - totalStr.length);
      addLine(qtyStr + ' '.repeat(spaceCount) + totalStr);
    });

    addLine('-'.repeat(cols));

    // Totals Section
    const formatRow = (label, valStr) => {
      const spaceCount = Math.max(1, cols - label.length - valStr.length);
      return label + ' '.repeat(spaceCount) + valStr;
    };

    const subtotal = tx.subtotal !== undefined ? tx.subtotal : (tx.finalTotal || 0);
    addLine(formatRow('Subtotal:', `Rp ${Number(subtotal).toLocaleString('id-ID')}`));

    if (tx.discount) addLine(formatRow('Diskon:', `- Rp ${Number(tx.discount).toLocaleString('id-ID')}`));
    if (tx.tax) addLine(formatRow('PPN:', `Rp ${Number(tx.tax).toLocaleString('id-ID')}`));
    if (tx.service) addLine(formatRow('Layanan:', `Rp ${Number(tx.service).toLocaleString('id-ID')}`));

    // Bold Grand Total
    add([0x1B, 0x45, 0x01]);
    addLine(formatRow('TOTAL:', `Rp ${Number(tx.finalTotal || 0).toLocaleString('id-ID')}`));
    add([0x1B, 0x45, 0x00]);

    addLine(formatRow('Bayar:', `Rp ${Number(tx.amountPaid || tx.finalTotal || 0).toLocaleString('id-ID')}`));
    addLine(formatRow('Kembali:', `Rp ${Number(tx.change || 0).toLocaleString('id-ID')}`));

    addLine('-'.repeat(cols));

    // Center Footer Note
    add([0x1B, 0x61, 0x01]);
    if (tx.receiptHeader) addLine(tx.receiptHeader);
    if (tx.receiptFooter) addLine(tx.receiptFooter);
    addLine('*** TERIMA KASIH ***');
    addLine('Powered by PayPOS PWA');

    // Feed and cut
    addLine('\n\n\n');
    add([0x1D, 0x56, 0x41, 0x10]);

    return bytes;
  }

  async printReceipt(tx, paperSize = '58mm', isReprint = false) {
    if (!this.isConnected) {
      throw new Error('Printer Bluetooth belum terhubung. Silakan hubungkan printer di menu Setting Printer.');
    }
    const bytes = this.buildReceiptBytes(tx, paperSize, isReprint);
    await this.sendData(bytes);
  }

  async printTest() {
    if (!this.isConnected) {
      throw new Error('Printer Bluetooth belum terhubung.');
    }

    const testTx = {
      storeName: 'PAYPOS TEST PRINTER',
      storeAddress: 'Uji Koneksi Bluetooth',
      storePhone: '081234567890',
      invoiceNumber: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString(),
      cashierName: 'Admin',
      paymentMethod: 'Tunai',
      items: [
        { name: 'Kopi Test Espresso', qty: 1, price: 15000 },
        { name: 'Roti Bakar Test', qty: 1, price: 12000 }
      ],
      subtotal: 27000,
      discount: 0,
      tax: 0,
      service: 0,
      finalTotal: 27000,
      amountPaid: 30000,
      change: 3000,
      receiptHeader: 'Printer Bluetooth Berhasil Terhubung!',
      receiptFooter: 'PayPOS ESC/POS Driver OK'
    };

    const bytes = this.buildReceiptBytes(testTx, '58mm');
    await this.sendData(bytes);
  }
}

window.bluetoothPrinter = new BluetoothPrinterManager();
