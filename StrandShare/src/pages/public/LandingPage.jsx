import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Mail, MapPin, Phone } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './landing-scroll.css';

/* ─── static content ─────────────────────────────────────────── */
const aboutHighlights = [
  {
    title: 'Who We Are',
    body: 'A care-focused platform connecting hospitals, support organizations, and volunteers around dignified wig support for people experiencing hair loss.',
    icon: '✦',
  },
  {
    title: 'What We Do',
    body: 'We streamline requests, referrals, approvals, and program coordination so teams spend less time on paperwork and more time helping people.',
    icon: '⊕',
  },
  {
    title: 'Why It Matters',
    body: 'Each successful handoff restores confidence. StrandShare creates accountable workflows that help communities sustain long-term care and impact.',
    icon: '◈',
  },
];

const impactAreas = [
  {
    title: 'Healthcare Coordination',
    body: 'Hospitals and care teams can coordinate patient referrals and track release workflows with clarity and accountability.',
  },
  {
    title: 'Organization Enablement',
    body: 'Verified organizations can manage donation activity, community outreach, and support programs in one place.',
  },
  {
    title: 'Transparent Giving',
    body: 'Donors and support groups can trust that every contribution follows a visible and accountable process.',
  },
];

const journeySteps = [
  { num: 'I',   title: 'Apply As Organization', detail: 'Submit organization details and your representative account.' },
  { num: 'II',  title: 'Confirm Email',          detail: 'Secure ownership by completing email confirmation.' },
  { num: 'III', title: 'Admin Verification',     detail: 'Super Admin reviews the profile and supporting details.' },
  { num: 'IV',  title: 'Activation',             detail: 'Approved organizations gain full access and receive a notification email.' },
];

const orgRequirements = [
  'Organization Name and Type',
  'Primary Contact Number',
  'Complete Address (Street, Barangay, City, Province, Region)',
  'Representative First and Last Name',
  'Representative Email for Account Confirmation',
  'Optional Logo URL',
];

const faqs = [
  { q: 'Do organizations need admin approval?',         a: 'Yes. Organizations must confirm email first, then wait for Super Admin approval before account access is activated.' },
  { q: 'Can I log in immediately after email confirmation?', a: 'No. Login is blocked until your organization application is approved by Super Admin.' },
  { q: 'Who becomes the organization representative?',  a: 'The applicant account is set as the organization leader / representative once approved.' },
  { q: 'Will I get notified when approved?',            a: 'Yes. The system sends an email notification after Super Admin approval.' },
];

const marqueeItems = [
  'Hair Donation', 'Restore Confidence', 'Real Hair Wigs',
  'Cancer Support', 'Alopecia Warriors', 'Dignity Restored',
];

/* ─── helpers ────────────────────────────────────────────────── */
function parseRgbChannels(hex, fallback = [184, 149, 90]) {
  const m = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
  return fallback;
}

function goTo(path) { window.location.assign(path); }

/* ─── canvas helpers ─────────────────────────────────────────── */
function setupHeroCanvas(canvas, getThemeRgb) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let W = 0, H = 0, raf = 0;
  let strands = [];

  function resize() {
    W = canvas.offsetWidth || 1;
    H = canvas.offsetHeight || 1;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strands = Array.from({ length: 60 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      len: 80 + Math.random() * 160,
      wave: 6 + Math.random() * 18,
      phase: Math.random() * Math.PI * 2,
      speed: 0.003 + Math.random() * 0.006,
      op: 0.08 + Math.random() * 0.15,
      w: 0.6 + Math.random() * 1.5,
      primary: Math.random() < 0.35,
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const theme = getThemeRgb();
    const primaryRgba = `rgba(${theme.primaryRgb},`;
    const textRgba = `rgba(${theme.textRgb},`;

    strands.forEach(s => {
      s.phase += s.speed;
      ctx.beginPath();
      ctx.strokeStyle = s.primary ? `${primaryRgba}${s.op + 0.1})` : `${textRgba}${s.op})`;
      ctx.lineWidth = s.w;
      ctx.lineCap = 'round';
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        const px = s.x + Math.sin(p * Math.PI * 2 + s.phase) * s.wave * (1 - p * 0.3);
        const py = s.y + p * s.len;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (s.y + s.len > H + 20) { s.y = -s.len - 20; s.x = Math.random() * W; }
      s.y += 0.12;
    });
    raf = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener('resize', resize, { passive: true });
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}

function setupCtaCanvas(canvas, getThemeRgb) {
  if (!canvas) return () => {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  let W = 0, H = 0, raf = 0, hairs = [];

  function resize() {
    W = canvas.offsetWidth || 1;
    H = canvas.offsetHeight || 1;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hairs = Array.from({ length: 30 }, () => ({
      x: Math.random() * W, y0: -80,
      len: 120 + Math.random() * 200,
      wave: (Math.random() - 0.5) * 25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.05 + Math.random() * 0.08,
      op: 0.15 + Math.random() * 0.25,
      w: 0.5 + Math.random() * 1.2,
      primary: Math.random() < 0.4,
    }));
  }

  function draw(ts) {
    const t = (ts || 0) * 0.001;
    ctx.clearRect(0, 0, W, H);
    const theme = getThemeRgb();
    const primaryRgba = `rgba(${theme.primaryRgb},`;
    const textRgba = `rgba(${theme.textRgb},`;

    hairs.forEach(h => {
      ctx.beginPath();
      ctx.strokeStyle = h.primary ? `${primaryRgba}${h.op + 0.1})` : `${textRgba}${h.op})`;
      ctx.lineWidth = h.w;
      for (let i = 0; i <= 14; i++) {
        const p = i / 14;
        const px = h.x + Math.sin(p * Math.PI + h.phase + t * h.speed) * h.wave * p;
        const py = h.y0 + p * h.len + (t * 25) % H;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
    raf = requestAnimationFrame(draw);
  }

  resize();
  raf = requestAnimationFrame(draw);
  window.addEventListener('resize', resize, { passive: true });
  return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
}

/* ─── component ──────────────────────────────────────────────── */
export default function LandingPage() {
  const { theme } = useTheme();

  /* theme tokens */
  const primaryColor   = String(theme?.primaryColor   || '#b8955a').trim();
  const primaryLight   = String(theme?.primaryColorLight || primaryColor).trim();
  const primaryDark    = String(theme?.primaryColorDark  || primaryColor).trim();
  const bgColor        = String(theme?.backgroundColor   || '#f5f0e8').trim();
  const textPrimary    = String(theme?.primaryTextColor   || '#0f0d0a').trim();
  const textSecondary  = String(theme?.secondaryTextColor || '#7a6f61').trim();
  const textTertiary   = String(theme?.tertiaryTextColor  || '#94a3b8').trim();
  const bodyFont       = String(theme?.secondaryFontFamily || theme?.selectedFont || theme?.fontFamily || 'DM Sans').trim();
  const headingFont    = String(theme?.selectedFont || theme?.fontFamily || 'Cormorant Garamond').trim();
  const brandName      = String(theme?.brandName    || 'StrandShare').trim();
  const brandTagline   = String(theme?.brandTagline || 'Every Strand Counts').trim();

  const themeRgbRef = useRef({ primaryRgb: '184, 149, 90', textRgb: '15, 13, 10' });

  /* CSS variables injected on root div */
  const cssVars = useMemo(() => {
    const pRgb  = parseRgbChannels(primaryColor, [184,149,90]).join(', ');
    const bgRgb = parseRgbChannels(bgColor, [245,240,232]).join(', ');
    const txtRgb = parseRgbChannels(textPrimary, [15,13,10]).join(', ');
    
    themeRgbRef.current = { primaryRgb: pRgb, textRgb: txtRgb };

    return {
      '--color-primary':           primaryColor,
      '--color-primary-light':     primaryLight,
      '--color-primary-dark':      primaryDark,
      '--color-primary-rgb':       pRgb,
      '--color-bg':                bgColor,
      '--color-bg-rgb':            bgRgb,
      '--color-text-primary':      textPrimary,
      '--color-text-primary-rgb':  txtRgb,
      '--color-text-secondary':    textSecondary,
      '--color-text-tertiary':     textTertiary,
      '--font-sans':               `'${bodyFont}', DM Sans, sans-serif`,
      '--font-serif':              `'${headingFont}', Cormorant Garamond, serif`,
    };
  }, [primaryColor, primaryLight, primaryDark, bgColor, textPrimary, textSecondary, textTertiary, bodyFont, headingFont]);

  /* refs */
  const rootRef      = useRef(null);
  const heroCanvasRef = useRef(null);
  const ctaCanvasRef  = useRef(null);

  /* state */
  const [heroVis,    setHeroVis]    = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [openFaq,    setOpenFaq]    = useState(-1);

  /* smooth scroll */
  const smoothTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  /* nav scroll */
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* hero reveal */
  useEffect(() => {
    const t = setTimeout(() => setHeroVis(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* canvas animations */
  useEffect(() => {
    const getThemeRgb = () => themeRgbRef.current;
    const c1 = setupHeroCanvas(heroCanvasRef.current, getThemeRgb);
    const c2 = setupCtaCanvas(ctaCanvasRef.current, getThemeRgb);
    return () => { c1(); c2(); };
  }, []);

  /* intersection observer — scroll reveals */
  useEffect(() => {
    if (!rootRef.current || typeof IntersectionObserver === 'undefined') return;
    const selector = '.eyebrow,.section-title,.section-lead,.about-card,.stat-item,.impact-card,.step,.req-item,.faq-item,.cta-title,.cta-sub,.cta-btns';
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('vis'); });
    }, { threshold: 0.12 });
    rootRef.current.querySelectorAll(selector).forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* stat counter animation */
  useEffect(() => {
    const targets = [{ id: 'sn0', val: 200 }, { id: 'sn1', val: 1400 }, { id: 'sn2', val: 48 }];
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        targets.forEach(({ id, val }) => {
          const el = document.getElementById(id);
          if (!el) return;
          const dur = 1800, start = performance.now();
          const tick = now => {
            const p = Math.min((now - start) / dur, 1);
            const ease = 1 - (1 - p) ** 4;
            el.textContent = Math.round(ease * val);
            if (p < 1) requestAnimationFrame(tick);
            else el.textContent = val + '+';
          };
          requestAnimationFrame(tick);
        });
        io.disconnect();
      });
    }, { threshold: 0.5 });
    const anchor = document.getElementById('stat-anchor');
    if (anchor) io.observe(anchor);
    return () => io.disconnect();
  }, []);

  const toggleFaq = useCallback(i => setOpenFaq(prev => (prev === i ? -1 : i)), []);
  const marqueeDouble = [...marqueeItems, ...marqueeItems];

  return (
    <div className="landing-scroll-root" style={cssVars} ref={rootRef}>

      {/* ── NAV ─────────────────────────────────────── */}
      <nav id="topnav" className={navScrolled ? 'scrolled' : ''}>
        <button type="button" className={`nav-brand${heroVis ? ' vis' : ''}`} onClick={() => smoothTo('hero')}>
          {theme?.logoImage
            ? <img src={theme.logoImage} alt={`${brandName} logo`} className="nav-brand-image" />
            : null}
          <span className="nav-logo-text">{brandName}</span>
        </button>

        <div className={`nav-links${heroVis ? ' vis' : ''}`}>
          <a href="#about">About</a>
          <a href="#impact">Impact</a>
          <a href="#journey">How It Works</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
        </div>

        <div className={`nav-actions${heroVis ? ' vis' : ''}`}>
          <button type="button" className="nav-login" onClick={() => goTo('/login')}>Login</button>
          <button type="button" className="nav-cta"   onClick={() => goTo('/apply-organization')}>Apply Organization</button>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────── */}
      <section id="hero">
        <canvas ref={heroCanvasRef} className="landing-stars" aria-hidden="true" />

        <div className="hero-inner">
          <p className={`hero-badge${heroVis ? ' vis' : ''}`}>{brandTagline}</p>

          <h1 className="hero-title">
            <span className={`line${heroVis ? ' vis' : ''}`}>
              <span className="line-inner">Every Strand</span>
            </span>
            <span className={`line${heroVis ? ' vis' : ''}`} style={{ transitionDelay: '0.14s' }}>
              <span className="line-inner">Carries <span>Hope</span></span>
            </span>
            <span className={`line${heroVis ? ' vis' : ''}`} style={{ transitionDelay: '0.28s' }}>
              <span className="line-inner">Forward</span>
            </span>
          </h1>

          <p className={`hero-sub${heroVis ? ' vis' : ''}`}>
            {brandName} connects hospitals, organizations, and communities around one shared
            goal — dignified wig support for people experiencing hair loss.
          </p>

          <div className={`hero-ctas${heroVis ? ' vis' : ''}`}>
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

      {/* ── MARQUEE ─────────────────────────────────── */}
      <div className="marquee-band" aria-hidden="true">
        <div className="m-track">
          {marqueeDouble.map((item, i) => (
            <span className="m-item" key={i}>{item}<span className="m-dot" /></span>
          ))}
        </div>
        <div className="m-track">
          {marqueeDouble.map((item, i) => (
            <span className="m-item" key={i}>{item}<span className="m-dot" /></span>
          ))}
        </div>
      </div>

      {/* ── ABOUT ───────────────────────────────────── */}
      <section id="about">
        <div className="container">
          <p className="eyebrow">About {brandName}</p>
          <h2 className="section-title">Everything You Need<br />To Know About <em>Us</em></h2>
          <p className="section-lead">
            A care-focused platform that turns fragmented tasks into a trusted, transparent
            workflow — from request to release.
          </p>
          <div className="about-grid">
            {aboutHighlights.map(item => (
              <article className="about-card" key={item.title}>
                <div className="card-icon">{item.icon}</div>
                <h3 className="card-title">{item.title}</h3>
                <p className="card-body">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────────── */}
      <section id="stats">
        <div className="container">
          <div className="stats-grid" id="stat-anchor">
            <div className="stat-item">
              <div className="stat-num"><span id="sn0">0</span><small>+</small></div>
              <div className="stat-label">Organizations Served</div>
            </div>
            <div className="stat-item">
              <div className="stat-num"><span id="sn1">0</span><small>+</small></div>
              <div className="stat-label">Wigs Distributed</div>
            </div>
            <div className="stat-item">
              <div className="stat-num"><span id="sn2">0</span><small>+</small></div>
              <div className="stat-label">Hospitals Connected</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── IMPACT ──────────────────────────────────── */}
      <section id="impact">
        <div className="container">
          <p className="eyebrow">Impact Areas</p>
          <h2 className="section-title">Where Our Work<br />Creates <em>Impact</em></h2>
          <div className="impact-grid">
            {impactAreas.map((item, i) => (
              <article className="impact-card" key={item.title}>
                <div className="impact-num">{String(i + 1).padStart(2, '0')} — {item.title}</div>
                <h3 className="impact-title">{item.title}</h3>
                <p className="impact-body">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── JOURNEY ─────────────────────────────────── */}
      <section id="journey">
        <div className="container">
          <p className="eyebrow">Organization Journey</p>
          <h2 className="section-title">
            Four Steps to<br /><em>Change a Life</em>
          </h2>
          <div className="steps-wrap">
            {journeySteps.map(step => (
              <article className="step" key={step.title}>
                <div className="step-num">{step.num}</div>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-detail">{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── REQUIREMENTS ────────────────────────────── */}
      <section id="apply">
        <div className="container">
          <p className="eyebrow">Requirements</p>
          <h2 className="section-title">Organization Application<br /><em>Requirements</em></h2>
          <p className="section-lead">Prepare the following details so your review can move quickly.</p>
          <div className="req-grid">
            {orgRequirements.map(req => (
              <div className="req-item" key={req}>
                <div className="req-check" aria-hidden="true">
                  <svg viewBox="0 0 12 12" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>
                </div>
                <span>{req}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn-primary" onClick={() => goTo('/apply-organization')}>
            Open Application Form <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────── */}
      <section id="faq">
        <div className="container">
          <p className="eyebrow">FAQ</p>
          <h2 className="section-title">Frequently Asked<br /><em>Questions</em></h2>
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <article className={`faq-item${openFaq === i ? ' open' : ''}`} key={faq.q}>
                <button type="button" className="faq-q" onClick={() => toggleFaq(i)}>
                  <span>{faq.q}</span>
                  <span className="faq-icon">
                    <svg viewBox="0 0 10 10"><polyline points="2,3 5,7 8,3" /></svg>
                  </span>
                </button>
                <div className="faq-body"><p>{faq.a}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section id="cta">
        <canvas ref={ctaCanvasRef} className="landing-stars" aria-hidden="true" />
        <div className="cta-inner container">
          <h2 className="cta-title">Ready to Make a<br /><em>Difference?</em></h2>
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

      {/* ── FOOTER ──────────────────────────────────── */}
      <footer id="contact">
        <div className="footer-inner">
          <div>
            <div className="footer-brand">{brandName}</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem', maxWidth: '300px', lineHeight: 1.7 }}>
              {brandTagline}. Compassionate, ethical, and collaborative support systems.
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
