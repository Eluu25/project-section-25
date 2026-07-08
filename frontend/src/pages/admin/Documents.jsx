import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { FileText, Upload, Download, Eye, Trash2, CheckCircle, XCircle, Search, Filter, RefreshCw, AlertTriangle } from 'lucide-react';
import './AdminPages.css';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { downloadDocumentById } from '../../utils/documentDownload';

const Documents = () => {
  const { t, tStatus } = useLanguage();
  const { success, error, warning } = useToast();
  const [documents, setDocuments] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingDocumentId, setRejectingDocumentId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
  const [newDoc, setNewDoc] = useState({
    client_id: '',
    loan_id: '',
    type: 'kyc'
  });

  const fetchDocuments = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    }
    setFetchError(null);
    try {
      const data = await api.getDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching documents:', err);
      setFetchError(err.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleRefresh = () => {
    fetchDocuments(true);
  };

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        warning('Only PDF and JPEG files are allowed');
        return;
      }
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        warning('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      warning('Please select a file');
      return;
    }
    if (!newDoc.client_id || !newDoc.type) {
      warning(`${t('client_id_label')} and document type are required`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('client_id', newDoc.client_id);
    formData.append('type', newDoc.type);
    if (newDoc.loan_id) {
      formData.append('loan_id', newDoc.loan_id);
    }

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      await api.uploadDocument(formData);

      clearInterval(progressInterval);
      setUploadProgress(100);

      setShowUploadModal(false);
      setSelectedFile(null);
      setNewDoc({ client_id: '', loan_id: '', type: 'kyc' });
      setUploadProgress(0);
      fetchDocuments();
      success('Document uploaded successfully');
    } catch (err) {
      error('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (documentId, fileName) => {
    try {
      await downloadDocumentById(documentId, fileName || `document_${documentId}`);
      success('Document downloaded');
    } catch (err) {
      error(err.message || 'Failed to download document');
    }
  };

  const handleVerify = async (documentId) => {
    try {
      await api.verifyDocument(documentId);
      fetchDocuments();
      success('Document verified successfully');
    } catch (err) {
      error(err.message || 'Failed to verify document');
    }
  };

  const handleReject = async (documentId) => {
    setRejectingDocumentId(documentId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleDelete = async (documentId) => {
    setDeletingDocumentId(documentId);
    setShowDeleteModal(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      warning('Rejection reason is required');
      return;
    }

    try {
      await api.rejectDocument(rejectingDocumentId, rejectReason.trim());
      setShowRejectModal(false);
      setRejectingDocumentId(null);
      setRejectReason('');
      fetchDocuments();
      success('Document rejected successfully');
    } catch (err) {
      error(err.message || 'Failed to reject document');
    }
  };

  const confirmDelete = async () => {
    try {
      await api.deleteDocument(deletingDocumentId);
      setShowDeleteModal(false);
      setDeletingDocumentId(null);
      fetchDocuments();
      success('Document deleted successfully');
    } catch (err) {
      error(err.message || 'Failed to delete document');
    }
  };

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.file_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        doc.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        doc.client_id?.toString().includes(searchTerm);
    const matchesType = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesType;
  });

  const getTypeLabel = (type) => {
    switch (type) {
      case 'kyc': return 'KYC Document';
      case 'loan_application': return 'Loan Application';
      case 'collateral': return 'Collateral Document';
      case 'income_proof': return 'Income Proof';
      case 'identity': return 'Identity Document';
      case 'other': return 'Other';
      default: return type;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Verified': return '#10b981';
      case 'Pending': return '#f59e0b';
      case 'Rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getFileIcon = (fileName) => {
    if (fileName?.toLowerCase().endsWith('.pdf')) return '📄';
    if (fileName?.toLowerCase().match(/\.(jpg|jpeg)$/)) return '🖼️';
    return '📎';
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="admin_documents_title" subtitleKey="admin_documents_subtitle">
        
        <button 
          className="btn-secondary" 
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={18} className={refreshing ? 'spinning' : ''} />
          {refreshing ? t('refreshing') : 'Refresh'}
        </button>
      
      </PageHeader>

      <div className="page-actions">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search documents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="btn-secondary"
          style={{ marginRight: '0.5rem' }}
        >
          <option value="all">All Types</option>
          <option value="kyc">KYC Documents</option>
          <option value="loan_application">Loan Applications</option>
          <option value="collateral">Collateral</option>
          <option value="income_proof">Income Proof</option>
          <option value="identity">Identity Documents</option>
        </select>

        <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={20} />
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="table-container">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem' }}>
            <RefreshCw size={48} className="spinning" style={{ color: '#3b82f6', marginBottom: '1rem' }} />
            <p style={{ color: '#6b7280' }}>{t('loading_documents')}</p>
          </div>
        </div>
      ) : fetchError ? (
        <div className="table-container">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem' }}>
            <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{fetchError}</p>
            <button className="btn-primary" onClick={handleRefresh}>
              <RefreshCw size={18} />
              {t('try_again')}
            </button>
          </div>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Type</th>
                <th>{t('client_id_label')}</th>
                <th>Loan ID</th>
                <th>{t('status')}</th>
                <th>Version</th>
                <th>Uploaded At</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.2rem' }}>{getFileIcon(doc.file_name)}</span>
                      <span>{doc.file_name}</span>
                    </span>
                  </td>
                  <td>{getTypeLabel(doc.type)}</td>
                  <td>#{doc.client_id}</td>
                  <td>{doc.loan_id || '-'}</td>
                  <td>
                    <span style={{ color: getStatusColor(doc.status), fontWeight: 'bold' }}>
                      {doc.status}
                    </span>
                </td>
                <td>v{doc.version}</td>
                <td>{new Date(doc.uploaded_at).toLocaleString()}</td>
                <td>
                  <button
                    className="btn-icon edit"
                    title="Download"
                    onClick={() => handleDownload(doc.id, doc.file_name || doc.fileName)}
                  >
                    <Download size={18} />
                  </button>
                  {doc.status === 'Pending' && (
                    <>
                      <button
                        className="btn-icon edit"
                        title="Verify"
                        onClick={() => handleVerify(doc.id)}
                      >
                        <CheckCircle size={18} style={{ color: '#10b981' }} />
                      </button>
                      <button
                        className="btn-icon delete"
                        title="Reject"
                        onClick={() => handleReject(doc.id)}
                      >
                        <XCircle size={18} style={{ color: '#ef4444' }} />
                      </button>
                    </>
                  )}
                  <button
                    className="btn-icon delete"
                    title="Delete"
                    onClick={() => handleDelete(doc.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredDocuments.length === 0 && (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            No documents found
          </p>
        )}
      </div>
      )}

      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Upload Document</h2>
              <button onClick={() => setShowUploadModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{t('client_id_label')} <span className="required">*</span></label>
                <input
                  type="text"
                  value={newDoc.client_id}
                  onChange={(e) => setNewDoc({ ...newDoc, client_id: e.target.value })}
                  placeholder="Enter client ID"
                  required
                />
              </div>

              <div className="form-group">
                <label>Loan ID (optional)</label>
                <input
                  type="text"
                  value={newDoc.loan_id}
                  onChange={(e) => setNewDoc({ ...newDoc, loan_id: e.target.value })}
                  placeholder="Enter loan ID if attaching to loan"
                />
              </div>

              <div className="form-group">
                <label>Document Type <span className="required">*</span></label>
                <select
                  value={newDoc.type}
                  onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })}
                  required
                >
                  <option value="kyc">KYC Document</option>
                  <option value="identity">Identity Document</option>
                  <option value="income_proof">Income Proof</option>
                  <option value="collateral">Collateral Document</option>
                  <option value="loan_application">Loan Application</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="form-group">
                <label>File <span className="required">*</span></label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  accept=".pdf,.jpg,.jpeg"
                  required
                />
                <small style={{ color: '#6b7280' }}>Accepted formats: PDF, JPEG (Max size: 5MB)</small>
              </div>

              {selectedFile && (
                <div className="info-card" style={{ marginBottom: '1rem', background: '#eff6ff', borderColor: '#bfdbfe' }}>
                  <FileText size={20} style={{ color: '#1e40af' }} />
                  <span style={{ color: '#1e40af' }}>
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </span>
                </div>
              )}

              {uploading && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ background: '#e5e7eb', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                    <div
                      style={{
                        background: '#3b82f6',
                        height: '100%',
                        width: `${uploadProgress}%`,
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                  <small style={{ color: '#6b7280' }}>{uploadProgress}% uploaded</small>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowUploadModal(false)} disabled={uploading}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleUpload} disabled={uploading}>
                  <Upload size={18} />
                  {uploading ? 'Uploading...' : 'Upload'}
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
              <h2>Reject Document</h2>
              <button onClick={() => setShowRejectModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p><strong>Document ID:</strong> {rejectingDocumentId}</p>
              <div className="form-group">
                <label>Rejection Reason <span className="required">*</span></label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason for audit trail"
                  rows={4}
                />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRejectModal(false)}>{t('cancel')}</button>
                <button className="btn-primary delete" onClick={confirmReject}>
                  <XCircle size={18} />
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Delete Document</h2>
              <button onClick={() => setShowDeleteModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <div className="info-card" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={20} />
                <span>This action permanently deletes the document.</span>
              </div>
              <p><strong>Document ID:</strong> {deletingDocumentId}</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>{t('cancel')}</button>
                <button className="btn-primary delete" onClick={confirmDelete}>
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
