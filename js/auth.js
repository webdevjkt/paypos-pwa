/**
 * PayPOS - Auth & Landing Controller for index.html
 * Handles Login, Registration, Session verification, and PWA Installation prompts.
 */

class PayPOSLanding {
  constructor() {
    this.deferredPrompt = null;
  }

  async init() {
    await window.payposDB.init();
    this.initPWA();
    this.checkCurrentSession();
    this.bindEvents();
  }

  checkCurrentSession() {
    const savedUser = localStorage.getItem('paypos_current_user');
    const loggedInBanner = document.getElementById('logged-in-banner');
    const authFormsContainer = document.getElementById('auth-forms-container');
    const loggedUserName = document.getElementById('logged-user-name');

    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (loggedInBanner && authFormsContainer) {
          loggedInBanner.style.display = 'block';
          authFormsContainer.style.display = 'none';
          if (loggedUserName) loggedUserName.textContent = user.name;
        }
      } catch (e) {
        localStorage.removeItem('paypos_current_user');
      }
    }
  }

  async handleLogin(company, username, pin) {
    const cfUrl = localStorage.getItem('paypos_cf_api_url') || 'https://paypos-api.wahyuhermawan788.workers.dev';
    const tenantCode = (company || 'DEMO').trim().toUpperCase();
    const u = (username || '').trim();
    const p = (pin || '').trim();

    try {
      this.showToast('Memverifikasi akun ke cloud...', 'info');

      // 1. Verifikasi online via Cloudflare Workers jika ada koneksi
      if (navigator.onLine && cfUrl) {
        try {
          const res = await fetch(`${cfUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ company: tenantCode, username: u, password: p })
          });

          const data = await res.json();
          if (res.ok && data.success) {
            localStorage.setItem('paypos_current_user', JSON.stringify(data.user));
            localStorage.setItem('paypos_tenant_code', data.user.tenantCode || tenantCode);
            window.payposAudio.playSuccess();
            this.showToast(`Selamat datang, ${data.user.name}! (${data.user.companyName})`, 'success');
            setTimeout(() => { window.location.href = 'pos.html'; }, 700);
            return;
          } else {
            // Jika akun ditolak oleh database Cloudflare (401, 404, 500), lempar error
            throw new Error(data.message || data.error || 'Login cloud gagal. Periksa kembali akun Anda.');
          }
        } catch (netErr) {
          // Jika error adalah penolakan akun dari server, jangan fallback ke user lokal
          if (netErr.message.includes('tidak ditemukan') || netErr.message.includes('salah') || netErr.message.includes('dinonaktifkan')) {
            throw netErr;
          }
          console.warn('[Offline Mode]', netErr.message);
        }
      }

      // 2. Offline / Local Fallback
      const user = await window.payposDB.authenticate(u, p);
      user.tenantCode = tenantCode;
      user.companyName = user.storeName || 'PayPOS Store';
      localStorage.setItem('paypos_current_user', JSON.stringify(user));
      localStorage.setItem('paypos_tenant_code', tenantCode);
      window.payposAudio.playSuccess();
      this.showToast(`Login berhasil (Mode Offline)! Mengalihkan...`, 'success');
      setTimeout(() => {
        window.location.href = 'pos.html';
      }, 700);

    } catch (err) {
      window.payposAudio.playError();
      this.showToast(err.message, 'error');
    }
  }

  async handleRegister(companyName, companyCode, ownerName, username, pin, phone) {
    const cfUrl = localStorage.getItem('paypos_cf_api_url') || 'https://paypos-api.wahyuhermawan788.workers.dev';
    const cleanCode = (companyCode || companyName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)).trim().toUpperCase();

    try {
      this.showToast('Mendaftarkan perusahaan ke cloud...', 'info');

      // 1. Daftarkan ke Cloudflare D1
      if (navigator.onLine && cfUrl) {
        try {
          const res = await fetch(`${cfUrl}/api/auth/register-company`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyName,
              companyCode: cleanCode,
              ownerName,
              username,
              password: pin,
              phone
            })
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || 'Gagal mendaftar di Cloud.');
          }
        } catch (e) {
          console.warn('[Register Cloud]', e.message);
        }
      }

      // 2. Simpan juga di local IndexedDB
      const newUser = await window.payposDB.register(ownerName, username, pin, companyName);
      newUser.tenantCode = cleanCode;
      newUser.companyName = companyName;
      localStorage.setItem('paypos_current_user', JSON.stringify(newUser));
      localStorage.setItem('paypos_tenant_code', cleanCode);

      window.payposAudio.playSuccess();
      this.showToast(`🎉 Perusahaan "${companyName}" berhasil terdaftar! Kode Login: ${cleanCode}`, 'success');
      setTimeout(() => {
        window.location.href = 'pos.html';
      }, 1000);
    } catch (err) {
      window.payposAudio.playError();
      this.showToast(err.message, 'error');
    }
  }

  fillDemoLogin(company, username, pin) {
    const cInput = document.getElementById('landing-login-company');
    const uInput = document.getElementById('landing-login-username');
    const pInput = document.getElementById('landing-login-pin');
    if (cInput && uInput && pInput) {
      cInput.value = company;
      uInput.value = username;
      pInput.value = pin;
      this.handleLogin(company, username, pin);
    }
  }

  logout() {
    localStorage.removeItem('paypos_current_user');
    const loggedInBanner = document.getElementById('logged-in-banner');
    const authFormsContainer = document.getElementById('auth-forms-container');
    if (loggedInBanner && authFormsContainer) {
      loggedInBanner.style.display = 'none';
      authFormsContainer.style.display = 'block';
    }
    this.showToast('Anda telah keluar dari akun.', 'info');
  }

  /* PWA Installation */
  initPWA() {
    const installBtns = document.querySelectorAll('.trigger-pwa-install');

    // ─── Detect Platform ───────────────────────────────────────────
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isStandalone = window.navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;

    // ─── Already installed as standalone app ─────────────────────
    if (isStandalone) {
      installBtns.forEach((btn) => {
        btn.innerHTML = '<span>✅</span><span>Aplikasi Sudah Terpasang</span>';
        btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
        btn.style.cursor = 'default';
        btn.disabled = true;
      });
      return;
    }

    // ─── iOS Safari: hanya bisa install manual via Share ─────────
    if (isIOS && isSafari) {
      installBtns.forEach((btn) => {
        btn.innerHTML = '<span>🍎</span><span>Cara Install di iPhone / iPad</span>';
        btn.addEventListener('click', () => this.showInstallGuideModal());
      });
      return;
    }

    // ─── iOS di Chrome/Firefox (bukan Safari) ────────────────────
    if (isIOS && !isSafari) {
      installBtns.forEach((btn) => {
        btn.innerHTML = '<span>⚠️</span><span>Gunakan Safari untuk Install di iPhone</span>';
        btn.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
        btn.addEventListener('click', () => {
          this.showToast('Di iPhone/iPad, buka di Safari lalu gunakan Share → Add to Home Screen', 'info');
          this.showInstallGuideModal();
        });
      });
      return;
    }

    // ─── Android / Desktop Chrome: gunakan beforeinstallprompt ───
    const updateButtonsReady = () => {
      installBtns.forEach((btn) => {
        btn.innerHTML = '<span>📲</span><span>Install Aplikasi (PWA)</span>';
        btn.disabled = false;
      });
    };

    if (window.deferredPWAInstallPrompt) {
      this.deferredPrompt = window.deferredPWAInstallPrompt;
      updateButtonsReady();
    }

    const triggerInstall = async () => {
      const promptEvent = this.deferredPrompt || window.deferredPWAInstallPrompt;
      if (promptEvent) {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        console.log(`[PWA] Install outcome: ${outcome}`);
        if (outcome === 'accepted') {
          this.showToast('🎉 Menginstall PayPOS...', 'success');
        } else {
          this.showToast('Install dibatalkan. Tekan tombol kapan saja untuk mencoba lagi.', 'info');
        }
        this.deferredPrompt = null;
        window.deferredPWAInstallPrompt = null;
      } else {
        this.showInstallGuideModal();
      }
    };

    installBtns.forEach((btn) => btn.addEventListener('click', triggerInstall));

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      window.deferredPWAInstallPrompt = e;
      console.log('[PWA] Install prompt available');
      updateButtonsReady();
    });

    window.addEventListener('appinstalled', () => {
      this.showToast('🎉 PayPOS berhasil diinstall di perangkat Anda!', 'success');
      this.deferredPrompt = null;
      window.deferredPWAInstallPrompt = null;
      installBtns.forEach((btn) => {
        btn.innerHTML = '<span>✅</span><span>Aplikasi Sudah Terpasang!</span>';
        btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
        btn.style.animation = 'none';
        btn.disabled = true;
      });
    });
  }

  showInstallGuideModal() {
    const modal = document.getElementById('modal-install-guide');
    if (modal) modal.classList.add('active');
  }

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

  bindEvents() {
    const btnTabLogin = document.getElementById('landing-tab-login');
    const btnTabRegister = document.getElementById('landing-tab-register');
    const formLogin = document.getElementById('landing-form-login');
    const formRegister = document.getElementById('landing-form-register');

    if (btnTabLogin && btnTabRegister) {
      btnTabLogin.addEventListener('click', () => {
        btnTabLogin.classList.add('active');
        btnTabRegister.classList.remove('active');
        if (formLogin) formLogin.style.display = 'flex';
        if (formRegister) formRegister.style.display = 'none';
      });

      btnTabRegister.addEventListener('click', () => {
        btnTabRegister.classList.add('active');
        btnTabLogin.classList.remove('active');
        if (formLogin) formLogin.style.display = 'none';
        if (formRegister) formRegister.style.display = 'flex';
      });
    }

    if (formLogin) {
      formLogin.addEventListener('submit', (e) => {
        e.preventDefault();
        const c = document.getElementById('landing-login-company')?.value || 'DEMO';
        const u = document.getElementById('landing-login-username').value;
        const p = document.getElementById('landing-login-pin').value;
        this.handleLogin(c, u, p);
      });
    }

    if (formRegister) {
      formRegister.addEventListener('submit', (e) => {
        e.preventDefault();
        const storeName = document.getElementById('landing-reg-store').value.trim();
        const companyCode = document.getElementById('landing-reg-company-code').value.trim();
        const ownerName = document.getElementById('landing-reg-name').value.trim();
        const username = document.getElementById('landing-reg-username').value.trim();
        const pin = document.getElementById('landing-reg-pin').value.trim();
        const phone = document.getElementById('landing-reg-phone')?.value.trim() || '';
        this.handleRegister(storeName, companyCode, ownerName, username, pin, phone);
      });
    }

    // Toggle Password Eye Icon on Landing
    const toggleLandingPin = document.getElementById('toggle-landing-login-pin');
    const landingPinInput = document.getElementById('landing-login-pin');
    if (toggleLandingPin && landingPinInput) {
      toggleLandingPin.addEventListener('click', () => {
        const isPass = landingPinInput.type === 'password';
        landingPinInput.type = isPass ? 'text' : 'password';
        toggleLandingPin.textContent = isPass ? '🙈' : '👁️';
      });
    }

    document.querySelectorAll('[data-modal-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.payposLanding = new PayPOSLanding();
  window.payposLanding.init();
});
