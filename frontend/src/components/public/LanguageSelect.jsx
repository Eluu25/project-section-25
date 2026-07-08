import { useLanguage } from '../../context/LanguageContext.jsx';

/** English + Amharic only (no Arabic). */
const LanguageSelect = ({ className = 'public-lang' }) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <select
      className={className}
      value={language}
      onChange={(e) => setLanguage(e.target.value)}
      aria-label={t('language')}
    >
      <option value="en">EN</option>
      <option value="am">AM</option>
    </select>
  );
};

export default LanguageSelect;
