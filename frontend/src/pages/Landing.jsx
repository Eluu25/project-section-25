import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Shield,
  TrendingUp,
  Users,
  Building2,
  Zap,
  CheckCircle2,
  Clock3,
  Landmark,
  Smartphone,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import PublicNav from '../components/public/PublicNav.jsx';
import '../styles/public-pages.css';

const Landing = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const stats = [
    { value: '15K+', label: t('landing_stat_clients') },
    { value: `500M+ ${t('etb')}`, label: t('landing_stat_disbursed') },
    { value: '6', label: t('landing_stat_branches') },
    { value: '98%', label: t('landing_stat_satisfaction') }
  ];

  const features = [
    { icon: TrendingUp, tone: 'teal', title: t('landing_feature_rates_title'), desc: t('landing_feature_rates_desc') },
    { icon: Shield, tone: 'blue', title: t('landing_feature_secure_title'), desc: t('landing_feature_secure_desc') },
    { icon: Building2, tone: 'amber', title: t('landing_feature_branches_title'), desc: t('landing_feature_branches_desc') },
    { icon: Users, tone: 'violet', title: t('landing_feature_support_title'), desc: t('landing_feature_support_desc') }
  ];

  const services = [
    { tag: 'Loans', title: t('landing_service_personal_title'), desc: t('landing_service_personal_desc') },
    { tag: 'Business', title: t('landing_service_business_title'), desc: t('landing_service_business_desc') },
    { tag: 'Agri', title: t('landing_service_agri_title'), desc: t('landing_service_agri_desc') },
    { tag: 'Fixed', title: t('landing_service_fixed_title'), desc: t('landing_service_fixed_desc') },
    { tag: t('save'), title: t('landing_service_passbook_title'), desc: t('landing_service_passbook_desc') },
    { tag: 'Digital', title: t('landing_service_mobile_title'), desc: t('landing_service_mobile_desc') }
  ];

  const steps = [
    { title: t('landing_step_1_title'), desc: t('landing_step_1_desc') },
    { title: t('landing_step_2_title'), desc: t('landing_step_2_desc') },
    { title: t('landing_step_3_title'), desc: t('landing_step_3_desc') }
  ];

  const previewTiles = [
    { icon: Landmark, title: t('landing_tile_branches'), sub: t('landing_tile_branches_sub') },
    { icon: Smartphone, title: t('landing_tile_mobile'), sub: t('landing_tile_mobile_sub') },
    { icon: Clock3, title: t('landing_tile_review'), sub: t('landing_tile_review_sub') },
    { icon: Shield, title: t('landing_tile_secure'), sub: t('landing_tile_secure_sub') }
  ];

  return (
    <div className="public-page">
      <PublicNav />

      <section className="landing-hero">
        <div className="landing-hero-bg" aria-hidden="true">
          <div className="landing-hero-glow landing-hero-glow-1" />
          <div className="landing-hero-glow landing-hero-glow-2" />
        </div>

        <div className="landing-hero-copy">
          <div className="landing-pill">
            <Zap size={14} />
            <span>{t('landing_badge_trusted')}</span>
          </div>
          <h1>
            {t('landing_hero_title_prefix')} <em>{t('landing_hero_title_highlight')}</em>
          </h1>
          <p className="landing-hero-lead">{t('landing_hero_subtitle')}</p>
          <div className="landing-hero-cta">
            <button type="button" className="public-btn public-btn-primary lg" onClick={() => navigate('/register')}>
              {t('landing_register_client')}
              <ArrowRight size={18} />
            </button>
            <button type="button" className="public-btn public-btn-secondary lg" onClick={() => navigate('/login')}>
              {t('landing_sign_in_dashboard')}
            </button>
          </div>
          <div className="landing-stats">
            {stats.map((s) => (
              <div className="landing-stat" key={s.label}>
                <strong>{s.value}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-hero-panel">
          <div className="landing-preview">
            <div className="landing-preview-header">
              <div>
                <span className="landing-preview-eyebrow">{t('landing_preview_eyebrow')}</span>
                <h3>{t('landing_preview_title')}</h3>
              </div>
              <div className="landing-preview-badge">
                <CheckCircle2 size={16} />
                {t('landing_preview_badge')}
              </div>
            </div>
            <div className="landing-preview-grid">
              {previewTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <div className="landing-preview-tile" key={tile.title}>
                    <Icon size={18} />
                    <div>
                      <strong>{tile.title}</strong>
                      <span>{tile.sub}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="landing-trust">
        <div className="landing-trust-inner">
          <div className="landing-trust-item"><Shield size={16} /><span>{t('landing_trust_secure')}</span></div>
          <div className="landing-trust-item"><Users size={16} /><span>{t('landing_trust_community')}</span></div>
          <div className="landing-trust-item"><Building2 size={16} /><span>{t('landing_trust_branches')}</span></div>
        </div>
      </div>

      <section id="features" className="landing-section light">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <h2>{t('landing_why_choose')}</h2>
            <p>{t('landing_features_subtitle')}</p>
          </div>
          <div className="landing-features">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <article className="landing-feature" key={f.title}>
                  <div className={`landing-feature-icon ${f.tone}`}>
                    <Icon size={24} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="services" className="landing-section dark">
        <div className="landing-section-head">
          <h2>{t('landing_our_services')}</h2>
          <p>{t('landing_services_subtitle')}</p>
        </div>
        <div className="landing-services">
          {services.map((s) => (
            <article className="landing-service" key={s.title}>
              <span className="landing-service-tag">{s.tag}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section light">
        <div className="landing-section-inner">
          <div className="landing-section-head">
            <h2>{t('landing_steps_title')}</h2>
            <p>{t('landing_steps_subtitle')}</p>
          </div>
          <div className="landing-steps">
            {steps.map((step, i) => (
              <article className="landing-step" key={step.title}>
                <div className="landing-step-num">0{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div className="landing-cta-box">
          <h2>{t('landing_ready')}</h2>
          <p>{t('landing_cta_subtitle')}</p>
          <div className="landing-cta-actions">
            <button type="button" className="public-btn public-btn-outline lg" onClick={() => navigate('/register')}>
              {t('landing_open_account')}
              <ArrowRight size={18} />
            </button>
            <button type="button" className="public-btn public-btn-secondary lg" onClick={() => navigate('/login')}>
              {t('landing_sign_in_dashboard')}
            </button>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-grid">
          <div>
            <div className="landing-footer-brand">
              <img src="/assets/images/logo.png" alt={t('landing_logo_alt')} />
              <span>{t('landing_brand')}</span>
            </div>
            <p>{t('landing_footer_tagline')}</p>
          </div>
          <div>
            <h4>{t('landing_quick_links')}</h4>
            <a href="#features">{t('landing_footer_features')}</a>
            <a href="#services">{t('landing_footer_services')}</a>
            <button type="button" className="footer-link" onClick={() => navigate('/contact')}>{t('landing_contact')}</button>
          </div>
          <div>
            <h4>{t('landing_footer_services')}</h4>
            <a href="#services">{t('landing_footer_personal_loans')}</a>
            <a href="#services">{t('landing_footer_savings')}</a>
          </div>
          <div>
            <h4>{t('landing_footer_contact_title')}</h4>
            <p>{t('landing_footer_address')}</p>
            <p>{t('landing_footer_phone')}</p>
            <p>{t('landing_footer_email')}</p>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <p>{t('landing_copyright')}</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
