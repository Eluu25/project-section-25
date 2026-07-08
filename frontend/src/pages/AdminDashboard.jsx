import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Users, Settings, Database, Shield, FileClock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import api from '../utils/api';

const formatActivityText = (activity) => {
  if (activity.human_readable_description) {
    return activity.human_readable_description;
  }

  if (typeof activity.details === 'string') {
    try {
      const parsed = JSON.parse(activity.details);
      if (parsed?.action) {
        return parsed.action.replaceAll('_', ' ').toLowerCase();
      }
      return activity.details;
    } catch {
      return activity.details;
    }
  }

  return activity.action ? activity.action.replaceAll('_', ' ') : '';
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) {
    return '';
  }

  const eventTime = new Date(timestamp);
  const diffMs = Date.now() - eventTime.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

const AdminDashboard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    stats: {
      total_users: 0,
      total_branches: 0,
      pending_approvals: 0,
      audit_events: 0,
    },
    recent_activities: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const data = await api.getAdminSummary();
      setSummary(data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = [
    { icon: Users, labelKey: 'stat_total_users', value: String(summary.stats.total_users), changeKey: 'live' },
    { icon: Database, labelKey: 'stat_branches', value: String(summary.stats.total_branches), changeKey: 'stat_configured' },
    { icon: Shield, labelKey: 'stat_pending_approvals', value: String(summary.stats.pending_approvals), changeKey: 'stat_needs_review' },
    { icon: FileClock, labelKey: 'stat_audit_events', value: String(summary.stats.audit_events), changeKey: 'stat_recorded' },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>{t('admin_dashboard_title')}</h1>
        <p>{t('admin_dashboard_page_subtitle')}</p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>{t('loading_dashboard')}</div>
      ) : (
        <div>
          <div className="stats-grid">
            {stats.map((stat, index) => (
              <div key={index} className="stat-card">
                <div className="stat-icon">
                  <stat.icon size={24} />
                </div>
                <div className="stat-content">
                  <h3>{stat.value}</h3>
                  <p>{t(stat.labelKey)}</p>
                  <span className="stat-change">{t(stat.changeKey)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-sections">
            <div className="section-card">
              <h2>{t('recent_activities')}</h2>
              <div className="activity-list">
                {summary.recent_activities.length === 0 ? (
                  <div className="activity-item">
                    <span>{t('no_recent_audit')}</span>
                    <span className="time">{t('time_now')}</span>
                  </div>
                ) : (
                  summary.recent_activities.map((activity) => (
                    <div className="activity-item" key={activity.id}>
                      <span>{formatActivityText(activity) || t('system_activity')}</span>
                      <span className="time">{formatRelativeTime(activity.timestamp) || t('unknown_time')}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="section-card">
              <h2>{t('quick_actions')}</h2>
              <div className="action-buttons">
                <button className="action-btn primary" onClick={() => navigate('/admin/accounts')}>
                  <Users size={20} />
                  {t('manage_users')}
                </button>
                <button className="action-btn secondary" onClick={() => navigate('/admin/settings')}>
                  <Settings size={20} />
                  {t('system_overview')}
                </button>
                <button className="action-btn secondary" onClick={() => navigate('/admin/logs')}>
                  <Database size={20} />
                  {t('view_audit_logs')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
