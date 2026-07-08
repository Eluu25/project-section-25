import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

const Unauthorized = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="unauthorized-container">
      <div className="unauthorized-card">
        <AlertTriangle className="warning-icon" size={64} />
        <h1>{t('unauthorized_title')}</h1>
        <p>{t('unauthorized_message')}</p>
        <button onClick={() => navigate('/login')} className="back-button">
          {t('unauthorized_back')}
        </button>
      </div>
    </div>
  );
};

export default Unauthorized;
