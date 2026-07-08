const { db } = require('../config/database');

const REGISTRY_TYPE_PATTERNS = [
  { key: 'business_license', match: (t) => /business\s*license/i.test(t) },
  { key: 'trade_license', match: (t) => /trade\s*license/i.test(t) }
];

const runGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
});

const runAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
});

const normalizeType = (type) => String(type || '').trim();

const isClientRegistryDocumentType = (type) => {
  const normalized = normalizeType(type);
  return REGISTRY_TYPE_PATTERNS.some((pattern) => pattern.match(normalized));
};

const findClientRegistryDocument = async (clientId, type) => {
  if (!clientId || !isClientRegistryDocumentType(type)) return null;

  const docs = await runAll(
    `SELECT *
     FROM documents
     WHERE client_id = ?
       AND (
         lower(COALESCE(type, '')) LIKE '%business license%'
         OR lower(COALESCE(type, '')) LIKE '%trade license%'
       )
     ORDER BY uploaded_at DESC`,
    [clientId]
  );

  const normalized = normalizeType(type);
  return docs.find((doc) => {
    const docType = normalizeType(doc.type);
    if (/business\s*license/i.test(normalized)) {
      return /business\s*license/i.test(docType);
    }
    if (/trade\s*license/i.test(normalized)) {
      return /trade\s*license/i.test(docType);
    }
    return true;
  }) || docs[0] || null;
};

const listClientRegistryDocuments = async (clientId) => runAll(
  `SELECT id, type, file_name, status, uploaded_at, loan_id
   FROM documents
   WHERE client_id = ?
     AND (
       lower(COALESCE(type, '')) LIKE '%business license%'
       OR lower(COALESCE(type, '')) LIKE '%trade license%'
     )
   ORDER BY uploaded_at DESC`,
  [clientId]
);

module.exports = {
  isClientRegistryDocumentType,
  findClientRegistryDocument,
  listClientRegistryDocuments
};
