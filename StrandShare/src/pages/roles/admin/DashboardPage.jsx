import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  Settings2,
  Users,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase, isSupabaseConfigured } from '../../../lib/supabaseClient';
import { useTheme } from '../../../context/ThemeContext';

const EVENT_REQUESTS_TABLE = 'Event_Requests';
const EVENT_APPLICATIONS_TABLE = 'Event_Applications';
const HOSPITALS_TABLE = 'Hospitals';
const USERS_TABLE = 'users';
const WIG_REQUIREMENTS_TABLE = 'wig_requirements';
const LOGISTICS_SETTINGS_TABLE = 'Logistics_Settings';
const LEGAL_DOCUMENTS_TABLE = 'legal_documents';

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function toManilaParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return parts;
}

function toManilaDayKey(value) {
  const parts = toManilaParts(value);
  if (!parts) return '';
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatRelativeShort(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
  });
}

function formatHospitalStatus(hospital) {
  const key = normalizeKey(hospital?.Approval_Status);
  if (key === 'approved') return 'approved';
  if (key === 'rejected') return 'rejected';
  if (key === 'pending') return 'pending';
  return hospital?.Is_Approved ? 'approved' : 'pending';
}

function applicantName(row) {
  return [
    row?.Applicant_First_Name,
    row?.Applicant_Middle_Name,
    row?.Applicant_Last_Name,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ') || 'Unknown applicant';
}

function buildSevenDaySeries() {
  const rows = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const base = new Date();
    base.setDate(base.getDate() - offset);
    rows.push({
      dayKey: toManilaDayKey(base),
      label: formatShortDate(base),
      applications: 0,
      requests: 0,
    });
  }
  return rows;
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractQueryResult(result) {
  if (result.status !== 'fulfilled') {
    return { data: [], error: new Error('Query request failed before completion.') };
  }
  if (result.value?.error) {
    return { data: [], error: result.value.error };
  }
  return { data: result.value?.data || [], error: null };
}

function MetricTile({ label, value, accentColor, helper, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: accentColor }} />
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-bold leading-none text-slate-900">{value}</p>
      <p className="mt-auto pt-2 text-[11px] text-slate-500">{helper}</p>
    </button>
  );
}

function ProgressRow({ label, value, total, accentColor }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-bold text-slate-900">{value}<span className="ml-1 font-normal text-slate-400">· {pct}%</span></span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%`, backgroundColor: accentColor }} />
      </div>
    </div>
  );
}

export default function DashboardPage({ onNavigate }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0f766e';
  const secondaryColor = theme?.secondaryColor || '#64748b';
  const tertiaryColor = theme?.tertiaryColor || '#10b981';
  const primaryTextColor = theme?.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme?.secondaryTextColor || '#475569';
  const fontFamily = theme?.fontFamily || 'Poppins';
  const headingFontFamily = theme?.secondaryFontFamily || theme?.fontFamily || 'Poppins';

  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [warnings, setWarnings] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState('');
  const [dashboard, setDashboard] = useState({
    kpis: {
      pendingAdminDecision: 0,
      pendingHospitalApplications: 0,
      approvedRequests: 0,
      approvedWithoutAssignedStaff: 0,
      pendingStaffReview: 0,
      appealedApplications: 0,
      systemAlerts: 0,
      adminUsers: 0,
      staffUsers: 0,
    },
    requestStatusData: [],
    trendData: buildSevenDaySeries(),
    actionItems: [],
    pendingAdminRows: [],
    pendingHospitalRows: [],
    systemChecks: {
      wigRequirementsReady: false,
      logisticsReady: false,
      legalReady: false,
      legalVersion: '',
    },
  });

  const loadDashboard = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    setIsLoading(true);
    setNotice({ kind: '', text: '' });
    setWarnings([]);

    try {
      const settled = await Promise.allSettled([
        supabase
          .from(EVENT_REQUESTS_TABLE)
          .select('Event_Request_ID,Event_Application_ID,Event_Name,Status,Created_At,Updated_At,Start_Date,End_Date,Assigned_Staff_User_ID,Event_Visibility')
          .order('Updated_At', { ascending: false })
          .limit(1000),
        supabase
          .from(EVENT_APPLICATIONS_TABLE)
          .select('Event_Application_ID,Event_Name,Status,Created_At,Updated_At,Applicant_First_Name,Applicant_Middle_Name,Applicant_Last_Name,Proposed_Start_At')
          .order('Created_At', { ascending: false })
          .limit(1000),
        supabase
          .from(HOSPITALS_TABLE)
          .select('Hospital_ID,Hospital_Name,Approval_Status,Is_Approved,Created_At,Updated_At,Hospital_Head_Name')
          .order('Updated_At', { ascending: false })
          .limit(1000),
        supabase
          .from(USERS_TABLE)
          .select('role,is_active')
          .limit(1000),
        supabase
          .from(WIG_REQUIREMENTS_TABLE)
          .select('Wig_Requirement_ID,Updated_At')
          .order('Wig_Requirement_ID', { ascending: true })
          .limit(1),
        supabase
          .from(LOGISTICS_SETTINGS_TABLE)
          .select('Logistics_Settings_ID,Destination_Name,Updated_At')
          .order('Logistics_Settings_ID', { ascending: false })
          .limit(1),
        supabase
          .from(LEGAL_DOCUMENTS_TABLE)
          .select('legal_document_id,version,is_active,effective_at,created_at')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      const requestResult = extractQueryResult(settled[0]);
      const applicationResult = extractQueryResult(settled[1]);
      const hospitalResult = extractQueryResult(settled[2]);
      const usersResult = extractQueryResult(settled[3]);
      const wigResult = extractQueryResult(settled[4]);
      const logisticsResult = extractQueryResult(settled[5]);
      const legalResult = extractQueryResult(settled[6]);

      const nextWarnings = [];
      if (hospitalResult.error) nextWarnings.push(`Hospital applications: ${hospitalResult.error.message}`);
      if (usersResult.error) nextWarnings.push(`User roles: ${usersResult.error.message}`);
      if (wigResult.error) nextWarnings.push(`Wig requirements: ${wigResult.error.message}`);
      if (logisticsResult.error) nextWarnings.push(`Logistics destination: ${logisticsResult.error.message}`);
      if (legalResult.error) nextWarnings.push(`Legal documents: ${legalResult.error.message}`);
      setWarnings(nextWarnings);

      if (requestResult.error || applicationResult.error) {
        const rawError = requestResult.error?.message || applicationResult.error?.message || 'Unable to load dashboard data.';
        setNotice({ kind: 'error', text: rawError });
      }

      const requestRows = requestResult.data;
      const applicationRows = applicationResult.data;
      const hospitalRows = hospitalResult.data;
      const userRows = usersResult.data;

      const applicationById = new Map(
        applicationRows.map((row) => [safeNumber(row.Event_Application_ID), row]),
      );

      const pendingAdminRows = requestRows
        .filter((row) => normalizeKey(row.Status) === 'pendingadminapproval')
        .slice()
        .sort((a, b) => new Date(a.Created_At || 0).getTime() - new Date(b.Created_At || 0).getTime());

      const approvedWithoutAssignedStaff = requestRows.filter(
        (row) => normalizeKey(row.Status) === 'approved' && !safeNumber(row.Assigned_Staff_User_ID),
      );

      const pendingStaffReviewRows = applicationRows.filter(
        (row) => normalizeKey(row.Status) === 'pendingstaffreview',
      );

      const appealedRows = applicationRows.filter(
        (row) => normalizeKey(row.Status) === 'appealed',
      );

      const pendingHospitalRows = hospitalRows
        .filter((row) => formatHospitalStatus(row) === 'pending')
        .slice()
        .sort((a, b) => new Date(a.Created_At || 0).getTime() - new Date(b.Created_At || 0).getTime());

      const roleCounts = userRows.reduce((acc, row) => {
        if (row?.is_active === false) return acc;
        const key = normalizeKey(row.role);
        if (key === 'admin') acc.admin += 1;
        if (key === 'staff') acc.staff += 1;
        return acc;
      }, { admin: 0, staff: 0 });

      const statusBreakdown = {
        pendingadminapproval: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
      };
      requestRows.forEach((row) => {
        const key = normalizeKey(row.Status);
        if (key in statusBreakdown) statusBreakdown[key] += 1;
      });

      const requestStatusData = [
        { name: 'Pending Admin', value: statusBreakdown.pendingadminapproval, color: '#f59e0b' },
        { name: 'Approved', value: statusBreakdown.approved, color: tertiaryColor },
        { name: 'Rejected', value: statusBreakdown.rejected, color: '#e11d48' },
        { name: 'Cancelled', value: statusBreakdown.cancelled, color: secondaryColor },
      ];

      const trendData = buildSevenDaySeries();
      const trendByDay = new Map(trendData.map((row) => [row.dayKey, row]));
      applicationRows.forEach((row) => {
        const key = toManilaDayKey(row.Created_At);
        if (!trendByDay.has(key)) return;
        trendByDay.get(key).applications += 1;
      });
      requestRows.forEach((row) => {
        const key = toManilaDayKey(row.Created_At);
        if (!trendByDay.has(key)) return;
        trendByDay.get(key).requests += 1;
      });

      const activeLegalRow = legalResult.data.find((row) => Boolean(row.is_active)) || null;
      const systemChecks = {
        wigRequirementsReady: wigResult.data.length > 0,
        logisticsReady: logisticsResult.data.length > 0,
        legalReady: Boolean(activeLegalRow),
        legalVersion: String(activeLegalRow?.version || ''),
      };

      const actionItems = [];
      if (pendingAdminRows.length > 0) {
        actionItems.push({
          title: 'Event requests waiting for admin decision',
          count: pendingAdminRows.length,
          detail: 'Approve or reject pending event requests.',
          page: 'manage-event-applications',
        });
      }
      if (pendingHospitalRows.length > 0) {
        actionItems.push({
          title: 'Hospital applications pending review',
          count: pendingHospitalRows.length,
          detail: 'Approve or reject hospital partnership applications.',
          page: 'manage-hospital-accounts',
        });
      }
      if (approvedWithoutAssignedStaff.length > 0) {
        actionItems.push({
          title: 'Approved events without assigned staff',
          count: approvedWithoutAssignedStaff.length,
          detail: 'Assign one staff per approved event request.',
          page: 'manage-event-applications',
        });
      }
      if (!systemChecks.wigRequirementsReady || !systemChecks.logisticsReady || !systemChecks.legalReady) {
        const missing = [
          !systemChecks.wigRequirementsReady ? 'wig requirements' : null,
          !systemChecks.logisticsReady ? 'logistics destination' : null,
          !systemChecks.legalReady ? 'active legal consent PDF' : null,
        ].filter(Boolean).join(', ');
        actionItems.push({
          title: 'Requirement configuration missing',
          count: 1,
          detail: `Review setup for: ${missing}.`,
          page: 'manage-requirements',
        });
      }
      if (appealedRows.length > 0) {
        actionItems.push({
          title: 'Appealed applications in pipeline',
          count: appealedRows.length,
          detail: 'Track staff resubmissions after admin rejection.',
          page: 'manage-event-applications',
        });
      }

      setDashboard({
        kpis: {
          pendingAdminDecision: pendingAdminRows.length,
          pendingHospitalApplications: pendingHospitalRows.length,
          approvedRequests: statusBreakdown.approved,
          approvedWithoutAssignedStaff: approvedWithoutAssignedStaff.length,
          pendingStaffReview: pendingStaffReviewRows.length,
          appealedApplications: appealedRows.length,
          systemAlerts: (!systemChecks.wigRequirementsReady ? 1 : 0)
            + (!systemChecks.logisticsReady ? 1 : 0)
            + (!systemChecks.legalReady ? 1 : 0),
          adminUsers: roleCounts.admin,
          staffUsers: roleCounts.staff,
        },
        requestStatusData,
        trendData,
        actionItems,
        pendingAdminRows: pendingAdminRows.slice(0, 5).map((row) => ({
          ...row,
          application: applicationById.get(safeNumber(row.Event_Application_ID)) || null,
        })),
        pendingHospitalRows: pendingHospitalRows.slice(0, 5),
        systemChecks,
      });

      setLastSyncedAt(new Date().toISOString());
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load dashboard data.' });
    } finally {
      setIsLoading(false);
    }
  }, [tertiaryColor, secondaryColor]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const topMetrics = useMemo(() => ([
    {
      key: 'pendingAdmin',
      label: 'Pending Admin',
      value: dashboard.kpis.pendingAdminDecision,
      accentColor: '#f59e0b',
      helper: 'Event requests waiting for your decision',
      page: 'manage-event-applications',
    },
    {
      key: 'approved',
      label: 'Approved Events',
      value: dashboard.kpis.approvedRequests,
      accentColor: tertiaryColor,
      helper: 'Live approved event requests',
      page: 'manage-event-applications',
    },
    {
      key: 'hospitals',
      label: 'Hospital Apps',
      value: dashboard.kpis.pendingHospitalApplications,
      accentColor: primaryColor,
      helper: 'Partnership applications pending review',
      page: 'manage-hospital-accounts',
    },
    {
      key: 'alerts',
      label: 'System Alerts',
      value: dashboard.kpis.systemAlerts,
      accentColor: '#e11d48',
      helper: 'Configuration items needing attention',
      page: 'manage-requirements',
    },
  ]), [dashboard.kpis, tertiaryColor, primaryColor]);

  const totalRequests = useMemo(
    () => dashboard.requestStatusData.reduce((sum, entry) => sum + safeNumber(entry.value), 0),
    [dashboard.requestStatusData],
  );

  return (
    <div
      className="space-y-4"
      style={{ fontFamily: `${fontFamily}, sans-serif`, color: primaryTextColor }}
    >
      {/* Plain title row */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: `${headingFontFamily}, sans-serif`, color: primaryTextColor }}
          >
            Admin Dashboard
          </h1>
          <p className="text-sm" style={{ color: secondaryTextColor }}>
            One-look view of approvals, backlogs, and configuration health.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>Last synced: <strong className="font-semibold text-slate-700">{lastSyncedAt ? formatRelativeShort(lastSyncedAt) : '—'}</strong></span>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {notice.text && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {notice.kind === 'error' ? <AlertTriangle size={14} className="mt-0.5 flex-none" /> : <CheckCircle2 size={14} className="mt-0.5 flex-none" />}
          <span>{notice.text}</span>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">Partial data warnings</p>
          <div className="mt-1 space-y-0.5">
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </div>
      )}

      {/* Top metric tiles — 4 tiles, equal weight */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {topMetrics.map((metric) => (
          <MetricTile
            key={metric.key}
            label={metric.label}
            value={metric.value}
            accentColor={metric.accentColor}
            helper={metric.helper}
            onClick={() => typeof onNavigate === 'function' && onNavigate(metric.page)}
          />
        ))}
      </section>

      {/* Row: Donut (with center total) + Bar chart + Progress-bar breakdown */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Donut with big center number */}
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-4">
          <h3 className="text-sm font-bold text-slate-800">Event Request Status</h3>
          <p className="text-xs text-slate-500">Lifetime distribution</p>
          <div className="relative mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dashboard.requestStatusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={82}
                  innerRadius={58}
                  paddingAngle={2}
                  stroke="none"
                >
                  {dashboard.requestStatusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-4xl font-bold leading-none text-slate-900">{totalRequests}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Total</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            {dashboard.requestStatusData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="flex-1 truncate text-slate-600">{entry.name}</span>
                <span className="font-bold text-slate-800">{entry.value}</span>
              </div>
            ))}
          </div>
        </article>

        {/* 7-day pipeline */}
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">7-Day Pipeline</h3>
              <p className="text-xs text-slate-500">Applications vs. Requests created daily</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondaryColor }} />Apps</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: primaryColor }} />Requests</span>
            </div>
          </div>
          <div className="mt-2 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard.trendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="applications" name="Applications" fill={secondaryColor} radius={[4, 4, 0, 0]} />
                <Bar dataKey="requests" name="Requests" fill={primaryColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        {/* Horizontal progress bars */}
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-3">
          <h3 className="text-sm font-bold text-slate-800">Status Breakdown</h3>
          <p className="text-xs text-slate-500">Share of all event requests</p>
          <div className="mt-4 space-y-3">
            {dashboard.requestStatusData.map((entry) => (
              <ProgressRow
                key={entry.name}
                label={entry.name}
                value={entry.value}
                total={totalRequests}
                accentColor={entry.color}
              />
            ))}
          </div>
        </article>
      </section>

      {/* Row: Action items + Pending queue (left) + Hospital list + Health + Roles (right) */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-7">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-1.5">
              <CalendarClock size={14} style={{ color: primaryColor }} />
              <h2 className="text-sm font-bold text-slate-800">Needs Action Now</h2>
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {dashboard.actionItems.length}
              </span>
            </div>
            {dashboard.actionItems.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle2 size={13} />
                No high-priority blockers right now.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {dashboard.actionItems.map((item) => (
                  <li key={`${item.title}-${item.page}`}>
                    <button
                      type="button"
                      onClick={() => typeof onNavigate === 'function' && onNavigate(item.page)}
                      className="flex w-full items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left transition hover:border-slate-300 hover:bg-white"
                    >
                      <span
                        className="flex h-7 w-7 flex-none items-center justify-center rounded-md text-xs font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {item.count}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-900">{item.title}</p>
                        <p className="truncate text-[11px] text-slate-500">{item.detail}</p>
                      </div>
                      <ArrowRight size={13} className="text-slate-400" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Oldest Pending Admin Decisions</h3>
                <p className="text-xs text-slate-500">First-in-first-out review queue</p>
              </div>
              <button
                type="button"
                onClick={() => typeof onNavigate === 'function' && onNavigate('manage-event-applications')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                style={{ color: primaryColor }}
              >
                Open queue <ArrowRight size={11} />
              </button>
            </div>
            {dashboard.pendingAdminRows.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No pending admin requests.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.pendingAdminRows.map((row) => (
                  <li key={row.Event_Request_ID} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{row.Event_Name || 'Untitled Event'}</p>
                      <p className="truncate text-[11px] text-slate-500">
                        ER-{row.Event_Request_ID} · {applicantName(row.application)}
                      </p>
                    </div>
                    <span className="flex-none rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      {formatShortDate(row.Created_At)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>

        <div className="space-y-3 xl:col-span-5">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Pending Hospital Apps</h3>
                <p className="text-xs text-slate-500">Awaiting your approval</p>
              </div>
              <button
                type="button"
                onClick={() => typeof onNavigate === 'function' && onNavigate('manage-hospital-accounts')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                style={{ color: primaryColor }}
              >
                Open <ArrowRight size={11} />
              </button>
            </div>
            {dashboard.pendingHospitalRows.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                No pending hospital applications.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {dashboard.pendingHospitalRows.map((row) => (
                  <li key={row.Hospital_ID} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-sky-100 text-sky-700">
                        <Building2 size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{row.Hospital_Name || `Hospital #${row.Hospital_ID}`}</p>
                        <p className="truncate text-[11px] text-slate-500">{row.Hospital_Head_Name || 'No head info'}</p>
                      </div>
                    </div>
                    <span className="flex-none text-[11px] text-slate-500">{formatShortDate(row.Created_At)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <Settings2 size={13} style={{ color: primaryColor }} />
                <h3 className="text-sm font-bold text-slate-800">System Health</h3>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Wig Requirements', ready: dashboard.systemChecks.wigRequirementsReady },
                  { label: 'Logistics Destination', ready: dashboard.systemChecks.logisticsReady },
                  { label: 'Legal Consent PDF', ready: dashboard.systemChecks.legalReady, detail: dashboard.systemChecks.legalVersion ? `v${dashboard.systemChecks.legalVersion}` : undefined },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                      item.ready
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}
                  >
                    {item.ready ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                    <span className="flex-1 truncate">{item.label}</span>
                    <span className="text-[10px] font-bold uppercase">
                      {item.ready ? (item.detail || 'OK') : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <Users size={13} style={{ color: primaryColor }} />
                <h3 className="text-sm font-bold text-slate-800">Active Roles</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admins</p>
                  <p className="text-xl font-bold leading-tight text-slate-900">{dashboard.kpis.adminUsers}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Staff</p>
                  <p className="text-xl font-bold leading-tight text-slate-900">{dashboard.kpis.staffUsers}</p>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Needs Staff</p>
                <p className="text-xl font-bold leading-tight text-slate-900">{dashboard.kpis.approvedWithoutAssignedStaff}</p>
                <p className="text-[10px] text-slate-500">Approved events unassigned</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
