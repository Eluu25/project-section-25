import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Lock,
  User,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  Shield,
  CheckCircle,
  BadgeCheck,
  Clock3
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext.jsx';
import PublicAuthShell from '../components/public/PublicAuthShell.jsx';
import '../styles/public-pages.css';
import api from '../utils/api';

const Login = () => {
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [twoFactorState, setTwoFactorState] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({ username: false, password: false });
  const [unlockRequested, setUnlockRequested] = useState(false);
  const [accountLocked, setAccountLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, verifyTwoFactor, completeTwoFactorSetup } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const roleRoutes = {
    admin: '/admin',
    branch_manager: '/branch-manager',
    loan_staff: '/loan-staff',
    saving_staff: '/saving-staff',
    ceo: '/ceo',
    client: '/client'
  };

  const goDashboard = (user) => navigate(roleRoutes[user.role] || '/client');

  const handleChange = (e) => {
    setCredentials((c) => ({ ...c, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setAccountLocked(false);
    setTwoFactorState(null);
    setTwoFactorCode('');
    setIsSubmitting(true);

    if (!credentials.username.trim() || !credentials.password) {
      setTouched({ username: true, password: true });
      setError(t('login_invalid'));
      setIsSubmitting(false);
      return;
    }

    const result = await login(credentials.username, credentials.password, rememberMe);

    if (result.success) {
      goDashboard(result.user);
    } else if (result.requiresTwoFactor) {
      setTwoFactorState({
        mode: result.twoFactorMode,
        challengeToken: result.challengeToken || null,
        setupToken: result.setupToken || null,
        setup: result.setup || null
      });
    } else if (result.error?.includes('locked')) {
      setAccountLocked(true);
      setError(t('login_locked'));
    } else {
      setError(t('login_invalid'));
    }
    setIsSubmitting(false);
  };

  const handleTwoFactorSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    if (!twoFactorState) {
      setIsSubmitting(false);
      return;
    }

    const action = twoFactorState.mode === 'setup'
      ? completeTwoFactorSetup(twoFactorState.setupToken, twoFactorCode, rememberMe)
      : verifyTwoFactor(twoFactorState.challengeToken, twoFactorCode, rememberMe);

    const result = await action;
    if (result.success) {
      goDashboard(result.user);
    } else {
      setError(result.error || t('error_generic'));
    }
    setIsSubmitting(false);
  };

  const handleRequestUnlock = async () => {
    if (!credentials.username.trim()) {
      setError(t('login_invalid'));
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await api.requestAccountUnlock({ username: credentials.username.trim() });
      setUnlockRequested(true);
      setError(response?.message || t('success_submitted'));
    } catch (err) {
      setError(err.message || t('error_generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const aside = (
    <>
      <img src="/assets/images/logo.png" alt={t('login_logo_alt')} className="public-auth-aside-logo" />
      <div>
        <span className="public-auth-aside-eyebrow">{t('login_welcome_eyebrow')}</span>
        <h2>{t('login_brand')}</h2>
        <p className="public-auth-aside-lead">{t('login_tagline')}</p>
      </div>
      <div className="public-auth-perks">
        <div className="public-auth-perk">
          <BadgeCheck size={18} />
          <div>
            <strong>{t('login_perk_1_title')}</strong>
            <span>{t('login_perk_1_desc')}</span>
          </div>
        </div>
        <div className="public-auth-perk">
          <Shield size={18} />
          <div>
            <strong>{t('login_perk_2_title')}</strong>
            <span>{t('login_perk_2_desc')}</span>
          </div>
        </div>
        <div className="public-auth-perk">
          <Clock3 size={18} />
          <div>
            <strong>{t('login_perk_3_title')}</strong>
            <span>{t('login_perk_3_desc')}</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <PublicAuthShell aside={aside} backLabel={t('login_back_home')} backTo="/">
      <div className="public-auth-card-head">
        <div className="public-auth-badge">
          <Shield size={14} />
          {t('login_secure_access')}
        </div>
        <h1>{t('login_title')}</h1>
        <p>{t('login_subtitle')}</p>
      </div>

      {!twoFactorState ? (
        <form onSubmit={handleSubmit} className="public-form">
          {error && (
            <div className="public-alert error" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          {accountLocked && (
            <button
              type="button"
              className="public-btn public-btn-outline"
              style={{ width: '100%' }}
              disabled={isSubmitting || unlockRequested}
              onClick={handleRequestUnlock}
            >
              {unlockRequested ? t('login_unlock_sent') : t('login_request_unlock')}
            </button>
          )}

          <div className="public-form-row">
            <label htmlFor="username">{t('login_username_label')}</label>
            <div className="public-input-wrap">
              <User className="public-input-icon" size={18} />
              <input
                type="text"
                id="username"
                name="username"
                value={credentials.username}
                onChange={handleChange}
                onBlur={() => setTouched((c) => ({ ...c, username: true }))}
                required
                autoComplete="username"
                className={touched.username && !credentials.username ? 'input-invalid' : ''}
              />
            </div>
            {touched.username && !credentials.username && (
              <span className="public-form-hint">{t('login_username_required')}</span>
            )}
          </div>

          <div className="public-form-row">
            <label htmlFor="password">{t('login_password_label')}</label>
            <div className="public-input-wrap">
              <Lock className="public-input-icon" size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={credentials.password}
                onChange={handleChange}
                onBlur={() => setTouched((c) => ({ ...c, password: true }))}
                required
                autoComplete="current-password"
                className={touched.password && !credentials.password ? 'input-invalid' : ''}
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
            {touched.password && !credentials.password && (
              <span className="public-form-hint">{t('login_password_required')}</span>
            )}
          </div>

          <div className="public-form-actions">
            <label className="public-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>{t('login_remember_me')}</span>
            </label>
            <Link to="/forgot-password" className="public-link">{t('login_forgot_password')}</Link>
          </div>

          <button type="submit" className="public-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner" />
                {t('login_signing_in')}
              </>
            ) : (
              <>
                {t('login_button')}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      ) : (
        <form onSubmit={handleTwoFactorSubmit} className="public-form">
          {error && (
            <div className="public-alert error" role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <div className="public-auth-card-head" style={{ marginBottom: '0.5rem' }}>
            <h1 style={{ fontSize: '1.2rem' }}>
              {twoFactorState.mode === 'setup' ? t('login_2fa_setup') : t('login_2fa_code')}
            </h1>
            <p>{t('login_2fa_hint')}</p>
          </div>
          {twoFactorState.mode === 'setup' && twoFactorState.setup && (
            <div className="setup-info">
              <p>{t('login_2fa_secret_label')}: <strong>{twoFactorState.setup.secret}</strong></p>
              <p>{t('login_2fa_setup_hint')}</p>
              <p className="otp-url">{twoFactorState.setup.otpauthUrl}</p>
            </div>
          )}
          <div className="public-form-row">
            <label htmlFor="twoFactorCode">{t('login_2fa_placeholder')}</label>
            <input
              type="text"
              id="twoFactorCode"
              inputMode="numeric"
              maxLength={6}
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoComplete="one-time-code"
            />
          </div>
          <button type="submit" className="public-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <span className="spinner" />
                {t('login_verifying')}
              </>
            ) : (
              <>
                {twoFactorState.mode === 'setup' ? t('login_complete_setup') : t('login_verify_code')}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      )}

      <div className="public-auth-trust">
        <span><Shield size={14} /> {t('login_trust_ssl')}</span>
        <span><CheckCircle size={14} /> {t('login_trust_secure')}</span>
      </div>

      <div className="public-auth-footer">
        <p>
          {t('login_new_client')}{' '}
          <Link to="/register">{t('login_register_link')}</Link>
        </p>
        <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>{t('login_footer_copyright')}</p>
      </div>
    </PublicAuthShell>
  );
};

export default Login;
