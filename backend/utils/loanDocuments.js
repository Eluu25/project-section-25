/**
 * Loan document queries and linking for approval workflows.
 */

const LOAN_DOCUMENT_TYPE_PATTERNS = [
  '%loan%',
  '%kyc%',
  '%collateral%',
  '%guarantee%',
  '%organization%',
  '%org%',
  '%letter%',
  '%supporting%',
  '%trade%',
  '%license%',
  '%libre%',
  '%lease%',
  '%property%',
  '%national id%',
  '%passport%',
  '%income%'
];

const buildLoanDocumentWhereClause = () => {
  const typeConditions = LOAN_DOCUMENT_TYPE_PATTERNS.map(
    (pattern) => `lower(COALESCE(type, '')) LIKE '${pattern}' OR lower(COALESCE(file_name, '')) LIKE '${pattern}'`
  ).join(' OR ');

  return `(
    loan_id = ?
    OR (related_entity_type IN ('loan_account', 'loan') AND related_entity_id = ?)
    OR (
      client_id = ?
      AND (loan_id IS NULL OR loan_id = ?)
      AND (${typeConditions})
    )
  )`;
};

const LOAN_DOCUMENT_WHERE = buildLoanDocumentWhereClause();

const linkDocumentsToLoan = async (runExec, { loanId, clientId, documentIds = [], approvalRequestId = null }) => {
  const uniqueIds = [...new Set((documentIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return 0;

  const placeholders = uniqueIds.map(() => '?').join(',');
  const params = [
    loanId,
    approvalRequestId || null,
    loanId,
    ...uniqueIds,
    clientId
  ];

  const result = await runExec(
    `UPDATE documents
     SET loan_id = ?,
         approval_request_id = COALESCE(approval_request_id, ?),
         related_entity_type = COALESCE(related_entity_type, 'loan_account'),
         related_entity_id = COALESCE(related_entity_id, ?)
     WHERE id IN (${placeholders})
       AND client_id = ?`,
    params
  );

  return result?.changes || 0;
};

module.exports = {
  LOAN_DOCUMENT_WHERE,
  linkDocumentsToLoan,
  LOAN_DOCUMENT_TYPE_PATTERNS
};
