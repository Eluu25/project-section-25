import { X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

const CancelRequestModal = ({
  open,
  title,
  subtitle,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  submitting = false
}) => {
  const { t } = useLanguage();

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="cancel-request-title">
      <div className="modal-content">
        <div className="modal-header">
          <h2 id="cancel-request-title">{title || t('cancel_request_title')}</h2>
          <button type="button" className="modal-close" onClick={onClose} disabled={submitting} aria-label={t('close')}>
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
          {subtitle && <p style={{ marginTop: 0, color: '#6b7280' }}>{subtitle}</p>}
          <div className="form-group">
            <label htmlFor="cancel-request-reason">{t('cancel_request_reason_label')}</label>
            <textarea
              id="cancel-request-reason"
              rows={3}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={t('cancel_request_reason_placeholder')}
              disabled={submitting}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            {t('cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={submitting}>
            {submitting ? t('cancelling') : t('confirm_cancel_request')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CancelRequestModal;
