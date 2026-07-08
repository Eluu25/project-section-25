/**
 * Transactional email — Brevo API only (sib-api-v3-sdk).
 * Does not throw; returns { success, provider: 'brevo', messageId?, error? }.
 */
const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
const brevoApiKey = process.env.BREVO_API_KEY;
if (brevoApiKey) {
  defaultClient.authentications['api-key'].apiKey = brevoApiKey;
}

const transactionalApi = new SibApiV3Sdk.TransactionalEmailsApi();

function getDefaultFrom() {
  const email = process.env.BREVO_SENDER_EMAIL || 'noreply@edekise.com';
  const name = process.env.BREVO_SENDER_NAME || 'Edekise Microfinance';
  return { email, name };
}

function normalizePayload({ to, subject, html, text }) {
  if (!to || !subject) {
    return { valid: false, error: 'Recipient (to) and subject are required' };
  }
  const textContent = text || (html ? String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const htmlContent = html || `<p>${String(textContent).replace(/\n/g, '<br/>')}</p>`;
  return { valid: true, to, subject, textContent, htmlContent };
}

/**
 * Send via Brevo Transactional API.
 */
async function sendViaBrevo({ to, subject, html, text }) {
  const normalized = normalizePayload({ to, subject, html, text });
  if (!normalized.valid) {
    return { success: false, provider: 'brevo', error: normalized.error };
  }
  if (!brevoApiKey) {
    return { success: false, provider: 'brevo', skipped: true, error: 'BREVO_API_KEY not configured' };
  }

  const from = getDefaultFrom();
  try {
    const response = await transactionalApi.sendTransacEmail({
      sender: { email: from.email, name: from.name },
      to: [{ email: normalized.to }],
      subject: normalized.subject,
      htmlContent: normalized.htmlContent,
      textContent: normalized.textContent
    });
    return {
      success: true,
      provider: 'brevo',
      messageId: response?.messageId || response?.body?.messageId || null
    };
  } catch (error) {
    const body = error?.response?.body;
    const message = body?.message
      || (typeof body === 'string' ? body : null)
      || error?.message
      || 'Brevo send failed';
    const code = body?.code || error?.status || null;
    console.error('[EMAIL][Brevo]', message, code ? `(code: ${code})` : '');
    return { success: false, provider: 'brevo', error: message, code };
  }
}

/**
 * Send email via Brevo only. Never throws.
 * @param {{ to: string, subject: string, html?: string, text?: string }} params
 */
async function sendEmail({ to, subject, html, text }) {
  const result = await sendViaBrevo({ to, subject, html, text });
  if (result.success) {
    console.log(`[EMAIL] Sent via Brevo to ${to}`);
  } else if (!result.skipped) {
    console.error(`[EMAIL] Brevo failed for ${to}:`, result.error);
  }
  return result;
}

function verifyBrevoConfig() {
  if (!brevoApiKey) {
    return { success: false, error: 'BREVO_API_KEY is not set' };
  }
  const from = getDefaultFrom();
  if (!from.email) {
    return { success: false, error: 'BREVO_SENDER_EMAIL is not set' };
  }
  return {
    success: true,
    message: 'Brevo API key and sender are configured',
    senderEmail: from.email,
    senderName: from.name
  };
}

module.exports = {
  sendEmail,
  sendViaBrevo,
  verifyBrevoConfig
};
