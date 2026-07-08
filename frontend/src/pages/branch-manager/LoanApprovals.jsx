import { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { CheckCircle, XCircle, Eye, Search, Filter, FileText, AlertTriangle, ArrowUp, Download, Receipt, PiggyBank } from 'lucide-react';
import { formatScheduleAmount, getInstallmentRemainingFromRow } from '../../utils/paymentSchedule';
import { formatDateOnly } from '../../utils/dateTime';
import '../admin/AdminPages.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dateTime';
import LoanReviewPackageModal from '../../components/LoanReviewPackageModal.jsx';
import { openDocumentById } from '../../utils/documentDownload';

const LoanApprovals = () => {
  let toast;
  try {
    toast = useToast();
  } catch (error) {
    console.warn('Toast context not available:', error);
    toast = { success: console.log, error: console.error, warning: console.warn };
  }
  const { success, error, warning } = toast;
  const { t, tStatus } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalJustification, setApprovalJustification] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [pendingLoans, setPendingLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historySummary, setHistorySummary] = useState({ approved: 0, rejected: 0, total: 0 });
  const [creditLimit, setCreditLimit] = useState(100000);
  const [loanDocuments, setLoanDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewPackage, setReviewPackage] = useState(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [savingsPolicy, setSavingsPolicy] = useState(null);

  useEffect(() => {
    fetchPendingLoans();
    fetchLoanHistorySummary();
    fetchThresholds();
    api.getLoanSavingsPolicy().then(setSavingsPolicy).catch(() => {});
  }, []);

  const fetchPendingLoans = async () => {
    try {
      const data = await api.getPendingLoans();
      setPendingLoans(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching pending loans:', error);
      setPendingLoans([]);
      warning(error?.message || 'Failed to load pending loan approvals');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanHistorySummary = async () => {
    try {
      const data = await api.getApprovalHistory('loan_origination');
      const loanSummary = data?.summary?.loan_origination || { approved: 0, rejected: 0, total: 0 };
      setHistorySummary(loanSummary);
    } catch (historyErr) {
      console.error('Error fetching loan approval history summary:', historyErr);
    }
  };

  const fetchThresholds = async () => {
    try {
      const thresholdData = await api.getApprovalThresholds();
      if (Number.isFinite(Number(thresholdData?.branch_manager))) {
        setCreditLimit(Number(thresholdData.branch_manager));
      }
    } catch (thresholdErr) {
      console.error('Error loading approval thresholds:', thresholdErr);
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
    const req = loan?.savings_requirement;
    if (loan?.ready_for_branch_review === false && req) {
      const parts = [];
      if (!req.meets_savings) {
        parts.push(req.message || `Required savings collateral not met (${req.required_savings_amount?.toLocaleString()} ETB).`);
      }
      if (!req.meets_documents) {
        parts.push('Supporting documents (trade license, receipt, or property proof) are missing.');
      }
      setRejectReason(parts.join(' ') || 'Loan requirements not fulfilled — cannot escalate to CEO.');
    } else {
      setRejectReason('');
    }
    setShowRejectModal(true);
  };

  const handleApprove = (loan) => {
    setSelectedLoan(loan);
    setApprovalJustification('');
    setShowApproveModal(true);
  };

  const confirmApprove = async () => {
    if (!approvalJustification.trim()) {
      warning('Please provide justification for approval.');
      return;
    }
    if (selectedLoan?.ready_for_branch_review === false) {
      const req = selectedLoan.savings_requirement;
      const parts = [];
      if (req && !req.meets_savings) {
        parts.push(req.message || `Savings must be at least ${req.required_savings_amount?.toLocaleString()} ETB (currently ${req.savings_balance?.toLocaleString()} ETB).`);
      }
      if (req && !req.meets_documents) {
        parts.push(`Supporting documents on file: ${req.document_count || 0}. Upload/link license or receipt on the loan package.`);
      }
      warning(parts.join(' ') || 'Loan savings collateral requirement is not met.');
      return;
    }

    try {
      await api.approveLoan(selectedLoan.id, approvalJustification.trim());
      setShowApproveModal(false);
      setApprovalJustification('');
      setSelectedLoan(null);
      fetchPendingLoans(); // Refresh the list
      success(isOver100K(selectedLoan)
        ? 'Loan reviewed and forwarded to CEO approval successfully'
        : 'Loan approved successfully');
    } catch (err) {
      console.error('Error approving loan:', err);
      error(err.message || 'Failed to approve loan');
    }
  };

  const handleEscalate = (loan) => {
    setSelectedLoan(loan);
    setShowEscalateModal(true);
  };

  const handleViewDetails = (loan) => {
    setSelectedLoan(loan);
    setShowDetailsModal(true);
  };

  const handleViewDocuments = (loan) => {
    setSelectedLoan(loan);
    setShowDocumentsModal(true);
    setLoanDocuments([]);
    setDocumentsLoading(true);
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
      .catch((err) => warning(err?.message || 'Failed to load loan documents'))
      .finally(() => setDocumentsLoading(false));
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
      error(err?.message || 'Failed to load loan review package');
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
      success('Receipt downloaded');
    } catch (err) {
      error(err?.message || 'Failed to download receipt');
    }
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
      success('Document downloaded');
    } catch (err) {
      error(err.message || 'Failed to download document');
    }
  };

  const handleOpenDocument = async (doc) => {
    if (!doc?.id) return;
    try {
      await openDocumentById(doc.id);
    } catch (err) {
      error(err.message || 'Failed to open document');
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      warning('Rejection reason is mandatory for audit compliance.');
      return;
    }
    try {
      await api.rejectLoan(selectedLoan.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedLoan(null);
      fetchPendingLoans();
      success('Loan rejected successfully');
    } catch (err) {
      console.error('Error rejecting loan:', err);
      error(err.message || 'Failed to reject loan');
    }
  };

  const confirmEscalate = async () => {
    if (!escalationReason.trim()) {
      warning('Justification is mandatory for escalation.');
      return;
    }
    try {
      await api.approveLoan(selectedLoan.id, escalationReason);
      setShowEscalateModal(false);
      setEscalationReason('');
      setSelectedLoan(null);
      fetchPendingLoans();
      success('Loan escalated to CEO successfully');
    } catch (err) {
      console.error('Error escalating loan:', err);
      error(err.message || 'Failed to escalate loan');
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

  const isOver100K = (loan) => getAmountValue(loan.amount) > 100000;
  const pendingExposure = useMemo(
    () => filteredLoans.reduce((sum, loan) => sum + getAmountValue(loan.amount), 0),
    [filteredLoans]
  );

  return (
    <div className="admin-page">
      <PageHeader titleKey="bm_loan_approvals_title" subtitleKey="bm_loan_approvals_page_subtitle">
        <div style={{ marginTop: '0.75rem' }}>
          <span className="inline-meta">{t('pending_loans_label')}: {filteredLoans.length}</span>
        </div>
      </PageHeader>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-content"><h3>{creditLimit.toLocaleString()} {t('etb')}</h3><p>{t('branch_credit_limit')}</p></div></div>
        <div className="stat-card"><div className="stat-content"><h3>{pendingExposure.toLocaleString()} {t('etb')}</h3><p>{t('pending_loan_exposure')}</p></div></div>
        <div className="stat-card"><div className="stat-content"><h3>{historySummary.approved}</h3><p>{t('approved_history')}</p></div></div>
        <div className="stat-card"><div className="stat-content"><h3>{historySummary.rejected}</h3><p>{t('rejected_history')}</p></div></div>
      </div>

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
            <option value="Pending">{t('pending')}</option>
            <option value="High Priority">{t('high_priority')}</option>
            <option value="Approved">{t('approved')}</option>
            <option value="Rejected">{t('rejected')}</option>
          </select>
        </div>
        <button
          className="btn-secondary"
          onClick={() => {
            setSearchTerm('');
            setFilterStatus('all');
          }}
        >
          {t('reset_filters')}
        </button>
      </div>

      {loading ? (
        <div className="table-container">
          <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_pending_loans')}</p>
        </div>
      ) : (
        <div className="table-container">
          {filteredLoans.length === 0 ? (
            <div className="empty-state">
              <p>{t('no_loan_approvals_filter')}</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('loan_id_label')}</th>
                  <th>{t('amount')}</th>
                  <th>{t('type_label')}</th>
                  <th>{t('term_label')}</th>
                  <th>{t('savings_collateral')}</th>
                  <th>{t('status')}</th>
                  <th>{t('submitted_label')}</th>
                  <th>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredLoans.map((loan) => (
                  <tr key={loan.id}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong>{loan.id}</strong>
                      <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{loan.client}</span>
                    </div>
                  </td>
                  <td>
                    <span className={isOver100K(loan) ? 'amount-highlight' : ''}>{loan.amount}</span>
                    {isOver100K(loan) && <ArrowUp size={12} className="escalation-icon" title={t('requires_ceo_approval')} />}
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
                    <span className={`status ${loan.ready_for_branch_review === false ? 'high' : loan.status === 'High Priority' ? 'high' : loan.status === 'Pending' ? 'pending' : loan.status === 'Approved' ? 'active' : 'inactive'}`}>
                      {loan.ready_for_branch_review === false
                        ? 'Needs collateral'
                        : (tStatus(loan.status) || loan.status)}
                    </span>
                  </td>
                  <td>{formatDateTime(loan.submitted)}</td>
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
                    <button
                      className="btn-icon edit"
                      title={
                        isOver100K(loan) && loan.ready_for_branch_review === false
                          ? t('loan_reject_requirements_first')
                          : (isOver100K(loan) ? t('approve_send_ceo') : t('approve'))
                      }
                      disabled={isOver100K(loan) && loan.ready_for_branch_review === false}
                      onClick={() => handleApprove(loan)}
                    >
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
          )}
        </div>
      )}

      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_reject_loan')}</h2>
              <button onClick={() => setShowRejectModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('loan_id_label')}:</strong> {selectedLoan?.id}</p>
              <p><strong>{t('client_label')}:</strong> {selectedLoan?.client}</p>
              <p><strong>{t('amount')}:</strong> {selectedLoan?.amount}</p>
              <div className="form-group">
                <label>{t('rejection_reason')} <span className="required">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Please provide a detailed reason for rejection (mandatory for audit compliance)"
                  rows={4}
                  required
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRejectModal(false)}>
                  {t('cancel')}
                </button>
                <button className="btn-primary delete" onClick={confirmReject}>
                  {t('confirm_rejection')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showApproveModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_approve_loan')}</h2>
              <button onClick={() => setShowApproveModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Loan ID:</strong> {selectedLoan?.id}</p>
              <p><strong>Client:</strong> {selectedLoan?.client}</p>
              <p><strong>Amount:</strong> {selectedLoan?.amount}</p>
              <div className="form-group">
                <label>{t('approval_justification')} <span className="required">*</span></label>
                <textarea
                  value={approvalJustification}
                  onChange={(e) => setApprovalJustification(e.target.value)}
                  placeholder="Please provide justification for approval"
                  rows={4}
                  required
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowApproveModal(false)}>
                  {t('cancel')}
                </button>
                <button className="btn-primary" onClick={confirmApprove}>
                  <CheckCircle size={18} />
                  {t('confirm_approval')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEscalateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_escalate_ceo')}</h2>
              <button onClick={() => setShowEscalateModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Loan ID:</strong> {selectedLoan?.id}</p>
              <p><strong>Client:</strong> {selectedLoan?.client}</p>
              <p><strong>Amount:</strong> {selectedLoan?.amount}</p>
              <div className="info-card" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={20} />
                <span>{t('loan_exceeds_ceo')}</span>
              </div>
              <div className="form-group">
                <label>{t('justification_escalation')} <span className="required">*</span></label>
                <textarea
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  placeholder="Please provide justification for escalating this loan to the CEO"
                  rows={4}
                  required
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowEscalateModal(false)}>
                  {t('cancel')}
                </button>
                <button className="btn-primary" onClick={confirmEscalate}>
                  <ArrowUp size={18} />
                  {t('escalate_to_ceo')}
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
                <label>{t('loan_id_label')}</label>
                <p>{selectedLoan?.id}</p>
              </div>
              <div className="form-group">
                <label>{t('client_label')}</label>
                <p>{selectedLoan?.client}</p>
              </div>
              <div className="form-group">
                <label>{t('amount')}</label>
                <p>{selectedLoan?.amount}</p>
              </div>
              <div className="form-group">
                <label>{t('type_label')}</label>
                <p>{selectedLoan?.type}</p>
              </div>
              <div className="form-group">
                <label>{t('term_label')}</label>
                <p>{selectedLoan?.term}</p>
              </div>
              <div className="form-group">
                <label>{t('status')}</label>
                <span className={`status ${selectedLoan?.status === 'High Priority' ? 'high' : selectedLoan?.status === 'Pending' ? 'pending' : 'active'}`}>
                  {tStatus(selectedLoan?.status) || selectedLoan?.status}
                </span>
              </div>
              <div className="form-group">
                <label>{t('submitted_date')}</label>
                <p>{selectedLoan?.submitted}</p>
              </div>
              {selectedLoan?.complianceFlag && (
                <div className="info-card" style={{ marginBottom: '1rem', background: '#fef3c7', borderColor: '#fcd34d' }}>
                  <AlertTriangle size={20} style={{ color: '#92400e' }} />
                  <span style={{ color: '#92400e' }}>{t('compliance_flag_review')}</span>
                </div>
              )}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDetailsModal(false)}>
                  {t('cancel')}
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

      <LoanReviewPackageModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        loan={selectedLoan}
        reviewPackage={reviewPackage}
        reviewLoading={reviewLoading}
        t={t}
        onDownloadDocument={handleDownloadDocument}
        onOpenDocument={handleOpenDocument}
        onDownloadTransactionReceipt={handleDownloadTransactionReceipt}
      />

      {showDocumentsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{t('loan_documents_title')}</h2>
              <button onClick={() => setShowDocumentsModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>{t('loan_id_label')}:</strong> {selectedLoan?.id}</p>
              <p><strong>{t('client_label')}:</strong> {selectedLoan?.client}</p>
              <div className="form-group">
                <label>{t('attached_documents_label')}</label>
                <div className="documents-list">
                  {documentsLoading ? (
                    <div style={{ padding: '1rem', color: '#6b7280' }}>{t('loading_documents')}</div>
                  ) : loanDocuments.length === 0 ? (
                    <div style={{ padding: '1rem', color: '#6b7280' }}>{t('no_documents_yet')}</div>
                  ) : loanDocuments.map((doc) => (
                    <div className="document-item" key={doc.id}>
                      <FileText size={20} />
                      <div>
                        <p className="document-name">{doc.type || 'Document'}</p>
                        <p className="document-meta">{doc.file_name} • Uploaded {formatDateTime(doc.uploaded_at)}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button type="button" className="btn-sm secondary" onClick={() => handleOpenDocument(doc)}>
                          {t('view') || 'View'}
                        </button>
                        <button type="button" className="btn-sm secondary" onClick={() => handleDownloadDocument(doc)}>
                          {t('download')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDocumentsModal(false)}>
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanApprovals;
