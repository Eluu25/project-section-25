import { useEffect, useMemo, useState, useCallback } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Search, ShieldCheck, Mail, UserCircle2, RefreshCw, AlertTriangle, Phone, CreditCard } from 'lucide-react';
import '../admin/AdminPages.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dateTime';

const UserAccounts = () => {
  const { t } = useLanguage();
  const { error, success } = useToast();
  const [users, setUsers] = useState([]);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [deletedRecords, setDeletedRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [clientDetail, setClientDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchUsers = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    setFetchError(null);
    try {
      const [userData, archivedData, deletedData, clientData] = await Promise.all([
        api.getUsers(),
        api.getArchivedUsers().catch(() => []),
        api.getDeletedUserRecords().catch(() => []),
        api.getClients().catch(() => [])
      ]);
      setUsers(Array.isArray(userData) ? userData : []);
      setArchivedUsers(Array.isArray(archivedData) ? archivedData : []);
      setDeletedRecords(Array.isArray(deletedData) ? deletedData : []);
      setClients(Array.isArray(clientData) ? clientData : []);
    } catch (err) {
      console.error('Error loading CEO user accounts view:', err);
      const errorMessage = err.message || 'Failed to load users';
      setFetchError(errorMessage);
      setUsers([]);
      setArchivedUsers([]);
      setDeletedRecords([]);
      setClients([]);
      if (!showRefresh) error(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [error]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const staffDirectory = useMemo(() => {
    const map = new Map();
    users.filter((u) => u.role !== 'client').forEach((u) => {
      map.set(`user-${u.id}`, { ...u, record_type: 'active' });
    });
    archivedUsers.forEach((u) => {
      if (!map.has(`user-${u.id}`)) {
        map.set(`user-${u.id}`, { ...u, record_type: 'archived' });
      }
    });
    return [...map.values()];
  }, [users, archivedUsers]);

  const filteredStaffUsers = useMemo(() => (
    staffDirectory.filter((user) => {
      const query = searchTerm.toLowerCase();
      const matchesSearch = (
        user.name?.toLowerCase().includes(query) ||
        user.username?.toLowerCase().includes(query) ||
        user.role?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.id_number?.toLowerCase().includes(query)
      );
      const matchesFilter = statusFilter === 'all'
        || (statusFilter === 'archived' && (user.status === 'Archived' || user.record_type === 'archived'))
        || (statusFilter === 'inactive' && ['Inactive', 'Suspended'].includes(user.status))
        || (statusFilter === 'active' && user.status === 'Active');
      return matchesSearch && matchesFilter;
    })
  ), [searchTerm, staffDirectory, statusFilter]);

  const filteredDeletedRecords = useMemo(() => (
    deletedRecords.filter((record) => {
      const query = searchTerm.toLowerCase();
      return (
        String(record.username || '').toLowerCase().includes(query) ||
        String(record.role || '').toLowerCase().includes(query) ||
        String(record.id || '').includes(query)
      );
    })
  ), [deletedRecords, searchTerm]);

  const filteredClientUsers = useMemo(() => (
    clients.filter((client) => {
      const query = searchTerm.toLowerCase();
      const matchesSearch = (
        client.name?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query) ||
        client.id_number?.toLowerCase().includes(query)
      );
      const matchesFilter = statusFilter === 'all'
        || (statusFilter === 'active' && (client.status || 'Active') === 'Active')
        || (statusFilter === 'inactive' && client.status === 'Inactive')
        || statusFilter === 'archived';
      return matchesSearch && matchesFilter;
    })
  ), [clients, searchTerm, statusFilter]);

  const openStaffProfile = (user) => {
    setClientDetail(null);
    setSelectedProfile({ type: 'staff', data: user });
  };

  const openDeletedProfile = (record) => {
    setClientDetail(null);
    setSelectedProfile({ type: 'deleted', data: record });
  };

  const openClientProfile = async (client) => {
    setSelectedProfile({ type: 'client', data: client });
    setClientDetail(null);
    setDetailLoading(true);
    try {
      const summary = await api.getClientProfile(client.id);
      setClientDetail(summary);
    } catch (err) {
      console.error('Client profile load error:', err);
      error(err.message || 'Failed to load client profile');
    } finally {
      setDetailLoading(false);
    }
  };

  const statusClass = (status) => {
    if (status === 'Active') return 'active';
    if (status === 'Archived') return 'inactive';
    if (status === 'Suspended' || status === 'Inactive') return 'high';
    return 'pending';
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="ceo_users_title" subtitleKey="ceo_users_subtitle">
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="inline-meta">Staff: {filteredStaffUsers.length}</span>
          <span className="inline-meta">Clients: {filteredClientUsers.length}</span>
          <span className="inline-meta">Deleted records: {filteredDeletedRecords.length}</span>
        </div>
      </PageHeader>

      <div className="page-actions sticky-actions">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder={t('search_ceo_users')}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive / Suspended</option>
          <option value="archived">Archived</option>
        </select>
        <button
          className="btn-secondary"
          onClick={() => fetchUsers(true)}
          disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <RefreshCw size={20} className={refreshing ? 'spinning' : ''} />
          {refreshing ? t('refreshing') : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="table-container">
          <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_user_accounts')}</p>
        </div>
      ) : fetchError ? (
        <div className="table-container">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem' }}>
            <AlertTriangle size={48} style={{ color: '#ef4444', marginBottom: '1rem' }} />
            <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{fetchError}</p>
            <button className="btn-primary" onClick={() => fetchUsers(true)}>Try Again</button>
          </div>
        </div>
      ) : (
        <>
          <div className="table-container" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '1rem' }}>Staff Users</h3>
            {filteredStaffUsers.length === 0 ? (
              <div className="empty-state"><p>{t('no_staff_users')}</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t('name')}</th>
                    <th>Username</th>
                    <th>{t('email')}</th>
                    <th>Phone</th>
                    <th>National ID</th>
                    <th>Role</th>
                    <th>{t('status')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaffUsers.map((user) => (
                    <tr key={`staff-${user.id}`}>
                      <td>#{user.id}</td>
                      <td>{user.name}</td>
                      <td>{user.username}</td>
                      <td>{user.email || '—'}</td>
                      <td>{user.phone || '—'}</td>
                      <td>{user.id_number || '—'}</td>
                      <td><span className="role-badge">{user.role?.replace('_', ' ')}</span></td>
                      <td>
                        <span className={`status ${statusClass(user.status)}`}>
                          {user.status || 'Unknown'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-icon edit" title="View profile" onClick={() => openStaffProfile(user)}>
                          <ShieldCheck size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filteredDeletedRecords.length > 0 && (
            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ margin: '1rem' }}>Deleted staff (audit snapshot)</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Former ID</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Last status</th>
                    <th>Deleted at</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeletedRecords.map((record) => (
                    <tr key={`deleted-${record.id}-${record.deleted_at}`}>
                      <td>#{record.id}</td>
                      <td>{record.username || '—'}</td>
                      <td>{record.role || '—'}</td>
                      <td>{record.status || '—'}</td>
                      <td>{formatDateTime(record.deleted_at)}</td>
                      <td>
                        <button className="btn-icon edit" title="View snapshot" onClick={() => openDeletedProfile(record)}>
                          <ShieldCheck size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-container">
            <h3 style={{ margin: '1rem' }}>Clients</h3>
            {filteredClientUsers.length === 0 ? (
              <div className="empty-state"><p>{t('no_clients_search')}</p></div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{t('name')}</th>
                    <th>{t('email')}</th>
                    <th>Phone</th>
                    <th>ID Number</th>
                    <th>KYC</th>
                    <th>{t('status')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClientUsers.map((client) => (
                    <tr key={`client-${client.id}`}>
                      <td>#{client.id}</td>
                      <td>{client.name}</td>
                      <td>{client.email || '—'}</td>
                      <td>{client.phone || '—'}</td>
                      <td>{client.id_number || '—'}</td>
                      <td>{client.kyc_status || 'Pending'}</td>
                      <td>
                        <span className={`status ${statusClass(client.status || 'Active')}`}>
                          {client.status || 'Active'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-icon edit" title="View profile" onClick={() => openClientProfile(client)}>
                          <UserCircle2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {selectedProfile && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h2>
                {selectedProfile.type === 'client' ? 'Client profile' : selectedProfile.type === 'deleted' ? 'Deleted account snapshot' : 'Staff profile'}
              </h2>
              <button onClick={() => setSelectedProfile(null)} className="modal-close">×</button>
            </div>
            <div className="modal-body">
              {selectedProfile.type === 'staff' && (
                <>
                  <div className="info-card" style={{ marginBottom: '1rem' }}>
                    <UserCircle2 size={24} />
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0' }}>{selectedProfile.data.name}</h3>
                      <p style={{ margin: 0 }}>#{selectedProfile.data.id} • {selectedProfile.data.username}</p>
                    </div>
                  </div>
                  <div className="form-group"><label>{t('email')}</label><p>{selectedProfile.data.email || '—'}</p></div>
                  <div className="form-group"><label>Phone</label><p>{selectedProfile.data.phone || '—'}</p></div>
                  <div className="form-group"><label>National ID</label><p>{selectedProfile.data.id_number || '—'}</p></div>
                  <div className="form-group"><label>Role</label><p>{selectedProfile.data.role}</p></div>
                  <div className="form-group"><label>Branch</label><p>{selectedProfile.data.branch_id || '—'}</p></div>
                  <div className="form-group">
                    <label>{t('status')}</label>
                    <span className={`status ${statusClass(selectedProfile.data.status)}`}>{selectedProfile.data.status}</span>
                  </div>
                  <div className="form-group"><label>Created</label><p>{selectedProfile.data.created || '—'}</p></div>
                </>
              )}

              {selectedProfile.type === 'deleted' && (
                <>
                  <div className="info-card" style={{ marginBottom: '1rem', background: '#fef2f2', borderColor: '#fecaca' }}>
                    <AlertTriangle size={24} style={{ color: '#b91c1c' }} />
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0' }}>{selectedProfile.data.username || 'Unknown user'}</h3>
                      <p style={{ margin: 0 }}>Account removed — profile preserved in audit log only</p>
                    </div>
                  </div>
                  <div className="form-group"><label>Former user ID</label><p>#{selectedProfile.data.id}</p></div>
                  <div className="form-group"><label>Role</label><p>{selectedProfile.data.role || '—'}</p></div>
                  <div className="form-group"><label>Status before deletion</label><p>{selectedProfile.data.status || '—'}</p></div>
                  <div className="form-group"><label>Deleted at</label><p>{formatDateTime(selectedProfile.data.deleted_at)}</p></div>
                  <div className="form-group"><label>Verified by</label><p>{selectedProfile.data.verified_by || '—'}</p></div>
                </>
              )}

              {selectedProfile.type === 'client' && (
                <>
                  <div className="info-card" style={{ marginBottom: '1rem' }}>
                    <UserCircle2 size={24} />
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0' }}>{selectedProfile.data.name}</h3>
                      <p style={{ margin: 0 }}>#{selectedProfile.data.id}</p>
                    </div>
                  </div>
                  <div className="form-group"><label>{t('email')}</label><p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={16} />{selectedProfile.data.email || '—'}</p></div>
                  <div className="form-group"><label>Phone</label><p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={16} />{selectedProfile.data.phone || '—'}</p></div>
                  <div className="form-group"><label>ID Number</label><p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CreditCard size={16} />{selectedProfile.data.id_number || '—'}</p></div>
                  <div className="form-group"><label>KYC</label><p>{selectedProfile.data.kyc_status || 'Pending'}</p></div>
                  <div className="form-group"><label>{t('status')}</label><span className={`status ${statusClass(selectedProfile.data.status || 'Active')}`}>{selectedProfile.data.status || 'Active'}</span></div>
                  {detailLoading && <p>{t('loading_generic')}</p>}
                  {clientDetail?.client && (
                    <div className="info-card" style={{ marginTop: '1rem' }}>
                      <p style={{ margin: 0 }}>
                        Savings accounts: {(clientDetail.savings_accounts || []).length} •
                        Documents: {(clientDetail.documents || []).length} •
                        Recent approvals: {(clientDetail.approvals || []).length}
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="modal-actions">
                <button className="btn-primary" onClick={() => setSelectedProfile(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAccounts;
