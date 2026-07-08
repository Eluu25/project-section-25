const { db } = require('../config/database');
const { evaluateLoanSavingsRequirement } = require('./loanSavingsRequirement');

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const parseDetails = (details) => {
  if (!details) return {};
  try {
    return typeof details === 'string' ? JSON.parse(details) : details;
  } catch {
    return {};
  }
};

const findLinkedDocuments = async (request) => {
  if (!request?.id) return [];
  const details = parseDetails(request);
  const receiptDocId = details.receipt_document_id || details.receiptDocId || null;
  if (receiptDocId) {
    const doc = await runGet('SELECT * FROM documents WHERE id = ?', [receiptDocId]);
    return doc ? [doc] : [];
  }
  const relatedEntityType = details.related_entity_type || details.relatedEntityType || null;
  const relatedEntityId = details.related_entity_id || details.relatedEntityId || request.entity_id || null;
  return runAll(
    `SELECT * FROM documents
     WHERE approval_request_id = ?
        OR (related_entity_id = ? AND (? IS NULL OR related_entity_type = ?))
     ORDER BY uploaded_at DESC`,
    [request.id, relatedEntityId, relatedEntityType, relatedEntityType]
  );
};

const buildReadinessBlockers = (request, { ready, details, linked = [] }) => {
  const blockers = [];
  if (request.type === 'statement_approval') {
    blockers.push('Statement approval workflow is disabled');
    return blockers;
  }
  if (request.type === 'transaction_deposit') {
    const requiresReceipt = Boolean(details.requires_receipt_proof || details.requiresReceiptProof);
    if (requiresReceipt && !(details.receipt_document_id || details.receiptDocId) && linked.length === 0) {
      blockers.push('Receipt or bank transfer proof not linked');
    }
  }
  if (request.type === 'account_creation' || request.type === 'savings_account_approval') {
    const requiresReceipt = Boolean(details.requires_receipt_proof || details.requiresReceiptProof);
    const hasReceipt = linked.some((doc) => /receipt/i.test(String(doc.type || doc.file_name || '')));
    if (requiresReceipt && !hasReceipt) {
      blockers.push('Opening receipt not attached');
    }
  }
  if (request.type === 'loan_origination' && !ready) {
    blockers.push('Loan savings collateral requirement not met');
  }
  return blockers;
};

/**
 * Branch manager can review all pending items; ready_for_branch_review indicates prerequisites met.
 */
async function isApprovalRequestReadyForBranchManager(request) {
  if (!request || request.status !== 'Pending') return false;
  if (request.type === 'statement_approval') return false;

  const details = parseDetails(request);

  if (request.type === 'transaction_deposit') {
    const requiresReceipt = Boolean(details.requires_receipt_proof || details.requiresReceiptProof);
    if (!requiresReceipt) return true;
    if (details.receipt_document_id || details.receiptDocId) return true;
    const linked = await findLinkedDocuments(request);
    return linked.length > 0;
  }

  if (request.type === 'transaction_withdraw') {
    return true;
  }

  if (request.type === 'account_creation' || request.type === 'savings_account_approval') {
    const requiresReceipt = Boolean(details.requires_receipt_proof || details.requiresReceiptProof);
    if (!requiresReceipt) return true;
    const linked = await findLinkedDocuments(request);
    const hasReceipt = linked.some((doc) => /receipt/i.test(String(doc.type || doc.file_name || '')));
    return linked.length > 0 && hasReceipt;
  }

  if (request.type === 'loan_origination') {
    const loan = await runGet('SELECT * FROM loan_accounts WHERE id = ?', [request.entity_id]);
    if (!loan) return false;
    const savings = loan.savings_account_id
      ? await runGet('SELECT * FROM savings_accounts WHERE id = ?', [loan.savings_account_id])
      : null;
    const evaluation = await evaluateLoanSavingsRequirement({
      savingsAccount: savings,
      loanAmount: loan.amount,
      clientId: loan.client_id,
      loanId: loan.id,
      documentIds: []
    });
    return evaluation.eligible;
  }

  return true;
}

async function enrichApprovalReadiness(request) {
  const details = parseDetails(request);
  const linked = ['transaction_deposit', 'account_creation', 'savings_account_approval', 'transaction_withdraw'].includes(request.type)
    ? await findLinkedDocuments(request)
    : [];
  const ready = await isApprovalRequestReadyForBranchManager(request);
  const readiness_blockers = ready ? [] : buildReadinessBlockers(request, { ready, details, linked });

  const payload = { ...request, ready_for_branch_review: ready, readiness_blockers };

  if (['transaction_deposit', 'transaction_withdraw'].includes(request.type)) {
    const transaction = await runGet(
      `SELECT id, amount, created_at, description, transaction_reference, status
       FROM transactions WHERE approval_request_id = ? LIMIT 1`,
      [request.id]
    );
    const primaryReceipt = linked[0] || null;
    payload.verification = {
      request_amount: Number(request.amount || details.amount || 0),
      transaction_amount: transaction?.amount != null ? Number(transaction.amount) : null,
      transaction_date: transaction?.created_at || null,
      transaction_reference: transaction?.transaction_reference || null,
      receipt_uploaded_at: primaryReceipt?.uploaded_at || null,
      receipt_reference: primaryReceipt?.receipt_reference || null,
      receipt_documents: linked.map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        uploaded_at: doc.uploaded_at,
        receipt_reference: doc.receipt_reference,
        status: doc.status
      }))
    };
  }

  return payload;
}

module.exports = {
  isApprovalRequestReadyForBranchManager,
  enrichApprovalReadiness,
  findLinkedDocuments
};
