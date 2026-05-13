import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  RefreshCw,
  Loader2,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';
const USERS_TABLE = 'users';
const UI_SETTINGS_TABLE = 'UI_Settings';
const AUDIT_LOGS_TABLE = 'audit_logs';
const HOSPITALS_TABLE = 'Hospitals';
const HOSPITAL_REP_TABLE = 'Hospital_Representative';

const URGENT_HOURS = 24;
const OVERDUE_HOURS = 48;

const EMPTY_DRIVE_INSIGHTS = {
  upcomingCount: 0,
  setupBreakdown: [],
  nextEventLabel: 'No scheduled events',
  trendPercent: 0,
  trendDirection: 'flat',
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function shouldBeVisibleToSuperAdmin(statusValue) {
  return normalizeStatusKey(statusValue) !== 'pendingstaffapproval';
}

function normalizeOrgApprovalStatus(value) {
  const status = normalizeText(value);
  if (status === 'approved') return 'approved';
  if (status === 'rejected') return 'rejected';
  return 'pending';
}

function toDateValue(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function toTimeMs(value) {
  const parsed = toDateValue(value);
  return parsed ? parsed.getTime() : null;
}

function getAgeHours(value) {
  const ms = toTimeMs(value);
  if (ms === null) return null;
  return Math.max(0, (Date.now() - ms) / (1000 * 60 * 60));
}

function formatDateTime(value) {
  const parsed = toDateValue(value);
  if (!parsed) return 'N/A';
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value) {
  const parsed = toDateValue(value);
  if (!parsed) return 'Date TBD';
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: '2-digit' });
}

function formatDateRange(startValue, endValue) {
  if (!startValue && !endValue) return 'Date TBD';
  if (!startValue) return `Until ${formatDateOnly(endValue)}`;
  if (!endValue) return `Starts ${formatDateOnly(startValue)}`;
  return `${formatDateOnly(startValue)} - ${formatDateOnly(endValue)}`;
}

function formatAgeLabel(hoursValue) {
  if (!Number.isFinite(hoursValue)) return 'N/A';
  const totalMinutes = Math.floor(hoursValue * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function mapStatusMeta(statusValue) {
  const key = normalizeStatusKey(statusValue);
  if (key === 'approved') return { label: 'Approved', className: 'bg-green-50 border-green-100 text-green-700' };
  if (key === 'completed' || key === 'done') return { label: 'Completed', className: 'bg-green-50 border-green-100 text-green-700' };
  if (key === 'rejected' || key === 'declined' || key === 'cancelled') return { label: 'Rejected', className: 'bg-rose-50 border-rose-100 text-rose-700' };
  if (key === 'pendingsuperadminapproval' || key === 'pendingadminapproval') return { label: 'Pending', className: 'bg-amber-50 border-amber-100 text-amber-700' };
  return { label: 'Pending', className: 'bg-blue-50 border-blue-100 text-blue-700' };
}

function getStatusBucket(statusValue) {
  const key = normalizeStatusKey(statusValue);
  if (key === 'approved') return 'approved';
  if (key === 'completed' || key === 'done') return 'completed';
  if (key === 'rejected' || key === 'declined' || key === 'cancelled') return 'rejected';
  if (key === 'pendingsuperadminapproval' || key === 'pendingadminapproval') return 'pending';
  return 'pending';
}

function urgencyBadge(hoursValue) {
  if (!Number.isFinite(hoursValue)) return { label: 'Unknown', className: 'bg-slate-50 border-gray-200 text-slate-700' };
  if (hoursValue >= OVERDUE_HOURS) return { label: 'Overdue', className: 'bg-red-50 border-red-100 text-red-700' };
  if (hoursValue >= URGENT_HOURS) return { label: 'Urgent', className: 'bg-amber-50 border-amber-100 text-amber-700' };
  return { label: 'Normal', className: 'bg-slate-50 border-gray-200 text-slate-700' };
}

function toUniqueOrganizationNames(rows) {
  const names = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.Group_Name || '').trim())
    .filter(Boolean);
  return Array.from(new Set(names));
}

function formatScopeLabel({ isOpenForAll, hostOrganizationName, allowedGroups }) {
  if (Boolean(isOpenForAll)) return 'Open to all organizations';
  const names = toUniqueOrganizationNames(allowedGroups);
  if (names.length) return `Specific organizations: ${names.join(', ')}`;
  return `Only ${hostOrganizationName || 'host organization'}`;
}

function formatLocationLabel(row) {
  const parts = [row?.City, row?.Province, row?.Region].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Location TBD';
}

function formatSetupTypeLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Scheduled';
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (x) => x.toUpperCase());
}

function getDriveTimelineMeta(row) {
  const start = toDateValue(row?.Start_Date);
  const end = toDateValue(row?.End_Date);
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000) - 1;
  const startMs = start ? start.getTime() : Number.NaN;
  const endMs = end ? end.getTime() : Number.NaN;
  const hasStart = Number.isFinite(startMs);
  const hasEnd = Number.isFinite(endMs);
  const updatedMs = toTimeMs(row?.Updated_At) || Number.MAX_SAFE_INTEGER;

  const isToday = (
    (hasStart && hasEnd && startMs <= dayEndMs && endMs >= dayStartMs)
    || (hasStart && !hasEnd && startMs >= dayStartMs && startMs <= dayEndMs)
    || (!hasStart && hasEnd && endMs >= dayStartMs && endMs <= dayEndMs)
  );
  const isUpcoming = hasStart ? startMs > dayEndMs : false;
  const isEnded = hasEnd ? endMs < dayStartMs : (hasStart ? startMs < dayStartMs : false);

  let timelineLabel = 'Scheduled';
  if (isToday) timelineLabel = 'Today';
  else if (isUpcoming) timelineLabel = 'Upcoming';
  else if (isEnded) timelineLabel = 'Ended';
  else if (hasStart && startMs <= now.getTime()) timelineLabel = 'In Progress';

  return {
    timelineLabel,
    isToday,
    isUpcoming,
    isEnded,
    sortMs: hasStart ? startMs : (hasEnd ? endMs : updatedMs),
  };
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load donation drive scope data.');
  const lower = message.toLowerCase();
  if (lower.includes('row-level security')) {
    return 'Access to donation drive scope data is blocked by database policy. Verify Super Admin read policies for Donation_Drive_Requests and Donation_Drive_Allowed_Groups.';
  }
  if (lower.includes('donation_drive_allowed_groups') && lower.includes('does not exist')) {
    return 'Donation_Drive_Allowed_Groups table is missing. Run migration 031_donation_drive_allowed_groups_policies.sql.';
  }
  return message;
}

export default function SuperAdminOverviewPage({ onNavigate }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#991b1b';
  const primaryTextColor = theme?.primaryTextColor || '#0f172a';
  const bodyFont = theme?.fontFamily || 'Poppins';

  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [uiSettingsMeta, setUiSettingsMeta] = useState({ updatedAt: null });
  const [backupMeta, setBackupMeta] = useState({ lastBackupAt: null, failedWeekCount: 0 });
  const [auditMeta, setAuditMeta] = useState({ todayCount: 0, weekCount: 0 });
  const [allDriveRows, setAllDriveRows] = useState([]);
  const [driveStats, setDriveStats] = useState({ pendingSuperAdmin: 0, approved: 0, completed: 0, total: 0 });
  const [driveInsights, setDriveInsights] = useState(EMPTY_DRIVE_INSIGHTS);
  const [orgStats, setOrgStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [userStats, setUserStats] = useState({
    total: 0,
    inactive: 0,
    expiredAccess: 0,
    activeHospitalReps: 0,
    unassignedHospitalReps: 0,
    hospitalsTotal: 0,
  });
  const [urgentItems, setUrgentItems] = useState([]);
  const [approvalAges, setApprovalAges] = useState({ orgOldestHours: null, driveOldestHours: null });
  const [tableQuery, setTableQuery] = useState('');
  const [tableStatusFilter, setTableStatusFilter] = useState('all');
  const [tableRowLimit, setTableRowLimit] = useState(6);
  const [graphWindowDays, setGraphWindowDays] = useState(30);
  const [graphMetric, setGraphMetric] = useState('donations');
  const [graphSetupFilter, setGraphSetupFilter] = useState('all');
  const [showInstantSettings, setShowInstantSettings] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showTrendCard, setShowTrendCard] = useState(true);
  const [showSnapshotCard, setShowSnapshotCard] = useState(true);

  const loadDashboard = useCallback(async () => {
      if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      setAllDriveRows([]);
      setDriveInsights(EMPTY_DRIVE_INSIGHTS);
      setUrgentItems([]);
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const now = new Date();
      const nowMs = now.getTime();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();

      const [
        uiSettingsResult,
        lastBackupResult,
        failedBackupWeekResult,
        auditTodayResult,
        auditWeekResult,
        requestsResult,
        organizationsResult,
        usersResult,
        hospitalLinksResult,
        hospitalsResult,
      ] = await Promise.all([
        supabase.from(UI_SETTINGS_TABLE).select('Updated_At').order('Updated_At', { ascending: false }).limit(1).maybeSingle(),
        supabase.from(AUDIT_LOGS_TABLE).select('time').eq('action', 'backup.create').order('time', { ascending: false }).limit(1).maybeSingle(),
        supabase.from(AUDIT_LOGS_TABLE).select('log_id', { count: 'exact', head: true }).eq('action', 'backup.create').eq('status', 'failed').gte('time', startOfWeek),
        supabase.from(AUDIT_LOGS_TABLE).select('log_id', { count: 'exact', head: true }).gte('time', startOfDay),
        supabase.from(AUDIT_LOGS_TABLE).select('log_id', { count: 'exact', head: true }).gte('time', startOfWeek),
        supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .select('Donation_Drive_ID, Organization_ID, Event_Title, Start_Date, End_Date, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type, City, Province, Region, Total_Recipients, Total_Donations_Collected')
          .order('Updated_At', { ascending: false })
          .limit(300),
        supabase.from(ORGANIZATIONS_TABLE).select('Organization_ID, Organization_Name, Approval_Status, Created_At, Updated_At').order('Created_At', { ascending: false }).limit(300),
        supabase
          .from(USERS_TABLE)
          .select('user_id, email, role, is_active, access_start, access_end, created_at, user_details:user_details ( user_id, first_name, last_name )')
          .order('created_at', { ascending: false })
          .limit(400),
        supabase.from(HOSPITAL_REP_TABLE).select('Link_ID, Hospital_ID, User_ID'),
        supabase.from(HOSPITALS_TABLE).select('Hospital_ID'),
      ]);

      setUiSettingsMeta({ updatedAt: uiSettingsResult?.data?.Updated_At || null });
      setBackupMeta({
        lastBackupAt: lastBackupResult?.data?.time || null,
        failedWeekCount: Number(failedBackupWeekResult?.count || 0),
      });
      setAuditMeta({
        todayCount: Number(auditTodayResult?.count || 0),
        weekCount: Number(auditWeekResult?.count || 0),
      });

      if (requestsResult.error) throw requestsResult.error;
      const requestRows = (requestsResult.data || []).filter((row) => shouldBeVisibleToSuperAdmin(row?.Status));
      const pendingDriveRows = requestRows.filter((row) => {
        const key = normalizeStatusKey(row?.Status);
        return key === 'pendingsuperadminapproval' || key === 'pendingadminapproval';
      });

      const driveIds = requestRows.map((row) => Number(row.Donation_Drive_ID || 0)).filter(Boolean);
      const organizationIds = Array.from(new Set(requestRows.map((row) => Number(row.Organization_ID || 0)).filter(Boolean)));

      let organizationsMap = {};
      if (organizationIds.length) {
        const namesResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .select('Organization_ID, Organization_Name')
          .in('Organization_ID', organizationIds);
        if (namesResult.error) throw namesResult.error;
        organizationsMap = (namesResult.data || []).reduce((acc, row) => {
          const id = Number(row.Organization_ID || 0);
          if (!id) return acc;
          acc[id] = String(row.Organization_Name || '').trim();
          return acc;
        }, {});
      }

      let groupsByDrive = {};
      if (driveIds.length) {
        const allowedGroupsResult = await supabase
          .from(DONATION_DRIVE_ALLOWED_GROUPS_TABLE)
          .select('Donation_Drive_ID, Organization_ID, Group_Name')
          .in('Donation_Drive_ID', driveIds);
        if (allowedGroupsResult.error) throw allowedGroupsResult.error;
        groupsByDrive = (allowedGroupsResult.data || []).reduce((acc, row) => {
          const driveId = Number(row.Donation_Drive_ID || 0);
          if (!driveId) return acc;
          const next = acc[driveId] || [];
          next.push({
            Donation_Drive_ID: driveId,
            Organization_ID: Number(row.Organization_ID || 0) || null,
            Group_Name: String(row.Group_Name || ''),
          });
          acc[driveId] = next;
          return acc;
        }, {});
      }

      const mappedDriveRows = requestRows.map((row) => {
        const driveId = Number(row.Donation_Drive_ID || 0) || 0;
        const organizationId = Number(row.Organization_ID || 0) || 0;
        const hostOrganizationName = organizationsMap[organizationId] || `Organization #${organizationId || 'N/A'}`;
        return {
          ...row,
          hostOrganizationName,
          scopeLabel: formatScopeLabel({
            isOpenForAll: row.Is_Open_For_All,
            hostOrganizationName,
            allowedGroups: groupsByDrive[driveId] || [],
          }),
          locationLabel: formatLocationLabel(row),
          dateLabel: formatDateRange(row.Start_Date, row.End_Date),
          statusMeta: mapStatusMeta(row.Status),
          timelineMeta: getDriveTimelineMeta(row),
        };
      });

      setAllDriveRows(mappedDriveRows);
      setDriveStats({
        pendingSuperAdmin: pendingDriveRows.length,
        approved: mappedDriveRows.filter((row) => normalizeStatusKey(row.Status) === 'approved').length,
        completed: mappedDriveRows.filter((row) => ['completed', 'done'].includes(normalizeStatusKey(row.Status))).length,
        total: mappedDriveRows.length,
      });

      const scheduledDriveRows = mappedDriveRows
        .filter((row) => normalizeStatusKey(row.Status) === 'approved')
        .filter((row) => row.timelineMeta.isUpcoming || row.timelineMeta.isToday || row.timelineMeta.timelineLabel === 'In Progress')
        .sort((a, b) => a.timelineMeta.sortMs - b.timelineMeta.sortMs);

      const setupBreakdown = Object.entries(
        scheduledDriveRows.reduce((acc, row) => {
          const key = formatSetupTypeLabel(row.Donation_Setup_Type);
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      )
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .slice(0, 2);

      const currentWindowStart = nowMs - (30 * 24 * 60 * 60 * 1000);
      const previousWindowStart = nowMs - (60 * 24 * 60 * 60 * 1000);
      let currentTrendTotal = 0;
      let previousTrendTotal = 0;

      mappedDriveRows.forEach((row) => {
        const updatedMs = toTimeMs(row.Updated_At);
        if (updatedMs === null) return;
        const statusKey = normalizeStatusKey(row.Status);
        if (!['approved', 'completed', 'done'].includes(statusKey)) return;
        const weight = Number(row.Total_Donations_Collected || 0) > 0 ? Number(row.Total_Donations_Collected || 0) : 1;
        if (updatedMs >= currentWindowStart) currentTrendTotal += weight;
        else if (updatedMs >= previousWindowStart) previousTrendTotal += weight;
      });

      const trendPercent = previousTrendTotal <= 0
        ? (currentTrendTotal > 0 ? 100 : 0)
        : ((currentTrendTotal - previousTrendTotal) / previousTrendTotal) * 100;

      setDriveInsights({
        upcomingCount: scheduledDriveRows.length,
        setupBreakdown,
        nextEventLabel: scheduledDriveRows[0]
          ? `Next: ${scheduledDriveRows[0].Event_Title || `Drive #${scheduledDriveRows[0].Donation_Drive_ID}`}`
          : 'No scheduled events',
        trendPercent,
        trendDirection: trendPercent > 0 ? 'up' : trendPercent < 0 ? 'down' : 'flat',
      });

      if (organizationsResult.error) throw organizationsResult.error;
      const orgRows = organizationsResult.data || [];
      const nextOrgStats = orgRows.reduce((acc, row) => {
        const bucket = normalizeOrgApprovalStatus(row?.Approval_Status);
        acc.total += 1;
        if (bucket === 'approved') acc.approved += 1;
        else if (bucket === 'rejected') acc.rejected += 1;
        else acc.pending += 1;
        return acc;
      }, { pending: 0, approved: 0, rejected: 0, total: 0 });
      setOrgStats(nextOrgStats);

      const pendingOrgRows = orgRows.filter((row) => normalizeOrgApprovalStatus(row?.Approval_Status) === 'pending');
      const orgOldestHours = pendingOrgRows.reduce((max, row) => {
        const ageHours = getAgeHours(row?.Updated_At || row?.Created_At);
        if (!Number.isFinite(ageHours)) return max;
        return max === null ? ageHours : Math.max(max, ageHours);
      }, null);
      const driveOldestHours = pendingDriveRows.reduce((max, row) => {
        const ageHours = getAgeHours(row?.Updated_At);
        if (!Number.isFinite(ageHours)) return max;
        return max === null ? ageHours : Math.max(max, ageHours);
      }, null);
      setApprovalAges({ orgOldestHours, driveOldestHours });

      if (usersResult.error) throw usersResult.error;
      const userRows = usersResult.data || [];
      const hospitalRepRoleKeys = new Set(['hospital', 'hstaff', 'hrepresentative']);
      const activeHospitalRepUserIds = new Set(
        userRows
          .filter((row) => row?.is_active && hospitalRepRoleKeys.has(normalizeStatusKey(row?.role)))
          .map((row) => Number(row.user_id || 0))
          .filter(Boolean),
      );
      const links = hospitalLinksResult?.error ? [] : (hospitalLinksResult?.data || []);
      const assignedHospitalRepUserIds = new Set(links.map((row) => Number(row.User_ID || 0)).filter(Boolean));
      const unassignedHospitalReps = Array.from(activeHospitalRepUserIds).filter((userId) => !assignedHospitalRepUserIds.has(userId));

      const nextUserStats = userRows.reduce((acc, row) => {
        acc.total += 1;
        if (!row?.is_active) acc.inactive += 1;
        const accessEndMs = toTimeMs(row?.access_end);
        if (row?.is_active && accessEndMs !== null && accessEndMs < nowMs) {
          acc.expiredAccess += 1;
        }
        return acc;
      }, {
        total: 0,
        inactive: 0,
        expiredAccess: 0,
        activeHospitalReps: activeHospitalRepUserIds.size,
        unassignedHospitalReps: unassignedHospitalReps.length,
        hospitalsTotal: Number((hospitalsResult?.data || []).length || 0),
      });
      setUserStats(nextUserStats);

      const urgent = [];
      pendingDriveRows.slice(0, 120).forEach((row) => {
        urgent.push({
          id: `drive:${row.Donation_Drive_ID}`,
          kind: 'Donation Drive Approval',
          title: row.Event_Title || `Donation Drive #${row.Donation_Drive_ID}`,
          updatedAt: row.Updated_At,
          ageHours: getAgeHours(row?.Updated_At),
          queuePageId: 'approve-donation-drives',
        });
      });
      orgRows
        .filter((row) => normalizeOrgApprovalStatus(row?.Approval_Status) === 'pending')
        .slice(0, 120)
        .forEach((row) => {
          const candidateTime = row?.Updated_At || row?.Created_At;
          urgent.push({
            id: `org:${row.Organization_ID}`,
            kind: 'Organization Application',
            title: row.Organization_Name || `Organization #${row.Organization_ID}`,
            updatedAt: candidateTime,
            ageHours: getAgeHours(candidateTime),
            queuePageId: 'manage-organization-applications',
          });
        });
      userRows
        .filter((row) => row?.is_active)
        .filter((row) => {
          const accessEndMs = toTimeMs(row?.access_end);
          return accessEndMs !== null && accessEndMs < nowMs;
        })
        .slice(0, 120)
        .forEach((row) => {
          urgent.push({
            id: `user-expired:${row.user_id}`,
            kind: 'Expired Access Window',
            title: row.email || `User #${row.user_id}`,
            updatedAt: row.access_end,
            ageHours: getAgeHours(row?.access_end),
            queuePageId: 'manage-user-accounts',
          });
        });

      const sortedUrgent = urgent
        .filter((item) => item.ageHours === null || item.ageHours >= URGENT_HOURS)
        .sort((a, b) => (b.ageHours || 0) - (a.ageHours || 0))
        .slice(0, 6);
      setUrgentItems(sortedUrgent);
    } catch (error) {
      setNotice({ kind: 'error', text: mapLoadError(error?.message) });
      setAllDriveRows([]);
      setDriveInsights(EMPTY_DRIVE_INSIGHTS);
      setUrgentItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    let isMounted = true;
    let refreshTimer = null;

    const scheduleRefresh = () => {
      if (!isMounted) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (isMounted) void loadDashboard();
      }, 180);
    };

    const channel = supabase
      .channel('public:super-admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: DONATION_DRIVE_REQUESTS_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: ORGANIZATIONS_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: USERS_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: HOSPITAL_REP_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: HOSPITALS_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: AUDIT_LOGS_TABLE }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: UI_SETTINGS_TABLE }, scheduleRefresh)
      .subscribe();

    return () => {
      isMounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  const quickActions = useMemo(() => ([
    { id: 'org', label: 'Organization Applications', value: orgStats.pending, pageId: 'manage-organization-applications' },
    { id: 'drive', label: 'Donation Drive Approvals', value: driveStats.pendingSuperAdmin, pageId: 'approve-donation-drives' },
    { id: 'users', label: 'User Accounts', value: userStats.inactive, pageId: 'manage-user-accounts' },
    { id: 'expired', label: 'Expired Access', value: userStats.expiredAccess, pageId: 'manage-user-accounts' },
    { id: 'hrep', label: 'H-Rep Assignments', value: userStats.unassignedHospitalReps, pageId: 'manage-hospital-accounts' },
    { id: 'backup', label: 'Backups', value: backupMeta.lastBackupAt ? 1 : 0, pageId: 'backup' },
  ]), [
    backupMeta.lastBackupAt,
    driveStats.pendingSuperAdmin,
    orgStats.pending,
    userStats.inactive,
    userStats.expiredAccess,
    userStats.unassignedHospitalReps,
  ]);

  const spotlightActionId = useMemo(() => {
    const top = quickActions
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)[0];
    return top?.id || 'expired';
  }, [quickActions]);

  const tableRows = useMemo(() => {
    const query = normalizeText(tableQuery);
    return allDriveRows
      .filter((row) => {
        const bucket = getStatusBucket(row?.Status);
        if (tableStatusFilter !== 'all' && bucket !== tableStatusFilter) {
          return false;
        }
        if (!query) {
          return true;
        }
        const haystack = [
          row?.Event_Title,
          row?.locationLabel,
          row?.hostOrganizationName,
          row?.dateLabel,
        ]
          .map((item) => normalizeText(item))
          .join(' ');
        return haystack.includes(query);
      })
      .sort((a, b) => {
        const left = toTimeMs(a?.Updated_At) || 0;
        const right = toTimeMs(b?.Updated_At) || 0;
        return right - left;
      })
      .slice(0, tableRowLimit);
  }, [allDriveRows, tableQuery, tableStatusFilter, tableRowLimit]);

  const graphSetupOptions = useMemo(() => {
    const labels = Array.from(
      new Set(
        allDriveRows
          .map((row) => formatSetupTypeLabel(row?.Donation_Setup_Type))
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return ['all', ...labels];
  }, [allDriveRows]);

  const graphTrend = useMemo(() => {
    const nowMs = Date.now();
    const currentStart = nowMs - (graphWindowDays * 24 * 60 * 60 * 1000);
    const previousStart = nowMs - (graphWindowDays * 2 * 24 * 60 * 60 * 1000);

    let currentTotal = 0;
    let previousTotal = 0;

    allDriveRows.forEach((row) => {
      const updatedMs = toTimeMs(row?.Updated_At);
      if (updatedMs === null) return;

      const statusKey = normalizeStatusKey(row?.Status);
      if (!['approved', 'completed', 'done'].includes(statusKey)) return;

      const setupLabel = formatSetupTypeLabel(row?.Donation_Setup_Type);
      if (graphSetupFilter !== 'all' && setupLabel !== graphSetupFilter) return;

      const metricValue = graphMetric === 'drives'
        ? 1
        : (Number(row?.Total_Donations_Collected || 0) > 0
            ? Number(row?.Total_Donations_Collected || 0)
            : 1);

      if (updatedMs >= currentStart) {
        currentTotal += metricValue;
        return;
      }
      if (updatedMs >= previousStart) {
        previousTotal += metricValue;
      }
    });

    const percent = previousTotal <= 0
      ? (currentTotal > 0 ? 100 : 0)
      : ((currentTotal - previousTotal) / previousTotal) * 100;

    const direction = percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat';
    return {
      percent,
      direction,
      label: `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}% ${direction === 'down' ? 'Drop' : 'Growth'}`,
    };
  }, [allDriveRows, graphMetric, graphSetupFilter, graphWindowDays]);

  const trendColor = graphTrend.direction === 'down' ? '#b91c1c' : primaryColor;
  const trendLabel = graphTrend.label;
  const cardPaddingClass = compactMode ? 'p-4' : 'p-5';

  const pageStyle = {
    color: primaryTextColor,
    fontFamily: `${bodyFont}, sans-serif`,
  };

  return (
    <div className="space-y-6" style={pageStyle}>
      <div className="space-y-5">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">See what needs action, what's happening, and what approvals are pending.</p>
        </div>

        {notice.text ? (
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.kind === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{notice.text}</span>
          </div>
        ) : null}

        {isLoading ? (
          <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-slate-500">
            <Loader2 size={14} className="animate-spin" /> Refreshing dashboard data
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => typeof onNavigate === 'function' && onNavigate(urgentItems[0]?.queuePageId || 'manage-user-accounts')}
            className={`rounded-xl border border-gray-200 bg-white text-left ${cardPaddingClass}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Action Needed</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{urgentItems.length}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white" style={{ color: primaryColor }}>
                <Bell size={13} />
              </div>
            </div>
            <p className="mt-5 text-xs" style={{ color: primaryColor }}>Over 24h old</p>
          </button>

          <button
            type="button"
            onClick={() => typeof onNavigate === 'function' && onNavigate('approve-donation-drives')}
            className={`rounded-xl border border-gray-200 bg-white text-left ${cardPaddingClass}`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Approvals Pending</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{orgStats.pending + driveStats.pendingSuperAdmin + userStats.unassignedHospitalReps}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-slate-50 text-slate-400">
                <ShieldCheck size={13} />
              </div>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center justify-between"><span className="text-slate-500">Donation Drives</span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{driveStats.pendingSuperAdmin}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">Organizations</span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{orgStats.pending}</span></div>
              <div className="flex items-center justify-between"><span className="text-slate-500">H-Representatives</span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{userStats.unassignedHospitalReps}</span></div>
            </div>
            <p className="mt-3 text-[10px] italic text-slate-400">Total pending review</p>
          </button>

          <button
            type="button"
            onClick={() => typeof onNavigate === 'function' && onNavigate('approve-donation-drives')}
            className={`rounded-xl border border-gray-200 bg-white text-left ${cardPaddingClass}`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Upcoming Events</p>
                <p className="mt-1 text-3xl font-bold text-slate-900">{driveInsights.upcomingCount}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-slate-50 text-slate-400">
                <CalendarClock size={13} />
              </div>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {(driveInsights.setupBreakdown.length > 0 ? driveInsights.setupBreakdown : [{ label: 'Scheduled', count: 0 }]).map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-slate-500">{item.label}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">{item.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 truncate text-[10px] text-slate-400">{driveInsights.nextEventLabel}</p>
          </button>

          <button
            type="button"
            onClick={() => typeof onNavigate === 'function' && onNavigate('manage-user-accounts')}
            className={`rounded-xl border border-gray-200 bg-white text-left ${cardPaddingClass}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Inactive Users</p>
                <p className="mt-1 text-3xl font-bold text-slate-400">{userStats.inactive}</p>
              </div>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-100 bg-slate-50 text-slate-400">
                <Users size={13} />
              </div>
            </div>
            <p className="mt-5 text-xs text-slate-500">Needs activation or setup</p>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <section className={`rounded-xl border border-gray-200 bg-white ${cardPaddingClass}`}>
              <div className="mb-5">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Action Center</p>
                <h3 className="text-xl font-bold text-slate-900">Needs your attention</h3>
                <p className="text-sm text-slate-500">Manage recent donation drive requests and waiting queues.</p>
              </div>

              <div className="mb-5 flex flex-wrap gap-2">
                {quickActions.map((item) => {
                  const spotlight = item.id === spotlightActionId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => typeof onNavigate === 'function' && onNavigate(item.pageId)}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${spotlight ? '' : 'border-gray-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                      style={spotlight
                        ? {
                            borderColor: `${primaryColor}33`,
                            backgroundColor: `${primaryColor}14`,
                            color: primaryColor,
                          }
                        : undefined}
                    >
                      {item.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${spotlight ? '' : 'bg-slate-100 text-slate-600'}`}
                        style={spotlight
                          ? {
                              border: `1px solid ${primaryColor}33`,
                              backgroundColor: '#ffffff',
                              color: primaryColor,
                            }
                          : undefined}
                      >
                        {item.value}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-4 border-b border-gray-100 pb-4">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Recent Drive Requests</p>
                <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                  <label className="relative">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={tableQuery}
                      onChange={(event) => setTableQuery(event.target.value)}
                      placeholder="Search event, location, organization..."
                      className="w-full rounded-md border border-gray-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-700 outline-none focus:border-slate-300"
                    />
                  </label>
                  <select
                    value={tableStatusFilter}
                    onChange={(event) => setTableStatusFilter(event.target.value)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                    <option value="completed">Completed</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <select
                    value={tableRowLimit}
                    onChange={(event) => setTableRowLimit(Number(event.target.value))}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none"
                  >
                    <option value={6}>6 rows</option>
                    <option value={10}>10 rows</option>
                    <option value={15}>15 rows</option>
                  </select>
                </div>
                {tableRows.length === 0 ? (
                  <div className="rounded-md border border-gray-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                    No donation drive requests matched your filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left">
                      <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                        <tr>
                          <th className="rounded-tl-lg border-b border-gray-200 px-4 py-2.5">Event Title</th>
                          <th className="border-b border-gray-200 px-4 py-2.5">Status</th>
                          <th className="border-b border-gray-200 px-4 py-2.5">Location</th>
                          <th className="border-b border-gray-200 px-4 py-2.5">Dates</th>
                          <th className="rounded-tr-lg border-b border-gray-200 px-4 py-2.5">Stats</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs text-slate-600">
                        {tableRows.map((row) => (
                          <tr key={row.Donation_Drive_ID}>
                            <td className="border-b border-gray-100 px-4 py-3 align-top">
                              <p className="font-medium text-slate-800">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</p>
                            </td>
                            <td className="border-b border-gray-100 px-4 py-3 align-top">
                              <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] ${row.statusMeta.className}`}>{row.statusMeta.label}</span>
                            </td>
                            <td className="border-b border-gray-100 px-4 py-3 align-top">{row.locationLabel}</td>
                            <td className="border-b border-gray-100 px-4 py-3 align-top">{row.dateLabel}</td>
                            <td className="border-b border-gray-100 px-4 py-3 align-top text-slate-400">
                              {Number(row.Total_Donations_Collected || 0) > 0 || Number(row.Total_Recipients || 0) > 0 ? (
                                <div className="flex flex-col text-[10px]">
                                  <span>Donations: {Number(row.Total_Donations_Collected || 0)}</span>
                                  <span>Recipients: {Number(row.Total_Recipients || 0)}</span>
                                </div>
                              ) : (
                                <span>&mdash;</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {!urgentItems.length ? (
                  <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <CheckCircle2 size={15} /> No urgent items right now.
                  </div>
                ) : (
                  urgentItems.map((item) => {
                    const badge = urgencyBadge(item.ageHours);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => typeof onNavigate === 'function' && onNavigate(item.queuePageId)}
                        className="flex w-full items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.kind}</p>
                          <p className="mb-2 truncate text-sm font-medium text-slate-900">{item.title}</p>
                          <div className="flex flex-wrap items-center gap-3">
                            <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>{badge.label}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Clock3 size={13} className="text-slate-400" /> {formatAgeLabel(item.ageHours)}</span>
                            <span className="text-[11px] text-slate-400">Updated: {formatDateTime(item.updatedAt)}</span>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                          Open queue <ArrowRight size={13} />
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4 lg:col-span-1">
            <section className={`rounded-xl border border-gray-200 bg-white ${compactMode ? 'p-3' : 'p-4'}`}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">System Pulse</p>
                  <h3 className="text-2xl font-bold leading-7 text-slate-900">What's<br />happening</h3>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowInstantSettings((previous) => !previous)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Settings size={12} /> Instant settings <ChevronDown size={12} />
                  </button>
                  {showInstantSettings ? (
                    <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setShowInstantSettings(false);
                          if (typeof onNavigate === 'function') onNavigate('settings');
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Full settings
                        <ArrowRight size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCompactMode((previous) => !previous);
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Compact cards
                        <span>{compactMode ? 'On' : 'Off'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTrendCard((previous) => !previous);
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Trend panel
                        <span>{showTrendCard ? 'On' : 'Off'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSnapshotCard((previous) => !previous);
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Snapshot panel
                        <span>{showSnapshotCard ? 'On' : 'Off'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowInstantSettings(false);
                          void loadDashboard();
                        }}
                        className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Refresh now
                        <RefreshCw size={12} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Upcoming Events</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{driveInsights.upcomingCount}</p>
                  <p className="mt-1 text-[10px] text-slate-500">{driveInsights.nextEventLabel}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Last Backup</p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-800">{backupMeta.lastBackupAt ? formatDateTime(backupMeta.lastBackupAt) : 'N/A'}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Failed (7d): {backupMeta.failedWeekCount}</p>
                  <button
                    type="button"
                    onClick={() => typeof onNavigate === 'function' && onNavigate('backup')}
                    className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white"
                  >
                    Backup <ArrowRight size={11} />
                  </button>
                </div>
              </div>

              {showTrendCard ? (
                <div className="rounded-lg border border-gray-100 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-end justify-between">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Donation Trends</p>
                      <p className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: trendColor }}>
                        <TrendingUp size={12} /> {trendLabel}
                      </p>
                    </div>
                    <span className="text-[9px] text-slate-400">Last {graphWindowDays} days</span>
                  </div>
                  <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <select
                      value={graphWindowDays}
                      onChange={(event) => setGraphWindowDays(Number(event.target.value))}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none"
                    >
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                    </select>
                    <select
                      value={graphMetric}
                      onChange={(event) => setGraphMetric(event.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none"
                    >
                      <option value="donations">By donations</option>
                      <option value="drives">By drives</option>
                    </select>
                    <select
                      value={graphSetupFilter}
                      onChange={(event) => setGraphSetupFilter(event.target.value)}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] text-slate-700 outline-none"
                    >
                      {graphSetupOptions.map((option) => (
                        <option key={option} value={option}>
                          {option === 'all' ? 'All setups' : option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="h-14 w-full">
                    <svg className="h-full w-full" preserveAspectRatio="none" viewBox="0 0 200 60">
                      <path d="M0 50 Q 25 45, 50 35 T 100 30 T 150 15 T 200 5" fill="none" stroke={trendColor} strokeLinecap="round" strokeWidth="2" />
                      <path d="M0 50 Q 25 45, 50 35 T 100 30 T 150 15 T 200 5 V 60 H 0 Z" fill="url(#dashboardGradientTrend)" opacity="0.1" />
                      <defs>
                        <linearGradient id="dashboardGradientTrend" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" style={{ stopColor: trendColor, stopOpacity: 1 }} />
                          <stop offset="100%" style={{ stopColor: trendColor, stopOpacity: 0 }} />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 border-t border-gray-100 pt-3">
                <div className="mb-2 flex items-center gap-1 text-xs font-semibold text-slate-700">
                  <SlidersHorizontal size={12} className="text-slate-400" /> UI Settings
                  <span className="ml-auto text-[10px] font-normal text-slate-400">Updated: {uiSettingsMeta.updatedAt ? formatDateTime(uiSettingsMeta.updatedAt) : 'N/A'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => typeof onNavigate === 'function' && onNavigate('settings')}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Design settings <ArrowRight size={12} />
                </button>
              </div>
            </section>

            {showSnapshotCard ? (
              <section className={`rounded-xl border border-gray-200 bg-white ${compactMode ? 'p-3' : 'p-4'}`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Snapshot</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-900">Key counts</h3>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="rounded-lg border border-gray-200 p-3">
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Organizations</p>
                      <p className="mt-1 text-3xl font-bold text-slate-900">{orgStats.total}</p>
                      <p className="text-[10px] text-slate-500">Approved: {orgStats.approved}</p>
                      <p className="text-[10px] text-slate-400">Pending: {orgStats.pending}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: primaryColor }}>Donation Drives</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{driveStats.total}</p>
                    <p className="text-[10px] text-slate-500">Approved: {driveStats.approved}</p>
                    <p className="text-[10px] text-slate-400">Pending SA: {driveStats.pendingSuperAdmin}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Users</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{userStats.total}</p>
                    <p className="text-[10px] text-slate-500">Inactive: {userStats.inactive}</p>
                    <p className="text-[10px] text-slate-500">Expired access: {userStats.expiredAccess}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">H-Representative Setup</p>
                    <p className="mt-1 text-3xl font-bold text-slate-400">{userStats.activeHospitalReps}</p>
                    <p className="text-[10px] text-slate-400">Unassigned: {userStats.unassignedHospitalReps}</p>
                    <p className="text-[10px] text-slate-500">Hospitals: {userStats.hospitalsTotal}</p>
                  </div>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-5">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Approvals Summary</p>
            <h3 className="text-2xl font-bold text-slate-900">Pending + oldest waiting</h3>
            <p className="text-sm text-slate-500">Manage recent donation drive requests and waiting queues.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => typeof onNavigate === 'function' && onNavigate('manage-organization-applications')}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4 text-left hover:bg-slate-50"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Organization Approvals</p>
                <p className="mt-1 text-3xl font-bold text-slate-400">{orgStats.pending}</p>
                <p className="text-[10px] text-slate-400">Oldest waiting: {approvalAges.orgOldestHours === null ? 'N/A' : formatAgeLabel(approvalAges.orgOldestHours)}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                Open <ArrowRight size={12} />
              </span>
            </button>

            <button
              type="button"
              onClick={() => typeof onNavigate === 'function' && onNavigate('approve-donation-drives')}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4 text-left hover:bg-slate-50"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Donation Drive Approvals</p>
                <p className="mt-1 text-3xl font-bold text-slate-400">{driveStats.pendingSuperAdmin}</p>
                <p className="text-[10px] text-slate-400">Oldest waiting: {approvalAges.driveOldestHours === null ? 'N/A' : formatAgeLabel(approvalAges.driveOldestHours)}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white">
                Open <ArrowRight size={12} />
              </span>
            </button>
          </div>
        </section>

        <div className="text-[11px] text-slate-500">
          Activity today: {auditMeta.todayCount} | Activity this week: {auditMeta.weekCount}
        </div>
      </div>
    </div>
  );
}
