const { db } = require('../config/database');

const queryOne = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
});

const getUserRecord = async (userId) => queryOne(
  'SELECT id, username, role, name, status FROM users WHERE id = ?',
  [userId]
);

const resolveClientProfileByUser = async (user) => {
  if (!user) {
    return null;
  }

  if (user.id_number) {
    const byId = await queryOne(
      'SELECT * FROM clients WHERE id_number = ? ORDER BY id ASC LIMIT 1',
      [user.id_number]
    );
    if (byId) return byId;
  }

  if (user.email) {
    const byEmail = await queryOne(
      `SELECT * FROM clients
       WHERE email IS NOT NULL AND email != '' AND LOWER(TRIM(email)) = LOWER(TRIM(?))
       ORDER BY id ASC LIMIT 1`,
      [user.email]
    );
    if (byEmail) return byEmail;
  }

  if (user.name) {
    const byName = await queryOne(
      'SELECT * FROM clients WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) ORDER BY id ASC LIMIT 1',
      [user.name]
    );
    if (byName) return byName;
  }

  if (user.username) {
    const byRegistration = await queryOne(
      `SELECT c.* FROM clients c
       INNER JOIN client_registration_requests r ON r.client_id = c.id
       WHERE r.generated_username = ?
       ORDER BY c.id ASC LIMIT 1`,
      [user.username]
    );
    if (byRegistration) return byRegistration;
  }

  return null;
};

module.exports = {
  getUserRecord,
  resolveClientProfileByUser
};
