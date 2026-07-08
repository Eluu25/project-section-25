import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useNavigate } from 'react-router-dom';
import { DollarSign, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import './Dashboard.css';
import api from '../utils/api';
import { formatDateTime } from '../utils/dateTime';

const BranchManagerDashboard = () => {
  const { t, tStatus } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState([
    { icon: DollarSign, label: t('pending_loan_approvals'), value: '0', change: t('live') },
    { icon: FileText, label: t('approval_queue'), value: '0', change: t('live') },
    { icon: CheckCircle, label: t('approved_today'), value: '0', change: t('live') },
    { icon: AlertCircle, label: t('high_priority'), value: '0', change: t('live') },
  ]);
  const [pendingLoans, setPendingLoans] = useState([]);
  const [approvalQueue, setApprovalQueue] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [loansData, approvalsData, complianceData, transactionsData] = await Promise.all([
        api.getPendingLoans().catch(() => []),
        api.getPendingApprovals().catch(() => []),
        api.getComplianceOverview().catch(() => null),
        api.getRecentTransactions(10).catch(() => [])
      ]);

      const highPriorityLoans = loansData.filter(loan => loan.status === 'High Priority').length;
      const branchApprovals = approvalsData.filter((request) => (
        ['account_creation', 'transaction_deposit', 'transaction_withdraw'].includes(request.type)
      ));
      const highPrioritySavings = complianceData?.summary?.open_aml_alerts || 0;

      const today = new Date().toISOString().split('T')[0];
      const approvedToday = loansData.filter((loan) => (
        loan.status === 'Active' &&
        String(loan.submitted || '').startsWith(today)
      )).length;

      setStats([
        { icon: DollarSign, label: t('pending_loan_approvals'), value: loansData.length.toString(), change: t('live') },
        { icon: FileText, label: t('approval_queue'), value: branchApprovals.length.toString(), change: t('live') },
        { icon: CheckCircle, label: t('approved_today'), value: approvedToday.toString(), change: t('live') },
        { icon: AlertCircle, label: t('high_priority'), value: (highPriorityLoans + highPrioritySavings).toString(), change: t('live') },
      ]);

      setPendingLoans(loansData.slice(0, 5));
      setApprovalQueue(branchApprovals.slice(0, 5));
      setRecentTransactions(Array.isArray(transactionsData) ? transactionsData.slice(0, 8) : []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>{t('bm_dashboard_title')}</h1>
        <p>{t('bm_dashboard_subtitle')}</p>
      </div>

      <div className="stats-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-icon">
              <stat.icon size={24} />
            </div>
            <div className="stat-content">
              <h3>{stat.value}</h3>
              <p>{stat.label}</p>
              <span className="stat-change">{stat.change}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-sections">
        <div className="section-card">
          <h2>{t('pending_loan_approvals')}</h2>
          <div className="table-container">
            {loading ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_generic')}</p>
            ) : pendingLoans.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>No pending loans</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Loan ID</th>
                    <th>Client</th>
                    <th>{t('amount')}</th>
                    <th>{t('status')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoans.map((loan) => (
                    <tr key={loan.id}>
                      <td>{loan.id}</td>
                      <td>{loan.client}</td>
                      <td>{loan.amount}</td>
                      <td>
                        <span className={`status ${loan.status === 'High Priority' ? 'high' : 'pending'}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn-sm primary" onClick={() => navigate('/branch-manager/loans')}>{t('approve')}</button>
                        <button className="btn-sm secondary" onClick={() => navigate('/branch-manager/loans')}>Review</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="section-card">
          <h2>Quick Actions</h2>
          <div className="action-buttons">
            <button className="action-btn primary" onClick={() => navigate('/branch-manager/loans')}>
              <CheckCircle size={20} />
              Review All Pending
            </button>
            <button className="action-btn secondary" onClick={() => navigate('/branch-manager/savings')}>
              <Clock size={20} />
              Review Approval Queue
            </button>
            <button className="action-btn secondary" onClick={() => navigate('/branch-manager/transactions')}>
              <FileText size={20} />
              View Transaction History
            </button>
          </div>
        </div>

        <div className="section-card">
          <h2>Approval Queue Snapshot</h2>
          <div className="table-container">
            {loading ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_generic')}</p>
            ) : approvalQueue.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>No pending operational approvals</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Type</th>
                    <th>{t('amount')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalQueue.map((request) => (
                    <tr key={request.id}>
                      <td>{request.id}</td>
                      <td>{request.type.replace('_', ' ')}</td>
                      <td>{Number(request.amount || 0).toLocaleString()} ETB</td>
                      <td>
                        <button className="btn-sm secondary" onClick={() => navigate('/branch-manager/savings')}>Review</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="section-card">
          <h2>Recent Transactions</h2>
          <div className="table-container">
            {loading ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>{t('loading_generic')}</p>
            ) : recentTransactions.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem' }}>No transaction history yet</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Client</th>
                    <th>Type</th>
                    <th>{t('amount')}</th>
                    <th>{t('date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((txn) => (
                    <tr key={txn.id}>
                      <td>{txn.id}</td>
                      <td>{txn.client_name || '-'}</td>
                      <td>{txn.transaction_type}</td>
                      <td>{Number(txn.amount || 0).toLocaleString()} ETB</td>
                      <td>{formatDateTime(txn.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BranchManagerDashboard;
