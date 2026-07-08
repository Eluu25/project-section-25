import { AlertTriangle, Download, FileText, PiggyBank } from 'lucide-react';
import { formatScheduleAmount, getInstallmentRemainingFromRow } from '../utils/paymentSchedule';
import { formatDateOnly, formatDateTime } from '../utils/dateTime';

const LoanReviewPackageModal = ({
  open,
  onClose,
  loan,
  reviewPackage,
  reviewLoading,
  t,
  onDownloadDocument,
  onOpenDocument,
  onDownloadTransactionReceipt
}) => {
  if (!open) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: '960px', maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-header">
          <h2>{t('loan_review_package')}</h2>
          <button type="button" onClick={onClose} className="modal-close">×</button>
        </div>
        <div className="modal-body">
          <p><strong>{t('loan_id_label')}:</strong> {loan?.id}</p>
          <p><strong>{t('client_label')}:</strong> {loan?.client}</p>
          {reviewLoading ? (
            <p style={{ padding: '1.5rem', textAlign: 'center' }}>{t('loading_review_package')}</p>
          ) : reviewPackage ? (
            <>
              <div className="info-card" style={{ marginBottom: '1rem' }}>
                <PiggyBank size={20} />
                <div>
                  <strong>{t('savings_docs_requirement')}</strong>
                  <p style={{ margin: '0.25rem 0 0' }}>{reviewPackage.savings_requirement?.message}</p>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
                    {t('balance_label')}: {Number(reviewPackage.savings_requirement?.savings_balance || 0).toLocaleString()} {t('etb')} •
                    {t('required_label')}: {Number(reviewPackage.savings_requirement?.required_savings_amount || 0).toLocaleString()} {t('etb')} •
                    {t('documents_count_label')}: {reviewPackage.savings_requirement?.document_count || 0}
                  </p>
                </div>
              </div>

              <h3 style={{ marginTop: '1rem' }}>{t('application_documents')}</h3>
              <div className="documents-list">
                {(reviewPackage.documents || []).length === 0 ? (
                  <p style={{ color: '#6b7280' }}>{t('no_documents_attached')}</p>
                ) : reviewPackage.documents.map((doc) => (
                  <div className="document-item" key={doc.id}>
                    <FileText size={20} />
                    <div>
                      <p className="document-name">{doc.type || t('document_label')}</p>
                      <p className="document-meta">{doc.file_name}</p>
                      {doc.receipt_reference && (
                        <p className="document-meta">{t('receipt_reference')}: {doc.receipt_reference}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {onOpenDocument ? (
                        <button className="btn-sm secondary" type="button" onClick={() => onOpenDocument(doc)}>
                          {t('view') || 'View'}
                        </button>
                      ) : null}
                      <button className="btn-sm secondary" type="button" onClick={() => onDownloadDocument(doc)}>
                        {t('download')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {(reviewPackage.savings_receipt_documents || []).length > 0 && (
                <>
                  <h3 style={{ marginTop: '1.5rem' }}>{t('receipt_bank_proofs')}</h3>
                  <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t('receipt_bank_proofs_hint')}</p>
                  <div className="documents-list">
                    {reviewPackage.savings_receipt_documents.map((doc) => (
                      <div className="document-item" key={`rcpt-${doc.id}`}>
                        <FileText size={20} />
                        <div>
                          <p className="document-name">{doc.type || t('receipt_reference')}</p>
                          <p className="document-meta">
                            {doc.receipt_reference || doc.file_name}
                            {doc.consumed_at ? ` · ${t('receipt_status_consumed')}` : ''}
                          </p>
                        </div>
                        <button className="btn-sm secondary" type="button" onClick={() => onDownloadDocument(doc)}>
                          {t('view_receipt')}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <h3 style={{ marginTop: '1.5rem' }}>{t('transaction_receipts')}</h3>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>{t('loan_account_transactions')}</p>
              <div className="table-container" style={{ marginTop: '0.5rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('type_label')}</th>
                      <th>{t('amount')}</th>
                      <th>{t('table_reference')}</th>
                      <th>{t('table_receipt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewPackage.transactions?.loan || []).length === 0 ? (
                      <tr><td colSpan={5}>{t('no_loan_transactions')}</td></tr>
                    ) : reviewPackage.transactions.loan.map((txn) => (
                      <tr key={txn.id}>
                        <td>{formatDateTime(txn.created_at)}</td>
                        <td>{txn.transaction_type}</td>
                        <td>{Number(txn.amount || 0).toLocaleString()} {t('etb')}</td>
                        <td>{txn.transaction_reference || '—'}</td>
                        <td>
                          <button type="button" className="btn-sm secondary" onClick={() => onDownloadTransactionReceipt(txn.id)}>
                            <Download size={14} /> PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '1rem' }}>{t('linked_savings_transactions')}</p>
              <div className="table-container" style={{ marginTop: '0.5rem' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('date')}</th>
                      <th>{t('type_label')}</th>
                      <th>{t('amount')}</th>
                      <th>{t('table_receipt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reviewPackage.transactions?.savings || []).length === 0 ? (
                      <tr><td colSpan={4}>{t('no_savings_transactions')}</td></tr>
                    ) : reviewPackage.transactions.savings.map((txn) => (
                      <tr key={txn.id}>
                        <td>{formatDateTime(txn.created_at)}</td>
                        <td>{txn.transaction_type}</td>
                        <td>{Number(txn.amount || 0).toLocaleString()} {t('etb')}</td>
                        <td>
                          <button type="button" className="btn-sm secondary" onClick={() => onDownloadTransactionReceipt(txn.id)}>
                            <Download size={14} /> PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {reviewPackage.penalty_schedule && (
                <div className="info-card" style={{ marginTop: '1.5rem' }}>
                  <AlertTriangle size={18} />
                  <span>{reviewPackage.penalty_schedule.description}</span>
                </div>
              )}

              {(reviewPackage.payment_schedule || []).length > 0 && (
                <>
                  <h3 style={{ marginTop: '1.5rem' }}>{t('payment_penalty_schedule')}</h3>
                  <div className="table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t('due_label')}</th>
                          <th>{t('total_label')}</th>
                          <th>{t('penalty_label')}</th>
                          <th>{t('paid_label')}</th>
                          <th>{t('remaining_label')}</th>
                          <th>{t('status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewPackage.payment_schedule.map((row) => {
                          const remaining = getInstallmentRemainingFromRow(row);
                          return (
                            <tr key={row.id}>
                              <td>{formatDateOnly(row.due_date)}</td>
                              <td>{formatScheduleAmount(row.total_amount)}</td>
                              <td>{Number(row.penalty_amount || 0) > 0 ? formatScheduleAmount(row.penalty_amount) : '—'}</td>
                              <td>{Number(row.paid_amount || 0) > 0 ? formatScheduleAmount(row.paid_amount) : '—'}</td>
                              <td>{remaining > 0 ? formatScheduleAmount(remaining) : '—'}</td>
                              <td>
                                <span className={`status ${row.status === 'Partial' ? 'partial' : row.is_overdue ? 'high' : row.status === 'Paid' ? 'active' : 'pending'}`}>
                                  {row.status === 'Partial' && remaining > 0
                                    ? `Partial (${formatScheduleAmount(remaining)} due)`
                                    : row.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : (
            <p style={{ color: '#6b7280' }}>{t('no_review_data')}</p>
          )}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>{t('close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanReviewPackageModal;
