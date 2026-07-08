import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Briefcase, FileCheck, ShieldCheck, UserPlus } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import PublicAuthShell from '../components/public/PublicAuthShell.jsx';
import '../styles/public-pages.css';
import api from '../utils/api';
import { stripEmojis, formatPhoneInput, validateRegistrationForm, sanitizeNationalIdDigits } from '../utils/validation';

const Register = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    full_name: '',
    gender: '',
    date_of_birth: '',
    phone: '+251',
    address: '',
    id_number: '',
    id_type: 'National ID',
    id_document: '',
    monthly_income: '',
    requested_loan_amount: '',
    income_source: '',
    email: '',
    id_document_file: null,
    profile_photo_file: null
  });
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeStep, setActiveStep] = useState(1);

  const steps = [
    { num: 1, label: t('register_step_personal'), icon: UserPlus },
    { num: 2, label: t('register_step_kyc'), icon: FileCheck },
    { num: 3, label: t('register_step_financial'), icon: Briefcase }
  ];

  const fieldErrors = useMemo(() => validateRegistrationForm(formData), [formData]);
  const showFieldError = (name) => (touched[name] ? fieldErrors[name] : '');

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      setFormData((c) => ({ ...c, [name]: formatPhoneInput(value) }));
      return;
    }
    if (name === 'id_number' && (formData.id_type === 'National ID' || formData.id_type === 'Fayda ID')) {
      setFormData((c) => ({ ...c, [name]: sanitizeNationalIdDigits(value) }));
      return;
    }
    setFormData((c) => ({ ...c, [name]: stripEmojis(value) }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((c) => ({ ...c, [name]: true }));
    if (name === 'phone') {
      const normalized = formatPhoneInput(formData.phone);
      setFormData((c) => ({ ...c, phone: normalized || '+251' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setTouched({ full_name: true, phone: true, email: true, id_number: true });

    if (Object.keys(validateRegistrationForm(formData)).length > 0) {
      setError(t('register_fix_fields'));
      return;
    }

    const required = ['full_name', 'gender', 'date_of_birth', 'phone', 'address', 'id_number', 'id_type'];
    if (required.some((f) => !String(formData[f] || '').trim())) {
      setError(t('register_complete_kyc'));
      return;
    }
    if (!String(formData.id_document || '').trim() && !formData.id_document_file) {
      setError(t('register_id_required'));
      return;
    }

    const monthlyIncome = Number(formData.monthly_income);
    if (!String(formData.monthly_income).trim() || Number.isNaN(monthlyIncome) || monthlyIncome <= 0) {
      setError(t('register_income_required'));
      return;
    }

    try {
      setSubmitting(true);
      const result = await api.publicClientRegistration({
        full_name: formData.full_name.trim(),
        gender: formData.gender,
        date_of_birth: formData.date_of_birth,
        phone: formatPhoneInput(formData.phone),
        address: formData.address.trim(),
        id_number: formData.id_number.trim(),
        id_type: formData.id_type,
        id_document: formData.id_document.trim(),
        monthly_income: formData.monthly_income,
        requested_loan_amount: formData.requested_loan_amount || 0,
        income_source: formData.income_source || '',
        email: formData.email.trim(),
        id_document_file: formData.id_document_file,
        profile_photo_file: formData.profile_photo_file
      });

      setSuccessMessage(result?.message || t('register_success'));
      setFormData({
        full_name: '', gender: '', date_of_birth: '', phone: '+251', address: '',
        id_number: '', id_type: 'National ID', id_document: '', monthly_income: '',
        requested_loan_amount: '', income_source: '', email: '',
        id_document_file: null, profile_photo_file: null
      });
      setTouched({});
      setActiveStep(1);
    } catch (err) {
      setError(err.message || t('register_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const aside = (
    <>
      <img src="/assets/images/logo.png" alt={t('landing_brand')} className="public-auth-aside-logo" />
      <div>
        <span className="public-auth-aside-eyebrow">{t('register_eyebrow')}</span>
        <h2>{t('register_title')}</h2>
        <p className="public-auth-aside-lead">{t('register_intro')}</p>
      </div>
      <div className="public-auth-perks">
        <div className="public-auth-perk">
          <ShieldCheck size={18} />
          <div>
            <strong>{t('register_perk_1_title')}</strong>
            <span>{t('register_perk_1_desc')}</span>
          </div>
        </div>
        <div className="public-auth-perk">
          <BadgeCheck size={18} />
          <div>
            <strong>{t('register_perk_2_title')}</strong>
            <span>{t('register_perk_2_desc')}</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <PublicAuthShell aside={aside} backLabel={t('register_back_home')} backTo="/">
      <div className="public-auth-card-head">
        <div className="public-auth-badge">
          <BadgeCheck size={14} />
          {t('register_guided')}
        </div>
        <h1>{t('register_title')}</h1>
        <p>{t('register_subtitle')}</p>
      </div>

      <div className="register-progress">
        {steps.map((s) => (
          <button
            key={s.num}
            type="button"
            className={`register-progress-step ${activeStep === s.num ? 'active' : ''}`}
            onClick={() => setActiveStep(s.num)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form className="public-form" onSubmit={handleSubmit}>
        {error && <div className="public-alert error" role="alert">{error}</div>}
        {successMessage && <div className="public-alert success" role="status">{successMessage}</div>}

        {(activeStep === 1) && (
          <section className="register-section">
            <h3>{t('register_personal_info')}</h3>
            <div className="register-grid">
              <div className="public-form-row span-2">
                <label htmlFor="full_name">{t('name')}</label>
                <input
                  id="full_name"
                  name="full_name"
                  type="text"
                  value={formData.full_name}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className={showFieldError('full_name') ? 'input-invalid' : ''}
                />
                {showFieldError('full_name') && <span className="public-form-hint">{showFieldError('full_name')}</span>}
              </div>
              <div className="public-form-row">
                <label htmlFor="gender">{t('gender')}</label>
                <select id="gender" name="gender" value={formData.gender} onChange={handleChange} required>
                  <option value="">{t('select_gender')}</option>
                  <option value="Male">{t('gender_male')}</option>
                  <option value="Female">{t('gender_female')}</option>
                </select>
              </div>
              <div className="public-form-row">
                <label htmlFor="date_of_birth">{t('date_of_birth')}</label>
                <input id="date_of_birth" name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange} required />
              </div>
              <div className="public-form-row">
                <label htmlFor="phone">{t('phone_et')}</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+251912345678"
                  value={formData.phone}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className={showFieldError('phone') ? 'input-invalid' : ''}
                />
                {showFieldError('phone') && <span className="public-form-hint">{showFieldError('phone')}</span>}
              </div>
              <div className="public-form-row">
                <label htmlFor="email">{t('email')} <span className="required-mark">*</span></label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  className={showFieldError('email') ? 'input-invalid' : ''}
                />
                {showFieldError('email') && <span className="public-form-hint">{showFieldError('email')}</span>}
              </div>
              <div className="public-form-row span-2">
                <label htmlFor="address">{t('address')}</label>
                <input id="address" name="address" type="text" value={formData.address} onChange={handleChange} required />
              </div>
            </div>
            <button type="button" className="public-btn public-btn-outline" style={{ marginTop: '0.75rem' }} onClick={() => setActiveStep(2)}>
              {t('register_next')} <ArrowRight size={16} />
            </button>
          </section>
        )}

        {(activeStep === 2) && (
          <section className="register-section">
            <h3>{t('register_kyc_section')}</h3>
            <div className="register-grid">
              <div className="public-form-row">
                <label htmlFor="id_type">{t('id_type')}</label>
                <select id="id_type" name="id_type" value={formData.id_type} onChange={handleChange} required>
                  <option value="">{t('select_id_type')}</option>
                  <option value="National ID">{t('id_type_national')}</option>
                  <option value="Passport">{t('id_type_passport')}</option>
                  <option value="Driving License">{t('id_type_license')}</option>
                  <option value="Kebele ID">{t('id_type_kebele')}</option>
                </select>
              </div>
              <div className="public-form-row">
                <label htmlFor="id_number">{t('id_number')}</label>
                <input
                  id="id_number"
                  name="id_number"
                  type="text"
                  inputMode={(formData.id_type === 'National ID' || formData.id_type === 'Fayda ID') ? 'numeric' : 'text'}
                  maxLength={(formData.id_type === 'National ID' || formData.id_type === 'Fayda ID') ? 16 : 32}
                  value={formData.id_number}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  required
                  placeholder={(formData.id_type === 'National ID' || formData.id_type === 'Fayda ID') ? t('id_16_digits') : ''}
                  className={showFieldError('id_number') ? 'input-invalid' : ''}
                />
                {showFieldError('id_number') && <span className="public-form-hint">{showFieldError('id_number')}</span>}
              </div>
              <div className="public-form-row span-2">
                <label htmlFor="id_document">{t('id_document_ref')}</label>
                <input id="id_document" name="id_document" type="text" value={formData.id_document} onChange={handleChange} />
              </div>
              <div className="public-form-row">
                <label htmlFor="id_document_file">{t('upload_id')}</label>
                <input id="id_document_file" name="id_document_file" type="file" accept="image/*" onChange={(e) => setFormData((c) => ({ ...c, id_document_file: e.target.files?.[0] || null }))} />
              </div>
              <div className="public-form-row">
                <label htmlFor="profile_photo_file">{t('upload_photo')}</label>
                <input id="profile_photo_file" name="profile_photo_file" type="file" accept="image/*" onChange={(e) => setFormData((c) => ({ ...c, profile_photo_file: e.target.files?.[0] || null }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="public-btn public-btn-outline" onClick={() => setActiveStep(1)}>{t('back')}</button>
              <button type="button" className="public-btn public-btn-primary" onClick={() => setActiveStep(3)}>{t('register_next')} <ArrowRight size={16} /></button>
            </div>
          </section>
        )}

        {(activeStep === 3) && (
          <section className="register-section">
            <h3>{t('register_financial_section')}</h3>
            <div className="register-grid">
              <div className="public-form-row">
                <label htmlFor="monthly_income">{t('monthly_income')}</label>
                <input
                  id="monthly_income"
                  name="monthly_income"
                  type="number"
                  min="1"
                  value={formData.monthly_income}
                  onChange={handleChange}
                  required
                  className={showFieldError('monthly_income') ? 'input-invalid' : ''}
                />
                {showFieldError('monthly_income') && <span className="public-form-hint">{showFieldError('monthly_income')}</span>}
              </div>
              <div className="public-form-row">
                <label htmlFor="requested_loan_amount">{t('requested_loan_optional')}</label>
                <input id="requested_loan_amount" name="requested_loan_amount" type="number" min="0" value={formData.requested_loan_amount} onChange={handleChange} />
              </div>
              <div className="public-form-row span-2">
                <label htmlFor="income_source">{t('income_source_optional')}</label>
                <select id="income_source" name="income_source" value={formData.income_source} onChange={handleChange}>
                  <option value="">{t('select_income_source')}</option>
                  <option value="Agriculture">{t('income_agriculture')}</option>
                  <option value="Trade">{t('income_trade')}</option>
                  <option value="Professional Employment">{t('income_employment')}</option>
                  <option value="Student">{t('income_student')}</option>
                  <option value="Casual Labor">{t('income_labor')}</option>
                  <option value="Remittance">{t('income_remittance')}</option>
                  <option value="Other">{t('income_other')}</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button type="button" className="public-btn public-btn-outline" onClick={() => setActiveStep(2)}>{t('back')}</button>
              <button type="submit" className="public-submit" style={{ flex: 1 }} disabled={submitting || Object.keys(fieldErrors).length > 0}>
                {submitting ? t('register_submitting') : t('register_submit_review')}
                {!submitting && <ArrowRight size={18} />}
              </button>
            </div>
          </section>
        )}
      </form>

      <div className="public-auth-footer">
        <p>{t('register_have_account')} <Link to="/login">{t('register_sign_in_link')}</Link></p>
      </div>
    </PublicAuthShell>
  );
};

export default Register;
