import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  History,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_REGISTRATIONS_TABLE = 'Donation_Drive_Registrations';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'ended', label: 'Ended' },
  { id: 'rejected', label: 'Rejected' },
];

function withColorAlpha(colorValue, alpha, fallback = '#0275d8') {
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  const input = String(colorValue || '').trim();
  const hexMatch = input.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16);
    const g = parseInt(hexMatch[1].slice(2, 4), 16);
    const b = parseInt(hexMatch[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  return withColorAlpha(fallback, safeAlpha, '#0275d8');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRoleKey(value) {
  return normalizeText(value).replace(/[\s_-]+/g, '');
}

function resolvePreferredMembership(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((row) => Boolean(row.Is_Primary))
    || list.find((row) => normalizeRoleKey(row.Membership_Role) === 'leader')
    || list[0]
    || null
  );
}

function formatDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'No schedule set';
  if (!startDate) return `Until ${formatDate(endDate)}`;
  if (!endDate) return `Starts ${formatDate(startDate)}`;
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function buildLocationLabel(row) {
  return [row.City, row.Province]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function isPastDrive(row) {
  const statusKey = normalizeRoleKey(row.Status);
  if (statusKey === 'completed') return true;
  if (statusKey === 'rejected' || statusKey === 'declined' || statusKey === 'cancelled') return true;
  const end = row.End_Date ? new Date(row.End_Date) : null;
  if (end && end < new Date()) return true;
  return false;
}

function classifyDrive(row) {
  const statusKey = normalizeRoleKey(row.Status);
  if (statusKey === 'completed') return 'completed';
  if (statusKey === 'rejected' || statusKey === 'declined' || statusKey === 'cancelled') return 'rejected';
  const end = row.End_Date ? new Date(row.End_Date) : null;
  if (end && end < new Date()) return 'ended';
  return 'other';
}

function statusToneStyle(category, primaryColor, tertiaryColor) {
  switch (category) {
    case 'completed':
      return { backgroundColor: withColorAlpha(tertiaryColor, 0.14), borderColor: withColorAlpha(tertiaryColor, 0.4), color: tertiaryColor };
    case 'rejected':
      return { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' };
    case 'ended':
      return { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', color: '#475569' };
    default:
      return { backgroundColor: withColorAlpha(primaryColor, 0.12), borderColor: withColorAlpha(primaryColor, 0.4), color: primaryColor };
  }
}

export default function DonationEventHistoryPage({ userProfile }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0275d8';
  const tertiaryColor = theme?.tertiaryColor || '#10b981';
  const primaryTextColor = theme?.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme?.secondaryTextColor || '#64748b';
  const tertiaryTextColor = theme?.tertiaryTextColor || '#94a3b8';
  const headingFont = theme?.secondaryFontFamily || theme?.fontFamily || 'Poppins';
  const bodyFont = theme?.fontFamily || 'Poppins';

  const rootStyle = { color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` };
  const headingStyle = { color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` };

  const [organizationId, setOrganizationId] = useState(null);
  const [organizationName, setOrganizationName] = useState('');
  const [drives, setDrives] = useState([]);
  const [attendeeCountsByDriveId, setAttendeeCountsByDriveId] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilterId, setStatusFilterId] = useState('all');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const loadHistory = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    if (!actorUserId) {
      setNotice({ kind: 'error', text: 'User profile is missing user_id. Please sign in again.' });
      return;
    }

    setIsLoading(true);
    setNotice({ kind: '', text: '' });

    try {
      const membershipResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Organization_ID, Is_Primary, Membership_Role, Created_At, Organizations:Organization_ID(Organization_Name)')
        .eq('User_ID', actorUserId)
        .order('Is_Primary', { ascending: false })
        .order('Created_At', { ascending: false });

      if (membershipResult.error) throw membershipResult.error;

      const preferred = resolvePreferredMembership(membershipResult.data || []);
      if (!preferred?.Organization_ID) {
        setOrganizationId(null);
        setOrganizationName('');
        setDrives([]);
        setNotice({ kind: 'warning', text: 'No organization membership found for your account.' });
        return;
      }

      const orgId = Number(preferred.Organization_ID || 0) || null;
      setOrganizationId(orgId);
      setOrganizationName(String(preferred?.Organizations?.Organization_Name || '').trim());

      const drivesResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select('Donation_Drive_ID, Event_Title, Event_Overview, Start_Date, End_Date, City, Province, Status, Donation_Setup_Type, Total_Recipients, Total_Donations_Collected, Completion_Notes, Completed_At, Updated_At')
        .eq('Organization_ID', orgId)
        .order('End_Date', { ascending: false, nullsFirst: false });

      if (drivesResult.error) throw drivesResult.error;

      const allRows = drivesResult.data || [];
      const pastRows = allRows.filter(isPastDrive);
      setDrives(pastRows);

      const driveIds = pastRows.map((row) => Number(row.Donation_Drive_ID || 0)).filter(Boolean);
      if (driveIds.length) {
        const registrationsResult = await supabase
          .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
          .select('Donation_Drive_ID')
          .in('Donation_Drive_ID', driveIds);

        if (!registrationsResult.error) {
          const counts = (registrationsResult.data || []).reduce((acc, row) => {
            const id = Number(row.Donation_Drive_ID || 0);
            if (!id) return acc;
            acc[id] = (acc[id] || 0) + 1;
            return acc;
          }, {});
          setAttendeeCountsByDriveId(counts);
        } else {
          setAttendeeCountsByDriveId({});
        }
      } else {
        setAttendeeCountsByDriveId({});
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load donation event history.' });
    } finally {
      setIsLoading(false);
    }
  }, [userProfile]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const filteredDrives = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    return drives.filter((row) => {
      if (statusFilterId !== 'all' && classifyDrive(row) !== statusFilterId) return false;
      if (!query) return true;
      return [row.Event_Title, row.City, row.Province, row.Status]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query));
    });
  }, [drives, searchQuery, statusFilterId]);

  const stats = useMemo(() => {
    const completed = drives.filter((row) => classifyDrive(row) === 'completed');
    const totalDonationsCollected = completed.reduce((sum, row) => sum + (Number(row.Total_Donations_Collected || 0) || 0), 0);
    const totalRecipients = completed.reduce((sum, row) => sum + (Number(row.Total_Recipients || 0) || 0), 0);
    return [
      { id: 'past', label: 'Past Events', value: drives.length },
      { id: 'completed', label: 'Completed', value: completed.length },
      { id: 'donations', label: 'Total Donations Collected', value: totalDonationsCollected },
      { id: 'recipients', label: 'Total Recipients', value: totalRecipients },
    ];
  }, [drives]);

  return (
    <div className="space-y-5" style={rootStyle}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>
            Organization Workspace
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl" style={headingStyle}>
            Donation Event History
          </h1>
          <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
            Past drives hosted by {organizationName || 'your organization'} - completed, ended, or closed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadHistory()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm hover:shadow disabled:opacity-60"
          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {notice.text && (
        <div
          className="rounded-xl border px-3 py-2 text-sm font-medium"
          style={
            notice.kind === 'error'
              ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.id} className="rounded-xl border bg-white p-4" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>{stat.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: primaryTextColor }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex items-center gap-2">
            <History size={18} style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold" style={headingStyle}>Past Events</h2>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }}>
              {drives.length}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5" style={{ borderColor: '#e2e8f0' }}>
              <Search size={14} style={{ color: tertiaryTextColor }} />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search past events"
                className="bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
                style={{ color: primaryTextColor }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((filter) => {
                const isActive = statusFilterId === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilterId(filter.id)}
                    className="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
                    style={
                      isActive
                        ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }
                        : { borderColor: '#e2e8f0', backgroundColor: '#ffffff', color: secondaryTextColor }
                    }
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {!filteredDrives.length && !isLoading ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: secondaryTextColor }}>
            {drives.length ? 'No past events match the current filter.' : 'No past donation drives yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
            {filteredDrives.map((row) => {
              const category = classifyDrive(row);
              const driveId = Number(row.Donation_Drive_ID || 0);
              const attendeeCount = attendeeCountsByDriveId[driveId] || 0;

              return (
                <article
                  key={row.Donation_Drive_ID}
                  className="rounded-2xl border bg-white p-4"
                  style={{ borderColor: '#e2e8f0' }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span
                        className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={statusToneStyle(category, primaryColor, tertiaryColor)}
                      >
                        {row.Status || 'Past'}
                      </span>
                      <h3 className="mt-2 text-lg font-bold leading-tight" style={{ color: primaryTextColor }}>
                        {row.Event_Title || `Drive #${row.Donation_Drive_ID}`}
                      </h3>
                      <p className="mt-1 text-xs" style={{ color: tertiaryTextColor }}>
                        Event ID #EV-{row.Donation_Drive_ID} - {row.Donation_Setup_Type || 'No setup type'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-1.5 text-sm">
                    <div className="flex items-center gap-2" style={{ color: secondaryTextColor }}>
                      <CalendarDays size={14} style={{ color: tertiaryTextColor }} />
                      {formatDateRange(row.Start_Date, row.End_Date)}
                    </div>
                    <div className="flex items-center gap-2" style={{ color: secondaryTextColor }}>
                      <MapPin size={14} style={{ color: tertiaryTextColor }} />
                      {buildLocationLabel(row) || 'No location set'}
                    </div>
                    <div className="flex items-center gap-2" style={{ color: secondaryTextColor }}>
                      <Users size={14} style={{ color: tertiaryTextColor }} />
                      {attendeeCount} attendee{attendeeCount === 1 ? '' : 's'} registered
                    </div>
                  </div>

                  {(row.Total_Recipients || row.Total_Donations_Collected) ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: '#e2e8f0' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
                          Donations Collected
                        </p>
                        <p className="mt-0.5 text-sm font-bold" style={{ color: primaryTextColor }}>
                          {Number(row.Total_Donations_Collected || 0)}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: '#e2e8f0' }}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
                          Recipients Reached
                        </p>
                        <p className="mt-0.5 text-sm font-bold" style={{ color: primaryTextColor }}>
                          {Number(row.Total_Recipients || 0)}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {row.Completion_Notes ? (
                    <div className="mt-3 rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: '#e2e8f0' }}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
                        Completion Notes
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: secondaryTextColor }}>{row.Completion_Notes}</p>
                    </div>
                  ) : null}

                  {row.Completed_At ? (
                    <div className="mt-3 flex items-center gap-1 text-[11px]" style={{ color: tertiaryTextColor }}>
                      <CheckCircle2 size={12} style={{ color: tertiaryColor }} />
                      Completed {formatDate(row.Completed_At)}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
