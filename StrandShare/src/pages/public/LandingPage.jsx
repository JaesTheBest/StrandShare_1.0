import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronUp, HeartPulse, Mail, MapPin, Phone } from 'lucide-react';
import { motion, useAnimation, useScroll, useSpring, useTransform } from 'framer-motion';
import { useTheme } from '../../context/ThemeContext';
import { TransitionFlipExit } from '../../components/transitions/TransitionFlip';
import './landing-scroll.css';

/*  static content  */
const aboutHighlights = [
  {
    title: 'Hospital-First Partnership',
    body: 'StrandShare focuses on partnered hospitals that run community events to support patients experiencing hair loss.',
    icon: '*',
  },
  {
    title: 'Event-Driven Process',
    body: 'Every request follows one process: hospital application, staff coordination, admin decision, and event execution readiness.',
    icon: '+',
  },
  {
    title: 'Patient-Centered Impact',
    body: 'Hospital events strengthen continuity of care by improving outreach planning, scheduling, and measurable support delivery.',
    icon: 'o',
  },
];

const impactAreas = [
  {
    title: 'Why Apply as Partner Hospitals',
    body: 'Event applications give hospitals a structured path to align staff support, venue planning, timeline readiness, and operational requirements.',
  },
  {
    title: 'How Events Help Hospitals',
    body: 'Hospitals gain clearer collaboration, predictable preparation, and stronger patient outreach through a managed event workflow.',
  },
  {
    title: 'How Events Help StrandShare',
    body: 'Events create traceable operations and consistent impact data, helping StrandShare scale support with quality and accountability.',
  },
];

const partnerTracks = [
  {
    id: 'hospital',
    eyebrow: 'Hospital Track',
    title: 'Partner Hospital',
    icon: 'hospital',
    body: 'For hospitals and care centers that plan and run approved community events through StrandShare.',
    points: [
      'Submit hospital event partnership applications',
      'Coordinate event requirements with assigned staff',
      'Run approved events with better structure and accountability',
    ],
  },
];

const journeySteps = [
  { num: 'I', title: 'Apply as Partner Hospital', detail: 'Submit your hospital partnership and event request through one application flow.' },
  { num: 'II', title: 'Staff Coordination', detail: 'Staff contacts your team through your preferred channel to align full event details.' },
  { num: 'III', title: 'Admin Decision', detail: 'Admin reviews the staff-endorsed request and issues approval or rejection.' },
  { num: 'IV', title: 'Event Activation', detail: 'Approved hospitals proceed with an organized event workflow and operational support.' },
];

const applicationChecklist = [
  { group: 'Hospital Partnership Essentials', items: [
    'Hospital Name and Facility Details',
    'Primary Contact Number and Preferred Contact Method',
    'Authorized Representative Full Name and Email',
    'Complete Address (Street, Barangay, City, Province, Region)',
  ]},
  { group: 'Event Planning Requirements', items: [
    'Event Title and Overview',
    'Proposed Event Schedule Window',
    'Venue and Location Information',
    'Expected Attendee Volume',
  ]},
];

const faqs = [
  { q: 'Who can apply for partnership?', a: 'Only hospitals and care centers can apply in this partnership flow.' },
  { q: 'Who can apply for event?', a: 'Any user can submit an event application. Staff will contact the requester using the selected preferred contact method.' },
  { q: 'Why is this partnership event-focused?', a: 'Events are the operating unit for planning, review, approval, and impact tracking across the hospital workflow.' },
  { q: 'What happens after we submit?', a: 'Staff receives your request, contacts your team, and prepares the case for admin decision.' },
  { q: 'Can we proceed immediately after applying?', a: 'No. Event requests require admin approval before event execution.' },
  { q: 'Will we receive updates?', a: 'Yes. Your team will receive status updates during staff coordination and after admin decision.' },
];

const marqueeItems = [
  'Hospital Events',
  'Patient Support',
  'Community Outreach',
  'Staff Coordination',
  'Admin Approval',
  'Measured Impact',
];

/*  helpers  */
function parseRgbChannels(hex, fallback = [184, 149, 90]) {
  const m = String(hex || '').trim().match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
  return fallback;
}

function goToHard(path) { window.location.assign(path); }

/*  canvas helpers  */
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

/*  component  */
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
  const [navMinimized, setNavMinimized] = useState(false);
  const [topHoverActive, setTopHoverActive] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [openFaq,    setOpenFaq]    = useState(-1);
  const topHoverStateRef = useRef(false);

  /* transitions */
  const [exitTransition, setExitTransition] = useState(null); // 'login' | 'apply' | null
  const pendingPathRef = useRef(null);
  const fadeControls = useAnimation();

  /* re-entry from login (back-to-landing) starts faded/zoomed */
  const incomingTransition = useMemo(() => {
    try {
      return typeof window !== 'undefined'
        ? sessionStorage.getItem('strandshare:incoming-transition') || ''
        : '';
    } catch { return ''; }
  }, []);
  const isReturningFromLogin = incomingTransition === 'back-from-login';

  useEffect(() => {
    if (isReturningFromLogin) {
      try { sessionStorage.removeItem('strandshare:incoming-transition'); } catch { /* ignore */ }
      fadeControls.start({
        opacity: 1,
        scale: 1,
        transition: { duration: 0.5, ease: [0.22, 0.61, 0.36, 1] },
      });
    }
  }, [isReturningFromLogin, fadeControls]);

  const handleNavigate = useCallback((path) => {
    if (exitTransition) return;
    if (path === '/login') {
      pendingPathRef.current = path;
      setExitTransition('login');
      fadeControls.start({
        opacity: 0,
        scale: 1.04,
        transition: { duration: 0.45, ease: [0.22, 0.61, 0.36, 1] },
      }).then(() => {
        sessionStorage.setItem('strandshare:incoming-transition', 'login');
        goToHard(path);
      });
    } else if (path === '/apply-partnership' || path === '/apply-event') {
      pendingPathRef.current = path;
      setExitTransition('apply');
    } else {
      goToHard(path);
    }
  }, [exitTransition, fadeControls]);

  const handleTransitionDone = useCallback(() => {
    const path = pendingPathRef.current;
    if (path) {
      sessionStorage.setItem('strandshare:incoming-transition', exitTransition || '');
      goToHard(path);
    }
  }, [exitTransition]);

  /* scroll-driven Apple-style effects */
  const { scrollY, scrollYProgress } = useScroll();
  const scrollProgressX = useSpring(scrollYProgress, { stiffness: 90, damping: 20, mass: 0.4 });
  const heroScale = useTransform(scrollY, [0, 600], [1, 0.92]);
  const heroOpacity = useTransform(scrollY, [0, 500], [1, 0]);
  const heroY = useTransform(scrollY, [0, 600], [0, -90]);
  const heroBgRotate = useTransform(scrollY, [0, 1000], [0, 8]);
  const heroBgScale = useTransform(scrollY, [0, 800], [1, 1.18]);

  /* smooth scroll */
  const smoothTo = useCallback((id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);
  const jumpToTop = useCallback(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, []);

  /* nav scroll */
  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY || 0;
      const canHoverReveal = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

      setNavScrolled(currentY > 40);
      setShowBackToTop(currentY > 420);

      setNavMinimized(canHoverReveal && currentY >= 100);

    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* hero reveal */
  useEffect(() => {
    const t = setTimeout(() => setHeroVis(true), 200);
    return () => clearTimeout(t);
  }, []);

  /* reveal minimized nav when cursor reaches top edge */
  useEffect(() => {
    const canHoverReveal = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!canHoverReveal) {
      topHoverStateRef.current = false;
      setTopHoverActive(false);
      return () => {};
    }

    const onMouseMove = (event) => {
      const shouldReveal = event.clientY <= 24;
      if (shouldReveal !== topHoverStateRef.current) {
        topHoverStateRef.current = shouldReveal;
        setTopHoverActive(shouldReveal);
      }
    };

    const onLeaveWindow = (event) => {
      if (event.relatedTarget !== null) return;
      if (topHoverStateRef.current) {
        topHoverStateRef.current = false;
        setTopHoverActive(false);
      }
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('mouseout', onLeaveWindow);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseout', onLeaveWindow);
    };
  }, []);

  /* canvas animations */
  useEffect(() => {
    const getThemeRgb = () => themeRgbRef.current;
    const c1 = setupHeroCanvas(heroCanvasRef.current, getThemeRgb);
    const c2 = setupCtaCanvas(ctaCanvasRef.current, getThemeRgb);
    return () => { c1(); c2(); };
  }, []);

  /* intersection observer - scroll reveals */
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
      <motion.div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          transformOrigin: '0% 50%',
          scaleX: scrollProgressX,
          background: primaryColor,
          zIndex: 9000,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/*  NAV  */}
      <nav
        id="topnav"
        className={[
          navScrolled ? 'scrolled' : '',
          navMinimized ? 'minimized' : '',
          navMinimized && topHoverActive ? 'peek' : '',
        ].filter(Boolean).join(' ')}
      >
        <button type="button" className={`nav-brand${heroVis ? ' vis' : ''}`} onClick={() => smoothTo('hero')}>
          {theme?.logoImage
            ? <img src={theme.logoImage} alt={`${brandName} logo`} className="nav-brand-image" />
            : null}
          <span className="nav-logo-text">{brandName}</span>
        </button>

        <div className={`nav-links${heroVis ? ' vis' : ''}`}>
          <a href="#about">About</a>
          <a href="#impact">Impact</a>
          <a href="#tracks">Tracks</a>
          <a href="#journey">How It Works</a>
          <a href="#faq">FAQ</a>
          <a href="#contact">Contact</a>
        </div>

        <div className={`nav-actions${heroVis ? ' vis' : ''}`}>
          <button type="button" className="nav-login" onClick={() => handleNavigate('/login')}>Login</button>
          <button type="button" className="nav-cta event-apply-cta" onClick={() => handleNavigate('/apply-event')}>Apply for Event</button>
        </div>
      </nav>

      <button
        type="button"
        className={`back-to-top${showBackToTop ? ' show' : ''}`}
        onClick={jumpToTop}
        aria-label="Back to top"
        title="Back to top"
      >
        <ChevronUp size={18} />
      </button>

    <TransitionFlipExit
      trigger={exitTransition === 'apply'}
      onComplete={handleTransitionDone}
    >
    <motion.div
      initial={isReturningFromLogin ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }}
      animate={fadeControls}
      style={{ transformOrigin: 'center center', willChange: 'transform, opacity' }}
    >

      {/*  HERO  */}
      <section id="hero">
        <motion.canvas
          ref={heroCanvasRef}
          className="landing-stars"
          aria-hidden="true"
          style={{ rotate: heroBgRotate, scale: heroBgScale }}
        />

        <motion.div
          className="hero-inner"
          style={{ scale: heroScale, opacity: heroOpacity, y: heroY }}
        >
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
            {brandName} connects partnered hospitals, hospital teams and communities
            around one shared goal - dignified wig support for people experiencing hair loss.
            Any user can apply for event requests, while partner hospital applications are for hospitals only.
          </p>

          <div className={`hero-ctas${heroVis ? ' vis' : ''}`}>
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-partnership')}>
              Apply as Partner Hospital <ArrowRight size={15} />
            </button>
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-event')}>
              Apply for Event <ArrowRight size={15} />
            </button>
          </div>
        </motion.div>

        <div className="scroll-hint">Scroll</div>
      </section>

      {/*  MARQUEE  */}
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

      {/*  ABOUT  */}
      <section id="about">
        <div className="container">
          <p className="eyebrow">About {brandName}</p>
          <h2 className="section-title">Everything You Need<br />To Know About <em>Us</em></h2>
          <p className="section-lead">
            A care-focused platform that turns fragmented tasks into a trusted, transparent
            workflow - from request to release.
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

      {/*  STATS  */}
      <section id="stats">
        <div className="container">
          <div className="stats-grid" id="stat-anchor">
            <div className="stat-item">
              <div className="stat-num"><span id="sn0">0</span><small>+</small></div>
              <div className="stat-label">Hospital Partnerships</div>
            </div>
            <div className="stat-item">
              <div className="stat-num"><span id="sn1">0</span><small>+</small></div>
              <div className="stat-label">Events Coordinated</div>
            </div>
            <div className="stat-item">
              <div className="stat-num"><span id="sn2">0</span><small>+</small></div>
              <div className="stat-label">Patients Supported</div>
            </div>
          </div>
        </div>
      </section>

      {/*  IMPACT  */}
      <section id="impact">
        <div className="container">
          <p className="eyebrow">Impact Areas</p>
          <h2 className="section-title">Where Our Work<br />Creates <em>Impact</em></h2>
          <div className="impact-grid">
            {impactAreas.map((item, i) => (
              <article className="impact-card" key={item.title}>
                <div className="impact-num">{String(i + 1).padStart(2, '0')} - {item.title}</div>
                <h3 className="impact-title">{item.title}</h3>
                <p className="impact-body">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/*  Hospital Partnership  */}
      <section id="tracks">
        <div className="container">
          <p className="eyebrow">Hospital Partnership</p>
          <h2 className="section-title">One Track.<br /><em>Hospital Partnership Mission.</em></h2>
          <p className="section-lead">
            Hospital partnership is focused on event execution. Submit your request, align details with staff, and move to admin decision.
          </p>
          <div className="impact-grid" style={{ gridTemplateColumns: 'repeat(1, 1fr)' }}>
            {partnerTracks.map((track) => (
              <article className="impact-card" key={track.id}>
                <div
                  className="impact-num"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <HeartPulse size={14} />
                  {track.eyebrow} - {track.title}
                </div>
                <h3 className="impact-title">{track.title}</h3>
                <p className="impact-body">{track.body}</p>
                <ul style={{ marginTop: '1.25rem', display: 'grid', gap: '0.5rem', listStyle: 'none', padding: 0 }}>
                  {track.points.map((point) => (
                    <li
                      key={point}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        fontSize: '0.92rem',
                        color: 'var(--color-text-secondary)',
                        lineHeight: 1.6,
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          flex: '0 0 auto',
                          marginTop: '0.55rem',
                          width: '6px',
                          height: '6px',
                          borderRadius: '999px',
                          background: 'var(--color-primary)',
                        }}
                      />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-partnership')}>
              Apply as Partner Hospital <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/*  JOURNEY  */}
      <section id="journey">
        <div className="container">
          <p className="eyebrow">Hospital Event Journey</p>
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

      {/*  REQUIREMENTS  */}
      <section id="apply">
        <div className="container">
          <p className="eyebrow">What You'll Need</p>
          <h2 className="section-title">Hospital Event Partnership<br /><em>Checklist</em></h2>
          <p className="section-lead">
            Prepare the required hospital and event details so staff coordination and admin review can move faster.
          </p>
          {applicationChecklist.map((group, idx) => (
            <div
              key={group.group}
              style={{
                marginBottom: '2rem',
                paddingTop: idx === 0 ? 0 : '2rem',
                borderTop: idx === 0
                  ? 'none'
                  : '1px solid rgba(var(--color-primary-rgb, 184, 149, 90), 0.18)',
              }}
            >
              <p
                className="eyebrow"
                style={{ marginTop: 0, marginBottom: '1rem', opacity: 0.85 }}
              >
                {group.group}
              </p>
              <div className="req-grid">
                {group.items.map(req => (
                  <div className="req-item" key={req}>
                    <div className="req-check" aria-hidden="true">
                      <svg viewBox="0 0 12 12" strokeWidth="2.5"><polyline points="2,6 5,9 10,3" /></svg>
                    </div>
                    <span>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-partnership')}>
              Open Partner Hospital Application Form <ArrowRight size={15} />
            </button>
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-event')}>
              Apply for Event <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/*  FAQ  */}
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

      {/*  CTA  */}
      <section id="cta">
        <canvas ref={ctaCanvasRef} className="landing-stars" aria-hidden="true" />
        <div className="cta-inner container">
          <h2 className="cta-title">Ready to Make a<br /><em>Difference?</em></h2>
          <p className="cta-sub">
            Join the hospital partnership network and run better-coordinated community events for patient support.
          </p>
          <div className="cta-btns">
            <button type="button" className="btn-primary event-apply-cta" onClick={() => handleNavigate('/apply-partnership')}>
              Apply as Partner Hospital <ArrowRight size={15} />
            </button>
            <button type="button" className="btn-outline" onClick={() => handleNavigate('/login')}>
              Login to Dashboard
            </button>
          </div>
        </div>
      </section>

      {/*  FOOTER  */}
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
            <a href="#tracks">Tracks</a>
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
    </motion.div>
    </TransitionFlipExit>
    </div>
  );
}


