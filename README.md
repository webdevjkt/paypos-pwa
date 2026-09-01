# ⚡ PayPOS - Progressive Web App (PWA) Sistem Kasir POS & Bluetooth Thermal Printer

**PayPOS** adalah aplikasi kasir (Point of Sale) modern berbasis Web & Progressive Web App (PWA) dengan tampilan **Tema Terang (Light Mode)** yang elegan, responsif di semua perangkat (HP, Tablet, Desktop), serta mendukung **koneksi langsung ke printer thermal Bluetooth (ESC/POS)** tanpa driver rumit.

![PayPOS](icons/icon.svg)

---

## ✨ Fitur Utama

- 🏠 **Main Menu Hub**: Dashboard utama setelah login dengan navigasi cepat ke seluruh fitur kasir.
- 🛒 **Terminal Kasir POS**:
  - Pencarian barang instan & filter kategori.
  - Manajemen keranjang belanja (+ / - qty, catatan, diskon persentase/rupiah).
  - Perhitungan pajak PPN & biaya layanan otomatis.
  - Perhitungan uang tunai cepat (*quick cash presets*) & kembalian otomatis.
  - Pembayaran multi-metode (Tunai, QRIS dinamis/statis, Transfer Bank, Kartu EDC).
- 🖨️ **Printer Thermal Bluetooth (Web Bluetooth ESC/POS)**:
  - Koneksi nirkabel langsung ke printer kasir Bluetooth 58mm & 80mm (Panda, RPP02N, Zywell, Iware, Eppos, VSC, dll).
  - Cetak struk belanja otomatis atau manual.
  - Fitur *Test Print* uji koneksi Bluetooth.
  - Fitur kirim struk nota langsung ke **WhatsApp**.
- 📦 **Manajemen Produk & Stok**:
  - Tambah, edit, dan hapus barang.
  - Barcode / SKU scan support.
  - Pengaturan harga modal, harga jual, estimasi margin laba, dan batas minimum stok.
- 📈 **Laporan Penjualan & Riwayat**:
  - Rekap omset & estimasi laba kotor harian, mingguan, bulanan.
  - Riwayat lengkap transaksi dengan fitur cetak ulang nota.
  - Ekspor laporan ke format **CSV**.
- ⚙️ **Pengaturan Toko & Backup Database Offline**:
  - Ubah nama toko, alamat, nomor telepon, dan catatan footer nota.
  - Backup & restore database offline dalam format **JSON** (IndexedDB).
- 📱 **Progressive Web App (PWA)**:
  - 100% Offline-Ready menggunakan Service Worker & IndexedDB.
  - Dapat di-install langsung di **Android, iOS (iPhone/iPad), Windows, dan MacOS**.

---

## 🔑 Kredensial Login Default

| Role | Username | Password / PIN |
|---|---|---|
| **Administrator / Owner** | `admin` | `admin` |
| **Kasir 1** | `kasir1` | `1234` |

---

## 🚀 Cara Menjalankan

### Persyaratan:
- [Node.js](https://nodejs.org/) (v16 ke atas)

### Langkah Instalasi:
```bash
# Clone repository
git clone https://github.com/sumarsonocalya-ship-it/paypos-pwa.git

# Masuk ke direktori
cd paypos-pwa

# Jalankan server lokal
npm start
```

Aplikasi akan berjalan di:
👉 `http://localhost:3000`

---

## 📱 Cara Install PWA di Perangkat

1. **Android**: Buka di Google Chrome, tekan tombol hijau **"Install Aplikasi"** atau titik tiga `⋮` > **Tambahkan ke Layar Utama (Install)**.
2. **iPhone / iPad**: Buka di Safari, tekan tombol **Share** > **Add to Home Screen (Tambahkan ke Layar Utama)**.
3. **Laptop / PC**: Buka di Chrome atau Edge, klik ikon **Install (🖥️)** di kanan bilah alamat URL.

---

## 📄 Lisensi
MIT License © 2026 PayPOS Team
