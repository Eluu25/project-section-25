/**
 * Branded HTML email templates for Edekise Microfinance.
 * All builders return { subject, text, html }.
 */

const BRAND = {
  name: 'Edekise Microfinance',
  primary: '#1e3a5f',
  accent: '#2563eb',
  success: '#059669',
  warning: '#b45309',
  danger: '#dc2626',
  muted: '#6b7280',
  bg: '#f3f4f6',
  card: '#ffffff'
};

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return '0 ETB';
  return `${n.toLocaleString('en-ET')} ETB`;
}

/**
 * Reusable responsive layout wrapper.
 */
function wrapEmailLayout({ title, bodyHtml, preheader = '', accentColor = BRAND.accent }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>${safeTitle}</title>
  <!--[if mso]><style type="text/css">body, table, td { font-family: Arial, sans-serif !important; }</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${safePreheader}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${BRAND.card};border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND.primary} 0%,${accentColor} 100%);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">${BRAND.name}</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:13px;">${safeTitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:${BRAND.muted};">
                &copy; ${new Date().getFullYear()} ${BRAND.name}. This is an automated message — please do not reply directly.
              </p>
              <p style="margin:8px 0 0;font-size:12px;"><a href="${escapeHtml(FRONTEND_URL)}" style="color:${BRAND.accent};text-decoration:none;">Client portal</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWelcomeEmail({ name }) {
  const subject = `Welcome to ${BRAND.name}`;
  const text = `Dear ${name},\n\nWelcome to ${BRAND.name}. Your account has been created successfully.\n\nBest regards,\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Welcome',
    preheader: 'Your account is ready',
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>We are pleased to welcome you to <strong>${BRAND.name}</strong>. Your account has been created and you may access services through our client portal.</p>
      <table role="presentation" width="100%" style="margin:24px 0;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;">
        <tr><td style="padding:16px;color:#1e40af;font-size:14px;">Log in to view balances, apply for loans, and manage your savings.</td></tr>
      </table>
      <p style="margin:0;">Best regards,<br/><strong>${BRAND.name}</strong></p>`
  });
  return { subject, text, html };
}

function buildAccountCreatedEmail({ name, username, temporaryPassword }) {
  const subject = 'Your account credentials — Edekise Microfinance';
  const text = `Dear ${name},\n\nYour account is active.\nUsername: ${username}\nTemporary password: ${temporaryPassword}\n\nChange your password after first login.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Account created',
    preheader: 'Login credentials inside',
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your client account is now active. Use the credentials below for your first login:</p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;">
        <tr><td style="padding:16px;font-size:14px;">
          <strong>Username:</strong> ${escapeHtml(username)}<br/>
          <strong>Temporary password:</strong> ${escapeHtml(temporaryPassword)}
        </td></tr>
      </table>
      <p style="color:${BRAND.warning};font-size:14px;">For security, change your password immediately after logging in.</p>`
  });
  return { subject, text, html };
}

function buildOtpVerificationEmail({ name, code, expiresMinutes = 10 }) {
  const subject = 'Your verification code — Edekise Microfinance';
  const text = `Dear ${name},\n\nYour verification code is: ${code}\n\nThis code expires in ${expiresMinutes} minutes.\n\nIf you did not request this, ignore this email.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Verification code',
    preheader: `Code: ${code}`,
    accentColor: BRAND.primary,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Enter this one-time verification code to continue:</p>
      <p style="text-align:center;margin:28px 0;">
        <span style="display:inline-block;padding:16px 32px;font-size:28px;font-weight:700;letter-spacing:6px;background:#f3f4f6;border-radius:8px;color:${BRAND.primary};">${escapeHtml(code)}</span>
      </p>
      <p style="font-size:14px;color:${BRAND.muted};">Expires in <strong>${expiresMinutes} minutes</strong>. Do not share this code.</p>`
  });
  return { subject, text, html };
}

function buildPasswordResetEmail({ resetLink, expiresHours = 1 }) {
  const subject = 'Password reset request — Edekise Microfinance';
  const text = `Reset your password using this link (expires in ${expiresHours} hour):\n${resetLink}\n\nIf you did not request this, ignore this email.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Password reset',
    preheader: 'Reset link inside',
    accentColor: BRAND.warning,
    bodyHtml: `
      <p>You requested a password reset for your ${BRAND.name} account.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:14px 28px;background:${BRAND.accent};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>
      </p>
      <p style="font-size:13px;color:${BRAND.muted};">Or copy this link:<br/><a href="${escapeHtml(resetLink)}" style="color:${BRAND.accent};word-break:break-all;">${escapeHtml(resetLink)}</a></p>
      <p style="font-size:14px;">Link expires in <strong>${expiresHours} hour</strong>.</p>`
  });
  return { subject, text, html };
}

function buildPasswordResetSuccessEmail() {
  const subject = 'Password reset successful — Edekise Microfinance';
  const text = `Your password was changed successfully.\n\nIf you did not make this change, contact support immediately.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Password updated',
    preheader: 'Your password was changed',
    accentColor: BRAND.success,
    bodyHtml: `
      <p>Your password was <strong>changed successfully</strong>.</p>
      <p style="font-size:14px;color:${BRAND.danger};">If you did not make this change, contact your branch immediately.</p>`
  });
  return { subject, text, html };
}

function buildDepositSuccessEmail({ name, accountId, amount, balanceAfter, transactionId }) {
  const subject = `Deposit confirmed — ${accountId}`;
  const text = `Dear ${name},\n\nDeposit of ${formatMoney(amount)} posted to account ${accountId}.\nNew balance: ${formatMoney(balanceAfter)}\nTransaction: ${transactionId || 'N/A'}\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Deposit confirmed',
    preheader: `+${formatMoney(amount)}`,
    accentColor: BRAND.success,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your deposit has been <strong>successfully posted</strong>.</p>
      <table role="presentation" width="100%" style="margin:20px 0;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Account</td><td style="padding:8px 0;text-align:right;"><strong>${escapeHtml(accountId)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Amount</td><td style="padding:8px 0;text-align:right;color:${BRAND.success};"><strong>+${formatMoney(amount)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">New balance</td><td style="padding:8px 0;text-align:right;"><strong>${formatMoney(balanceAfter)}</strong></td></tr>
        ${transactionId ? `<tr><td style="padding:8px 0;color:${BRAND.muted};">Reference</td><td style="padding:8px 0;text-align:right;">${escapeHtml(transactionId)}</td></tr>` : ''}
      </table>`
  });
  return { subject, text, html };
}

function buildWithdrawalSuccessEmail({ name, accountId, amount, balanceAfter, transactionId }) {
  const subject = `Withdrawal confirmed — ${accountId}`;
  const text = `Dear ${name},\n\nWithdrawal of ${formatMoney(amount)} from account ${accountId}.\nNew balance: ${formatMoney(balanceAfter)}\nTransaction: ${transactionId || 'N/A'}\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Withdrawal confirmed',
    preheader: `-${formatMoney(amount)}`,
    accentColor: BRAND.primary,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your withdrawal has been <strong>processed successfully</strong>.</p>
      <table role="presentation" width="100%" style="margin:20px 0;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Account</td><td style="padding:8px 0;text-align:right;"><strong>${escapeHtml(accountId)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">Amount</td><td style="padding:8px 0;text-align:right;color:${BRAND.danger};"><strong>-${formatMoney(amount)}</strong></td></tr>
        <tr><td style="padding:8px 0;color:${BRAND.muted};">New balance</td><td style="padding:8px 0;text-align:right;"><strong>${formatMoney(balanceAfter)}</strong></td></tr>
        ${transactionId ? `<tr><td style="padding:8px 0;color:${BRAND.muted};">Reference</td><td style="padding:8px 0;text-align:right;">${escapeHtml(transactionId)}</td></tr>` : ''}
      </table>`
  });
  return { subject, text, html };
}

function buildLoanApprovalEmail(loan) {
  const subject = `Loan approved — ${loan.id}`;
  const text = `Dear ${loan.client_name},\n\nYour loan ${loan.id} for ${formatMoney(loan.amount)} has been approved.\nRate: ${loan.interest_rate}% · Term: ${loan.term}\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Loan approved',
    preheader: `Loan ${loan.id} approved`,
    accentColor: BRAND.success,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(loan.client_name)}</strong>,</p>
      <p>Congratulations — your loan application has been <strong>approved</strong>.</p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;font-size:14px;">
        <tr><td style="padding:16px;">
          <strong>Loan ID:</strong> ${escapeHtml(loan.id)}<br/>
          <strong>Amount:</strong> ${formatMoney(loan.amount)}<br/>
          <strong>Interest rate:</strong> ${escapeHtml(loan.interest_rate)}%<br/>
          <strong>Term:</strong> ${escapeHtml(loan.term)}<br/>
          <strong>Payment frequency:</strong> ${escapeHtml(loan.payment_frequency || 'Monthly')}
        </td></tr>
      </table>
      <p>Your loan is now active. Please follow your repayment schedule.</p>`
  });
  return { subject, text, html };
}

function buildLoanRejectionEmail(loan, reason) {
  const subject = `Loan application update — ${loan.id}`;
  const text = `Dear ${loan.client_name},\n\nLoan ${loan.id} was not approved.\nReason: ${reason || 'Not specified'}\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Loan application update',
    preheader: 'Application status update',
    accentColor: BRAND.danger,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(loan.client_name)}</strong>,</p>
      <p>After review, your loan application could not be approved at this time.</p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;font-size:14px;">
        <tr><td style="padding:16px;">
          <strong>Loan ID:</strong> ${escapeHtml(loan.id)}<br/>
          <strong>Amount requested:</strong> ${formatMoney(loan.amount)}<br/>
          <strong>Reason:</strong> ${escapeHtml(reason || 'Not specified')}
        </td></tr>
      </table>
      <p>Contact your branch to discuss alternative options.</p>`
  });
  return { subject, text, html };
}

function buildSuspiciousLoginEmail({ username, attempts, locked, ipAddress }) {
  const subject = 'Security alert — unusual sign-in activity';
  const text = `Security alert for account ${username}.\nFailed attempts: ${attempts}\n${locked ? 'Account has been temporarily locked.\n' : ''}If this was not you, contact support immediately.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Security alert',
    preheader: 'Unusual login activity detected',
    accentColor: BRAND.danger,
    bodyHtml: `
      <p>We detected <strong>unsuccessful sign-in attempts</strong> on your account.</p>
      <table role="presentation" width="100%" style="margin:20px 0;background:#fef2f2;border-radius:8px;border:1px solid #fca5a5;font-size:14px;">
        <tr><td style="padding:16px;">
          <strong>Username:</strong> ${escapeHtml(username)}<br/>
          <strong>Failed attempts:</strong> ${escapeHtml(attempts)}<br/>
          ${ipAddress ? `<strong>IP address:</strong> ${escapeHtml(ipAddress)}<br/>` : ''}
          <strong>Status:</strong> ${locked ? 'Account temporarily locked' : 'Monitoring continued attempts'}
        </td></tr>
      </table>
      <p>If you did not try to sign in, contact your branch immediately and change your password.</p>`
  });
  return { subject, text, html };
}

function buildRegistrationSubmittedEmail({ name }) {
  const subject = 'Registration submitted — Edekise Microfinance';
  const text = `Dear ${name},\n\nYour registration was submitted and is pending admin review.\n\n${BRAND.name}`;
  const html = wrapEmailLayout({
    title: 'Registration received',
    preheader: 'Pending admin review',
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Thank you for registering with ${BRAND.name}. Your application is <strong>pending review</strong> and we will contact you once it has been processed.</p>`
  });
  return { subject, text, html };
}

function buildApprovalPendingStaffEmail({ requestId, processLabel, amount, entityId, requesterName }) {
  const subject = `Action required: ${processLabel}`;
  const html = wrapEmailLayout({
    title: 'Approval required',
    preheader: requestId,
    accentColor: BRAND.warning,
    bodyHtml: `
      <p>A <strong>${escapeHtml(processLabel)}</strong> requires your review.</p>
      <table role="presentation" width="100%" style="margin:16px 0;font-size:14px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:${BRAND.muted};">Request ID</td><td style="text-align:right;"><strong>${escapeHtml(requestId)}</strong></td></tr>
        <tr><td style="padding:6px 0;color:${BRAND.muted};">Reference</td><td style="text-align:right;">${escapeHtml(entityId || '—')}</td></tr>
        <tr><td style="padding:6px 0;color:${BRAND.muted};">Amount</td><td style="text-align:right;"><strong>${formatMoney(amount)}</strong></td></tr>
        ${requesterName ? `<tr><td style="padding:6px 0;color:${BRAND.muted};">Requested by</td><td style="text-align:right;">${escapeHtml(requesterName)}</td></tr>` : ''}
      </table>
      <p>Please sign in to the staff portal to approve or reject this request.</p>`
  });
  return { subject, text: `Approval required: ${processLabel} (${requestId}). Amount: ${formatMoney(amount)}.`, html };
}

function buildApprovalDecisionEmail({ name, approved, processLabel, requestId, reason }) {
  const subject = approved
    ? `${processLabel} approved`
    : `${processLabel} not approved`;
  const accent = approved ? BRAND.success : BRAND.danger;
  const html = wrapEmailLayout({
    title: approved ? 'Request approved' : 'Request update',
    preheader: requestId,
    accentColor: accent,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name || 'Client')}</strong>,</p>
      <p>Your request <strong>${escapeHtml(requestId)}</strong> (${escapeHtml(processLabel)}) has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
      ${!approved && reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
      <p>Log in to your account for details.</p>`
  });
  return {
    subject,
    text: `Your ${processLabel} (${requestId}) was ${approved ? 'approved' : 'rejected'}.${reason ? ` Reason: ${reason}` : ''}`,
    html
  };
}

function buildRequestCancelledEmail({ name, processLabel, requestId }) {
  const subject = `Request cancelled — ${processLabel}`;
  const html = wrapEmailLayout({
    title: 'Request cancelled',
    preheader: requestId,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name || 'Client')}</strong>,</p>
      <p>Your pending request <strong>${escapeHtml(requestId)}</strong> (${escapeHtml(processLabel)}) has been <strong>cancelled</strong> and will not be processed.</p>
      <p>You may submit a new request when ready.</p>`
  });
  return { subject, text: `Request ${requestId} cancelled.`, html };
}

function buildDepositPendingEmail({ name, accountId, amount }) {
  const subject = 'Deposit request received — pending approval';
  const html = wrapEmailLayout({
    title: 'Deposit submitted',
    preheader: `Pending review · ${formatMoney(amount)}`,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>We received your deposit request of <strong>${formatMoney(amount)}</strong> for account <strong>${escapeHtml(accountId)}</strong>.</p>
      <p>It is <strong>pending branch manager approval</strong>. You will receive another email when it is posted to your account.</p>`
  });
  return { subject, text: `Deposit request ${formatMoney(amount)} pending approval.`, html };
}

function buildWithdrawalPendingEmail({ name, accountId, amount }) {
  const subject = 'Withdrawal request received — pending approval';
  const html = wrapEmailLayout({
    title: 'Withdrawal submitted',
    preheader: `Pending review · ${formatMoney(amount)}`,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>We received your withdrawal request of <strong>${formatMoney(amount)}</strong> from account <strong>${escapeHtml(accountId)}</strong>.</p>
      <p>It is <strong>pending approval</strong>. You will be notified when it is processed.</p>`
  });
  return { subject, text: `Withdrawal request ${formatMoney(amount)} pending approval.`, html };
}

function buildTransactionRejectedEmail({ name, processLabel, accountId, amount, reason }) {
  const subject = `${processLabel} not approved`;
  const html = wrapEmailLayout({
    title: 'Request update',
    accentColor: BRAND.danger,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your ${escapeHtml(processLabel.toLowerCase())} of <strong>${formatMoney(amount)}</strong> for account <strong>${escapeHtml(accountId)}</strong> was not approved.</p>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}`
  });
  return { subject, text: `${processLabel} rejected. ${reason || ''}`, html };
}

function buildKycRejectedEmail({ name, reason }) {
  const subject = 'KYC verification update';
  const html = wrapEmailLayout({
    title: 'KYC update',
    accentColor: BRAND.danger,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your identity verification could not be completed at this time.</p>
      ${reason ? `<p><strong>Reason:</strong> ${escapeHtml(reason)}</p>` : ''}
      <p>Please contact your branch or resubmit updated documents.</p>`
  });
  return { subject, text: `KYC not verified. ${reason || ''}`, html };
}

function buildKycVerifiedEmail({ name }) {
  const subject = 'KYC verified — account services enabled';
  const html = wrapEmailLayout({
    title: 'KYC verified',
    accentColor: BRAND.success,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your KYC verification is <strong>complete</strong>. You may now use savings, loans, and other account services.</p>`
  });
  return { subject, text: 'Your KYC verification is complete.', html };
}

function buildApplicationSubmittedEmail({ name, applicationType, referenceId, amount }) {
  const subject = `${applicationType} submitted — pending review`;
  const html = wrapEmailLayout({
    title: 'Application received',
    preheader: referenceId || applicationType,
    bodyHtml: `
      <p>Dear <strong>${escapeHtml(name)}</strong>,</p>
      <p>Your <strong>${escapeHtml(applicationType)}</strong> has been submitted and is pending review.</p>
      ${referenceId ? `<p><strong>Reference:</strong> ${escapeHtml(referenceId)}</p>` : ''}
      ${amount ? `<p><strong>Amount:</strong> ${formatMoney(amount)}</p>` : ''}`
  });
  return { subject, text: `${applicationType} submitted for review.`, html };
}

function buildContactAcknowledgementEmail({ name, referenceId, category }) {
  const subject = 'We received your message';
  const html = wrapEmailLayout({
    title: 'Message received',
    preheader: referenceId,
    bodyHtml: `
      <p>Hello <strong>${escapeHtml(name || 'there')}</strong>,</p>
      <p>We received your message and our team will review it shortly.</p>
      <p><strong>Reference:</strong> ${escapeHtml(referenceId)}<br/>
      <strong>Category:</strong> ${escapeHtml(category || 'General')}</p>`
  });
  return { subject, text: `Message received. Reference: ${referenceId}`, html };
}

const APPROVAL_TYPE_LABELS = {
  transaction_deposit: 'Deposit',
  transaction_withdraw: 'Withdrawal',
  savings_account_approval: 'Savings account',
  loan_origination: 'Loan application',
  account_creation: 'Account creation',
  statement_approval: 'Statement request'
};

function labelApprovalType(type) {
  return APPROVAL_TYPE_LABELS[type] || type || 'Request';
}

module.exports = {
  BRAND,
  wrapEmailLayout,
  buildWelcomeEmail,
  buildAccountCreatedEmail,
  buildOtpVerificationEmail,
  buildPasswordResetEmail,
  buildPasswordResetSuccessEmail,
  buildDepositSuccessEmail,
  buildWithdrawalSuccessEmail,
  buildLoanApprovalEmail,
  buildLoanRejectionEmail,
  buildSuspiciousLoginEmail,
  buildRegistrationSubmittedEmail,
  buildApprovalPendingStaffEmail,
  buildApprovalDecisionEmail,
  buildRequestCancelledEmail,
  buildDepositPendingEmail,
  buildWithdrawalPendingEmail,
  buildTransactionRejectedEmail,
  buildKycRejectedEmail,
  buildKycVerifiedEmail,
  buildApplicationSubmittedEmail,
  buildContactAcknowledgementEmail,
  labelApprovalType
};
