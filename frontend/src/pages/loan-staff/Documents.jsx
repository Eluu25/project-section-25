import { useState, useEffect } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Upload, Search, Download, Eye, Trash2, FileText, Check, XCircle, Filter, AlertCircle } from 'lucide-react';
import '../admin/AdminPages.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { downloadDocumentById, openDocumentById } from '../../utils/documentDownload';
import { formatDateTime } from '../../utils/dateTime';

const Documents = () => {
  const { t, tStatus } = useLanguage();
  const { success, error: showError, warning } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadData, setUploadData] = useState({
    clientId: '',
    loanId: '',
    documentType: 'National ID'
  });
  const [clients, setClients] = useState([]);
  const [loans, setLoans] = useState([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [registryDocs, setRegistryDocs] = useState([]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (!showUploadModal) return;
    setLookupLoading(true);
    Promise.all([
      api.getClients({ forLoan: true }).catch(() => []),
      api.getLoans().catch(() => [])
    ])
      .then(([clientRows, loanRows]) => {
        setClients(Array.isArray(clientRows) ? clientRows : []);
        setLoans(Array.isArray(loanRows) ? loanRows : []);
      })
      .finally(() => setLookupLoading(false));
  }, [showUploadModal]);

  useEffect(() => {
    if (!uploadData.clientId) {
      setRegistryDocs([]);
      return;
    }
    api.getClientRegistryDocuments(uploadData.clientId)
      .then((docs) => setRegistryDocs(Array.isArray(docs) ? docs : []))
      .catch(() => setRegistryDocs([]));
  }, [uploadData.clientId]);

  const fetchDocuments = async () => {
    try {
      const data = await api.getDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      showError(error.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const clientLoans = loans.filter((loan) => String(loan.client_id) === String(uploadData.clientId));

  const filteredDocuments = documents.filter((doc) => {
    const clientText = String(doc.client_name || doc.client || doc.client_id || '').toLowerCase();
    const fileText = String(doc.fileName || doc.file_name || '').toLowerCase();
    const loanText = String(doc.loanId || doc.loan_id || '').toLowerCase();
    const matchesSearch = clientText.includes(searchTerm.toLowerCase())
      || fileText.includes(searchTerm.toLowerCase())
      || loanText.includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || doc.type === filterType;
    return matchesSearch && matchesFilter;
  });

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        warning('File size exceeds 10MB limit.');
        return;
      }
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!validTypes.includes(file.type)) {
        warning('Invalid file type. Only PDF, JPG, and PNG files are allowed.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadData.clientId || !uploadData.loanId) {
      warning('Please select a client, loan, and file.');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('client_id', uploadData.clientId);
    formData.append('loan_id', uploadData.loanId);
    formData.append('type', uploadData.documentType);
    formData.append('related_entity_type', 'loan_account');
    formData.append('related_entity_id', uploadData.loanId);

    try {
      const result = await api.uploadDocument(formData);
      if (result?.reused) {
        warning(result.message || 'License already on file for this client.');
      }
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadData({ clientId: '', loanId: '', documentType: 'National ID' });
      fetchDocuments();
      success('Document uploaded successfully');
    } catch (error) {
      console.error('Error uploading document:', error);
      showError(error.message || 'Failed to upload document');
    }
  };

  const handleViewDocument = (doc) => {
    setSelectedDoc(doc);
    setShowViewModal(true);
  };

  const handleDownloadDocument = async (doc) => {
    try {
      await downloadDocumentById(doc.id, doc.fileName || doc.file_name || `document_${doc.id}`);
      success('Document downloaded');
    } catch (downloadError) {
      console.error('Error downloading document:', downloadError);
      showError(downloadError.message || 'Failed to download document');
    }
  };

  const handleOpenDocument = async (doc) => {
    try {
      await openDocumentById(doc.id);
    } catch (openError) {
      showError(openError.message || 'Failed to open document');
    }
  };

  const handleVerify = (doc) => {
    setSelectedDoc(doc);
    setShowVerifyModal(true);
  };

  const handleReject = (doc) => {
    setSelectedDoc(doc);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleDelete = (doc) => {
    setSelectedDoc(doc);
    setShowDeleteModal(true);
  };

  const confirmVerify = async () => {
    try {
      await api.verifyDocument(selectedDoc.id);
      setShowVerifyModal(false);
      fetchDocuments();
      success('Document verified successfully');
    } catch (error) {
      console.error('Error verifying document:', error);
      showError(error.message || 'Failed to verify document');
    }
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      warning('Rejection reason is required');
      return;
    }
    try {
      await api.rejectDocument(selectedDoc.id, rejectReason);
      setShowRejectModal(false);
      setRejectReason('');
      fetchDocuments();
      success('Document rejected successfully');
    } catch (error) {
      console.error('Error rejecting document:', error);
      showError(error.message || 'Failed to reject document');
    }
  };

  const confirmDelete = async () => {
    try {
      await api.deleteDocument(selectedDoc.id);
      setShowDeleteModal(false);
      fetchDocuments();
      success('Document deleted successfully');
    } catch (error) {
      console.error('Error deleting document:', error);
      showError(error.message || 'Failed to delete document');
    }
  };

  const statusClass = (status) => {
    if (status === 'Verified') return 'active';
    if (status === 'Pending') return 'pending';
    if (status === 'Rejected') return 'inactive';
    return 'inactive';
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="loan_docs_title" subtitleKey="loan_docs_subtitle" />

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

        <div className="filter-dropdown">
          <Filter size={20} />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="National ID">National ID</option>
            <option value="ID Card">ID Card</option>
            <option value="Business License">Business License</option>
            <option value="Land Title">Land Title</option>
            <option value="Bank Statement">Bank Statement</option>
            <option value="Income Proof">Income Proof</option>
          </select>
        </div>

        <button className="btn-primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={20} />
          Upload Document
        </button>
      </div>

      {loading ? (
        <div className="table-container">
          <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_documents')}</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc ID</th>
                <th>Client</th>
                <th>Loan ID</th>
                <th>Type</th>
                <th>File Name</th>
                <th>Upload Date</th>
                <th>{t('status')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No documents found</td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td>{doc.id}</td>
                    <td>{doc.client_name || doc.client || doc.client_id || '-'}</td>
                    <td>{doc.loan_id || doc.loanId || '-'}</td>
                    <td>{doc.type}</td>
                    <td>{doc.file_name || doc.fileName || '-'}</td>
                    <td>{formatDateTime(doc.uploaded_at || doc.uploadDate)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`status ${statusClass(doc.status)}`}>
                          {tStatus(doc.status) || doc.status}
                        </span>
                        {doc.status === 'Rejected' && doc.rejection_reason && (
                          <AlertCircle size={16} className="warning-icon" title={doc.rejection_reason} />
                        )}
                      </div>
                    </td>
                    <td>
                      <button className="btn-icon edit" title="View" onClick={() => handleViewDocument(doc)}>
                        <Eye size={18} />
                      </button>
                      <button className="btn-icon edit" title="Open" onClick={() => handleOpenDocument(doc)}>
                        <FileText size={18} />
                      </button>
                      <button className="btn-icon edit" title="Download" onClick={() => handleDownloadDocument(doc)}>
                        <Download size={18} />
                      </button>
                      {doc.status === 'Pending' && (
                        <>
                          <button className="btn-icon edit" title="Verify" onClick={() => handleVerify(doc)}>
                            <Check size={18} />
                          </button>
                          <button className="btn-icon delete" title="Reject" onClick={() => handleReject(doc)}>
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                      <button className="btn-icon delete" title="Delete" onClick={() => handleDelete(doc)}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
              {lookupLoading ? (
                <p>{t('loading')}</p>
              ) : (
                <>
                  {registryDocs.length > 0 && (
                    <div className="info-card" style={{ marginBottom: '1rem', background: '#ecfdf5', borderColor: '#6ee7b7' }}>
                      <strong>Client already has license on file</strong>
                      <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                        {registryDocs.map((doc) => (
                          <li key={doc.id}>{doc.type} — {doc.file_name || doc.id}</li>
                        ))}
                      </ul>
                      <p style={{ margin: '0.35rem 0 0', fontSize: '0.875rem', color: '#047857' }}>
                        Uploading business/trade license again will reuse the existing file.
                      </p>
                    </div>
                  )}
                  <div className="form-group">
                    <label>Client <span className="required">*</span></label>
                    <select
                      value={uploadData.clientId}
                      onChange={(e) => setUploadData({ clientId: e.target.value, loanId: '', documentType: uploadData.documentType })}
                      required
                    >
                      <option value="">Select client</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} (#{client.id})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Loan <span className="required">*</span></label>
                    <select
                      value={uploadData.loanId}
                      onChange={(e) => setUploadData({ ...uploadData, loanId: e.target.value })}
                      required
                      disabled={!uploadData.clientId}
                    >
                      <option value="">Select loan</option>
                      {clientLoans.map((loan) => (
                        <option key={loan.id} value={loan.id}>
                          {loan.id} — {loan.type || 'Loan'} ({loan.status})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Document Type <span className="required">*</span></label>
                    <select
                      value={uploadData.documentType}
                      onChange={(e) => setUploadData({ ...uploadData, documentType: e.target.value })}
                      required
                    >
                      <option value="National ID">National ID</option>
                      <option value="ID Card">ID Card</option>
                      <option value="Business License">Business License</option>
                      <option value="Land Title">Land Title</option>
                      <option value="Bank Statement">Bank Statement</option>
                      <option value="Income Proof">Income Proof</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Upload File <span className="required">*</span></label>
                    <div className="file-upload-area">
                      <input
                        type="file"
                        id="documentFile"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                      />
                      <label htmlFor="documentFile" className="file-upload-label">
                        <Upload size={32} />
                        <p>Click to select a file</p>
                        <p className="file-hint">Max 10MB • PDF, JPG, PNG</p>
                      </label>
                      {selectedFile && (
                        <div className="selected-file">
                          <FileText size={16} />
                          <span>{selectedFile.name}</span>
                          <button type="button" onClick={() => setSelectedFile(null)} className="remove-file">×</button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button className="btn-primary" onClick={handleUpload} disabled={lookupLoading}>
                  <Upload size={18} />
                  Upload Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showViewModal && selectedDoc && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>View Document</h2>
              <button onClick={() => setShowViewModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label>Document ID</label><p>{selectedDoc.id}</p></div>
              <div className="form-group"><label>Client</label><p>{selectedDoc.client_name || selectedDoc.client_id}</p></div>
              <div className="form-group"><label>Loan ID</label><p>{selectedDoc.loan_id || '-'}</p></div>
              <div className="form-group"><label>Type</label><p>{selectedDoc.type}</p></div>
              <div className="form-group"><label>File</label><p>{selectedDoc.file_name || '-'}</p></div>
              <div className="form-group">
                <label>{t('status')}</label>
                <span className={`status ${statusClass(selectedDoc.status)}`}>{selectedDoc.status}</span>
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowViewModal(false)}>Close</button>
                <button className="btn-secondary" onClick={() => handleOpenDocument(selectedDoc)}>Open file</button>
                <button className="btn-primary" onClick={() => handleDownloadDocument(selectedDoc)}>Download</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Verify Document</h2>
              <button onClick={() => setShowVerifyModal(false)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              <p>Mark <strong>{selectedDoc?.file_name}</strong> as verified?</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowVerifyModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={confirmVerify}>Verify</button>
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
              <div className="form-group">
                <label>Reason</label>
                <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              </div>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowRejectModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={confirmReject}>Reject</button>
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
              <p>Delete <strong>{selectedDoc?.file_name}</strong>? This cannot be undone.</p>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={confirmDelete}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
