const { db } = require('../config/database');
const crypto = require('crypto');

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

const generateReceiptReference = (prefix = 'RCT') => {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
};

const generateTransactionReference = (transactionType) => {
  const type = String(transactionType || 'TXN').toUpperCase().replace(/\s+/g, '_');
  return generateReceiptReference(type);
};

const findDuplicateReceiptByHash = async (fileHash, { clientId = null } = {}) => {
  if (!fileHash) return null;

  const params = [fileHash];
  let sql = 'SELECT id, client_id, type, uploaded_at, consumed_at FROM documents WHERE file_hash = ?';
  if (clientId) {
    sql += ' AND client_id = ?';
    params.push(clientId);
  }
  sql += ' LIMIT 1';

  return runGet(sql, params);
};

const findReceiptUsageByDocumentId = async (receiptDocumentId, { excludeApprovalId = null } = {}) => {
  if (!receiptDocumentId) return null;

  const doc = await runGet('SELECT id, consumed_at, approval_request_id, receipt_reference FROM documents WHERE id = ?', [receiptDocumentId]);
  if (!doc) return null;
  if (doc.consumed_at) {
    return { source: 'document', document_id: doc.id, receipt_reference: doc.receipt_reference };
  }

  const approvals = await runAll(
    `SELECT id, status, details FROM approval_requests
     WHERE status IN ('Pending', 'Approved')
       AND type IN ('transaction_deposit', 'transaction_withdraw')`
  );

  for (const approval of approvals) {
    if (excludeApprovalId && approval.id === excludeApprovalId) continue;
    const details = parseDetails(approval.details);
    if (String(details.receipt_document_id || '') === String(receiptDocumentId)) {
      return { source: 'approval', approval_id: approval.id, status: approval.status };
    }
  }

  if (doc.approval_request_id) {
    const linked = await runGet(
      'SELECT id, status FROM approval_requests WHERE id = ? AND status IN (\'Pending\', \'Approved\')',
      [doc.approval_request_id]
    );
    if (linked && (!excludeApprovalId || linked.id !== excludeApprovalId)) {
      return { source: 'approval_link', approval_id: linked.id, status: linked.status };
    }
  }

  return null;
};

const assertReceiptNotDuplicate = async (fileHash, options = {}) => {
  if (!fileHash) return;
  const existing = await findDuplicateReceiptByHash(fileHash, options);
  if (!existing) return;

  if (existing.consumed_at) {
    const error = new Error('This receipt file was already used for another transaction.');
    error.statusCode = 409;
    error.code = 'DUPLICATE_RECEIPT';
    error.existing_document_id = existing.id;
    throw error;
  }

  const linkedApproval = existing.approval_request_id
    ? await runGet('SELECT id, status FROM approval_requests WHERE id = ?', [existing.approval_request_id])
    : null;

  if (linkedApproval && linkedApproval.status === 'Pending') {
    const error = new Error('This receipt is already linked to a pending deposit request.');
    error.statusCode = 409;
    error.code = 'DUPLICATE_RECEIPT';
    error.existing_document_id = existing.id;
    throw error;
  }

  if (linkedApproval && linkedApproval.status === 'Approved') {
    const error = new Error('This receipt file was already uploaded and used.');
    error.statusCode = 409;
    error.code = 'DUPLICATE_RECEIPT';
    error.existing_document_id = existing.id;
    throw error;
  }

  // Cancelled/rejected approvals: same client may re-upload the same file for a new request.
};

/** One receipt document cannot fund two deposits/withdrawals. */
const assertReceiptDocumentAvailable = async (receiptDocumentId, { excludeApprovalId = null } = {}) => {
  const usage = await findReceiptUsageByDocumentId(receiptDocumentId, { excludeApprovalId });
  if (usage) {
    const error = new Error(
      usage.source === 'document'
        ? `Receipt ${usage.receipt_reference || receiptDocumentId} was already used for a transaction.`
        : `Receipt is already linked to approval ${usage.approval_id} (${usage.status}).`
    );
    error.statusCode = 409;
    error.code = 'RECEIPT_ALREADY_USED';
    error.usage = usage;
    throw error;
  }
};

const markReceiptDocumentConsumed = async (receiptDocumentId, { approvalRequestId = null, transactionId = null } = {}) => {
  if (!receiptDocumentId) return;
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE documents
       SET consumed_at = COALESCE(consumed_at, CURRENT_TIMESTAMP),
           approval_request_id = COALESCE(approval_request_id, ?),
           related_entity_type = COALESCE(related_entity_type, 'transaction'),
           related_entity_id = COALESCE(related_entity_id, ?)
       WHERE id = ?`,
      [approvalRequestId, transactionId, receiptDocumentId],
      (err) => (err ? reject(err) : resolve())
    );
  });
};

const isReceiptDocumentType = (type) => /receipt|proof|deposit|payment|transfer/i.test(String(type || ''));

module.exports = {
  generateReceiptReference,
  generateTransactionReference,
  findDuplicateReceiptByHash,
  findReceiptUsageByDocumentId,
  assertReceiptNotDuplicate,
  assertReceiptDocumentAvailable,
  markReceiptDocumentConsumed,
  isReceiptDocumentType
};
