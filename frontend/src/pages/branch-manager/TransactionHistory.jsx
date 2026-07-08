import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { useLanguage } from '../../context/LanguageContext.jsx';
import { Search, RefreshCw, Download, FileText } from 'lucide-react';
import '../admin/AdminPages.css';
import './TransactionHistory.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/dateTime';

const DAY_FILTERS = [
  { value: 'all', label: 'All Time' },
  { value: '7', label: 'Last 7 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'disbursement', label: 'Disbursement' },
  { value: 'repayment', label: 'Repayment' }
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Accounts' },
  { value: 'savings', label: 'Savings Accounts' },
  { value: 'loan', label: 'Loan Accounts' }
];

const TransactionHistory = () => {
  const { t, tStatus } = useLanguage();
  const { error } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dayFilter, setDayFilter] = useState('30');
  const [accountTypeFilter, setAccountTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadTransactions = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const activeStart = startDate
        || (dayFilter !== 'all'
          ? new Date(Date.now() - (Number(dayFilter) * 24 * 60 * 60 * 1000)).toISOString()
          : '');
      const activeEnd = endDate ? `${endDate}T23:59:59.999Z` : '';
      const data = await api.getRecentTransactions(300, {
        query: debouncedSearchTerm || undefined,
        type: typeFilter !== 'all' ? typeFilter : undefined,
        account_type: accountTypeFilter !== 'all' ? accountTypeFilter : undefined,
        start_date: activeStart || undefined,
        end_date: activeEnd || undefined
      });
      setTransactions(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      console.error('Failed to load transaction history:', fetchError);
      error(fetchError.message || 'Failed to load transaction history');
      setTransactions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [dayFilter, typeFilter, accountTypeFilter, startDate, endDate, debouncedSearchTerm]);

  const filteredTransactions = useMemo(() => transactions, [transactions]);

  const parseFilenameFromContentDisposition = (contentDisposition) => {
    if (!contentDisposition) return null;
    const match = /filename="([^"]+)"/i.exec(contentDisposition);
    return match?.[1] || null;
  };

  const triggerDownload = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `transaction_statement_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadTransactionStatement = async (transactionId, format = 'pdf') => {
    try {
      const result = format === 'csv'
        ? await api.downloadTransactionStatementCsv(transactionId)
        : await api.downloadTransactionStatementPdf(transactionId);
      const { blob, contentDisposition } = result;
      const filename = parseFilenameFromContentDisposition(contentDisposition)
        || `transaction_statement_${transactionId}_${new Date().toISOString().slice(0, 10)}.${format}`;
      triggerDownload(blob, filename);
    } catch (downloadError) {
      error(downloadError?.message || 'Failed to download transaction statement');
    }
  };

  return (
    <div className="admin-page txn-statement-page">
      <PageHeader titleKey="bm_transaction_history_title" subtitleKey="bm_transaction_page_subtitle">
        <div style={{ marginTop: '0.75rem' }}>
          <span className="inline-meta">{filteredTransactions.length} records</span>
        </div>
      </PageHeader>

      <div className="statement-toolbar">
        <div className="search-bar" style={{ flex: '1 1 240px', margin: 0 }}>
          <Search size={18} />
          <input
            type="text"
            placeholder={t('search_transactions')}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="filter-group">
          {DAY_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`filter-chip ${dayFilter === filter.value ? 'active' : ''}`}
              onClick={() => setDayFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <select className="statement-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <select className="statement-select" value={accountTypeFilter} onChange={(e) => setAccountTypeFilter(e.target.value)}>
            {ACCOUNT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input className="statement-select" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" />
          <input className="statement-select" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="End date" />
          <button type="button" className="statement-action-btn secondary" onClick={() => loadTransactions(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
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
                <th>Transaction ID</th>
                <th>Client</th>
                <th>Account</th>
                <th>Type</th>
                <th>{t('amount')}</th>
                <th>{t('table_balance_before')}</th>
                <th>{t('table_balance_after')}</th>
                <th>{t('status')}</th>
                <th>{t('date')}</th>
                <th>Statement</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((txn) => (
                <tr key={txn.id}>
                  <td><code>{txn.id}</code></td>
                  <td>{txn.client_name || '-'}</td>
                  <td>{txn.account_id || '-'}</td>
                  <td><span className="status-badge">{txn.transaction_type || '-'}</span></td>
                  <td>{Number(txn.amount || 0).toLocaleString()} ETB</td>
                  <td>{Number(txn.balance_before || 0).toLocaleString()} ETB</td>
                  <td>{Number(txn.balance_after || 0).toLocaleString()} ETB</td>
                  <td>
                    <span className={`status ${txn.status === 'Completed' ? 'active' : txn.status === 'Cancelled' ? 'inactive' : 'pending'}`}>
                      {tStatus(txn.status) || txn.status || 'Completed'}
                    </span>
                  </td>
                  <td>{formatDateTime(txn.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="statement-action-btn"
                        onClick={() => handleDownloadTransactionStatement(txn.id, 'pdf')}
                      >
                        <FileText size={14} />
                        PDF
                      </button>
                      <button
                        type="button"
                        className="statement-action-btn secondary"
                        onClick={() => handleDownloadTransactionStatement(txn.id, 'csv')}
                      >
                        <Download size={14} />
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <div className="empty-state">
              <p>{t('no_transactions_filter')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionHistory;
