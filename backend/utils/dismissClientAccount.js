const { db } = require('../config/database');
const { withTransaction } = require('./transactionWrapper');

const DISMISSIBLE_STATUSES = new Set(['rejected', 'cancelled']);

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ changes: this.changes });
  });
});

const assertDismissibleStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (!DISMISSIBLE_STATUSES.has(normalized)) {
    const err = new Error('Only rejected or cancelled accounts can be removed from your portal.');
    err.statusCode = 400;
    throw err;
  }
};

async function dismissSavingsAccountForClient(accountId, clientId) {
  const account = await runGet(
    'SELECT * FROM savings_accounts WHERE id = ? AND client_id = ?',
    [accountId, clientId]
  );
  if (!account) {
    const err = new Error('Savings account not found');
    err.statusCode = 404;
    throw err;
  }
  assertDismissibleStatus(account.status);

  await withTransaction(async () => {
    await runExec(
      `DELETE FROM approval_requests
       WHERE entity_id = ? AND status IN ('Pending', 'Cancelled', 'Rejected')`,
      [accountId]
    );
    await runExec(
      `DELETE FROM transactions
       WHERE account_id = ? AND account_type = 'savings'
         AND status IN ('Pending', 'Pending Approval', 'Cancelled')`,
      [accountId]
    );
    await runExec('DELETE FROM documents WHERE related_entity_id = ? AND related_entity_type = ?', [
      accountId,
      'savings_account'
    ]);
    await runExec('DELETE FROM savings_accounts WHERE id = ?', [accountId]);
  });

  return { removed_id: accountId };
}

async function dismissLoanAccountForClient(loanId, clientId) {
  const loan = await runGet(
    'SELECT * FROM loan_accounts WHERE id = ? AND client_id = ?',
    [loanId, clientId]
  );
  if (!loan) {
    const err = new Error('Loan account not found');
    err.statusCode = 404;
    throw err;
  }
  assertDismissibleStatus(loan.status);

  await withTransaction(async () => {
    await runExec(
      `DELETE FROM approval_requests
       WHERE entity_id = ? AND status IN ('Pending', 'Cancelled', 'Rejected')`,
      [loanId]
    );
    await runExec('DELETE FROM payment_schedule WHERE loan_id = ?', [loanId]);
    await runExec('DELETE FROM loan_guarantors WHERE loan_id = ?', [loanId]);
    await runExec(
      `DELETE FROM transactions
       WHERE account_id = ? AND account_type = 'loan'
         AND status IN ('Pending', 'Pending Approval', 'Cancelled')`,
      [loanId]
    );
    await runExec('DELETE FROM documents WHERE loan_id = ? OR related_entity_id = ?', [loanId, loanId]);
    await runExec('DELETE FROM loan_accounts WHERE id = ?', [loanId]);
  });

  return { removed_id: loanId };
}

module.exports = {
  dismissSavingsAccountForClient,
  dismissLoanAccountForClient,
  DISMISSIBLE_STATUSES
};
