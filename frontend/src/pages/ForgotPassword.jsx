import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Shield } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import PublicAuthShell from '../components/public/PublicAuthShell.jsx';
import '../styles/public-pages.css';
import api from '../utils/api';

const ForgotPassword = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email.trim()) {
      setError(t('email_required'));
      return;
    }
    try {
      setSubmitting(true);
      const result = await api.requestPasswordReset(email.trim().toLowerCase());
      setMessage(result?.message || t('forgot_password_sent'));
    } catch (err) {
      setError(err.message || t('error_generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PublicAuthShell compact backLabel={t('register_back_login')} backTo="/login">
      <div className="public-auth-card-head">
        <div className="public-auth-badge">
          <Shield size={14} />
          {t('login_secure_access')}
        </div>
        <h1>{t('forgot_password_title')}</h1>
        <p>{t('forgot_password_subtitle')}</p>
      </div>

      <form className="public-form" onSubmit={handleSubmit}>
        {error && <div className="public-alert error" role="alert">{error}</div>}
        {message && <div className="public-alert success" role="status">{message}</div>}

        <div className="public-form-row">
          <label htmlFor="email">{t('email')}</label>
          <div className="public-input-wrap">
            <Mail className="public-input-icon" size={18} />
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
        </div>

        <button type="submit" className="public-submit" disabled={submitting}>
          {submitting ? t('forgot_password_sending') : t('forgot_password_send')}
          <ArrowRight size={18} />
        </button>
      </form>

      <div className="public-auth-footer">
        <p>{t('forgot_password_remember')} <Link to="/login">{t('login_button')}</Link></p>
      </div>
    </PublicAuthShell>
  );
};

export default ForgotPassword;
