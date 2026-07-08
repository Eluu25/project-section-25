import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { CheckCircle, XCircle, Clock, AlertTriangle, Shield, RefreshCw } from 'lucide-react';
import './AdminPages.css';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { formatDateTime } from '../../utils/dateTime';

const Approvals = () => {
  const { t, tStatus } = useLanguage();
  const { success, error, warning } = useToast();
  const [approvals, setApprovals] = useState([]);
  const [thresholds, setThresholds] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [justification, setJustification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approveVerified, setApproveVerified] = useState(false);
  const [linkedDocuments, setLinkedDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);

  const fetchApprovals = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }
    setFetchError(null);
    try {
      const data = await api.getPendingApprovals();
      setApprovals(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching approvals:', err);
      setFetchError(err.message || 'Failed to load approvals');
      setApprovals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchThresholds = useCallback(async () => {
    try {
      const data = await api.getApprovalThresholds();
      setThresholds(data);
    } catch (err) {
      console.error('Error fetching thresholds:', err);
    }
  }, []);

  const handleRefresh = () => {
    fetchApprovals(true);
    fetchThresholds();
  };

  useEffect(() => {
    fetchApprovals();
    fetchThresholds();
  }, [fetchApprovals, fetchThresholds]);

  const loadApprovalDocuments = async (approval) => {
    if (!approval?.id) return;
    setDocumentsLoading(true);
    try {
      const docs = await api.getDocumentsByApprovalRequest(approval.id).catch(() => []);
      setLinkedDocuments(Array.isArray(docs) ? docs : []);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const openApproveModal = (approval) => {
    setSelectedApproval(approval);
    setJustification('');
    setApproveVerified(false);
    setLinkedDocuments([]);
    setShowApproveModal(true);
    if (['transaction_deposit', 'transaction_withdraw'].includes(approval.type)) {
      loadApprovalDocuments(approval);
    }
  };

  const requiresVerification = (approval) => (
    approval?.type === 'transaction_deposit' || approval?.type === 'transaction_withdraw'
  );

  const handleApprove = async () => {
    if (!justification.trim()) {
      warning('Justification is required');
      return;
    }
    if (requiresVerification(selectedApproval) && !approveVerified) {
      warning('Confirm you have verified the receipt and request details before approving.');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const data = await api.approveRequest(selectedApproval.id, justification);

      if (!data.error) {
        setShowApproveModal(false);
        setSelectedApproval(null);
        setJustification('');
        await fetchApprovals();
        success('Request approved successfully');
      } else {
        error(data.error);
      }
    } catch (err) {
      error('Failed to approve request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!justification.trim()) {
      warning('Rejection reason is required');
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const data = await api.rejectRequest(selectedApproval.id, justification);

      if (!data.error) {
        setShowRejectModal(false);
        setSelectedApproval(null);
        setJustification('');
        await fetchApprovals();
        success('Request rejected successfully');
      } else {
        error(data.error);
      }
    } catch (err) {
      error('Failed to reject request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'transaction_deposit': return 'Deposit Transaction';
      case 'transaction_withdraw': return 'Withdrawal Transaction';
      case 'loan_application': return 'Loan Application';
      default: return type;
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'transaction_deposit': return '📥';
      case 'transaction_withdraw': return '📤';
      case 'loan_application': return '💰';
      default: return '📋';
    }
  };

  const getApprovalLevelColor = (level) => {
    switch (level) {
      case 'branch_manager': return '#3b82f6';
      case 'ceo': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const getApprovalLevelLabel = (level) => {
    switch (level) {
      case 'branch_manager': return 'Branch Manager';
      case 'ceo': return 'CEO';
      default: return level;
    }
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="admin_approvals_title" subtitleKey="admin_approvals_page_subtitle">
        <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="inline-meta">Pending requests: {approvals.length}</span>
          <button
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            type="button"
          >
            <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
            {refreshing ? t('refreshing') : t('refresh')}
          </button>
        </div>
      </PageHeader>

      <div className="info-card" style={{ marginBottom: '2rem', background: '#f0fdf4', borderColor: '#86efac' }}>
        <Shield size={24} style={{ color: '#166534' }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534' }}>Approval Thresholds</h3>
          <p style={{ margin: 0, color: '#166534' }}>
            Branch Manager: up to {thresholds.branch_manager?.toLocaleString() || '100,000'} ETB | 
            CEO: Unlimited
          </p>
        </div>
      </div>

      {loading ? (
        <div className="table-container">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem' }}>
            <RefreshCw size={48} className="spinning" style={{ color: '#3b82f6', marginBottom: '1rem' }} />
            <p style={{ color: '#6b7280' }}>{t('loading_approvals')}</p>
          </div>
        </div>
      ) : fetchError ? (
        <div className="table-container">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem' }}>
            <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{fetchError}</p>
            <button className="btn-primary" onClick={handleRefresh}>
              <RefreshCw size={18} />
              Try Again
            </button>
          </div>
        </div>
      ) : approvals.length === 0 ? (
        <div className="empty-state">
          <Clock size={48} />
          <p>{t('no_pending_approvals')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Entity ID</th>
                <th>{t('amount')}</th>
                <th>Requested By</th>
                <th>Approval Level</th>
                <th>Created At</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((approval) => (
                <tr key={approval.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>{getTypeIcon(approval.type)}</span>
                      {getTypeLabel(approval.type)}
                    </span>
                  </td>
                  <td>{approval.entity_id}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {approval.amount ? `${parseFloat(approval.amount).toLocaleString()} ETB` : '-'}
                  </td>
                  <td>{approval.requested_by_name || '-'}</td>
                  <td>
                    <span style={{ 
                      color: getApprovalLevelColor(approval.approval_level),
                      fontWeight: 'bold',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      background: `${getApprovalLevelColor(approval.approval_level)}20`
                    }}>
                      {getApprovalLevelLabel(approval.approval_level)}
                    </span>
                  </td>
                  <td>{formatDateTime(approval.created_at)}</td>
                  <td>
                    <button 
                      className="btn-icon edit" 
                      title="Approve"
                      onClick={() => openApproveModal(approval)}
                      disabled={isSubmitting}
                    >
                      <CheckCircle size={18} style={{ color: '#10b981' }} />
                    </button>
                    <button 
                      className="btn-icon delete" 
                      title="Reject"
                      onClick={() => { setSelectedApproval(approval); setShowRejectModal(true); setJustification(''); }}
                    >
                      <XCircle size={18} style={{ color: '#ef4444' }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showApproveModal && selectedApproval && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_approve_request')}</h2>
              <button onClick={() => setShowApproveModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Request ID:</strong> {selectedApproval.id}</p>
              <p><strong>Type:</strong> {getTypeLabel(selectedApproval.type)}</p>
              <p><strong>Entity ID:</strong> {selectedApproval.entity_id}</p>
              <p><strong>Amount:</strong> {selectedApproval.amount ? `${parseFloat(selectedApproval.amount).toLocaleString()} ETB` : '-'}</p>
              <p><strong>Approval Level:</strong> {getApprovalLevelLabel(selectedApproval.approval_level)}</p>
              <p><strong>Requested By:</strong> {selectedApproval.requested_by_name || '-'}</p>
              
              {selectedApproval.details && (
                <div className="info-card" style={{ marginBottom: '1rem', background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  <AlertTriangle size={20} style={{ color: '#1e40af' }} />
                  <span style={{ color: '#1e40af' }}>
                    {selectedApproval.details}
                  </span>
                </div>
              )}
              
              {requiresVerification(selectedApproval) && (
                <>
                  <div className="info-card" style={{ marginBottom: '1rem', background: '#fffbeb', borderColor: '#fcd34d' }}>
                    <AlertTriangle size={20} style={{ color: '#b45309' }} />
                    <span style={{ color: '#92400e' }}>
                      Verify receipt, amount, and account before approving. This action cannot be undone.
                    </span>
                  </div>
                  {documentsLoading ? (
                    <p className="text-muted">{t('loading_linked_documents')}</p>
                  ) : linkedDocuments.length > 0 ? (
                    <ul style={{ margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
                      {linkedDocuments.map((doc) => (
                        <li key={doc.id}>
                          <button
                            type="button"
                            className="btn-sm secondary"
                            onClick={() => api.downloadDocument(doc.id).then(({ blob, contentDisposition }) => {
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = doc.file_name || 'receipt';
                              a.click();
                              URL.revokeObjectURL(url);
                            }).catch(() => error('Failed to download document'))}
                          >
                            View {doc.type || doc.file_name || doc.id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : selectedApproval.type === 'transaction_deposit' ? (
                    <p className="text-muted" style={{ marginBottom: '1rem' }}>{t('no_receipt_blocked')}</p>
                  ) : null}
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={approveVerified}
                      onChange={(e) => setApproveVerified(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    I have verified the request details and supporting documents
                  </label>
                </>
              )}

              <div className="form-group">
                <label>Justification <span className="required">*</span></label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Enter justification for approval"
                  rows={3}
                  required
                />
              </div>
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowApproveModal(false)} disabled={isSubmitting}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleApprove} disabled={isSubmitting || (requiresVerification(selectedApproval) && !approveVerified)}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner"></span>
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Approve
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && selectedApproval && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{t('modal_reject_request')}</h2>
              <button onClick={() => setShowRejectModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Request ID:</strong> {selectedApproval.id}</p>
              <p><strong>Type:</strong> {getTypeLabel(selectedApproval.type)}</p>
              <p><strong>Entity ID:</strong> {selectedApproval.entity_id}</p>
              <p><strong>Amount:</strong> {selectedApproval.amount ? `${parseFloat(selectedApproval.amount).toLocaleString()} ETB` : '-'}</p>
              <p><strong>Requested By:</strong> {selectedApproval.requested_by_name || '-'}</p>
              
              <div className="info-card" style={{ marginBottom: '1rem', background: '#fef2f2', borderColor: '#fca5a5' }}>
                <AlertTriangle size={20} style={{ color: '#991b1b' }} />
                <span style={{ color: '#991b1b' }}>
                  This action will reject the request and the transaction will not be executed.
                </span>
              </div>
              
              <div className="form-group">
                <label>Rejection Reason <span className="required">*</span></label>
                <textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Enter reason for rejection"
                  rows={3}
                  required
                />
              </div>
              
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRejectModal(false)} disabled={isSubmitting}>
                  Cancel
                </button>
                <button className="btn-primary" style={{ background: '#ef4444' }} onClick={handleReject} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="spinner"></span>
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle size={18} />
                      Reject
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
