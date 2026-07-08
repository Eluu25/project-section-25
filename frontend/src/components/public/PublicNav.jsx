import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.jsx';
import LanguageSelect from './LanguageSelect.jsx';

const PublicNav = ({ variant = 'landing' }) => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAuth = variant === 'auth';

  const close = () => setMobileOpen(false);

  return (
    <header className={`public-nav ${variant}`}>
      <div className="public-nav-inner">
        <button type="button" className="public-brand" onClick={() => { close(); navigate('/'); }}>
          <img src="/assets/images/logo.png" alt={t('landing_logo_alt')} className="public-brand-logo" />
          <span>{t('landing_brand')}</span>
        </button>

        <button
          type="button"
          className="public-nav-toggle"
          aria-expanded={mobileOpen}
          aria-label={t('toggle_menu') || 'Toggle menu'}
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className={`public-nav-actions ${mobileOpen ? 'open' : ''}`}>
          <LanguageSelect />
          {!isAuth && (
            <>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/register'); }}>
                {t('landing_register')}
              </button>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/login'); }}>
                {t('landing_sign_in')}
              </button>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/contact'); }}>
                {t('landing_contact')}
              </button>
            </>
          )}
          {isAuth && (
            <>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/'); }}>
                {t('login_back_home')}
              </button>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/register'); }}>
                {t('landing_register')}
              </button>
              <button type="button" className="public-nav-link" onClick={() => { close(); navigate('/login'); }}>
                {t('landing_sign_in')}
              </button>
            </>
          )}
          <button
            type="button"
            className="public-btn public-btn-primary"
            onClick={() => { close(); navigate(isAuth ? '/register' : '/login'); }}
          >
            {isAuth ? t('landing_register_client') : t('landing_get_started')}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default PublicNav;
