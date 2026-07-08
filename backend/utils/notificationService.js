const { db } = require('../config/database');
const { sendEmail: sendBrevoEmail } = require('../services/emailService');

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const clientAllowsNotification = async (clientId, category = 'general') => {
  if (!clientId) return true;
  const row = await runGet(
    'SELECT notify_email, notify_sms, notify_payment_reminders FROM clients WHERE id = ?',
    [clientId]
  );
  if (!row) return true;
  if (category === 'payment_reminder' || category === 'deposit_reminder') {
    return Number(row.notify_payment_reminders ?? 1) === 1;
  }
  if (category === 'missed_deposit') {
    return true;
  }
  if (category === 'sms') {
    return Number(row.notify_sms ?? 1) === 1;
  }
  return Number(row.notify_email ?? 1) === 1;
};

async function sendEmailReminder({ to, subject, text, html, category = 'general', metadata = {}, clientId = null }) {
  if (!to) {
    return { success: false, skipped: true, error: 'Recipient email is required' };
  }

  const resolvedClientId = clientId || metadata.client_id || metadata.clientId || null;
  const allowed = await clientAllowsNotification(resolvedClientId, category);
  if (!allowed) {
    return { success: false, skipped: true, error: 'Client has disabled this notification channel' };
  }

  const result = await sendBrevoEmail({
    to,
    subject,
    text,
    html: html || `<p>${String(text || '').replace(/\n/g, '<br/>')}</p>`
  });

  await runExec(
    'INSERT INTO email_log (recipient_email, subject, body, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      to,
      subject,
      text || '',
      result.success ? 'Sent' : 'Failed',
      result.success ? null : (result.error || null),
      new Date().toISOString()
    ]
  );

  return { ...result, provider: 'brevo', category, metadata };
}

async function sendSMSReminder({ client_id, phone, message, event_type = 'reminder', related_account_id = null, related_transaction_id = null }) {
  if (!phone) {
    return { success: false, skipped: true, error: 'Phone number is required' };
  }

  const allowed = await clientAllowsNotification(client_id, 'sms');
  if (!allowed) {
    return { success: false, skipped: true, error: 'Client has disabled SMS notifications' };
  }

  await runExec(
    `INSERT INTO sms_notifications
     (client_id, phone_number, message_type, message, event_type, related_account_id, related_transaction_id, status, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client_id || null,
      phone,
      event_type,
      message || '',
      event_type,
      related_account_id,
      related_transaction_id,
      'Pending',
      new Date().toISOString()
    ]
  );

  return { success: true, queued: true };
}

module.exports = {
  sendEmailReminder,
  sendSMSReminder
};
