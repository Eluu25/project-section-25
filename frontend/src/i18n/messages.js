import en from './locales/en.js';
import am from './locales/am.js';

export const MESSAGES = { en, am };

export const translate = (language, key) => {
  const dict = MESSAGES[language] || MESSAGES.en;
  return dict[key] || MESSAGES.en[key] || key;
};

/** Map backend English error text to i18n keys (partial match). */
const ERROR_PATTERNS = [
  { test: /session expired|invalid or expired token/i, key: 'error_session_expired' },
  { test: /network error|failed to fetch|connection/i, key: 'error_network' },
  { test: /timed out|timeout/i, key: 'error_timeout' },
  { test: /too many requests|429/i, key: 'error_too_many_requests' },
  { test: /unauthorized|401/i, key: 'error_unauthorized' },
  { test: /forbidden|403|access denied|not assigned|not allowed/i, key: 'error_forbidden' },
  { test: /not found|404/i, key: 'error_not_found' },
  { test: /duplicate user|username.*exists|phone already|email already/i, key: 'error_duplicate_user' },
  { test: /duplicate client|duplicate registration/i, key: 'error_duplicate_client' },
  { test: /duplicate.*phone|phone number already/i, key: 'error_duplicate_phone' },
  { test: /duplicate.*id|id number already/i, key: 'error_duplicate_id' },
  { test: /DUPLICATE_SAVINGS|already has a.*savings|one account per saving/i, key: 'error_duplicate_savings' },
  { test: /DUPLICATE_LOAN|already has a.*loan|one loan per type/i, key: 'error_duplicate_loan' },
  { test: /receipt.*already|receipt.*used|duplicate receipt/i, key: 'error_receipt_used' },
  { test: /insufficient balance/i, key: 'error_insufficient_balance' },
  { test: /kyc|verification is required/i, key: 'error_kyc_required' },
  { test: /invalid username or password|authentication failed/i, key: 'login_invalid' },
  { test: /locked/i, key: 'login_locked' }
];

export const translateError = (message, language = 'en') => {
  if (!message || language === 'en') return message || translate('en', 'error_generic');
  const text = String(message);
  for (const { test, key } of ERROR_PATTERNS) {
    if (test.test(text)) return translate(language, key);
  }
  return text;
};

export const translateStatus = (status, language = 'en') => {
  const map = {
    Pending: 'pending',
    Active: 'status_active',
    Inactive: 'status_inactive',
    Approved: 'status_approved',
    Rejected: 'status_rejected',
    Completed: 'completed',
    Cancelled: 'cancelled',
    Verified: 'verified',
    'Pending Approval': 'pending',
    'Pending Branch Manager Review': 'pending',
    'Pending CEO Review': 'pending'
  };
  const key = map[status];
  return key ? translate(language, key) : status;
};
