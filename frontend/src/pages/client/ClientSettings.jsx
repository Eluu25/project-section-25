import { useLanguage } from '../../context/LanguageContext.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useState, useEffect } from 'react';
import { Save, X, Lock, Bell, User, ShieldCheck } from 'lucide-react';
import '../admin/AdminPages.css';
import './ClientPages.css';
import api from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { validateEmail, validatePasswordStrength } from '../../utils/validation';

const ClientSettings = () => {
  const { t } = useLanguage();
  const { success, error: showError, warning } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState({ firstName: '', lastName: '', email: '', phone: '' });
  const [notifications, setNotifications] = useState({ emailNotifications: true, smsNotifications: true, reminders: true });

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const client = await api.getMyClientProfile();
      setProfile({
        firstName: client?.firstName || client?.name?.split?.(' ')?.[0] || '',
        lastName: client?.lastName || client?.name?.split?.(' ').slice(1).join(' ') || '',
        email: client?.email || '',
        phone: client?.phone || ''
      });
      const prefs = client?.notification_preferences || {};
      setNotifications({
        emailNotifications: prefs.emailNotifications !== false,
        smsNotifications: prefs.smsNotifications !== false,
        reminders: prefs.paymentReminders !== false
      });
    } catch (err) {
      console.error('Failed loading settings', err);
      showError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!profile.firstName.trim()) return warning('First name required');
    if (!validateEmail(profile.email)) return warning('Enter a valid email');

    setSaving(true);
    try {
      await api.updateMyClientProfile({
        ...profile,
        notification_preferences: {
          emailNotifications: notifications.emailNotifications,
          smsNotifications: notifications.smsNotifications,
          paymentReminders: notifications.reminders
        }
      });
      success('Settings saved');
    } catch (err) {
      console.error('Save settings error', err);
      showError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) return warning(t('validation_required_fields'));
    if (passwords.new !== passwords.confirm) return warning(t('passwords_do_not_match'));
    const errors = validatePasswordStrength(passwords.new);
    if (errors.length) return warning(t('password_complexity_failed'));

    setChangingPassword(true);
    try {
      await api.changeClientPassword(passwords.current, passwords.new, passwords.confirm);
      success(t('password_changed'));
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      console.error('Change password error', err);
      showError(err.message || t('error_generic'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="admin-page">
      <PageHeader titleKey="client_settings_title" subtitleKey="client_settings_subtitle" />

      {loading ? (
        <div className="table-container"><p style={{ padding: '2rem', textAlign: 'center' }}>{t('loading_settings')}</p></div>
      ) : (
        <div className="settings-grid">
          <section className="settings-card">
            <div className="settings-card-header"><User size={18} /><h3>{t('settings_profile')}</h3></div>
            <div className="settings-card-body">
              <label>{t('first_name')}</label>
              <input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} />
              <label>{t('last_name')}</label>
              <input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} />
              <label>{t('email')}</label>
              <input value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <label>{t('phone_label')}</label>
              <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
            </div>
            <div className="settings-card-actions">
              <button className="btn-primary" onClick={handleSaveSettings} disabled={saving}>{saving ? t('saving_label') : (<><Save size={14}/> {t('save')}</>)}</button>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-header"><Bell size={18} /><h3>{t('settings_notifications')}</h3></div>
            <div className="settings-card-body">
              <label className="checkbox-row"><input type="checkbox" checked={notifications.emailNotifications} onChange={() => setNotifications({ ...notifications, emailNotifications: !notifications.emailNotifications })} /> {t('email_alerts')}</label>
              <label className="checkbox-row"><input type="checkbox" checked={notifications.smsNotifications} onChange={() => setNotifications({ ...notifications, smsNotifications: !notifications.smsNotifications })} /> {t('sms_alerts')}</label>
              <label className="checkbox-row"><input type="checkbox" checked={notifications.reminders} onChange={() => setNotifications({ ...notifications, reminders: !notifications.reminders })} /> {t('payment_reminders')}</label>
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card-header"><Lock size={18} /><h3>{t('settings_security')}</h3></div>
            <div className="settings-card-body">
              <label>{t('current_password')}</label>
              <input type="password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} />
              <label>{t('new_password')}</label>
              <input type="password" value={passwords.new} onChange={(e) => setPasswords({ ...passwords, new: e.target.value })} />
              <label>{t('confirm_password')}</label>
              <input type="password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} />
            </div>
            <div className="settings-card-actions">
              <button className="btn-primary" onClick={handleChangePassword} disabled={changingPassword}>{changingPassword ? t('updating_label') : t('change_password')}</button>
            </div>
          </section>

        </div>
      )}
    </div>
  );
};

export default ClientSettings;
