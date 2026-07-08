const { db } = require('../config/database');
const { recordAuditEvent } = require('./auditTrail');

const PRIVILEGED_ROLES = new Set(['admin', 'branch_manager', 'ceo']);
const STAFF_CLIENT_ROLES = new Set(['loan_staff', 'saving_staff']);

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const isPrivilegedStaff = (role) => PRIVILEGED_ROLES.has(String(role || '').toLowerCase());

/** Client has an active portal login (excludes deleted / inactive users). */
const ACTIVE_CLIENT_USER_EXISTS_SQL = `
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.role = 'client'
      AND LOWER(COALESCE(u.status, 'Active')) = 'active'
      AND (
        LOWER(TRIM(u.name)) = LOWER(TRIM(c.name))
        OR (
          c.email IS NOT NULL AND TRIM(c.email) != ''
          AND u.email IS NOT NULL AND TRIM(u.email) != ''
          AND LOWER(TRIM(u.email)) = LOWER(TRIM(u.email))
        )
        OR (
          c.id_number IS NOT NULL AND TRIM(c.id_number) != ''
          AND u.id_number IS NOT NULL AND TRIM(u.id_number) != ''
          AND u.id_number = c.id_number
        )
      )
  )
`;

/** SQL conditions for clients selectable in loan application / search. */
const LOAN_ELIGIBLE_CLIENT_WHERE_SQL = `
  LOWER(TRIM(COALESCE(c.status, ''))) = 'active'
  AND LOWER(TRIM(COALESCE(c.kyc_status, ''))) = 'verified'
  AND ${ACTIVE_CLIENT_USER_EXISTS_SQL}
`;

const assertClientEligibleForLoan = async (clientId) => {
  const row = await runGet(
    `SELECT c.id FROM clients c WHERE c.id = ? AND ${LOAN_ELIGIBLE_CLIENT_WHERE_SQL}`,
    [clientId]
  );
  if (!row) {
    const error = new Error(
      'This client is not available for loan applications. The account must be active, KYC-verified, and have an active login (pending or deleted profiles are excluded).'
    );
    error.statusCode = 403;
    error.code = 'CLIENT_NOT_LOAN_ELIGIBLE';
    throw error;
  }
  return row;
};

const filterLoanEligibleClientsQuery = () => ({
  sql: `SELECT c.*
        FROM clients c
        WHERE ${LOAN_ELIGIBLE_CLIENT_WHERE_SQL}
        ORDER BY c.created_at DESC`,
  params: []
});

const assertStaffCanAccessClient = async (user, clientId) => {
  if (!user || !clientId) {
    const error = new Error('Client access denied');
    error.statusCode = 403;
    throw error;
  }

  if (user.role === 'client') {
    const client = await runGet(
      'SELECT id FROM clients WHERE id = ?',
      [clientId]
    );
    const ownProfile = await runGet('SELECT client_id FROM users WHERE id = ?', [user.id]);
    if (!client || Number(ownProfile?.client_id) !== Number(clientId)) {
      const error = new Error('You can only access your own profile');
      error.statusCode = 403;
      throw error;
    }
    return;
  }

  if (isPrivilegedStaff(user.role) || STAFF_CLIENT_ROLES.has(user.role)) {
    return;
  }

  const error = new Error('Insufficient permissions for this client');
  error.statusCode = 403;
  throw error;
};

const filterClientsQueryForUser = () => ({
  sql: `SELECT c.*
        FROM clients c
        WHERE EXISTS (
          SELECT 1 FROM users u
          WHERE u.role = 'client'
            AND (
              LOWER(TRIM(u.name)) = LOWER(TRIM(c.name))
              OR (c.email IS NOT NULL AND c.email != '' AND u.email IS NOT NULL AND u.email != ''
                  AND LOWER(TRIM(u.email)) = LOWER(TRIM(c.email)))
              OR (c.id_number IS NOT NULL AND c.id_number != '' AND u.id_number IS NOT NULL AND u.id_number != ''
                  AND u.id_number = c.id_number)
            )
        )
        OR c.status IN ('Pending Admin Approval', 'Pending Admin Review')
        OR EXISTS (
          SELECT 1 FROM savings_accounts s
          WHERE s.client_id = c.id AND s.status NOT IN ('Rejected', 'Cancelled')
        )
        OR EXISTS (
          SELECT 1 FROM loan_accounts l
          WHERE l.client_id = c.id AND l.status NOT IN ('Rejected', 'Cancelled')
        )
        ORDER BY c.created_at DESC`,
  params: []
});

const requireClientAccess = (clientIdParam = 'id') => async (req, res, next) => {
  try {
    const clientId = req.params[clientIdParam] || req.params.clientId || req.body.client_id;
    if (!clientId) {
      return res.status(400).json({ error: 'Client ID is required' });
    }
    await assertStaffCanAccessClient(req.user, clientId);
    req.clientId = Number(clientId);
    return next();
  } catch (error) {
    return res.status(error.statusCode || 403).json({ error: error.message || 'Access denied' });
  }
};

module.exports = {
  isPrivilegedStaff,
  assertStaffCanAccessClient,
  assertClientEligibleForLoan,
  filterClientsQueryForUser,
  filterLoanEligibleClientsQuery,
  LOAN_ELIGIBLE_CLIENT_WHERE_SQL,
  ACTIVE_CLIENT_USER_EXISTS_SQL,
  requireClientAccess
};
