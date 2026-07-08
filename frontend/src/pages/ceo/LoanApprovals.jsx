import { useState, useEffect } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { CheckCircle, XCircle, Eye, Search, Filter, AlertTriangle, ArrowUp, FileText, Download, Receipt } from 'lucide-react';
import LoanReviewPackageModal from '../../components/LoanReviewPackageModal.jsx';
import '../admin/AdminPages.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';

const LoanApprovals = () => {
  const { t, tStatus } = useLanguage();
  const { success, error, warning } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [approveJustification, setApproveJustification] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [pendingLoans, setPendingLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [loanDocuments, setLoanDocuments] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewPackage, setReviewPackage] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  useEffect(() => {
    fetchPendingLoans();
  }, []);

  const fetchPendingLoans = async () => {
    try {
      const data = await api.getPendingLoans();
      const ceoLoans = data.filter(loan => 
        loan.status === 'Pending CEO Review' || 
        (parseFloat(loan.amount?.replace(/[^0-9]/g, '') || 0) > 100000 && loan.status === 'Pending')
      );
      setPendingLoans(ceoLoans);
    } catch (error) {
      console.error('Error fetching pending loans:', error);
      setPendingLoans([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredLoans = pendingLoans.filter(loan => {
    const matchesSearch = (loan.client?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                         (loan.id?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === 'all' || loan.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const handleReject = (loan) => {
    setSelectedLoan(loan);
    setShowRejectModal(true);
  };

  const handleApprove = (loan) => {
    setSelectedLoan(loan);
    setApproveJustification('');
    setShowApproveModal(true);
  };

  const handleReviewPackage = async (loan) => {
    setSelectedLoan(loan);
    setShowReviewModal(true);
    setReviewPackage(null);
    setReviewLoading(true);
    try {
      const data = await api.getLoanReviewPackage(loan.id);
      setReviewPackage(data);
    } catch (err) {
      error(err?.message || t('error_generic'));
    } finally {
      setReviewLoading(false);
    }
  };

  const handleDownloadTransactionReceipt = async (transactionId) => {
    try {
      const { blob, contentDisposition } = await api.downloadTransactionStatementPdf(transactionId);
      const match = /filename="([^"]+)"/i.exec(contentDisposition || '');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || `receipt_${transactionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      success(t('receipt_downloaded'));
    } catch (err) {
      error(err?.message || t('receipt_download_failed'));
    }
  };

  const confirmApprove = async () => {
    if (!approveJustification.trim()) {
      warning(t('ceo_justification_required'));
      return;
    }

    setSubmitting(true);
    try {
      await api.approveLoan(selectedLoan.id, approveJustification.trim());
      setShowApproveModal(false);
      setSelectedLoan(null);
      setApproveJustification('');
      success(t('loan_approved_ceo'));
      fetchPendingLoans();
    } catch (err) {
      console.error('Error approving loan:', err);
      error(err.message || 'Failed to approve loan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetails = (loan) => {
    setSelectedLoan(loan);
    setShowDetailsModal(true);
  };

  const handleViewDocuments = (loan) => {
    setSelectedLoan(loan);
    setShowDocumentsModal(true);
    setDocumentsLoading(true);
    setLoanDocuments([]);
    Promise.all([
      api.getDocumentsByLoan(loan.id).catch(() => []),
      api.getDocumentsByEntity('loan_account', loan.id).catch(() => []),
      loan?.approval_request_id ? api.getDocumentsByApprovalRequest(loan.approval_request_id).catch(() => []) : Promise.resolve([])
    ])
      .then(([byLoan, byEntity, byApproval]) => {
        const merged = [...(byLoan || []), ...(byEntity || []), ...(byApproval || [])];
        const deduped = merged.filter((doc, index, arr) => arr.findIndex((item) => item.id === doc.id) === index);
        setLoanDocuments(deduped);
      })
      .catch((err) => warning(err?.message || 'Failed to load documents'))
      .finally(() => setDocumentsLoading(false));
  };

  const handleDownloadDocument = async (doc) => {
    if (!doc?.id) return;
    try {
      const { blob, contentDisposition } = await api.downloadDocument(doc.id);
      const match = /filename="([^"]+)"/i.exec(contentDisposition || '');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || doc.file_name || `document_${doc.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      success(t('document_downloaded'));
    } catch (err) {
      error(err.message || 'Failed to download document');
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      warning(t('rejection_reason_required'));
      return;
    }
    try {
      await api.rejectLoan(selectedLoan.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedLoan(null);
      fetchPendingLoans();
      success(t('loan_rejected_success'));
    } catch (err) {
      console.error('Error rejecting loan:', err);
      error(err.message || 'Failed to reject loan');
    }
  };

  const getAmountValue = (amountStr) => {
    if (typeof amountStr === 'number') {
      return amountStr;
    }
    if (typeof amountStr === 'string') {
      return parseInt(amountStr.replace(/[^0-9]/g, ''));
    }
    return 0;
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="ceo_loan_approvals_title" subtitleKey="ceo_loan_approvals_subtitle">
        <div style={{ marginTop: '0.75rem' }}>
          <span className="inline-meta">{t('ceo_queue_label')}: {filteredLoans.length}</span>
        </div>
      </PageHeader>

      <div className="page-actions sticky-actions">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder={t('search_loans')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="filter-dropdown">
          <Filter size={20} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">{t('all_status')}</option>
            <option value="Pending CEO Review">Pending CEO Review</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="table-container">
          <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_generic')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('loan_id_label')}</th>
                <th>{t('amount')}</th>
                <th>{t('type_label')}</th>
                <th>{t('term_label')}</th>
                <th>{t('savings_collateral')}</th>
                <th>{t('status')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                    {t('no_pending_ceo_loans')}
                  </td>
                </tr>
              ) : filteredLoans.map((loan) => (
                <tr key={loan.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong>{loan.id}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{loan.client}</span>
                    </div>
                  </td>
                  <td>
                    <span className="amount-highlight">{loan.amount}</span>
                    <ArrowUp size={12} className="escalation-icon" title={t('ceo_approval_required_tooltip')} />
                  </td>
                  <td>{loan.type}</td>
                  <td>{loan.term}</td>
                  <td>
                    {loan.savings_requirement ? (
                      <span className={`status ${loan.savings_requirement.eligible ? 'active' : 'high'}`}>
                        {loan.savings_requirement.savings_ratio_percent}% / {loan.savings_requirement.collateral_percent}% req.
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    <span className={`status ${loan.status === 'Pending CEO Review' ? 'high' : 'pending'}`}>
                      {tStatus(loan.status) || loan.status}
                    </span>
                  </td>
                  <td>
                    <button className="btn-icon edit" title={t('view_details_title')} onClick={() => handleViewDetails(loan)}>
                      <Eye size={18} />
                    </button>
                    <button className="btn-icon edit" title={t('ceo_review_package_btn')} onClick={() => handleReviewPackage(loan)}>
                      <Receipt size={18} />
                    </button>
                    <button className="btn-icon edit" title={t('nav_documents')} onClick={() => handleViewDocuments(loan)}>
                      <FileText size={18} />
                    </button>
                    <button className="btn-icon edit" title={t('approve')} onClick={() => handleApprove(loan)}>
                      <CheckCircle size={18} />
                    </button>
                    <button className="btn-icon delete" title={t('reject_title_short')} onClick={() => handleReject(loan)}>
                      <XCircle size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showApproveModal && selectedLoan && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_approve_loan_ceo')}</h2>
              <button onClick={() => (submitting ? null : setShowApproveModal(false))} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('loan_id_label')}:</strong> {selectedLoan?.id}</p>
              <p><strong>{t('client_label')}:</strong> {selectedLoan?.client}</p>
              <p><strong>{t('amount')}:</strong> {selectedLoan?.amount}</p>
              <div className="form-group">
                <label>{t('approval_justification_label')} <span className="required">*</span></label>
                <textarea
                  value={approveJustification}
                  onChange={(e) => setApproveJustification(e.target.value)}
                  placeholder={t('ceo_approve_placeholder')}
                  rows={4}
                  disabled={submitting}
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowApproveModal(false)} disabled={submitting}>
                  {t('cancel')}
                </button>
                <button className="btn-primary" onClick={confirmApprove} disabled={submitting}>
                  {submitting ? t('approving_label') : t('approve')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_reject_loan')}</h2>
              <button onClick={() => (submitting ? null : setShowRejectModal(false))} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('loan_id_label')}:</strong> {selectedLoan?.id}</p>
              <p><strong>{t('client_label')}:</strong> {selectedLoan?.client}</p>
              <p><strong>{t('amount')}:</strong> {selectedLoan?.amount}</p>
              <div className="info-card" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={20} />
                <span>{t('ceo_rejection_notice')}</span>
              </div>
              <div className="form-group">
                <label>{t('rejection_reason_label')} <span className="required">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t('rejection_placeholder_audit')}
                  rows={4}
                  required
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRejectModal(false)} disabled={submitting}>
                  {t('cancel')}
                </button>
                <button className="btn-primary delete" onClick={confirmReject} disabled={submitting}>
                  {t('confirm_rejection')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDetailsModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('loan_details')}</h2>
              <button onClick={() => setShowDetailsModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Loan ID</label>
                <p>{selectedLoan?.id}</p>
              </div>
              <div className="form-group">
                <label>Client</label>
                <p>{selectedLoan?.client}</p>
              </div>
              <div className="form-group">
                <label>{t('amount')}</label>
                <p>{selectedLoan?.amount}</p>
              </div>
              <div className="form-group">
                <label>Type</label>
                <p>{selectedLoan?.type}</p>
              </div>
              <div className="form-group">
                <label>Term</label>
                <p>{selectedLoan?.term}</p>
              </div>
              <div className="form-group">
                <label>{t('status')}</label>
                <span className={`status ${selectedLoan?.status === 'Pending CEO Review' ? 'high' : 'pending'}`}>
                  {selectedLoan?.status}
                </span>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDetailsModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={() => {
                  setShowDetailsModal(false);
                  handleApprove(selectedLoan);
                }}>
                  <CheckCircle size={18} />
                  {t('confirm_approve_loan')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDocumentsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '650px' }}>
            <div className="modal-header">
              <h2>{t('loan_documents_modal_title')}</h2>
              <button onClick={() => setShowDocumentsModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Loan ID:</strong> {selectedLoan?.id}</p>
              <p><strong>Client:</strong> {selectedLoan?.client}</p>

              {documentsLoading ? (
                <div style={{ padding: '1rem', color: '#6b7280' }}>{t('loading_documents')}</div>
              ) : loanDocuments.length === 0 ? (
                <div style={{ padding: '1rem', color: '#6b7280' }}>{t('no_documents_yet')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
                  {loanDocuments.map((doc) => (
                    <div key={doc.id} className="info-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <strong>{doc.type || 'Document'}</strong>
                        <span style={{ color: '#6b7280', fontSize: '0.9rem' }}>{doc.file_name}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>
                          {t('uploaded_label')}: {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : '-'}
                        </span>
                      </div>
                      <button className="btn-secondary" onClick={() => handleDownloadDocument(doc)}>
                        <Download size={18} />
                        {t('download')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDocumentsModal(false)}>
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <LoanReviewPackageModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        loan={selectedLoan}
        reviewPackage={reviewPackage}
        reviewLoading={reviewLoading}
        t={t}
        onDownloadDocument={handleDownloadDocument}
        onDownloadTransactionReceipt={handleDownloadTransactionReceipt}
      />
    </div>
  );
};

export default LoanApprovals;
