import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.jsx';
import PublicNav from './PublicNav.jsx';

const PublicAuthShell = ({
  children,
  aside,
  backLabel,
  backTo = '/',
  compact = false,
  showNav = true
}) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <div className={`public-auth-layout ${compact ? 'public-auth-layout-compact' : ''}`}>
      {showNav && <PublicNav variant="auth" />}

      <div className="public-auth-body">
        <div className="public-auth-bg" aria-hidden="true">
          <div className="public-auth-mesh" />
          <div className="public-auth-glow public-auth-glow-1" />
          <div className="public-auth-glow public-auth-glow-2" />
        </div>

        {!compact && backTo && (
          <div className="public-auth-toolbar">
            <button type="button" className="public-auth-back" onClick={() => navigate(backTo)}>
              <ChevronLeft size={18} />
              <span>{backLabel || t('login_back_home')}</span>
            </button>
          </div>
        )}

        <div className={`public-auth-grid ${compact ? 'public-auth-grid-compact' : ''}`}>
          {aside && <aside className="public-auth-aside">{aside}</aside>}
          <main className="public-auth-main">{children}</main>
        </div>
      </div>
    </div>
  );
};

export default PublicAuthShell;
