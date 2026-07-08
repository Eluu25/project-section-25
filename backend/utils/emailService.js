/**
 * Legacy email facade — delegates to services/emailService.js + emailTemplates.js.
 * Existing imports from '../utils/emailService' remain unchanged.
 */
const coreEmail = require('../services/emailService');
const templates = require('./emailTemplates');
const { db } = require('../config/database');

const logEmailAttempt = (to, subject, text, result) => new Promise((resolve) => {
  db.run(
    'INSERT INTO email_log (recipient_email, subject, body, status, error_message, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
    [to, subject, text || '', result.success ? 'Sent' : 'Failed', result.error || null, new Date().toISOString()],
    (err) => {
      if (err) console.warn('[EMAIL] Could not write email_log:', err.message);
      resolve();
    }
  );
});

async function coreSendEmail(payload) {
  const normalized = typeof payload === 'string'
    ? null
    : payload;

  if (!normalized) {
    return { success: false, error: 'Invalid email payload' };
  }

  const result = await coreEmail.sendEmail({
    to: normalized.to,
    subject: normalized.subject,
    html: normalized.html,
    text: normalized.text
  });

  await logEmailAttempt(normalized.to, normalized.subject, normalized.text, result);
  return result;
}

/**
 * Backward-compatible signature: sendEmail(to, subject, text, html?)
 * Also accepts: sendEmail({ to, subject, html, text })
 */
async function sendEmail(toOrPayload, subject, text, html = null) {
  let payload;
  if (typeof toOrPayload === 'object' && toOrPayload !== null) {
    payload = toOrPayload;
  } else {
    payload = { to: toOrPayload, subject, text, html };
  }
  return coreSendEmail(payload);
}

/** Fire-and-forget — never throws; safe inside controllers. Logs delivery failures. */
function fireAndForgetEmail(fn) {
  Promise.resolve()
    .then(fn)
    .then((result) => {
      if (result && result.success === false) {
        console.error('[EMAIL] Delivery failed:', {
          error: result.error,
          provider: result.provider
        });
      }
    })
    .catch((err) => console.error('[EMAIL] Async send failed:', err?.message || err));
}

async function sendFromTemplate(builder, data) {
  const { subject, text, html } = builder(data);
  return sendEmail({ to: data.to || data.email, subject, text, html });
}

async function sendWelcomeEmail(client) {
  const { subject, text, html } = templates.buildWelcomeEmail({ name: client.name });
  return sendEmail({ to: client.email, subject, text, html });
}

async function sendAccountCreatedEmail({ email, name, username, temporaryPassword }) {
  const { subject, text, html } = templates.buildAccountCreatedEmail({ name, username, temporaryPassword });
  return sendEmail({ to: email, subject, text, html });
}

async function sendOtpVerificationEmail({ email, name, code, expiresMinutes }) {
  const { subject, text, html } = templates.buildOtpVerificationEmail({ name, code, expiresMinutes });
  return sendEmail({ to: email, subject, text, html });
}

async function sendPasswordResetEmail({ email, resetLink, expiresHours }) {
  const { subject, text, html } = templates.buildPasswordResetEmail({ resetLink, expiresHours });
  return sendEmail({ to: email, subject, text, html });
}

async function sendPasswordResetSuccessEmail(email) {
  const { subject, text, html } = templates.buildPasswordResetSuccessEmail();
  return sendEmail({ to: email, subject, text, html });
}

async function sendDepositSuccessEmail({ email, name, accountId, amount, balanceAfter, transactionId }) {
  const { subject, text, html } = templates.buildDepositSuccessEmail({
    name, accountId, amount, balanceAfter, transactionId
  });
  return sendEmail({ to: email, subject, text, html });
}

async function sendWithdrawalSuccessEmail({ email, name, accountId, amount, balanceAfter, transactionId }) {
  const { subject, text, html } = templates.buildWithdrawalSuccessEmail({
    name, accountId, amount, balanceAfter, transactionId
  });
  return sendEmail({ to: email, subject, text, html });
}

async function sendLoanApprovalEmail(loan) {
  const { subject, text, html } = templates.buildLoanApprovalEmail(loan);
  return sendEmail({ to: loan.client_email, subject, text, html });
}

async function sendLoanRejectionEmail(loan, reason) {
  const { subject, text, html } = templates.buildLoanRejectionEmail(loan, reason);
  return sendEmail({ to: loan.client_email, subject, text, html });
}

async function sendSuspiciousLoginAlert({ email, username, attempts, locked, ipAddress }) {
  const { subject, text, html } = templates.buildSuspiciousLoginEmail({ username, attempts, locked, ipAddress });
  return sendEmail({ to: email, subject, text, html });
}

async function sendRegistrationSubmittedEmail({ email, name }) {
  const { subject, text, html } = templates.buildRegistrationSubmittedEmail({ name });
  return sendEmail({ to: email, subject, text, html });
}

async function sendPaymentReminder(payment) {
  const subject = `Payment Reminder - Loan ${payment.loan_id}`;
  const text = `Dear ${payment.client_name},\n\nPayment of ${payment.total_amount} ETB for loan ${payment.loan_id} is due on ${payment.due_date}.\n\n${templates.BRAND.name}`;
  const html = templates.wrapEmailLayout({
    title: 'Payment reminder',
    preheader: `Due ${payment.due_date}`,
    bodyHtml: `
      <p>Dear <strong>${payment.client_name}</strong>,</p>
      <p>Your payment of <strong>${payment.total_amount} ETB</strong> for loan <strong>${payment.loan_id}</strong> is due on <strong>${payment.due_date}</strong>.</p>
      <p>Please pay on time to avoid late fees.</p>`
  });
  return sendEmail({ to: payment.email, subject, text, html });
}

async function sendInterestCreditEmail(data) {
  const subject = `Interest credited — ${data.account_id}`;
  const text = `Dear ${data.client_name}, interest of ${data.interest_amount} ETB was credited. Balance: ${data.balance_after} ETB.`;
  const html = templates.wrapEmailLayout({
    title: 'Interest credit',
    accentColor: templates.BRAND.accent,
    bodyHtml: `
      <p>Dear <strong>${data.client_name}</strong>,</p>
      <p>Interest of <strong>${Number(data.interest_amount).toFixed(2)} ETB</strong> was credited to account <strong>${data.account_id}</strong>.</p>
      <p>New balance: <strong>${Number(data.balance_after).toFixed(2)} ETB</strong></p>`
  });
  return sendEmail({ to: data.client_email, subject, text, html });
}

async function sendApprovalRequestEmail(data) {
  const subject = `Approval required — ${data.entity_id}`;
  const text = `Transaction ${data.type} for ${data.amount} ETB requires approval.`;
  const html = templates.wrapEmailLayout({
    title: 'Approval required',
    accentColor: templates.BRAND.warning,
    bodyHtml: `<p>A transaction requires your approval.</p>
      <p><strong>Entity:</strong> ${data.entity_id}<br/><strong>Amount:</strong> ${data.amount} ETB</p>`
  });
  return sendEmail({ to: data.manager_email, subject, text, html });
}

async function testEmailConfig() {
  return coreEmail.verifyBrevoConfig();
}

const emailService = {
  sendEmail,
  fireAndForgetEmail,
  sendWelcomeEmail,
  sendAccountCreatedEmail,
  sendOtpVerificationEmail,
  sendPasswordResetEmail,
  sendPasswordResetSuccessEmail,
  sendDepositSuccessEmail,
  sendWithdrawalSuccessEmail,
  sendLoanApprovalEmail,
  sendLoanRejectionEmail,
  sendSuspiciousLoginAlert,
  sendRegistrationSubmittedEmail,
  sendPaymentReminder,
  sendInterestCreditEmail,
  sendApprovalRequestEmail,
  testEmailConfig
};

module.exports = {
  ...emailService,
  emailService
};
