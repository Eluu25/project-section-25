import { AlertCircle, CheckCircle2, Calendar, Coins, FileImage, Hash, ShieldCheck, Upload } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { formatDateTime } from '../utils/dateTime';
import './ReceiptVerificationPanel.css';

/**
 * Bank transfer / mobile banking screenshot verification UI (upload + review).
 */
const ReceiptVerificationPanel = ({
  file = null,
  onFileChange,
  document = null,
  verification = null,
  verified = false,
  onVerifiedChange,
  showVerifyCheckbox = false,
  disabled = false,
  accept = '.pdf,.jpg,.jpeg,.png,.webp',
  inputId = 'receipt-proof-input'
}) => {
  const { t } = useLanguage();

  const receiptRef = document?.receipt_reference || document?.receiptReference || verification?.receipt_reference;
  const requestAmount = verification?.request_amount ?? verification?.requestAmount;
  const transactionAmount = verification?.transaction_amount ?? verification?.transactionAmount;
  const transactionDate = verification?.transaction_date ?? verification?.transactionDate;
  const receiptUploadedAt = verification?.receipt_uploaded_at ?? document?.uploaded_at;
  const isConsumed = Boolean(document?.consumed_at);
  const docStatus = document?.status || (isConsumed ? 'Consumed' : null);
  const fileHash = document?.file_hash;

  const statusClass = docStatus === 'Verified'
    ? 'verified'
    : docStatus === 'Rejected'
      ? 'rejected'
      : isConsumed
        ? 'consumed'
        : 'pending';

  return (
    <div className="receipt-verification-panel">
      <div className="receipt-panel-header">
        <ShieldCheck size={22} />
        <div>
          <h4>{t('receipt_verification_title')}</h4>
          <p>{t('receipt_verification_subtitle')}</p>
        </div>
      </div>

      {document && (
        <div className={`receipt-status-badge ${statusClass}`}>
          {docStatus === 'Verified' && <CheckCircle2 size={16} />}
          {docStatus === 'Rejected' && <AlertCircle size={16} />}
          <span>
            {docStatus === 'Verified'
              ? t('receipt_status_verified')
              : docStatus === 'Rejected'
                ? t('receipt_status_rejected')
                : isConsumed
                  ? t('receipt_status_consumed')
                  : t('receipt_status_pending')}
          </span>
        </div>
      )}

      {(requestAmount != null || transactionAmount != null) && (
        <div className="receipt-verification-amounts">
          <div className="receipt-meta-row">
            <Coins size={14} />
            <span className="receipt-meta-label">{t('receipt_request_amount')}</span>
            <strong>{Number(requestAmount || 0).toLocaleString()} ETB</strong>
          </div>
          {transactionAmount != null && (
            <div className="receipt-meta-row">
              <Coins size={14} />
              <span className="receipt-meta-label">{t('receipt_transaction_amount')}</span>
              <strong>{Number(transactionAmount).toLocaleString()} ETB</strong>
            </div>
          )}
        </div>
      )}

      {(transactionDate || receiptUploadedAt) && (
        <div className="receipt-verification-dates">
          {transactionDate && (
            <div className="receipt-meta-row">
              <Calendar size={14} />
              <span className="receipt-meta-label">{t('receipt_transaction_date')}</span>
              <span>{formatDateTime(transactionDate)}</span>
            </div>
          )}
          {receiptUploadedAt && (
            <div className="receipt-meta-row">
              <Calendar size={14} />
              <span className="receipt-meta-label">{t('receipt_uploaded_date')}</span>
              <span>{formatDateTime(receiptUploadedAt)}</span>
            </div>
          )}
        </div>
      )}

      {receiptRef && (
        <div className="receipt-meta-row">
          <span className="receipt-meta-label">{t('receipt_identification_ref')}</span>
          <code>{receiptRef}</code>
        </div>
      )}

      {fileHash && (
        <div className="receipt-meta-row">
          <Hash size={14} />
          <span className="receipt-meta-label">{t('receipt_hash_label')}</span>
          <code className="receipt-hash">{fileHash.slice(0, 16)}…</code>
        </div>
      )}

      {document?.file_name && (
        <div className="receipt-file-preview">
          <FileImage size={18} />
          <span>{document.file_name}</span>
        </div>
      )}

      {onFileChange && (
        <div className="receipt-upload-zone">
          <label htmlFor={inputId} className="receipt-upload-label">
            <Upload size={20} />
            <span>{t('receipt_upload_label')}</span>
            <small>{t('receipt_upload_hint')}</small>
            <small className="receipt-accept">{t('receipt_accept_types')}</small>
          </label>
          <input
            id={inputId}
            type="file"
            accept={accept}
            disabled={disabled}
            className="receipt-file-input"
            onChange={(e) => onFileChange(e.target.files?.[0] || null)}
          />
          <p className="receipt-selected">
            {file?.name || document?.file_name || t('receipt_no_file_selected')}
          </p>
        </div>
      )}

      {showVerifyCheckbox && onVerifiedChange && (
        <label className="receipt-verify-checkbox">
          <input
            type="checkbox"
            checked={verified}
            disabled={disabled}
            onChange={(e) => onVerifiedChange(e.target.checked)}
          />
          <span>{t('receipt_verify_checkbox')}</span>
        </label>
      )}
    </div>
  );
};

export default ReceiptVerificationPanel;
