const { db } = require('../config/database');
const {
  normalizeEthiopianPhone,
  normalizeStaffNationalId,
  normalizeText
} = require('./inputValidators');

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const phonesMatch = (stored, incoming) => {
  const a = normalizeEthiopianPhone(stored);
  const b = normalizeEthiopianPhone(incoming);
  if (a && b) return a === b;
  return String(stored || '').trim() === String(incoming || '').trim();
};

const idsMatch = (stored, incoming) => {
  const a = normalizeStaffNationalId(stored);
  const b = normalizeStaffNationalId(incoming);
  if (a && b) return a === b;
  return normalizeText(stored).toUpperCase() === normalizeText(incoming).toUpperCase();
};

const findUserWithDuplicatePhone = async (normalizedPhone, excludeUserId = null) => {
  if (!normalizedPhone) return null;
  const rows = await runAll(
    excludeUserId
      ? 'SELECT id, phone FROM users WHERE phone IS NOT NULL AND id != ?'
      : 'SELECT id, phone FROM users WHERE phone IS NOT NULL',
    excludeUserId ? [excludeUserId] : []
  );
  return rows.find((row) => phonesMatch(row.phone, normalizedPhone)) || null;
};

const findClientWithDuplicatePhone = async (normalizedPhone) => {
  if (!normalizedPhone) return null;
  const rows = await runAll('SELECT id, phone FROM clients WHERE phone IS NOT NULL', []);
  return rows.find((row) => phonesMatch(row.phone, normalizedPhone)) || null;
};

const findPendingClientRequestWithDuplicatePhone = async (normalizedPhone) => {
  if (!normalizedPhone) return null;
  const rows = await runAll(
    `SELECT id, phone
     FROM client_registration_requests
     WHERE phone IS NOT NULL
       AND (status IS NULL OR status IN ('Pending Admin Review', 'Pending'))`,
    []
  );
  return rows.find((row) => phonesMatch(row.phone, normalizedPhone)) || null;
};

const findUserWithDuplicateNationalId = async (normalizedId, excludeUserId = null) => {
  if (!normalizedId) return null;
  const rows = await runAll(
    excludeUserId
      ? 'SELECT id, id_number FROM users WHERE id_number IS NOT NULL AND id != ?'
      : 'SELECT id, id_number FROM users WHERE id_number IS NOT NULL',
    excludeUserId ? [excludeUserId] : []
  );
  return rows.find((row) => idsMatch(row.id_number, normalizedId)) || null;
};

const findClientWithDuplicateNationalId = async (normalizedId) => {
  if (!normalizedId) return null;
  const rows = await runAll('SELECT id, id_number FROM clients WHERE id_number IS NOT NULL', []);
  return rows.find((row) => idsMatch(row.id_number, normalizedId)) || null;
};

const findPendingClientRequestWithDuplicateNationalId = async (normalizedId) => {
  if (!normalizedId) return null;
  const rows = await runAll(
    `SELECT id, id_number
     FROM client_registration_requests
     WHERE id_number IS NOT NULL
       AND (status IS NULL OR status IN ('Pending Admin Review', 'Pending'))`,
    []
  );
  return rows.find((row) => idsMatch(row.id_number, normalizedId)) || null;
};

module.exports = {
  phonesMatch,
  idsMatch,
  findUserWithDuplicatePhone,
  findClientWithDuplicatePhone,
  findPendingClientRequestWithDuplicatePhone,
  findUserWithDuplicateNationalId,
  findClientWithDuplicateNationalId,
  findPendingClientRequestWithDuplicateNationalId
};
