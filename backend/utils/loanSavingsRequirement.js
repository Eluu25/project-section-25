const { db } = require('../config/database');
const { LOAN_DOCUMENT_WHERE } = require('./loanDocuments');

/** Required savings balance as % of requested loan (default 30%). */
const COLLATERAL_PERCENT = Number(process.env.LOAN_SAVINGS_COLLATERAL_PERCENT || 30);
/** Minimum informational threshold (default 20%). */
const MIN_PERCENT = Number(process.env.LOAN_SAVINGS_MIN_PERCENT || 20);

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const runQuery = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const countExplicitDocuments = async (clientId, documentIds = []) => {
  const ids = [...new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const row = await runQuery(
    `SELECT COUNT(*) AS count FROM documents WHERE client_id = ? AND id IN (${placeholders})`,
    [clientId, ...ids]
  );
  return Number(row?.count || 0);
};

const countLoanLinkedDocuments = async (clientId, loanId) => {
  if (!loanId) return 0;
  const row = await runQuery(
    `SELECT COUNT(*) AS count
     FROM documents
     WHERE client_id = ?
       AND (${LOAN_DOCUMENT_WHERE})`,
    [loanId, loanId, clientId, loanId]
  );
  return Number(row?.count || 0);
};

const countClientSupportingDocuments = async (clientId) => {
  const row = await runQuery(
    `SELECT COUNT(*) AS count
     FROM documents
     WHERE client_id = ?
       AND (
         lower(COALESCE(type, '')) LIKE '%loan%'
         OR lower(COALESCE(type, '')) LIKE '%license%'
         OR lower(COALESCE(type, '')) LIKE '%supporting%'
         OR lower(COALESCE(type, '')) LIKE '%business%'
         OR lower(COALESCE(type, '')) LIKE '%trade%'
         OR lower(COALESCE(type, '')) LIKE '%collateral%'
         OR lower(COALESCE(type, '')) LIKE '%kyc%'
         OR lower(COALESCE(type, '')) LIKE '%national id%'
         OR lower(COALESCE(type, '')) LIKE '%income%'
         OR lower(COALESCE(type, '')) LIKE '%organization%'
         OR lower(COALESCE(type, '')) LIKE 'receipt%'
       )`,
    [clientId]
  );
  return Number(row?.count || 0);
};

const countSavingsReceiptDocuments = async (clientId, savingsAccountId) => {
  if (!savingsAccountId) return 0;
  const row = await runQuery(
    `SELECT COUNT(*) AS count
     FROM documents
     WHERE client_id = ?
       AND (
         lower(COALESCE(type, '')) LIKE 'receipt%'
         OR (related_entity_type = 'savings_account' AND related_entity_id = ?)
         OR (related_entity_type = 'transaction' AND related_entity_id IN (
           SELECT id FROM transactions WHERE account_id = ? AND account_type = 'savings'
         ))
       )`,
    [clientId, savingsAccountId, savingsAccountId]
  );
  return Number(row?.count || 0);
};

async function countLoanSupportingDocuments({ clientId, loanId = null, savingsAccountId = null, documentIds = [] }) {
  const counts = [
    await countExplicitDocuments(clientId, documentIds),
    loanId ? await countLoanLinkedDocuments(clientId, loanId) : await countClientSupportingDocuments(clientId),
    await countSavingsReceiptDocuments(clientId, savingsAccountId)
  ];
  return Math.max(...counts, 0);
}

/**
 * Evaluate savings collateral + supporting documents for loan approval.
 */
async function evaluateLoanSavingsRequirement({
  savingsAccount,
  loanAmount,
  clientId,
  loanId = null,
  documentIds = []
}) {
  const principal = Number(loanAmount || 0);
  const savingsBalance = Number(savingsAccount?.amount || 0);
  const requiredAmount = roundMoney(principal * (COLLATERAL_PERCENT / 100));
  const minimumAmount = roundMoney(principal * (MIN_PERCENT / 100));
  const documentCount = await countLoanSupportingDocuments({
    clientId,
    loanId,
    savingsAccountId: savingsAccount?.id || null,
    documentIds
  });
  const hasDocuments = documentCount > 0;
  const meetsSavings = savingsBalance + 0.005 >= requiredAmount;
  const meetsMinimum = savingsBalance + 0.005 >= minimumAmount;

  return {
    collateral_percent: COLLATERAL_PERCENT,
    minimum_percent: MIN_PERCENT,
    loan_amount: principal,
    savings_balance: savingsBalance,
    savings_account_id: savingsAccount?.id || null,
    required_savings_amount: requiredAmount,
    minimum_savings_amount: minimumAmount,
    savings_shortfall: meetsSavings ? 0 : roundMoney(requiredAmount - savingsBalance),
    savings_ratio_percent: principal > 0 ? roundMoney((savingsBalance / principal) * 100) : 0,
    document_count: documentCount,
    has_documents: hasDocuments,
    meets_savings: meetsSavings,
    meets_minimum: meetsMinimum,
    meets_documents: hasDocuments,
    eligible: meetsSavings && hasDocuments,
    message: !meetsSavings && !hasDocuments
      ? `Loan requires ${COLLATERAL_PERCENT}% (${requiredAmount.toLocaleString()} ETB) in savings and at least one supporting document or receipt.`
      : !meetsSavings
        ? `Savings balance must be at least ${COLLATERAL_PERCENT}% of the loan (${requiredAmount.toLocaleString()} ETB). Current: ${savingsBalance.toLocaleString()} ETB.`
        : !hasDocuments
          ? 'Upload a business/trade license, loan supporting document, or savings deposit receipt linked to this client.'
          : 'Savings collateral and documents meet loan approval requirements.'
  };
}

async function assertLoanSavingsRequirement(options) {
  const evaluation = await evaluateLoanSavingsRequirement(options);
  if (!evaluation.eligible) {
    const error = new Error(evaluation.message);
    error.statusCode = 400;
    error.details = evaluation;
    throw error;
  }
  return evaluation;
}

module.exports = {
  COLLATERAL_PERCENT,
  MIN_PERCENT,
  evaluateLoanSavingsRequirement,
  assertLoanSavingsRequirement,
  countLoanSupportingDocuments
};
