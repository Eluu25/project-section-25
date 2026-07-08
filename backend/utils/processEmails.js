/**
 * Central dispatcher — one entry point for all business-process emails (Brevo).
 */
const { sendEmail, fireAndForgetEmail } = require('./emailService');
const templates = require('./emailTemplates');

const PROCESS_BUILDERS = {
  registration_submitted: (d) => templates.buildRegistrationSubmittedEmail({ name: d.name }),
  welcome: (d) => templates.buildWelcomeEmail({ name: d.name }),
  account_created: (d) => templates.buildAccountCreatedEmail({
    name: d.name,
    username: d.username,
    temporaryPassword: d.temporaryPassword
  }),
  otp_verification: (d) => templates.buildOtpVerificationEmail({
    name: d.name,
    code: d.code,
    expiresMinutes: d.expiresMinutes
  }),
  password_reset: (d) => templates.buildPasswordResetEmail({
    resetLink: d.resetLink,
    expiresHours: d.expiresHours
  }),
  password_reset_success: () => templates.buildPasswordResetSuccessEmail(),
  deposit_success: (d) => templates.buildDepositSuccessEmail(d),
  withdrawal_success: (d) => templates.buildWithdrawalSuccessEmail(d),
  deposit_pending: (d) => templates.buildDepositPendingEmail(d),
  withdrawal_pending: (d) => templates.buildWithdrawalPendingEmail(d),
  deposit_rejected: (d) => templates.buildTransactionRejectedEmail({
    name: d.name,
    processLabel: 'Deposit',
    accountId: d.accountId,
    amount: d.amount,
    reason: d.reason
  }),
  withdrawal_rejected: (d) => templates.buildTransactionRejectedEmail({
    name: d.name,
    processLabel: 'Withdrawal',
    accountId: d.accountId,
    amount: d.amount,
    reason: d.reason
  }),
  loan_approved: (d) => templates.buildLoanApprovalEmail(d.loan || d),
  loan_rejected: (d) => templates.buildLoanRejectionEmail(d.loan || d, d.reason),
  loan_application_submitted: (d) => templates.buildApplicationSubmittedEmail({
    name: d.name,
    applicationType: 'Loan application',
    referenceId: d.referenceId,
    amount: d.amount
  }),
  savings_application_submitted: (d) => templates.buildApplicationSubmittedEmail({
    name: d.name,
    applicationType: 'Savings account application',
    referenceId: d.referenceId,
    amount: d.amount
  }),
  kyc_verified: (d) => templates.buildKycVerifiedEmail({ name: d.name }),
  kyc_rejected: (d) => templates.buildKycRejectedEmail({ name: d.name, reason: d.reason }),
  suspicious_login: (d) => templates.buildSuspiciousLoginEmail(d),
  payment_reminder: (d) => {
    const subject = `Payment reminder — loan ${d.loan_id}`;
    const text = `Dear ${d.client_name}, payment of ${d.total_amount} ETB is due on ${d.due_date}.`;
    const html = templates.wrapEmailLayout({
      title: 'Payment reminder',
      bodyHtml: `<p>Dear <strong>${d.client_name}</strong>, your loan payment of <strong>${d.total_amount} ETB</strong> is due on <strong>${d.due_date}</strong>.</p>`
    });
    return { subject, text, html };
  },
  interest_credit: (d) => {
    const subject = `Interest credited — ${d.account_id}`;
    const html = templates.wrapEmailLayout({
      title: 'Interest credited',
      accentColor: templates.BRAND.accent,
      bodyHtml: `<p>Dear <strong>${d.client_name}</strong>, interest of <strong>${Number(d.interest_amount).toFixed(2)} ETB</strong> was added. New balance: <strong>${Number(d.balance_after).toFixed(2)} ETB</strong>.</p>`
    });
    return { subject, text, html };
  },
  approval_pending_staff: (d) => templates.buildApprovalPendingStaffEmail({
    requestId: d.requestId,
    processLabel: d.processLabel || templates.labelApprovalType(d.type),
    amount: d.amount,
    entityId: d.entityId,
    requesterName: d.requesterName
  }),
  approval_decision: (d) => templates.buildApprovalDecisionEmail({
    name: d.name,
    approved: d.approved,
    processLabel: d.processLabel || templates.labelApprovalType(d.type),
    requestId: d.requestId,
    reason: d.reason
  }),
  request_cancelled: (d) => templates.buildRequestCancelledEmail({
    name: d.name,
    processLabel: d.processLabel || templates.labelApprovalType(d.type),
    requestId: d.requestId
  }),
  contact_acknowledgement: (d) => templates.buildContactAcknowledgementEmail(d)
};

/**
 * Send a process email (awaits result). Never throws.
 */
async function sendProcessEmail(processType, data = {}) {
  const builder = PROCESS_BUILDERS[processType];
  if (!builder) {
    console.warn('[EMAIL] Unknown process type:', processType);
    return { success: false, error: `Unknown process type: ${processType}` };
  }

  const built = builder(data);
  if (!built) {
    return { success: false, error: 'Template build failed' };
  }

  const to = data.email || data.to;
  if (!to) {
    return { success: false, error: 'Recipient email is required' };
  }

  const { subject, text, html } = built;
  return sendEmail({ to, subject, text, html });
}

/** Queue process email without blocking the HTTP response. */
function notifyProcess(processType, data = {}) {
  fireAndForgetEmail(() => sendProcessEmail(processType, data));
}

/** Notify staff roles that a new approval is waiting. */
async function notifyApprovalPendingStaff({ requestId, type, amount, entityId, requestedBy }) {
  const { db } = require('../config/database');
  const approvalLevel = Number(amount || 0) > 100000 ? 'ceo' : 'branch_manager';
  const roles = approvalLevel === 'ceo' ? ['ceo', 'admin'] : ['branch_manager', 'admin'];
  const processLabel = templates.labelApprovalType(type);

  return new Promise((resolve) => {
    db.all(
      `SELECT email, username FROM users WHERE role IN (${roles.map(() => '?').join(',')}) AND email IS NOT NULL AND trim(email) <> ''`,
      roles,
      async (err, rows) => {
        if (err || !rows?.length) {
          resolve();
          return;
        }
        let requesterName = null;
        if (requestedBy) {
          const u = await new Promise((res) => {
            db.get('SELECT username, name FROM users WHERE id = ?', [requestedBy], (e, row) => res(row));
          });
          requesterName = u?.name || u?.username || `User #${requestedBy}`;
        }
        for (const row of rows) {
          notifyProcess('approval_pending_staff', {
            email: row.email,
            requestId,
            type,
            processLabel,
            amount,
            entityId,
            requesterName
          });
        }
        resolve();
      }
    );
  });
}

/** Email the user who submitted an approval request. */
async function notifyApprovalRequester({
  requestId,
  type,
  requestedBy,
  approved,
  reason,
  processType = 'approval_decision'
}) {
  if (!requestedBy) return;
  const { db } = require('../config/database');
  const user = await new Promise((resolve) => {
    db.get('SELECT email, name, username FROM users WHERE id = ?', [requestedBy], (err, row) => resolve(row || null));
  });
  if (!user?.email) return;

  notifyProcess(processType, {
    email: user.email,
    name: user.name || user.username,
    approved,
    type,
    requestId,
    reason,
    processLabel: templates.labelApprovalType(type)
  });
}

/** Email client by client_id for a process. */
async function notifyClientProcess(clientId, processType, data = {}) {
  if (!clientId) return;
  const { db } = require('../config/database');
  const client = await new Promise((resolve) => {
    db.get('SELECT id, name, email FROM clients WHERE id = ?', [clientId], (err, row) => resolve(row || null));
  });
  if (!client?.email) return;
  notifyProcess(processType, { ...data, email: client.email, name: client.name || data.name });
}

module.exports = {
  sendProcessEmail,
  notifyProcess,
  notifyApprovalPendingStaff,
  notifyApprovalRequester,
  notifyClientProcess,
  labelApprovalType: templates.labelApprovalType
};
