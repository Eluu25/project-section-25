import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lock, Eye, EyeOff, Shield } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import PublicAuthShell from '../components/public/PublicAuthShell.jsx';
import '../styles/public-pages.css';
import api from '../utils/api';
import { validatePasswordStrength } from '../utils/validation';

const ResetPassword = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    if (!token) {
      setError(t('reset_password_invalid_link'));
      setVerifying(false);
      return;
    }
    api.verifyPasswordResetToken(token)
      .then((data) => {
        setUsername(data?.username || '');
        setVerifying(false);
      })
      .catch((err) => {
        setError(err.message || t('reset_password_invalid_link'));
        setVerifying(false);
      });
  }, [token, t]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    const strengthErrors = validatePasswordStrength(password);
    if (strengthErrors.length > 0) {
      setError(strengthErrors.join('. '));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('reset_password_mismatch'));
      return;
    }

    try {
      setSubmitting(true);
      await api.confirmPasswordReset(token, password);
      setMessage(t('reset_password_success'));
      setTimeout(() => navigate('/login'), 1800);
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
        <h1>{t('reset_password_title')}</h1>
        <p>{username ? `${t('login_username_label')}: ${username}` : t('forgot_password_subtitle')}</p>
      </div>

      {verifying ? (
        <p className="auth-status-text">{t('reset_password_verifying')}</p>
      ) : (
        <form className="public-form" onSubmit={handleSubmit}>
          {error && <div className="public-alert error" role="alert">{error}</div>}
          {message && <div className="public-alert success" role="status">{message}</div>}

          <div className="public-form-row">
            <label htmlFor="password">{t('reset_password_new')}</label>
            <div className="public-input-wrap">
              <Lock className="public-input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                className="public-input-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t('login_hide_password') : t('login_show_password')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="public-form-row">
            <label htmlFor="confirmPassword">{t('reset_password_confirm')}</label>
            <div className="public-input-wrap">
              <Lock className="public-input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          <button type="submit" className="public-submit" disabled={submitting || !password}>
            {submitting ? t('reset_password_updating') : t('reset_password_update')}
            <ArrowRight size={18} />
          </button>
        </form>
      )}
    </PublicAuthShell>
  );
};

export default ResetPassword;
