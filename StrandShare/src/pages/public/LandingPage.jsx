import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  Globe,
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './landing-scroll.css';

const aboutHighlights = [
  {
    title: 'Who We Are',
    description:
      'A care-focused platform connecting hospitals, support organizations, and volunteers around dignified wig support for people experiencing hair loss.',
    icon: HeartHandshake,
  },
  {
    title: 'What We Do',
    description:
      'We streamline requests, referrals, approvals, and program coordination so teams spend less time on paperwork and more time helping people.',
    icon: ClipboardCheck,
  },
  {
    title: 'Why It Matters',
    description:
      'Each successful handoff restores confidence. StrandShare creates accountable workflows that help communities sustain long-term care and impact.',
    icon: Sparkles,
  },
];

const impactAreas = [
  {
    title: 'Healthcare Coordination',
    description: 'Hospitals and care teams can coordinate patient referrals and track release workflows with clarity and accountability.',
    icon: Stethoscope,
  },
  {
    title: 'Organization Enablement',
    description: 'Verified organizations can manage donation activity, community outreach, and support programs in one place.',
    icon: Users,
  },
  {
    title: 'Transparent Giving',
    description: 'Donors and support groups can trust that every contribution follows a visible and accountable process.',
    icon: Coins,
  },
];

const journeySteps = [
  {
    title: 'Apply As Organization',
    detail: 'Submit organization details and your representative account.',
  },
  {
    title: 'Confirm Email',
    detail: 'Secure ownership by completing email confirmation.',
  },
  {
    title: 'Admin Verification',
    detail: 'Super Admin reviews the profile and supporting details.',
  },
  {
    title: 'Activation',
    detail: 'Approved organizations gain full access and receive a notification email.',
  },
];

const organizationRequirements = [
  'Organization Name and Type',
  'Primary Contact Number',
  'Complete Address (Street, Barangay, City, Province, Region)',
  'Representative First and Last Name',
  'Representative Email for Account Confirmation',
  'Optional Logo URL',
];

const faqs = [
  {
    question: 'Do organizations need admin approval?',
    answer:
      'Yes. Organizations must confirm email first, then wait for Super Admin approval before account access is activated.',
  },
  {
    question: 'Can I log in immediately after email confirmation?',
    answer:
      'No. Login is blocked until your organization application is approved by Super Admin.',
  },
  {
    question: 'Who becomes the organization representative?',
    answer:
      'The applicant account is set as the organization leader / representative once approved.',
  },
  {
    question: 'Will I get notified when approved?',
    answer:
      'Yes. The system sends an email notification after Super Admin approval.',
  },
];

function parseColorToRgbChannels(colorValue, fallback = [15, 118, 110]) {
  const input = String(colorValue || '').trim();
  const fallbackChannels = Array.isArray(fallback) && fallback.length === 3 ? fallback : [15, 118, 110];

  const rgbMatch = input.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    return rgbMatch.slice(1, 4).map((channel) => {
      const parsed = Number(channel);
      return Math.max(0, Math.min(255, Number.isFinite(parsed) ? parsed : 0));
    });
  }

  const hexSix = input.match(/^#([0-9a-f]{6})$/i);
  if (hexSix) {
    const hex = hexSix[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const hexThree = input.match(/^#([0-9a-f]{3})$/i);
  if (hexThree) {
    const [r, g, b] = hexThree[1].split('');
    return [
      parseInt(`${r}${r}`, 16),
      parseInt(`${g}${g}`, 16),
      parseInt(`${b}${b}`, 16),
    ];
  }

  return fallbackChannels;
}

function goTo(path) {
  if (typeof window === 'undefined') {
    return;
  }

  window.location.assign(path);
}

function setupStarfield(canvas, starCount = 120) {
  if (!canvas || typeof window === 'undefined') {
    return () => {};
  }

  const context = canvas.getContext('2d');
  if (!context) {
    return () => {};
  }

  let width = 0;
  let height = 0;
  let animationId = 0;
  let stars = [];

  const createStar = () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 1.4 + 0.3,
    opacity: Math.random() * 0.8 + 0.2,
    speed: Math.random() * 0.3 + 0.05,
  });

  const resize = () => {
    width = Math.max(1, canvas.offsetWidth || 1);
    height = Math.max(1, canvas.offsetHeight || 1);

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    stars = Array.from({ length: starCount }, createStar);
  };

  const draw = () => {
    context.clearRect(0, 0, width, height);

    for (const star of stars) {
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
      context.fill();

      star.y += star.speed;
      if (star.y > height) {
        star.y = 0;
        star.x = Math.random() * width;
      }
    }

    animationId = window.requestAnimationFrame(draw);
  };

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });

  return () => {
    window.cancelAnimationFrame(animationId);
    window.removeEventListener('resize', resize);
  };
}

export default function LandingPage() {
  const { theme } = useTheme();

  const primaryColor = String(theme?.primaryColor || '#0f766e').trim() || '#0f766e';
  const primaryColorLight = String(theme?.primaryColorLight || primaryColor).trim() || primaryColor;
  const primaryColorDark = String(theme?.primaryColorDark || primaryColor).trim() || primaryColor;
  const backgroundColor = String(theme?.backgroundColor || '#f8fafc').trim() || '#f8fafc';
  const primaryTextColor = String(theme?.primaryTextColor || '#0f172a').trim() || '#0f172a';
  const secondaryTextColor = String(theme?.secondaryTextColor || '#334155').trim() || '#334155';
  const tertiaryTextColor = String(theme?.tertiaryTextColor || '#64748b').trim() || '#64748b';
  const bodyFont = String(theme?.secondaryFontFamily || theme?.selectedFont || theme?.fontFamily || 'sans-serif').trim() || 'sans-serif';
  const headingFont = String(theme?.selectedFont || theme?.fontFamily || bodyFont || 'serif').trim() || 'serif';
  const brandName = String(theme?.brandName || 'StrandShare').trim() || 'StrandShare';
  const brandTagline = String(theme?.brandTagline || 'Every Strand Counts').trim() || 'Every Strand Counts';

  const rootRef = useRef(null);
  const heroCanvasRef = useRef(null);
  const ctaCanvasRef = useRef(null);

  const [heroVisible, setHeroVisible] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(-1);
  const [isNavScrolled, setIsNavScrolled] = useState(false);

  const smoothTo = useCallback((id) => {
    if (typeof document === 'undefined') {
      return;
    }

    const section = document.getElementById(id);
    if (!section) {
      return;
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const toggleFaq = useCallback((index) => {
    setOpenFaqIndex((previous) => (previous === index ? -1 : index));
  }, []);

  const rootVariables = useMemo(() => {
    const tealRgb = parseColorToRgbChannels(primaryColor, [15, 118, 110]).join(' ');
    const tealLightRgb = parseColorToRgbChannels(primaryColorLight, parseColorToRgbChannels(primaryColor)).join(' ');
    const tealDarkRgb = parseColorToRgbChannels(primaryColorDark, parseColorToRgbChannels(primaryColor)).join(' ');
    const inkRgb = parseColorToRgbChannels(primaryTextColor, [15, 23, 42]).join(' ');
    const midRgb = parseColorToRgbChannels(secondaryTextColor, [51, 65, 85]).join(' ');
    const offRgb = parseColorToRgbChannels(backgroundColor, [248, 250, 252]).join(' ');

    return {
      '--teal': primaryColor,
      '--teal-light': primaryColorLight,
      '--teal-dark': primaryColorDark,
      '--off': backgroundColor,
      '--white': '#ffffff',
      '--ink': primaryTextColor,
      '--mid': secondaryTextColor,
      '--muted': tertiaryTextColor,
      '--teal-rgb': tealRgb,
      '--teal-light-rgb': tealLightRgb,
      '--teal-dark-rgb': tealDarkRgb,
      '--ink-rgb': inkRgb,
      '--mid-rgb': midRgb,
      '--off-rgb': offRgb,
      '--font-sans': `${bodyFont}, sans-serif`,
      '--font-serif': `${headingFont}, serif`,
    };
  }, [
    backgroundColor,
    bodyFont,
    headingFont,
    primaryColor,
    primaryColorDark,
    primaryColorLight,
    primaryTextColor,
    secondaryTextColor,
    tertiaryTextColor,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setHeroVisible(true);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const onScroll = () => {
      setIsNavScrolled(window.scrollY > 40);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    const cleanupHero = setupStarfield(heroCanvasRef.current, 160);
    const cleanupCta = setupStarfield(ctaCanvasRef.current, 80);

    return () => {
      cleanupHero();
      cleanupCta();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    const animatedNumbers = new WeakSet();
    const frameIds = [];

    const animateNumber = (element) => {
      const target = Number(element.dataset.target || 0);
      if (!Number.isFinite(target) || target <= 0) {
        return;
      }

      const durationMs = 1800;
      const startMs = performance.now();

      const tick = (nowMs) => {
        const progress = Math.min((nowMs - startMs) / durationMs, 1);
        const eased = 1 - ((1 - progress) ** 4);
        const value = Math.round(eased * target);

        element.textContent = `${value}${target >= 10 ? '+' : ''}`;

        if (progress < 1) {
          frameIds.push(window.requestAnimationFrame(tick));
        } else {
          element.textContent = `${target}+`;
        }
      };

      frameIds.push(window.requestAnimationFrame(tick));
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        const target = entry.target;
        target.classList.add('vis');

        if (target instanceof HTMLElement && target.dataset.target && !animatedNumbers.has(target)) {
          animatedNumbers.add(target);
          animateNumber(target);
        }
      });
    }, { threshold: 0.15 });

    const revealSelector = '.eyebrow, .section-title, .section-lead, .about-card, .stat-item, .impact-card, .step, .req-item, .faq-item, .cta-title, .cta-sub, .cta-btns, .stat-num';

    root.querySelectorAll(revealSelector).forEach((element) => {
      observer.observe(element);
    });

    return () => {
      observer.disconnect();
      frameIds.forEach((frameId) => {
        window.cancelAnimationFrame(frameId);
      });
    };
  }, []);

  return (
    <div className="landing-scroll-root" style={rootVariables} ref={rootRef}>
      <nav id="topnav" className={isNavScrolled ? 'scrolled' : ''}>
        <button type="button" className="nav-brand" onClick={() => smoothTo('hero')}>
          {theme?.logoImage ? (
            <img src={theme.logoImage} alt={`${brandName} logo`} className="nav-brand-image" />
          ) : (
            <span className="nav-brand-fallback" aria-hidden="true">
              <Building2 size={16} />
            </span>
          )}
          <span className="nav-logo-text">{brandName}</span>
        </button>

        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#impact">Impact</a>
          <a href="#journey">How It Works</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
        </div>

        <div className="nav-actions">
          <button type="button" className="nav-login" onClick={() => goTo('/login')}>
            Login
          </button>
          <button type="button" className="nav-cta" onClick={() => goTo('/apply-organization')}>
            Apply Organization
          </button>
        </div>
      </nav>

      <section id="hero">
        <canvas ref={heroCanvasRef} className="landing-stars" />

        <div className="hero-inner">
          <p className={`hero-badge ${heroVisible ? 'vis' : ''}`}>✦ {brandTagline}</p>

          <h1 className="hero-title">
            <span className={`line ${heroVisible ? 'vis' : ''}`}>Building Confidence</span>
            <span className={`line ${heroVisible ? 'vis' : ''}`}>
              Through <span>Connected</span>
            </span>
            <span className={`line ${heroVisible ? 'vis' : ''}`}>Care</span>
          </h1>

          <p className={`hero-sub ${heroVisible ? 'vis' : ''}`}>
            {brandName} connects hospitals, organizations, and communities around one shared goal - dignified wig support for people experiencing hair loss.
          </p>

          <div className={`hero-ctas ${heroVisible ? 'vis' : ''}`}>
            <button type="button" className="btn-primary" onClick={() => goTo('/apply-organization')}>
              Apply As Organization <ArrowRight size={15} />
            </button>
            <button type="button" className="btn-outline" onClick={() => smoothTo('about')}>
              Learn More
            </button>
          </div>
        </div>

        <div className="scroll-hint">Scroll</div>
      </section>

      <section id="about">
        <div className="container">
          <p className="eyebrow">About StrandShare</p>
          <h2 className="section-title">Everything You Need To Know About Us</h2>
          <p className="section-lead">A care-focused platform that turns fragmented tasks into a trusted, transparent workflow - from request to release.</p>

          <div className="about-grid">
            {aboutHighlights.map((item) => {
              const Icon = item.icon;

              return (
                <article className="about-card" key={item.title}>
                  <div className="card-icon">
                    <Icon size={20} />
                  </div>
                  <h3 className="card-title">{item.title}</h3>
                  <p className="card-body">{item.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="stats">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-num" data-target="200">0</div>
              <div className="stat-label">Organizations Served</div>
            </div>
            <div className="stat-item">
              <div className="stat-num" data-target="1400">0</div>
              <div className="stat-label">Wigs Distributed</div>
            </div>
            <div className="stat-item">
              <div className="stat-num" data-target="48">0</div>
              <div className="stat-label">Hospitals Connected</div>
            </div>
          </div>
        </div>
      </section>

      <section id="impact">
        <div className="container">
          <p className="eyebrow">Impact Areas</p>
          <h2 className="section-title">Where Our Work Creates Impact</h2>

          <div className="impact-grid">
            {impactAreas.map((item, index) => {
              const Icon = item.icon;

              return (
                <article className="impact-card" key={item.title}>
                  <div className="impact-num">{String(index + 1).padStart(2, '0')}</div>
                  <h3 className="impact-title">{item.title}</h3>
                  <p className="impact-body">{item.description}</p>
                  <div style={{ marginTop: '1rem', color: 'var(--teal)' }}>
                    <Icon size={18} />
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="journey">
        <div className="container">
          <p className="eyebrow">Organization Journey</p>
          <h2 className="section-title">From Application to Activation</h2>
          <p className="section-lead">Our onboarding process is designed for trust and accountability - from first application to full activation.</p>

          <div className="steps-wrap">
            {journeySteps.map((step, index) => (
              <article className="step" key={step.title}>
                <div className="step-num">{index + 1}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-detail">{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="apply">
        <div className="container">
          <p className="eyebrow">Requirements</p>
          <h2 className="section-title">Organization Application Requirements</h2>
          <p className="section-lead">Prepare the following details so your review can move quickly.</p>

          <div className="req-grid">
            {organizationRequirements.map((requirement) => (
              <div className="req-item" key={requirement}>
                <div className="req-check" aria-hidden="true">
                  <svg viewBox="0 0 12 12" strokeWidth="2.5">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                </div>
                <span>{requirement}</span>
              </div>
            ))}
          </div>

          <button type="button" className="btn-primary" onClick={() => goTo('/apply-organization')}>
            Open Application Form <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <section id="faq">
        <div className="container">
          <p className="eyebrow">FAQ</p>
          <h2 className="section-title">Frequently Asked Questions</h2>

          <div className="faq-list">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <article className={`faq-item ${isOpen ? 'open' : ''}`} key={faq.question}>
                  <button type="button" className="faq-q" onClick={() => toggleFaq(index)}>
                    <span>{faq.question}</span>
                    <div className="faq-icon" aria-hidden="true">
                      <svg viewBox="0 0 12 12" strokeWidth="2.5">
                        <polyline points="2,4 6,8 10,4" />
                      </svg>
                    </div>
                  </button>
                  <div className="faq-body">
                    <p>{faq.answer}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="cta">
        <canvas ref={ctaCanvasRef} className="landing-stars" />

        <div className="cta-inner container">
          <h2 className="cta-title">Ready to Make a Difference?</h2>
          <p className="cta-sub">
            Join the growing network of hospitals and organizations<br />
            building a better support system for those who need it most.
          </p>
          <div className="cta-btns">
            <button type="button" className="btn-primary" onClick={() => goTo('/apply-organization')}>
              Apply As Organization <ArrowRight size={15} />
            </button>
            <button type="button" className="btn-outline" onClick={() => goTo('/login')}>
              Login to Dashboard
            </button>
          </div>
        </div>
      </section>

      <footer id="contact">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">{brandName}</div>
            <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: '0.4rem', maxWidth: '320px' }}>
              {brandTagline}. Compassionate, ethical, and collaborative support systems. We believe every strand of help creates real change.
            </p>
          </div>

          <div className="footer-links">
            <a href="#about">About</a>
            <a href="#impact">Impact</a>
            <a href="#journey">How It Works</a>
            <a href="#apply">Apply</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="footer-contact">
            <span><Mail size={14} /> support@strandshare.org</span>
            <span><Phone size={14} /> +63 912 345 6789</span>
            <span><MapPin size={14} /> Manila, Philippines</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
