import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { Search, Users, FileText, PiggyBank, Clock, Receipt } from 'lucide-react';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatDateTime } from '../../utils/dateTime';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import '../admin/AdminPages.css';

const statusTone = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'active' || s === 'verified' || s === 'approved' || s === 'completed') return 'active';
  if (s === 'pending') return 'pending';
  return 'inactive';
};

const ClientWorkspace = () => {
  const { t, tStatus } = useLanguage();
  const { error: toastError } = useToast();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getClients();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err.message || t('error_generic'));
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [t, toastError]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesStatus =
        statusFilter === 'all' ||
        String(c.status || 'Active').toLowerCase() === statusFilter.toLowerCase() ||
        (statusFilter === 'pending' && String(c.kyc_status || '').toLowerCase() === 'pending');
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        String(c.name || '').toLowerCase().includes(q) ||
        String(c.phone || '').toLowerCase().includes(q) ||
        String(c.id_number || '').includes(q) ||
        String(c.id || '').includes(q) ||
        String(c.email || '').toLowerCase().includes(q)
      );
    });
  }, [clients, search, statusFilter]);

  const selectClient = async (clientId) => {
    setSelectedId(clientId);
    setSummary(null);
    setSummaryLoading(true);
    try {
      const data = await api.getClientProcessSummary(clientId);
      setSummary(data);
    } catch (err) {
      toastError(err.message || t('error_generic'));
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const client = summary?.client;
  const pendingApprovals = (summary?.approval_requests || []).filter((a) => a.status === 'Pending');
  const ongoingAccounts = (summary?.savings_accounts || []).filter((a) =>
    ['Active', 'Pending'].includes(a.status)
  );

  return (
    <div className="admin-page">
      <PageHeader titleKey="ss_client_workspace_title" subtitleKey="ss_client_workspace_subtitle" />

      <div className="filters-bar" style={{ marginBottom: '1rem' }}>
        <div className="search-box">
          <Search size={18} />
          <input
            type="search"
            placeholder={t('ss_search_clients')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">{t('filter_all_status')}</option>
          <option value="Active">{t('status_active')}</option>
          <option value="Pending">{t('pending')}</option>
          <option value="Inactive">{t('status_inactive')}</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(0, 2fr)', gap: '1rem' }}>
        <div className="section-card" style={{ maxHeight: '70vh', overflow: 'auto' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} /> {t('ss_clients_list')} ({filteredClients.length})
          </h2>
          {loading ? (
            <p>{t('loading')}</p>
          ) : filteredClients.length === 0 ? (
            <p>{t('ss_no_clients')}</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredClients.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`client-pick-btn${Number(selectedId) === Number(c.id) ? ' active' : ''}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.75rem',
                      marginBottom: '0.5rem',
                      border: Number(selectedId) === Number(c.id) ? '2px solid var(--primary, #2563eb)' : '1px solid #e5e7eb',
                      borderRadius: '8px',
                      background: Number(selectedId) === Number(c.id) ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}
                    onClick={() => selectClient(c.id)}
                  >
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {c.phone || '—'} · KYC: {c.kyc_status || 'Pending'}
                    </div>
                    <span className={`status ${statusTone(c.status)}`}>{c.status || 'Active'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="section-card">
          {!selectedId ? (
            <p>{t('ss_select_client_hint')}</p>
          ) : summaryLoading ? (
            <p>{t('loading')}</p>
          ) : !summary ? (
            <p>{t('error_generic')}</p>
          ) : (
            <>
              <h2>{client?.name}</h2>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                {client?.phone} · {client?.email || '—'} · ID: {client?.id_number || '—'}
              </p>

              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1rem' }}>
                <div className="stat-card">
                  <PiggyBank size={18} />
                  <div>
                    <strong>{ongoingAccounts.length}</strong>
                    <p>{t('ss_savings_accounts')}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <Clock size={18} />
                  <div>
                    <strong>{pendingApprovals.length}</strong>
                    <p>{t('ss_pending_requests')}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <Receipt size={18} />
                  <div>
                    <strong>{(summary.receipts || []).length}</strong>
                    <p>{t('receipt_reference')}</p>
                  </div>
                </div>
              </div>

              <h3>{t('ss_savings_accounts')}</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t('ss_type')}</th>
                      <th>{t('ss_balance')}</th>
                      <th>{t('transaction_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.savings_accounts || []).map((acc) => (
                      <tr key={acc.id}>
                        <td>{acc.id}</td>
                        <td>{acc.type}</td>
                        <td>{Number(acc.amount || 0).toLocaleString()} ETB</td>
                        <td><span className={`status ${statusTone(acc.status)}`}>{acc.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ marginTop: '1.5rem' }}>{t('ss_pending_requests')}</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>{t('ss_type')}</th>
                      <th>{t('ss_amount')}</th>
                      <th>{t('transaction_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.approval_requests || []).slice(0, 20).map((req) => (
                      <tr key={req.id}>
                        <td>{req.id}</td>
                        <td>{req.type}</td>
                        <td>{Number(req.amount || 0).toLocaleString()} ETB</td>
                        <td><span className={`status ${statusTone(req.status)}`}>{req.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ marginTop: '1.5rem' }}>{t('nav_transaction_history')}</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('receipt_reference')}</th>
                      <th>{t('ss_type')}</th>
                      <th>{t('ss_amount')}</th>
                      <th>{t('ss_date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.transactions || []).slice(0, 15).map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.transaction_reference || tx.id}</td>
                        <td>{tx.transaction_type}</td>
                        <td>{Number(tx.amount || 0).toLocaleString()} ETB</td>
                        <td>{formatDateTime(tx.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileText size={18} /> {t('nav_documents')}
              </h3>
              <ul style={{ paddingLeft: '1rem' }}>
                {(summary.documents || []).slice(0, 20).map((doc) => (
                  <li key={doc.id} style={{ marginBottom: '0.5rem' }}>
                    <strong>{doc.type}</strong>
                    {doc.receipt_reference ? ` · ${doc.receipt_reference}` : ''}
                    {doc.consumed_at ? ` · ${t('ss_receipt_used')}` : ''}
                    {' · '}
                    <a href={resolveMediaUrl(doc.file_path)} target="_blank" rel="noreferrer">
                      {t('ss_view_file')}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientWorkspace;
