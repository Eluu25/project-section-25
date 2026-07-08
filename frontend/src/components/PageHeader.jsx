import { useLanguage } from '../context/LanguageContext.jsx';

/** Standard page header with localized title and optional subtitle. */
const PageHeader = ({ titleKey, subtitleKey, children }) => {
  const { t } = useLanguage();
  return (
    <div className="page-header">
      <div>
        {titleKey && <h1>{t(titleKey)}</h1>}
        {subtitleKey && <p>{t(subtitleKey)}</p>}
      </div>
      {children}
    </div>
  );
};

export default PageHeader;
