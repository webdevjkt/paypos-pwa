-- PayPOS Multi-Tenant SaaS D1 SQL Schema for Cloudflare
-- Run in Cloudflare D1 Console

-- 1. Tenants Table (Daftar Perusahaan / Toko Klien SaaS)
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT UNIQUE NOT NULL,       -- Kode Perusahaan (misal: "CAFE88", "TOKO-BERKAH")
  name TEXT NOT NULL,                     -- Nama Perusahaan / Brand
  phone TEXT,
  address TEXT,
  plan TEXT DEFAULT 'trial',              -- 'trial', 'pro', 'enterprise'
  status TEXT DEFAULT 'active',           -- 'active', 'suspended'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME DEFAULT (datetime('now', '+30 days'))
);

-- 2. Users Table (Kasir & Owner terikat ke Tenant)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT NOT NULL,              -- Kode Perusahaan
  name TEXT NOT NULL,
  username TEXT NOT NULL,
  pin TEXT NOT NULL,
  role TEXT DEFAULT 'cashier',            -- 'owner', 'admin', 'cashier'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_code, username)
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '🏷️',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_code, name)
);

-- 4. Products Table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT NOT NULL,
  cost_price REAL DEFAULT 0,
  price REAL NOT NULL,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 5,
  image TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_code TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  discount REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  service REAL DEFAULT 0,
  final_total REAL NOT NULL,
  payment_method TEXT NOT NULL,
  amount_paid REAL NOT NULL,
  change_amount REAL DEFAULT 0,
  cashier_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_code, invoice_number)
);

-- 6. Settings Table
CREATE TABLE IF NOT EXISTS settings (
  tenant_code TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_code, key)
);

-- 7. Super Admin Accounts Table (Akun Master Pemilik SaaS)
CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SEED DEFAULT DEMO PERUSAHAAN
INSERT OR IGNORE INTO tenants (tenant_code, name, phone, plan, status)
VALUES ('DEMO', 'PayPOS Coffee & Kitchen Demo', '081234567890', 'pro', 'active');

-- 1. User Admin: Tri (user: Tri / pass: admin)
INSERT OR IGNORE INTO users (tenant_code, name, username, pin, role)
VALUES ('DEMO', 'Tri (Admin / Owner)', 'tri', 'admin', 'owner');

-- 2. User Demo (perusahaan: DEMO / user: demo / pass: demo)
INSERT OR IGNORE INTO users (tenant_code, name, username, pin, role)
VALUES ('DEMO', 'User Demo', 'demo', 'demo', 'owner');

-- 3. Kasir Demo (kasir1 / 1234)
INSERT OR IGNORE INTO users (tenant_code, name, username, pin, role)
VALUES ('DEMO', 'Kasir 1', 'kasir1', '1234', 'cashier');

-- 4. Akun Master Super Admin di Database
INSERT OR IGNORE INTO super_admins (name, username, password)
VALUES ('Tri Master Admin', 'Tri', 'admin');
