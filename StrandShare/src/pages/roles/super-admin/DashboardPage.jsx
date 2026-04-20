import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Clock3,
  Database,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
  Workflow,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const cards = [
  { label: 'Total Accounts', value: '1,284', trend: '+4.2%', icon: Users },
  { label: 'Reports Generated', value: '86', trend: '+10.4%', icon: FileText },
  { label: 'Audit Events Today', value: '243', trend: '+1.8%', icon: ShieldCheck },
  { label: 'Backups Completed', value: '30', trend: '+0.7%', icon: BarChart3 },
];

const mockGovernancePipeline = [
  { name: 'Role Drift Detection', progress: 82, status: 'Healthy' },
  { name: 'Access Window Compliance', progress: 67, status: 'Review' },
  { name: 'MFA Coverage Expansion', progress: 74, status: 'Healthy' },
  { name: 'Retention Policy Validation', progress: 58, status: 'Attention' },
];

const mockActivityTimeline = [
  { time: '08:00', label: 'Scheduled backup validation', state: 'done' },
  { time: '10:15', label: 'Cross-region sync health check', state: 'done' },
  { time: '13:20', label: 'Privilege escalation review', state: 'pending' },
  { time: '16:40', label: 'Export compliance audit report', state: 'pending' },
];

const mockForecast = [35, 42, 48, 55, 57, 63, 68, 72, 77, 81, 86, 90];

const mockQueues = [
  { queue: 'User Access Reconcile', waiting: 18, eta: '12m' },
  { queue: 'Report Generation Batch', waiting: 9, eta: '5m' },
  { queue: 'Policy Drift Alerts', waiting: 4, eta: '2m' },
  { queue: 'Backup Integrity Scan', waiting: 6, eta: '8m' },
];

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function mapStatusMeta(statusValue) {
  const key = normalizeStatusKey(statusValue);

  if (key === 'approved') {
    return {
      label: 'Approved',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (key === 'rejected' || key === 'declined' || key === 'cancelled') {
    return {
      label: 'Rejected',
      className: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }

  if (key === 'pendingsuperadminapproval' || key === 'pendingadminapproval') {
    return {
      label: 'Pending Super Admin Approval',
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    };
  }

  return {
    label: 'Pending Staff Approval',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
  };
}

function toUniqueOrganizationNames(rows) {
  const names = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.Group_Name || '').trim())
    .filter(Boolean);

  return Array.from(new Set(names));
}

function formatScopeLabel({ isOpenForAll, hostOrganizationName, allowedGroups }) {
  if (Boolean(isOpenForAll)) {
    return 'Open to all organizations';
  }

  const groupNames = toUniqueOrganizationNames(allowedGroups);
  if (groupNames.length) {
    return `Specific organizations: ${groupNames.join(', ')}`;
  }

  return `Only ${hostOrganizationName || 'host organization'}`;
}

function formatDateTime(value) {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }

  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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

export default function SuperAdminOverviewPage() {
  const { theme } = useTheme();
  const [recentDriveRows, setRecentDriveRows] = useState([]);
  const [drivesNotice, setDrivesNotice] = useState('');
  const [isDrivesLoading, setIsDrivesLoading] = useState(false);

  const loadRecentDriveRows = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setDrivesNotice('Supabase is not configured. Recent donation drive scopes are unavailable.');
      setRecentDriveRows([]);
      return;
    }

    try {
      setIsDrivesLoading(true);
      setDrivesNotice('');

      const requestsResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select('Donation_Drive_ID, Organization_ID, Event_Title, Is_Open_For_All, Status, Updated_At')
        .order('Updated_At', { ascending: false })
        .limit(8);

      if (requestsResult.error) {
        throw requestsResult.error;
      }

      const requestRows = requestsResult.data || [];

      if (!requestRows.length) {
        setRecentDriveRows([]);
        return;
      }

      const driveIds = requestRows
        .map((row) => Number(row.Donation_Drive_ID || 0))
        .filter(Boolean);

      const organizationIds = Array.from(
        new Set(
          requestRows
            .map((row) => Number(row.Organization_ID || 0))
            .filter(Boolean),
        ),
      );

      let organizationsMap = {};
      if (organizationIds.length) {
        const organizationsResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .select('Organization_ID, Organization_Name')
          .in('Organization_ID', organizationIds);

        if (organizationsResult.error) {
          throw organizationsResult.error;
        }

        organizationsMap = (organizationsResult.data || []).reduce((accumulator, row) => {
          const organizationId = Number(row.Organization_ID || 0);
          if (!organizationId) {
            return accumulator;
          }

          accumulator[organizationId] = String(row.Organization_Name || '').trim();
          return accumulator;
        }, {});
      }

      let groupsByDrive = {};
      if (driveIds.length) {
        const allowedGroupsResult = await supabase
          .from(DONATION_DRIVE_ALLOWED_GROUPS_TABLE)
          .select('Donation_Drive_ID, Organization_ID, Group_Name')
          .in('Donation_Drive_ID', driveIds);

        if (allowedGroupsResult.error) {
          throw allowedGroupsResult.error;
        }

        groupsByDrive = (allowedGroupsResult.data || []).reduce((accumulator, row) => {
          const driveId = Number(row.Donation_Drive_ID || 0);
          if (!driveId) {
            return accumulator;
          }

          const nextRows = accumulator[driveId] || [];
          nextRows.push({
            Donation_Drive_ID: driveId,
            Organization_ID: Number(row.Organization_ID || 0) || null,
            Group_Name: String(row.Group_Name || ''),
          });

          accumulator[driveId] = nextRows;
          return accumulator;
        }, {});
      }

      const nextRows = requestRows.map((row) => {
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
        };
      });

      setRecentDriveRows(nextRows);
    } catch (error) {
      setDrivesNotice(mapLoadError(error?.message));
      setRecentDriveRows([]);
    } finally {
      setIsDrivesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentDriveRows();
  }, [loadRecentDriveRows]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Super Admin Overview</h2>
        <p className="text-gray-600 mt-1">Centralized control for accounts, reports, logs, and data protection.</p>
        <div className="mt-3 inline-flex items-center rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs font-semibold text-gray-500">
          Placeholder Visualization Mode
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl bg-white border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-600">{card.label}</p>
                <Icon size={18} style={{ color: theme.primaryColor }} />
              </div>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="mt-2 text-sm font-semibold text-emerald-600 inline-flex items-center gap-1">
                {card.trend}
                <ArrowUpRight size={14} />
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Workflow size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Governance Automation Pipeline</h3>
          </div>
          <div className="space-y-4">
            {mockGovernancePipeline.map((item) => (
              <div key={item.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700">{item.name}</span>
                  <span className="text-gray-500">{item.progress}% • {item.status}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${item.progress}%`, backgroundColor: theme.primaryColor }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock3 size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Ops Timeline</h3>
          </div>
          <div className="space-y-3">
            {mockActivityTimeline.map((event) => (
              <div key={event.time + event.label} className="flex items-start gap-3">
                <div
                  className="w-2.5 h-2.5 mt-1.5 rounded-full"
                  style={{ backgroundColor: event.state === 'done' ? '#10b981' : '#f59e0b' }}
                />
                <div>
                  <p className="text-xs text-gray-500">{event.time}</p>
                  <p className="text-sm text-gray-800">{event.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">90-Day H-Representative Capacity Forecast</h3>
          </div>
          <div className="h-40 flex items-end gap-2">
            {mockForecast.map((value, index) => (
              <div key={`forecast-${index}`} className="flex-1">
                <div
                  className="rounded-t-md"
                  style={{
                    height: `${value}%`,
                    background: `linear-gradient(180deg, ${theme.primaryColor} 0%, ${theme.primaryColor}88 100%)`,
                  }}
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Mock trend for future predictive analytics integration.
          </p>
        </section>

        <section className="rounded-xl bg-white border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database size={17} style={{ color: theme.primaryColor }} />
            <h3 className="font-bold text-gray-900">Processing Queues</h3>
          </div>
          <div className="space-y-3">
            {mockQueues.map((item) => (
              <div key={item.queue} className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-semibold text-gray-800">{item.queue}</p>
                <p className="text-xs text-gray-500 mt-1">
                  Waiting: {item.waiting} • ETA: {item.eta}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div>
            <h3 className="font-bold text-gray-900">Recent Donation Drive Scope Snapshot</h3>
            <p className="text-xs text-gray-500">
              Open-for-all and specific-organization scopes are resolved from Donation_Drive_Requests and Donation_Drive_Allowed_Groups.
            </p>
          </div>

          <button
            type="button"
            onClick={() => loadRecentDriveRows()}
            disabled={isDrivesLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {isDrivesLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        {drivesNotice && (
          <div className="mx-4 mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {drivesNotice}
          </div>
        )}

        {!recentDriveRows.length ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm text-gray-600">
            {isDrivesLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading recent donation drives...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                No recent donation drive requests found.
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Event</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Organization</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Scope</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentDriveRows.map((row) => {
                  const statusMeta = mapStatusMeta(row.Status);

                  return (
                    <tr key={row.Donation_Drive_ID} className="border-t border-gray-200">
                      <td className="px-4 py-3 text-gray-800">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</td>
                      <td className="px-4 py-3 text-gray-700">{row.hostOrganizationName}</td>
                      <td className="px-4 py-3 text-gray-700">{row.scopeLabel}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDateTime(row.Updated_At)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
