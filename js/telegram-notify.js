/**
 * PayPOS - Telegram Notification Helper
 * Sends formatted receipt & transaction alerts to Telegram Bot
 */

class TelegramNotifier {
  constructor() {}

  async sendTransactionAlert(transaction) {
    try {
      const settings = await window.payposDB.getAllSettings();
      const botToken = (settings.telegramBotToken || '').trim();
      const chatId = (settings.telegramChatId || '').trim();
      const isEnabled = settings.telegramEnabled === true || settings.telegramEnabled === 'true' || settings.telegramEnabled === 'yes';

      if (!isEnabled || !botToken || !chatId) {
        return { success: false, reason: 'Telegram notification is disabled or not configured' };
      }

      // Format Items List
      let itemsText = '';
      if (Array.isArray(transaction.items)) {
        itemsText = transaction.items.map(it => {
          const itemTotal = (it.price * it.qty).toLocaleString('id-ID');
          return `  ▫️ <b>${it.name}</b> x${it.qty} = Rp ${itemTotal}`;
        }).join('\n');
      }

      const totalFormatted = (transaction.finalTotal || 0).toLocaleString('id-ID');
      const paidFormatted = (transaction.amountPaid || 0).toLocaleString('id-ID');
      const changeFormatted = (transaction.change || 0).toLocaleString('id-ID');
      const storeTitle = transaction.storeName || settings.storeName || 'PayPOS Store';
      const cashier = transaction.cashierName || 'Kasir';
      const paymentMethod = transaction.paymentMethod || 'Tunai';

      const d = new Date(transaction.timestamp || Date.now());
      const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

      // Telegram Markdown / HTML Formatted Message
      const message = `🔔 <b>TRANSAKSI BARU - ${storeTitle.toUpperCase()}</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🧾 <b>No. Struk:</b> <code>${transaction.invoiceNumber}</code>\n` +
        `📅 <b>Waktu:</b> ${dateStr}, ${timeStr} WIB\n` +
        `👤 <b>Kasir:</b> ${cashier}\n` +
        `💳 <b>Metode Bayar:</b> ${paymentMethod}\n\n` +
        `📦 <b>Rincian Pembelian:</b>\n` +
        `${itemsText}\n\n` +
        `💰 <b>TOTAL: Rp ${totalFormatted}</b>\n` +
        `💵 <b>Bayar:</b> Rp ${paidFormatted}\n` +
        `🪙 <b>Kembali:</b> Rp ${changeFormatted}\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `⚡ <i>Dikirim otomatis oleh PayPOS PWA</i>`;

      const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      const resData = await res.json();
      if (!res.ok || !resData.ok) {
        console.warn('[Telegram Error]', resData);
        return { success: false, error: resData.description || 'Gagal mengirim pesan Telegram' };
      }

      console.log('✅ Telegram alert sent successfully for invoice:', transaction.invoiceNumber);
      return { success: true };
    } catch (err) {
      console.warn('[Telegram Exception]', err.message);
      return { success: false, error: err.message };
    }
  }

  async testConnection(botToken, chatId) {
    if (!botToken || !chatId) {
      throw new Error('Bot Token dan Chat ID wajib diisi.');
    }

    const testMsg = `🔔 <b>UJI KONEKSI TELEGRAM BOT PAYPOS</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `✅ Bot Telegram berhasil terhubung dengan sistem kasir PayPOS!\n` +
      `📅 Waktu Uji: ${new Date().toLocaleString('id-ID')}\n` +
      `━━━━━━━━━━━━━━━━━━━━`;

    const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: testMsg,
        parse_mode: 'HTML'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.description || 'Gagal menghubungi Telegram Bot. Periksa kembali Token atau Chat ID.');
    }
    return data;
  }
}

window.telegramNotifier = new TelegramNotifier();
