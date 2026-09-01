/**
 * PayPOS - User & Outlet Management (Multi-Tenant SaaS)
 * Full CRUD for Cashiers/Users and Branches/Outlets
 */

class UserManager {
  constructor() {
    this.currentEditId = null;
    this.init();
  }

  init() {
    const form = document.getElementById('user-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveUser(e));
    }

    const togglePinBtn = document.getElementById('toggle-user-pin');
    const pinInput = document.getElementById('user-pin');
    if (togglePinBtn && pinInput) {
      togglePinBtn.addEventListener('click', () => {
        const isPass = pinInput.type === 'password';
        pinInput.type = isPass ? 'text' : 'password';
        togglePinBtn.textContent = isPass ? '🙈' : '👁️';
      });
    }
  }

  async loadUsers() {
    const tbody = document.getElementById('user-table-body');
    if (!tbody) return;

    try {
      const users = await window.payposDB.getAll('users');
      const limits = this.getPlanLimits();
      const quotaBadge = document.getElementById('user-quota-badge');
      const addBtn = document.getElementById('btn-add-user');

      // Update Quota Badge & Button State
      const isMaxed = users.length >= limits.maxUsers;
      if (quotaBadge) {
        quotaBadge.textContent = `Kuota ${limits.plan}: ${users.length}/${limits.maxUsers} User`;
        quotaBadge.style.background = isMaxed ? '#fee2e2' : '#e0e7ff';
        quotaBadge.style.color = isMaxed ? '#b91c1c' : '#4338ca';
      }

      if (addBtn) {
        if (isMaxed) {
          addBtn.disabled = true;
          addBtn.style.opacity = '0.4';
          addBtn.style.pointerEvents = 'none';
          addBtn.style.cursor = 'not-allowed';
          addBtn.style.background = '#64748b';
          addBtn.style.borderColor = '#475569';
          addBtn.innerHTML = `<span>🔒</span> Kuota Penuh (${users.length}/${limits.maxUsers})`;
          addBtn.title = `Batas kuota lisensi ${limits.plan} (${limits.maxUsers} User) sudah penuh. Hubungi Admin untuk upgrade.`;
        } else {
          addBtn.disabled = false;
          addBtn.style.opacity = '1';
          addBtn.style.pointerEvents = 'auto';
          addBtn.style.cursor = 'pointer';
          addBtn.style.background = 'var(--primary)';
          addBtn.style.borderColor = 'transparent';
          addBtn.innerHTML = `<span>➕</span> Tambah User Kasir`;
          addBtn.title = 'Tambah User Kasir Baru';
        }
      }

      if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Belum ada data user.</td></tr>';
        return;
      }

      tbody.innerHTML = users.map((u) => {
        let roleBadge = '<span class="status-badge" style="background: #f1f5f9; color: #475569;">🛒 Kasir</span>';
        let roleSubtitle = '🛒 Akses Transaksi POS';

        if (u.role === 'owner' || u.role === 'admin') {
          roleBadge = '<span class="status-badge" style="background: #e0e7ff; color: #4338ca; font-weight: 800;">👑 Owner / Admin</span>';
          roleSubtitle = '👑 Akses Penuh Semua Menu';
        } else if (u.role === 'supervisor') {
          roleBadge = '<span class="status-badge" style="background: #fef3c7; color: #b45309; font-weight: 800;">👔 Supervisor</span>';
          roleSubtitle = '👔 Kasir, Stok, & Laporan';
        } else if (u.role === 'inventory') {
          roleBadge = '<span class="status-badge" style="background: #ecfdf5; color: #065f46; font-weight: 800;">📦 Gudang / Kitchen</span>';
          roleSubtitle = '📦 Kelola Stok Produk';
        }

        return `
          <tr>
            <td>
              <strong>${u.name}</strong>
              <div style="font-size: 11px; color: var(--text-muted);">${roleSubtitle}</div>
            </td>
            <td><code>${u.username}</code></td>
            <td>${roleBadge}</td>
            <td>
              <span style="font-family: monospace; letter-spacing: 2px;">••••••</span>
            </td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window.userManager.openEditModal(${u.id})">✏️ Edit</button>
                ${(u.username.toLowerCase() === 'tri' || u.username.toLowerCase() === 'demo') ? '' : `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--danger);" onclick="window.userManager.deleteUser(${u.id}, '${u.username}')">🗑️</button>`}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Error: ${err.message}</td></tr>`;
    }
  }

  getPlanLimits() {
    const savedUser = JSON.parse(localStorage.getItem('paypos_current_user') || '{}');
    const plan = (savedUser.plan || localStorage.getItem('paypos_tenant_plan') || 'standard').toLowerCase();

    if (plan === 'premium') {
      return { plan: 'PREMIUM', maxOutlets: 4, maxUsers: 9 };
    } else if (plan === 'pro') {
      return { plan: 'PROFESIONAL', maxOutlets: 2, maxUsers: 6 };
    }
    // Default standard
    return { plan: 'STANDARD', maxOutlets: 1, maxUsers: 3 };
  }

  async openAddModal() {
    const limits = this.getPlanLimits();
    const currentUsers = await window.payposDB.getAll('users');

    if (currentUsers.length >= limits.maxUsers) {
      window.payposApp.showToast(`⛔ Batas Lisensi ${limits.plan} Tercapai! Maksimal ${limits.maxUsers} User. Hubungi Admin untuk Upgrade ke Paket Lebih Tinggi.`, 'error');
      if (window.payposAudio) window.payposAudio.playError();
      return;
    }

    this.currentEditId = null;
    document.getElementById('modal-user-title').textContent = `Tambah User Kasir (Kuota: ${currentUsers.length}/${limits.maxUsers})`;
    document.getElementById('user-form').reset();
    document.getElementById('user-id').value = '';
    document.getElementById('modal-user').classList.add('active');
  }

  async openEditModal(id) {
    const user = await window.payposDB.getById('users', id);
    if (!user) return;

    this.currentEditId = id;
    document.getElementById('modal-user-title').textContent = 'Edit User Kasir';
    document.getElementById('user-id').value = user.id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-pin').value = user.pin;
    document.getElementById('user-role').value = user.role || 'cashier';
    document.getElementById('modal-user').classList.add('active');
  }

  async handleSaveUser(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const name = document.getElementById('user-name').value.trim();
    const username = document.getElementById('user-username').value.trim().toLowerCase();
    const pin = document.getElementById('user-pin').value.trim();
    const role = document.getElementById('user-role').value;
    const tenantCode = localStorage.getItem('paypos_tenant_code') || 'DEMO';

    const limits = this.getPlanLimits();
    const currentUsers = await window.payposDB.getAll('users');

    if (!id && currentUsers.length >= limits.maxUsers) {
      window.payposApp.showToast(`⛔ Batas Lisensi ${limits.plan} Tercapai (${limits.maxUsers} User).`, 'error');
      return;
    }

    const payload = { name, username, pin, role, tenantCode };

    try {
      if (id) {
        payload.id = parseInt(id, 10);
        await window.payposDB.update('users', payload);
        window.payposApp.showToast('User berhasil diperbarui!', 'success');
      } else {
        await window.payposDB.add('users', payload);
        window.payposApp.showToast('User kasir baru berhasil dibuat!', 'success');
      }

      // Sync ke Cloudflare D1
      const cfUrl = localStorage.getItem('paypos_cf_api_url') || 'https://paypos-api.wahyuhermawan788.workers.dev';
      if (navigator.onLine && cfUrl) {
        fetch(`${cfUrl}/api/users/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Tenant-Code': tenantCode },
          body: JSON.stringify({ tenantCode, user: payload })
        }).catch(err => console.warn('[User Cloud Sync]', err.message));
      }

      document.getElementById('modal-user').classList.remove('active');
      this.loadUsers();
    } catch (err) {
      window.payposApp.showToast('Gagal simpan user: ' + err.message, 'error');
    }
  }

  async deleteUser(id, username) {
    if (confirm(`Yakin ingin menghapus user "${username}"?`)) {
      await window.payposDB.delete('users', id);
      window.payposApp.showToast(`User ${username} telah dihapus.`, 'success');
      this.loadUsers();
    }
  }
}

class OutletManager {
  constructor() {
    this.currentEditId = null;
    this.init();
  }

  getPlanLimits() {
    const savedUser = JSON.parse(localStorage.getItem('paypos_current_user') || '{}');
    const plan = (savedUser.plan || localStorage.getItem('paypos_tenant_plan') || 'standard').toLowerCase();

    if (plan === 'premium') {
      return { plan: 'PREMIUM', maxOutlets: 4, maxUsers: 9 };
    } else if (plan === 'pro') {
      return { plan: 'PROFESIONAL', maxOutlets: 2, maxUsers: 6 };
    }
    return { plan: 'STANDARD', maxOutlets: 1, maxUsers: 3 };
  }

  init() {
    const form = document.getElementById('outlet-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveOutlet(e));
    }
  }

  async loadOutlets() {
    const tbody = document.getElementById('outlet-table-body');
    if (!tbody) return;

    try {
      let outlets = await window.payposDB.getAll('outlets');
      const limits = this.getPlanLimits();
      const quotaBadge = document.getElementById('outlet-quota-badge');
      const addBtn = document.getElementById('btn-add-outlet');

      if (!outlets || outlets.length === 0) {
        // Seed default main outlet
        const mainOutlet = {
          name: 'Outlet Pusat / Toko Utama',
          phone: '081234567890',
          address: 'Jl. Utama No. 88',
          isMain: true,
          tenantCode: localStorage.getItem('paypos_tenant_code') || 'DEMO'
        };
        await window.payposDB.add('outlets', mainOutlet);
        outlets = [mainOutlet];
      }

      // Update Quota Badge & Button State
      const isMaxed = outlets.length >= limits.maxOutlets;
      if (quotaBadge) {
        quotaBadge.textContent = `Kuota ${limits.plan}: ${outlets.length}/${limits.maxOutlets} Outlet`;
        quotaBadge.style.background = isMaxed ? '#fee2e2' : '#fef3c7';
        quotaBadge.style.color = isMaxed ? '#b91c1c' : '#b45309';
      }

      if (addBtn) {
        if (isMaxed) {
          addBtn.disabled = true;
          addBtn.style.opacity = '0.4';
          addBtn.style.pointerEvents = 'none';
          addBtn.style.cursor = 'not-allowed';
          addBtn.style.background = '#64748b';
          addBtn.style.borderColor = '#475569';
          addBtn.innerHTML = `<span>🔒</span> Kuota Penuh (${outlets.length}/${limits.maxOutlets})`;
          addBtn.title = `Batas kuota lisensi ${limits.plan} (${limits.maxOutlets} Cabang) sudah penuh. Hubungi Admin untuk upgrade.`;
        } else {
          addBtn.disabled = false;
          addBtn.style.opacity = '1';
          addBtn.style.pointerEvents = 'auto';
          addBtn.style.cursor = 'pointer';
          addBtn.style.background = 'var(--primary)';
          addBtn.style.borderColor = 'transparent';
          addBtn.innerHTML = `<span>➕</span> Tambah Cabang Baru`;
          addBtn.title = 'Tambah Cabang / Outlet Baru';
        }
      }

      tbody.innerHTML = outlets.map((o) => `
        <tr>
          <td>
            <strong>🏬 ${o.name}</strong>
            ${o.isMain ? '<span class="status-badge" style="margin-left: 6px; font-size: 10px; background: #ecfdf5; color: #065f46;">Outlet Utama</span>' : ''}
          </td>
          <td>${o.phone || '-'}</td>
          <td><span style="font-size: 12px; color: var(--text-muted);">${o.address || '-'}</span></td>
          <td>
            <span class="status-badge">
              <span class="status-dot"></span> Aktif
            </span>
          </td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="window.outletManager.openEditModal(${o.id})">✏️ Edit</button>
              ${o.isMain ? '' : `<button class="btn-secondary" style="padding: 4px 8px; font-size: 11px; color: var(--danger);" onclick="window.outletManager.deleteOutlet(${o.id}, '${o.name}')">🗑️</button>`}
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Error: ${err.message}</td></tr>`;
    }
  }

  async openAddModal() {
    const limits = this.getPlanLimits();
    const currentOutlets = await window.payposDB.getAll('outlets');

    if (currentOutlets.length >= limits.maxOutlets) {
      window.payposApp.showToast(`⛔ Batas Lisensi ${limits.plan} Tercapai! Maksimal ${limits.maxOutlets} Cabang / Outlet. Hubungi Admin untuk Upgrade ke Paket Lebih Tinggi.`, 'error');
      if (window.payposAudio) window.payposAudio.playError();
      return;
    }

    this.currentEditId = null;
    document.getElementById('modal-outlet-title').textContent = `Tambah Cabang / Outlet (Kuota: ${currentOutlets.length}/${limits.maxOutlets})`;
    document.getElementById('outlet-form').reset();
    document.getElementById('outlet-id').value = '';
    document.getElementById('modal-outlet').classList.add('active');
  }

  async openEditModal(id) {
    const outlet = await window.payposDB.getById('outlets', id);
    if (!outlet) return;

    this.currentEditId = id;
    document.getElementById('modal-outlet-title').textContent = 'Edit Cabang / Outlet';
    document.getElementById('outlet-id').value = outlet.id;
    document.getElementById('outlet-name').value = outlet.name;
    document.getElementById('outlet-phone').value = outlet.phone || '';
    document.getElementById('outlet-address').value = outlet.address || '';
    document.getElementById('outlet-is-main').checked = !!outlet.isMain;
    document.getElementById('modal-outlet').classList.add('active');
  }

  async handleSaveOutlet(e) {
    e.preventDefault();
    const id = document.getElementById('outlet-id').value;
    const name = document.getElementById('outlet-name').value.trim();
    const phone = document.getElementById('outlet-phone').value.trim();
    const address = document.getElementById('outlet-address').value.trim();
    const isMain = document.getElementById('outlet-is-main').checked;
    const tenantCode = localStorage.getItem('paypos_tenant_code') || 'DEMO';

    const limits = this.getPlanLimits();
    const currentOutlets = await window.payposDB.getAll('outlets');

    if (!id && currentOutlets.length >= limits.maxOutlets) {
      window.payposApp.showToast(`⛔ Batas Lisensi ${limits.plan} Tercapai (${limits.maxOutlets} Outlet).`, 'error');
      return;
    }

    const payload = { name, phone, address, isMain, tenantCode };

    try {
      if (id) {
        payload.id = parseInt(id, 10);
        await window.payposDB.update('outlets', payload);
        window.payposApp.showToast('Cabang berhasil diperbarui!', 'success');
      } else {
        await window.payposDB.add('outlets', payload);
        window.payposApp.showToast('Cabang baru berhasil ditambahkan!', 'success');
      }

      document.getElementById('modal-outlet').classList.remove('active');
      this.loadOutlets();
    } catch (err) {
      window.payposApp.showToast('Gagal simpan cabang: ' + err.message, 'error');
    }
  }

  async deleteOutlet(id, name) {
    if (confirm(`Yakin ingin menghapus cabang "${name}"?`)) {
      await window.payposDB.delete('outlets', id);
      window.payposApp.showToast(`Cabang ${name} telah dihapus.`, 'success');
      this.loadOutlets();
    }
  }
}

window.userManager = new UserManager();
window.outletManager = new OutletManager();
