const { db } = require('../config/database');

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ changes: this.changes });
  });
});

const generateTransactionId = () => `TXN-${Date.now()}`;

/**
 * Create a pending savings transaction tied to an approval request (maker-checker).
 * Links receipt documents to the transaction row when provided.
 */
async function createPendingDepositTransaction({
  approvalRequestId,
  accountId,
  amount,
  description,
  receiptDocumentId = null,
  createdBy = null
}) {
  const existing = await runGet(
    'SELECT id, status FROM transactions WHERE approval_request_id = ? LIMIT 1',
    [approvalRequestId]
  );
  if (existing) {
    return existing.id;
  }

  const account = await runGet('SELECT id, amount, client_id, status FROM savings_accounts WHERE id = ?', [accountId]);
  if (!account) {
    throw Object.assign(new Error('Savings account not found for pending transaction'), { statusCode: 404 });
  }

  const balanceBefore = Number(account.amount || 0);
  const transactionId = generateTransactionId();

  await runExec(
    `INSERT INTO transactions
     (id, account_id, account_type, transaction_type, amount, balance_before, balance_after, description, approval_request_id, status, created_by)
     VALUES (?, ?, 'savings', 'deposit', ?, ?, ?, ?, ?, 'Pending Approval', ?)`,
    [
      transactionId,
      accountId,
      amount,
      balanceBefore,
      balanceBefore,
      description || 'Deposit pending approval',
      approvalRequestId,
      createdBy
    ]
  );

  if (receiptDocumentId) {
    await runExec(
      `UPDATE documents
       SET approval_request_id = ?, related_entity_type = 'transaction', related_entity_id = ?
       WHERE id = ?`,
      [approvalRequestId, transactionId, receiptDocumentId]
    );
  }

  return transactionId;
}

async function cancelPendingTransactionForApproval(approvalRequestId, reason = 'Cancelled') {
  const pending = await runGet(
    `SELECT id FROM transactions
     WHERE approval_request_id = ? AND (status = 'Pending Approval' OR status = 'Pending')
     LIMIT 1`,
    [approvalRequestId]
  );
  if (!pending) return null;
  await runExec(
    `UPDATE transactions SET status = 'Cancelled', description = COALESCE(description, '') || ? WHERE id = ?`,
    [` [${reason}]`, pending.id]
  );
  return pending.id;
}

module.exports = {
  createPendingDepositTransaction,
  cancelPendingTransactionForApproval
};
