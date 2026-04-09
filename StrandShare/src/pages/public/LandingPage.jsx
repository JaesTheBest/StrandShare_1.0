import React from 'react';
import {
  Building2,
  CheckCircle2,
  ShieldCheck,
  Users,
  ArrowRight,
  Mail,
  Phone,
  MapPin,
  HeartHandshake,
  Sparkles,
  Coins,
  ClipboardCheck,
  Stethoscope,
  Globe,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const aboutHighlights = [
  {
    title: 'Who We Are',
    description:
      'StrandShare is a care-focused platform that connects hospitals, support organizations, and volunteers around one shared goal: dignified wig support for people experiencing hair loss.',
    icon: HeartHandshake,
  },
  {
    title: 'What We Do',
    description:
      'We streamline requests, referrals, approvals, and program coordination so teams can spend less time tracking paperwork and more time helping people.',
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
    description: 'Hospitals and care teams can coordinate patient referrals and track release workflows with clarity.',
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
    detail: 'Approved organizations gain access and receive a notification email.',
  },
];

const organizationRequirements = [
  'Organization Name and Type',
  'Primary Contact Number',
  'Complete Address (Street, Barangay, City, Province, Region, Country)',
  'Representative first and last name',
  'Representative email for account confirmation',
  'Optional logo URL',
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
      'The applicant account is set as the organization leader/representative once approved.',
  },
  {
    question: 'Will I get notified when approved?',
    answer:
      'Yes. The system sends an email notification after Super Admin approval.',
  },
];

function withAlpha(colorValue, alpha, fallback = '#0f766e') {
  const input = String(colorValue || fallback).trim();
  const clampedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));

  const hex6 = input.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const hex = hex6[1];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }

  const hex3 = input.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const hex = hex3[1];
    const r = parseInt(`${hex[0]}${hex[0]}`, 16);
    const g = parseInt(`${hex[1]}${hex[1]}`, 16);
    const b = parseInt(`${hex[2]}${hex[2]}`, 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }

  return input;
}

function goTo(path) {
  if (typeof window === 'undefined') return;
  window.location.assign(path);
}

export default function LandingPage() {
  const { theme } = useTheme();

  const primaryColor = theme.primaryColor || '#0f766e';
  const secondaryColor = theme.secondaryColor || '#1f2937';
  const tertiaryColor = theme.tertiaryColor || '#10b981';
  const backgroundColor = theme.backgroundColor || '#f8fafc';
  const primaryTextColor = theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme.secondaryTextColor || '#334155';
  const tertiaryTextColor = theme.tertiaryTextColor || '#64748b';
  const brandName = theme.brandName || 'StrandShare';
  const brandTagline = theme.brandTagline || 'Every Strand Counts';

  const pageBackground = {
    backgroundColor,
    backgroundImage: `radial-gradient(circle at 14% 18%, ${withAlpha(primaryColor, 0.22)} 0%, transparent 42%), radial-gradient(circle at 82% 8%, ${withAlpha(tertiaryColor, 0.2)} 0%, transparent 35%), linear-gradient(180deg, ${withAlpha(secondaryColor, 0.04)} 0%, ${withAlpha(backgroundColor, 0.98)} 65%)`,
  };

  const sectionCardStyle = {
    backgroundColor: withAlpha('#ffffff', 0.88),
    borderColor: withAlpha(secondaryColor, 0.2),
  };

  const buttonPrimaryStyle = {
    backgroundColor: primaryColor,
    color: '#ffffff',
  };

  return (
    <div className="min-h-screen" style={{ ...pageBackground, color: primaryTextColor }}>
      <header
        className="sticky top-0 z-30 border-b bg-white/90 backdrop-blur"
        style={{ borderColor: withAlpha(secondaryColor, 0.2) }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <button
            type="button"
            onClick={() => goTo('/')}
            className="flex items-center gap-2 text-left"
          >
            {theme.logoImage ? (
              <img
                src={theme.logoImage}
                alt={`${brandName} logo`}
                className="h-10 w-10 rounded-xl border object-cover"
                style={{ borderColor: withAlpha(secondaryColor, 0.25) }}
              />
            ) : (
              <div className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ backgroundColor: primaryColor }}>
                <Building2 size={18} />
              </div>
            )}
            <div>
              <p className="text-lg font-black tracking-tight" style={{ color: primaryTextColor }}>{brandName}</p>
              <p className="text-[11px] uppercase tracking-[0.16em]" style={{ color: tertiaryTextColor }}>{brandTagline}</p>
            </div>
          </button>

          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex" style={{ color: secondaryTextColor }}>
            <a href="#about" className="hover:opacity-80">About Us</a>
            <a href="#impact" className="hover:opacity-80">Impact</a>
            <a href="#journey" className="hover:opacity-80">How It Works</a>
            <a href="#apply" className="hover:opacity-80">Apply</a>
            <a href="#faq" className="hover:opacity-80">FAQ</a>
            <a href="#contact" className="hover:opacity-80">Contact</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo('/login')}
              className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
              style={{ borderColor: withAlpha(secondaryColor, 0.35), color: secondaryTextColor }}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => goTo('/apply-organization')}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white"
              style={buttonPrimaryStyle}
            >
              Apply Organization <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b" style={{ borderColor: withAlpha(secondaryColor, 0.2) }}>
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:gap-16 md:px-8 md:py-20">
          <div>
            <p
              className="mb-3 inline-flex items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ borderColor: withAlpha(primaryColor, 0.35), color: primaryColor }}
            >
              <Globe size={14} /> About {brandName}
            </p>
            <h1 className="text-4xl font-black leading-tight tracking-tight md:text-5xl" style={{ color: primaryTextColor }}>
              Building Confidence Through Connected Care
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 md:text-lg" style={{ color: secondaryTextColor }}>
              {brandName} helps hospitals, organizations, and communities collaborate around wig assistance. We turn fragmented tasks into a trusted, transparent workflow from request to release.
            </p>

            <div className="mt-7 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
              <article className="rounded-xl border bg-white/80 px-4 py-3" style={{ borderColor: withAlpha(secondaryColor, 0.22) }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: tertiaryTextColor }}>Care Teams</p>
                <p className="mt-1 text-xl font-black" style={{ color: primaryTextColor }}>Hospitals</p>
              </article>
              <article className="rounded-xl border bg-white/80 px-4 py-3" style={{ borderColor: withAlpha(secondaryColor, 0.22) }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: tertiaryTextColor }}>Community</p>
                <p className="mt-1 text-xl font-black" style={{ color: primaryTextColor }}>Organizations</p>
              </article>
              <article className="rounded-xl border bg-white/80 px-4 py-3" style={{ borderColor: withAlpha(secondaryColor, 0.22) }}>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: tertiaryTextColor }}>Support</p>
                <p className="mt-1 text-xl font-black" style={{ color: primaryTextColor }}>Donor Network</p>
              </article>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => goTo('/apply-organization')}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow"
                style={buttonPrimaryStyle}
              >
                Apply As Organization <ArrowRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => goTo('/login')}
                className="rounded-xl border bg-white px-5 py-3 text-sm font-bold"
                style={{ borderColor: withAlpha(secondaryColor, 0.35), color: secondaryTextColor }}
              >
                Go To Login
              </button>
            </div>
          </div>

          <div className="rounded-2xl border p-5 shadow-sm backdrop-blur" style={sectionCardStyle}>
            <h2 className="text-lg font-bold" style={{ color: primaryTextColor }}>What Makes {brandName} Different</h2>
            <div className="mt-4 space-y-3 text-sm" style={{ color: secondaryTextColor }}>
              <article className="rounded-lg border bg-white p-3" style={{ borderColor: withAlpha(secondaryColor, 0.18) }}>
                <p className="font-bold" style={{ color: primaryTextColor }}>Human-Centered Workflow</p>
                <p className="mt-1">Designed for healthcare and community teams who need reliable and practical coordination.</p>
              </article>
              <article className="rounded-lg border bg-white p-3" style={{ borderColor: withAlpha(secondaryColor, 0.18) }}>
                <p className="font-bold" style={{ color: primaryTextColor }}>Transparent Accountability</p>
                <p className="mt-1">Tracks application, review, and activation milestones so every step is visible and traceable.</p>
              </article>
              <article className="rounded-lg border bg-white p-3" style={{ borderColor: withAlpha(secondaryColor, 0.18) }}>
                <p className="font-bold" style={{ color: primaryTextColor }}>Scalable Collaboration</p>
                <p className="mt-1">Built to support growing partnerships among hospitals, organizations, and advocates.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: tertiaryTextColor }}>About Us</p>
            <h2 className="mt-2 text-3xl font-black md:text-4xl" style={{ color: primaryTextColor }}>Everything You Need To Know About {brandName}</h2>
          </div>
          <ShieldCheck size={28} style={{ color: primaryColor }} />
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {aboutHighlights.map((item) => {
            const Icon = item.icon;

            return (
              <article key={item.title} className="rounded-2xl border p-6" style={sectionCardStyle}>
                <div className="inline-flex rounded-lg p-2.5" style={{ backgroundColor: withAlpha(primaryColor, 0.13), color: primaryColor }}>
                  <Icon size={18} />
                </div>
                <h3 className="mt-3 text-lg font-black" style={{ color: primaryTextColor }}>{item.title}</h3>
                <p className="mt-2 text-sm leading-7" style={{ color: secondaryTextColor }}>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="impact" className="border-y bg-white/60" style={{ borderColor: withAlpha(secondaryColor, 0.2) }}>
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: primaryTextColor }}>Where Our Work Creates Impact</h2>
          <div className="mt-7 grid gap-4 md:grid-cols-3">
            {impactAreas.map((area) => {
              const Icon = area.icon;

              return (
                <article key={area.title} className="rounded-xl border bg-white p-5" style={{ borderColor: withAlpha(secondaryColor, 0.2) }}>
                  <Icon size={20} style={{ color: primaryColor }} />
                  <h3 className="mt-3 text-base font-black" style={{ color: primaryTextColor }}>{area.title}</h3>
                  <p className="mt-2 text-sm" style={{ color: secondaryTextColor }}>{area.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="journey" className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="rounded-2xl border p-6 md:p-8" style={sectionCardStyle}>
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: primaryTextColor }}>Organization Journey At {brandName}</h2>
          <p className="mt-2 text-sm md:text-base" style={{ color: secondaryTextColor }}>
            Our onboarding process is designed for trust and accountability, from first application to full activation.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {journeySteps.map((step, index) => (
              <article key={step.title} className="rounded-xl border bg-white p-4" style={{ borderColor: withAlpha(secondaryColor, 0.22) }}>
                <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: tertiaryTextColor }}>
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-sm font-black" style={{ color: primaryTextColor }}>{step.title}</h3>
                <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>{step.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-7xl px-4 py-14 md:px-8">
        <div className="rounded-2xl border p-6 md:p-8" style={sectionCardStyle}>
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: primaryTextColor }}>Organization Application Requirements</h2>
          <p className="mt-3 text-sm" style={{ color: secondaryTextColor }}>
            Prepare the following details so your review can move quickly.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {organizationRequirements.map((item) => (
              <div key={item} className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2 text-sm" style={{ borderColor: withAlpha(secondaryColor, 0.22), color: secondaryTextColor }}>
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: tertiaryColor }} />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => goTo('/apply-organization')}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
              style={buttonPrimaryStyle}
            >
              Open Organization Application Form <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      <section id="faq" className="border-y bg-white" style={{ borderColor: withAlpha(secondaryColor, 0.2) }}>
        <div className="mx-auto max-w-7xl px-4 py-14 md:px-8">
          <h2 className="text-2xl font-black md:text-3xl" style={{ color: primaryTextColor }}>Frequently Asked Questions</h2>
          <div className="mt-6 space-y-3">
            {faqs.map((faq) => (
              <article key={faq.question} className="rounded-xl border p-4" style={sectionCardStyle}>
                <h3 className="text-sm font-black md:text-base" style={{ color: primaryTextColor }}>{faq.question}</h3>
                <p className="mt-1 text-sm leading-6" style={{ color: secondaryTextColor }}>{faq.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer id="contact" className="mx-auto max-w-7xl px-4 py-10 md:px-8">
        <div className="rounded-2xl border p-6 md:p-8" style={sectionCardStyle}>
          <h2 className="text-xl font-black" style={{ color: primaryTextColor }}>Contact Us</h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3" style={{ color: secondaryTextColor }}>
            <p className="inline-flex items-center gap-2"><Mail size={15} /> support@strandshare.org</p>
            <p className="inline-flex items-center gap-2"><Phone size={15} /> +63 912 345 6789</p>
            <p className="inline-flex items-center gap-2"><MapPin size={15} /> Manila, Philippines</p>
          </div>

          <div className="mt-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: withAlpha(secondaryColor, 0.22), color: secondaryTextColor }}>
            {brandName} is committed to compassionate, ethical, and collaborative support systems. We believe every strand of help creates real change.
          </div>
        </div>
      </footer>
    </div>
  );
}
