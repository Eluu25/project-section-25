const { db } = require('../config/database');

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const normalizeProductType = (value) => String(value || '').trim().toLowerCase();

/** Savings accounts that block opening the same product type again. */
const BLOCKING_SAVINGS_STATUSES = [
  'Active',
  'Pending',
  'Pending Approval',
  'Pending Branch Manager Review'
];

/** Loan accounts that block another loan of the same type. */
const BLOCKING_LOAN_STATUSES = [
  'Active',
  'Pending',
  'Approved',
  'Overdue',
  'Pending Branch Manager Review',
  'Pending CEO Review',
  'High Priority'
];

const findDuplicateSavings = async (clientId, productType, excludeAccountId = null) => {
  const normalized = normalizeProductType(productType);
  if (!normalized) return null;

  const placeholders = BLOCKING_SAVINGS_STATUSES.map(() => '?').join(', ');
  return runGet(
    `SELECT id, type, status FROM savings_accounts
     WHERE client_id = ?
       AND lower(trim(type)) = ?
       AND status IN (${placeholders})
       ${excludeAccountId ? 'AND id != ?' : ''}
     LIMIT 1`,
    excludeAccountId
      ? [clientId, normalized, ...BLOCKING_SAVINGS_STATUSES, excludeAccountId]
      : [clientId, normalized, ...BLOCKING_SAVINGS_STATUSES]
  );
};

const assertUniqueActiveSavingsProduct = async (clientId, productType, excludeAccountId = null) => {
  const duplicate = await findDuplicateSavings(clientId, productType, excludeAccountId);
  if (duplicate) {
    const error = new Error(
      `This client already has a "${productType}" savings account (${duplicate.id}, status: ${duplicate.status}). Only one account per saving type is allowed.`
    );
    error.statusCode = 409;
    error.code = 'DUPLICATE_SAVINGS_PRODUCT';
    throw error;
  }
};

const assertUniqueActiveLoanType = async (clientId, loanType, excludeLoanId = null) => {
  const normalized = normalizeProductType(loanType);
  if (!normalized) return;

  const placeholders = BLOCKING_LOAN_STATUSES.map(() => '?').join(', ');
  const row = await runGet(
    `SELECT id, type, status FROM loan_accounts
     WHERE client_id = ?
       AND lower(trim(type)) = ?
       AND status IN (${placeholders})
       ${excludeLoanId ? 'AND id != ?' : ''}
     LIMIT 1`,
    excludeLoanId
      ? [clientId, normalized, ...BLOCKING_LOAN_STATUSES, excludeLoanId]
      : [clientId, normalized, ...BLOCKING_LOAN_STATUSES]
  );

  if (row) {
    const error = new Error(
      `This client already has a "${loanType}" loan (${row.id}, status: ${row.status}). Only one loan per type is allowed.`
    );
    error.statusCode = 409;
    error.code = 'DUPLICATE_LOAN_TYPE';
    throw error;
  }
};

module.exports = {
  assertUniqueActiveSavingsProduct,
  assertUniqueActiveLoanType,
  findDuplicateSavings
};
