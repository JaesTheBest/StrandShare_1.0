import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';
const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';

const STATUS = {
  pendingSuperAdmin: 'Pending Super Admin Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
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

function formatDateRange(startDate, endDate) {
  const startLabel = formatDateTime(startDate);
  const endLabel = formatDateTime(endDate);

  if (!startDate && !endDate) {
    return 'No schedule set';
  }

  if (!startDate) {
    return `Until ${endLabel}`;
  }

  if (!endDate) {
    return `Starts ${startLabel}`;
  }

  return `${startLabel} to ${endLabel}`;
}

function mapStatusMeta(statusValue) {
  const key = normalizeStatusKey(statusValue);

  if (key === 'approved') {
    return {
      label: 'Approved',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    };
  }

  if (key === 'completed' || key === 'done') {
    return {
      label: 'Completed',
      className: 'border-teal-200 bg-teal-50 text-teal-800',
    };
  }

  if (key === 'rejected' || key === 'declined' || key === 'cancelled') {
    return {
      label: key === 'cancelled' ? 'Cancelled' : 'Rejected',
      className: 'border-rose-200 bg-rose-50 text-rose-800',
    };
  }

  if (key === 'pendingstaffapproval') {
    return {
      label: 'Pending Staff Approval',
      className: 'border-blue-200 bg-blue-50 text-blue-800',
    };
  }

  return {
    label: 'Pending Super Admin Approval',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
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

function getStaffDisplayName(staff) {
  if (!staff) {
    return '';
  }

  const name = [staff.first_name, staff.last_name]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  if (name) {
    return `${name} (${staff.email || `User #${staff.user_id}`})`;
  }

  return staff.email || `User #${staff.user_id}`;
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load super admin donation drive queue.');
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Viewing super admin donation drive queue is blocked by database policy. Verify Donation_Drive_Requests read permissions.';
  }

  if (lower.includes('donation_drive_requests') && lower.includes('does not exist')) {
    return 'Donation_Drive_Requests table is missing. Run migration 032_donation_drive_approval_completion_workflow.sql.';
  }

  return message;
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to apply super admin decision.');
  const lower = message.toLowerCase();

  if (lower.includes('assigned staff is required')) {
    return 'Assigned staff is required before final approval.';
  }

  if (lower.includes('row-level security')) {
    return 'Super admin decision was blocked by database policy. Verify migration 032 policies and trigger.';
  }

  return message;
}

export default function ApproveDonationDrivesPage({ userProfile }) {
  const [requests, setRequests] = useState([]);
  const [organizationNamesById, setOrganizationNamesById] = useState({});
  const [allowedGroupsByDriveId, setAllowedGroupsByDriveId] = useState({});
  const [staffOptions, setStaffOptions] = useState([]);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [decisionModal, setDecisionModal] = useState({
    open: false,
    mode: 'approve',
    row: null,
    reason: '',
    assignedStaffUserId: '',
  });

  const loadPageData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      setRequests([]);
      setOrganizationNamesById({});
      setAllowedGroupsByDriveId({});
      setStaffOptions([]);
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const [requestsResult, staffResult] = await Promise.all([
        supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .select(
            'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type, Assigned_Staff_User_ID, Status_Reason',
          )
          .order('Updated_At', { ascending: false })
          .limit(300),
        supabase
          .from(USERS_TABLE)
          .select('user_id, email, role')
          .in('role', ['Staff', 'staff'])
          .eq('is_active', true),
      ]);

      if (requestsResult.error) {
        throw requestsResult.error;
      }

      if (staffResult.error) {
        throw staffResult.error;
      }

      const requestRows = requestsResult.data || [];
      setRequests(requestRows);

      const staffRows = staffResult.data || [];
      if (staffRows.length) {
        const staffUserIds = staffRows
          .map((row) => Number(row.user_id || 0))
          .filter(Boolean);

        let detailsByUserId = {};

        if (staffUserIds.length) {
          const detailsResult = await supabase
            .from(USER_DETAILS_TABLE)
            .select('user_id, first_name, last_name')
            .in('user_id', staffUserIds);

          if (detailsResult.error) {
            throw detailsResult.error;
          }

          detailsByUserId = (detailsResult.data || []).reduce((accumulator, row) => {
            const userId = Number(row.user_id || 0);
            if (!userId) {
              return accumulator;
            }

            accumulator[userId] = {
              first_name: String(row.first_name || ''),
              last_name: String(row.last_name || ''),
            };

            return accumulator;
          }, {});
        }

        setStaffOptions(
          staffRows
            .map((row) => {
              const userId = Number(row.user_id || 0);
              if (!userId) {
                return null;
              }

              return {
                user_id: userId,
                email: String(row.email || ''),
                first_name: detailsByUserId[userId]?.first_name || '',
                last_name: detailsByUserId[userId]?.last_name || '',
              };
            })
            .filter(Boolean)
            .sort((a, b) => getStaffDisplayName(a).localeCompare(getStaffDisplayName(b))),
        );
      } else {
        setStaffOptions([]);
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

      if (organizationIds.length) {
        const organizationsResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .select('Organization_ID, Organization_Name')
          .in('Organization_ID', organizationIds);

        if (organizationsResult.error) {
          throw organizationsResult.error;
        }

        const orgNameMap = (organizationsResult.data || []).reduce((accumulator, row) => {
          const organizationId = Number(row.Organization_ID || 0);
          if (!organizationId) {
            return accumulator;
          }

          accumulator[organizationId] = String(row.Organization_Name || '').trim();
          return accumulator;
        }, {});

        setOrganizationNamesById(orgNameMap);
      } else {
        setOrganizationNamesById({});
      }

      if (driveIds.length) {
        const allowedGroupsResult = await supabase
          .from(DONATION_DRIVE_ALLOWED_GROUPS_TABLE)
          .select('Donation_Drive_ID, Organization_ID, Group_Name')
          .in('Donation_Drive_ID', driveIds);

        if (allowedGroupsResult.error) {
          throw allowedGroupsResult.error;
        }

        const mappedGroups = (allowedGroupsResult.data || []).reduce((accumulator, row) => {
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

        setAllowedGroupsByDriveId(mappedGroups);
      } else {
        setAllowedGroupsByDriveId({});
      }
    } catch (error) {
      setNotice({ kind: 'error', text: mapLoadError(error?.message) });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const tableRows = useMemo(() => {
    return requests.map((row) => {
      const driveId = Number(row.Donation_Drive_ID || 0) || 0;
      const organizationId = Number(row.Organization_ID || 0) || 0;
      const statusKey = normalizeStatusKey(row.Status);

      const hostOrganizationName = organizationNamesById[organizationId] || `Organization #${organizationId || 'N/A'}`;
      const assignedStaffUserId = Number(row.Assigned_Staff_User_ID || 0) || null;
      const assignedStaff = staffOptions.find((option) => option.user_id === assignedStaffUserId) || null;

      return {
        ...row,
        statusKey,
        scopeLabel: formatScopeLabel({
          isOpenForAll: row.Is_Open_For_All,
          hostOrganizationName,
          allowedGroups: allowedGroupsByDriveId[driveId] || [],
        }),
        hostOrganizationName,
        assignedStaff,
        assignedStaffLabel: assignedStaff ? getStaffDisplayName(assignedStaff) : 'Not assigned',
        isPendingSuperAdmin: statusKey === 'pendingsuperadminapproval' || statusKey === 'pendingadminapproval',
      };
    });
  }, [allowedGroupsByDriveId, organizationNamesById, requests, staffOptions]);

  const stats = useMemo(() => {
    const pendingSuperAdmin = tableRows.filter((row) => row.isPendingSuperAdmin).length;
    const approved = tableRows.filter((row) => normalizeStatusKey(row.Status) === 'approved').length;
    const completed = tableRows.filter((row) => ['completed', 'done'].includes(normalizeStatusKey(row.Status))).length;

    return [
      { label: 'Pending Super Admin', value: String(pendingSuperAdmin) },
      { label: 'Approved', value: String(approved) },
      { label: 'Completed', value: String(completed) },
      { label: 'Active Staff Options', value: String(staffOptions.length) },
    ];
  }, [staffOptions.length, tableRows]);

  const openDecisionModal = (row, mode) => {
    setDecisionModal({
      open: true,
      mode,
      row,
      reason: '',
      assignedStaffUserId: row?.Assigned_Staff_User_ID ? String(row.Assigned_Staff_User_ID) : '',
    });
  };

  const closeDecisionModal = () => {
    setDecisionModal({
      open: false,
      mode: 'approve',
      row: null,
      reason: '',
      assignedStaffUserId: '',
    });
  };

  const handleDecision = async () => {
    if (!decisionModal.row?.Donation_Drive_ID) {
      return;
    }

    const isApprove = decisionModal.mode === 'approve';
    const isCancel = decisionModal.mode === 'cancel';

    const nextStatus = isApprove
      ? STATUS.approved
      : isCancel
        ? STATUS.cancelled
        : STATUS.rejected;

    const reason = String(decisionModal.reason || '').trim();
    const assignedStaffUserId = Number(decisionModal.assignedStaffUserId || 0) || null;

    if (!isApprove && !reason) {
      setNotice({ kind: 'error', text: 'Reason is required for reject/cancel decisions.' });
      return;
    }

    if (isApprove && !assignedStaffUserId) {
      setNotice({ kind: 'error', text: 'Assigned staff is required before final approval.' });
      return;
    }

    try {
      setIsSaving(true);
      setNotice({ kind: '', text: '' });

      const updatePayload = {
        Status: nextStatus,
        Assigned_Staff_User_ID: isApprove ? assignedStaffUserId : decisionModal.row.Assigned_Staff_User_ID || null,
        Status_Reason: reason || null,
      };

      const updateResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .update(updatePayload)
        .eq('Donation_Drive_ID', decisionModal.row.Donation_Drive_ID)
        .eq('Status', STATUS.pendingSuperAdmin)
        .select('Donation_Drive_ID')
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }

      if (!updateResult.data?.Donation_Drive_ID) {
        throw new Error('Donation drive is no longer pending super admin approval. Refresh and try again.');
      }

      await logAuditAction({
        action: 'donation_drive_requests.super_admin_decision',
        description: `Super Admin ${decisionModal.mode} donation drive #${decisionModal.row.Donation_Drive_ID}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });

      setNotice({
        kind: 'success',
        text: isApprove
          ? 'Donation drive approved and assigned to staff. It is now eligible for event visibility.'
          : `Donation drive was marked as ${nextStatus}.`,
      });

      closeDecisionModal();
      await loadPageData();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.super_admin_decision',
        description: `Failed super admin ${decisionModal.mode} decision for donation drive #${decisionModal.row.Donation_Drive_ID}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Approve Donation Drives</h1>
          <p className="text-slate-600">
            Only Staff-approved requests appear here. Final approval requires assigning a staff-in-charge for the event.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadPageData()}
          disabled={isLoading || isSaving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh Queue
        </button>
      </div>

      {notice.text && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            notice.kind === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : notice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Super Admin Donation Drive Queue</h2>
          <p className="text-xs text-slate-500">This queue should only contain records in Pending Super Admin Approval state.</p>
        </div>

        {!tableRows.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading donation drive queue...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                No donation drive requests found.
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Drive</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Organization</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Schedule</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Scope</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Assigned Staff</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const statusMeta = mapStatusMeta(row.Status);

                  return (
                    <tr key={row.Donation_Drive_ID} className="border-t border-slate-200 align-top">
                      <td className="px-4 py-3 text-slate-800">
                        <p className="font-semibold text-slate-900">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.Event_Overview || 'No event overview provided.'}</p>
                        <p className="mt-1 text-xs text-slate-500">Updated: {formatDateTime(row.Updated_At)}</p>
                        {row.Status_Reason && (
                          <p className="mt-1 text-xs text-rose-700">Reason: {row.Status_Reason}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.hostOrganizationName}</td>
                      <td className="px-4 py-3 text-slate-700">{formatDateRange(row.Start_Date, row.End_Date)}</td>
                      <td className="px-4 py-3 text-slate-700">{row.scopeLabel}</td>
                      <td className="px-4 py-3 text-slate-700">{row.assignedStaffLabel}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {row.isPendingSuperAdmin ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openDecisionModal(row, 'approve')}
                              disabled={isSaving}
                              className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                            >
                              Approve + Assign Staff
                            </button>
                            <button
                              type="button"
                              onClick={() => openDecisionModal(row, 'reject')}
                              disabled={isSaving}
                              className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => openDecisionModal(row, 'cancel')}
                              disabled={isSaving}
                              className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No action needed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {decisionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                {decisionModal.mode === 'approve'
                  ? 'Approve Donation Drive and Assign Staff'
                  : decisionModal.mode === 'cancel'
                    ? 'Cancel Donation Drive'
                    : 'Reject Donation Drive'}
              </h3>
              <button
                type="button"
                onClick={closeDecisionModal}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                disabled={isSaving}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
              <p>
                Event: <span className="font-semibold text-slate-900">{decisionModal.row?.Event_Title || 'N/A'}</span>
              </p>

              {decisionModal.mode === 'approve' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Assign Staff In Charge *</label>
                  <select
                    value={decisionModal.assignedStaffUserId}
                    onChange={(event) => setDecisionModal((prev) => ({ ...prev, assignedStaffUserId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    disabled={isSaving}
                  >
                    <option value="">Select staff</option>
                    {staffOptions.map((staff) => (
                      <option key={staff.user_id} value={staff.user_id}>{getStaffDisplayName(staff)}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason *</label>
                  <textarea
                    value={decisionModal.reason}
                    onChange={(event) => setDecisionModal((prev) => ({ ...prev, reason: event.target.value }))}
                    className="min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="Provide required reason"
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeDecisionModal}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={isSaving}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleDecision}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5" />
          <p>
            Final approval happens only here after Staff approval, and requires staff assignment before the drive becomes Approved.
          </p>
        </div>
      </div>
    </div>
  );
}
