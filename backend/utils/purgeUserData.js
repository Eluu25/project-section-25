const { db } = require('../config/database');
const { withTransaction } = require('./transactionWrapper');

const runExec = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) reject(err);
    else resolve({ changes: this.changes });
  });
});

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const resolveClientIdForUser = async (user) => {
  if (!user) return null;

  if (user.id_number) {
    const byNationalId = await runGet(
      'SELECT id FROM clients WHERE id_number = ? ORDER BY id ASC LIMIT 1',
      [user.id_number]
    );
    if (byNationalId?.id) return byNationalId.id;
  }

  if (user.role !== 'client') {
    return null;
  }

  if (user.email) {
    const byEmail = await runGet(
      `SELECT id FROM clients
       WHERE email IS NOT NULL AND email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(?))
       ORDER BY id ASC LIMIT 1`,
      [user.email]
    );
    if (byEmail?.id) return byEmail.id;
  }

  const byName = await runGet(
    'SELECT id FROM clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id ASC LIMIT 1',
    [user.name]
  );
  if (byName?.id) return byName.id;

  const registrationMatch = await runGet(
    `SELECT client_id FROM client_registration_requests
     WHERE client_id IS NOT NULL
       AND (
         LOWER(TRIM(full_name)) = LOWER(TRIM(?))
         OR (email IS NOT NULL AND email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(?)))
         OR generated_username = ?
       )
     ORDER BY id DESC LIMIT 1`,
    [user.name, user.email || '', user.username || '']
  );
  return registrationMatch?.client_id || null;
};

/**
 * Permanently remove a user and associated operational data (not archived snapshots).
 */
async function purgeUserData(userId, { reviewedBy = null } = {}) {
  const user = await runGet('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  let clientId = await resolveClientIdForUser(user);
  if (!clientId && user.role === 'client') {
    const byUsername = await runGet(
      `SELECT client_id FROM client_registration_requests
       WHERE generated_username = ? AND client_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [user.username]
    );
    clientId = byUsername?.client_id || null;
  }

  await withTransaction(async () => {
    await runExec(
      `UPDATE approval_requests
       SET status = 'Cancelled',
           justification = COALESCE(justification, 'Cancelled — requester account permanently deleted'),
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = COALESCE(?, reviewed_by)
       WHERE requested_by = ? AND status = 'Pending'`,
      [reviewedBy, userId]
    );

    await runExec('DELETE FROM approval_requests WHERE requested_by = ?', [userId]);
    await runExec('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    await runExec('DELETE FROM staff_client_assignments WHERE staff_user_id = ?', [userId]);

    if (clientId) {
      await runExec('DELETE FROM client_registration_requests WHERE client_id = ?', [clientId]);
      const savingsRows = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM savings_accounts WHERE client_id = ?', [clientId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });
      const loanRows = await new Promise((resolve, reject) => {
        db.all('SELECT id FROM loan_accounts WHERE client_id = ?', [clientId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
      });

      for (const loan of loanRows) {
        await runExec('DELETE FROM payment_schedule WHERE loan_id = ?', [loan.id]);
        await runExec('DELETE FROM loan_guarantors WHERE loan_id = ?', [loan.id]);
      }

      await runExec('DELETE FROM transactions WHERE account_id IN (SELECT id FROM savings_accounts WHERE client_id = ?) OR account_id IN (SELECT id FROM loan_accounts WHERE client_id = ?)', [clientId, clientId]);
      await runExec('DELETE FROM documents WHERE client_id = ?', [clientId]);
      await runExec('DELETE FROM approval_requests WHERE entity_id IN (SELECT id FROM savings_accounts WHERE client_id = ?) OR entity_id IN (SELECT id FROM loan_accounts WHERE client_id = ?)', [clientId, clientId]);
      await runExec('DELETE FROM loan_accounts WHERE client_id = ?', [clientId]);
      await runExec('DELETE FROM savings_accounts WHERE client_id = ?', [clientId]);
      await runExec('DELETE FROM update_requests WHERE client_id = ?', [clientId]);
      await runExec('DELETE FROM statements WHERE client_id = ?', [clientId]);
      await runExec('DELETE FROM clients WHERE id = ?', [clientId]);
    }

    await runExec('DELETE FROM audit_trail WHERE user_id = ?', [userId]);
    await runExec('DELETE FROM users WHERE id = ?', [userId]);
  });

  return { user, client_id: clientId };
}

async function purgeClientById(clientId) {
  const client = await runGet('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client) {
    const err = new Error('Client not found');
    err.statusCode = 404;
    throw err;
  }

  await withTransaction(async () => {
    await runExec('DELETE FROM client_registration_requests WHERE client_id = ?', [clientId]);
    await runExec(
      `UPDATE approval_requests
       SET status = 'Cancelled',
           justification = COALESCE(justification, 'Cancelled — client record purged'),
           reviewed_at = CURRENT_TIMESTAMP
       WHERE status = 'Pending'
         AND (entity_id IN (SELECT id FROM savings_accounts WHERE client_id = ?)
              OR entity_id IN (SELECT id FROM loan_accounts WHERE client_id = ?))`,
      [clientId, clientId]
    );

    const loanRows = await new Promise((resolve, reject) => {
      db.all('SELECT id FROM loan_accounts WHERE client_id = ?', [clientId], (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
    for (const loan of loanRows) {
      await runExec('DELETE FROM payment_schedule WHERE loan_id = ?', [loan.id]);
      await runExec('DELETE FROM loan_guarantors WHERE loan_id = ?', [loan.id]);
    }

    await runExec('DELETE FROM transactions WHERE account_id IN (SELECT id FROM savings_accounts WHERE client_id = ?) OR account_id IN (SELECT id FROM loan_accounts WHERE client_id = ?)', [clientId, clientId]);
    await runExec('DELETE FROM documents WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM approval_requests WHERE entity_id IN (SELECT id FROM savings_accounts WHERE client_id = ?) OR entity_id IN (SELECT id FROM loan_accounts WHERE client_id = ?)', [clientId, clientId]);
    await runExec('DELETE FROM loan_accounts WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM savings_accounts WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM update_requests WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM statements WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM staff_client_assignments WHERE client_id = ?', [clientId]);
    await runExec('DELETE FROM clients WHERE id = ?', [clientId]);
  });

  return { client };
}

module.exports = { purgeUserData, resolveClientIdForUser, purgeClientById };
