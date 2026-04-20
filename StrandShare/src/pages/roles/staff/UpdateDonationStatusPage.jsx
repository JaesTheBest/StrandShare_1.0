import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';
const DONATION_DRIVE_EVENT_ASSETS_BUCKET = 'donation_drive_event_assets';
const MAX_EVENT_ASSET_SIZE_BYTES = 15 * 1024 * 1024;

const STATUS = {
  pendingStaff: 'Pending Staff Approval',
  pendingSuperAdmin: 'Pending Super Admin Approval',
  approved: 'Approved',
  completed: 'Completed',
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

function toSafeFileName(fileName = '') {
  return String(fileName || 'event-asset')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 120);
}

function toSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load donation drive requests.');
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Viewing donation drive requests is blocked by database policy. Verify Staff access for Donation_Drive_Requests and Donation_Drive_Allowed_Groups.';
  }

  if (lower.includes('donation_drive_allowed_groups') && lower.includes('does not exist')) {
    return 'Donation_Drive_Allowed_Groups table is missing. Run migration 031_donation_drive_allowed_groups_policies.sql.';
  }

  if (lower.includes('donation_drive_requests') && lower.includes('does not exist')) {
    return 'Donation_Drive_Requests table is missing. Run migration 032_donation_drive_approval_completion_workflow.sql.';
  }

  return message;
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to update donation drive workflow.');
  const lower = message.toLowerCase();

  if (lower.includes('donation_drive_event_assets') && lower.includes('bucket')) {
    return 'Donation drive event assets bucket is missing. Run migration 033_donation_drive_event_assets_storage_policies.sql.';
  }

  if (lower.includes('row-level security')) {
    return 'Workflow update was blocked by database policy. Verify migration 032 and role policies.';
  }

  return message;
}

function validateCompletionFiles(files) {
  const list = Array.isArray(files) ? files : [];

  if (!list.length) {
    return 'Upload at least one completion attachment (image or PDF).';
  }

  const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  const allowedExtension = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

  for (const file of list) {
    const fileName = String(file?.name || '').toLowerCase();
    const matchesMime = allowedMime.has(String(file?.type || '').toLowerCase());
    const matchesExtension = allowedExtension.some((extension) => fileName.endsWith(extension));

    if (!matchesMime && !matchesExtension) {
      return 'Completion attachment must be JPG, PNG, WEBP, or PDF.';
    }

    if (Number(file?.size || 0) > MAX_EVENT_ASSET_SIZE_BYTES) {
      return `Each completion attachment must be ${formatFileSize(MAX_EVENT_ASSET_SIZE_BYTES)} or smaller.`;
    }
  }

  return '';
}

export default function UpdateDonationStatusPage({ userProfile }) {
  const [requests, setRequests] = useState([]);
  const [organizationNamesById, setOrganizationNamesById] = useState({});
  const [allowedGroupsByDriveId, setAllowedGroupsByDriveId] = useState({});
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [actionModal, setActionModal] = useState({
    open: false,
    mode: 'approve',
    row: null,
    reason: '',
  });
  const [completionModal, setCompletionModal] = useState({
    open: false,
    row: null,
    totalRecipients: '',
    totalDonations: '',
    notes: '',
    files: [],
  });

  const staffUserId = Number(userProfile?.user_id || 0) || null;

  const loadDonationDriveQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      setRequests([]);
      setOrganizationNamesById({});
      setAllowedGroupsByDriveId({});
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const requestsResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select(
          'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type, Assigned_Staff_User_ID, Status_Reason, Completion_Notes, Total_Recipients, Total_Donations_Collected, Completion_Attachments',
        )
        .order('Updated_At', { ascending: false })
        .limit(200);

      if (requestsResult.error) {
        throw requestsResult.error;
      }

      const requestRows = requestsResult.data || [];
      setRequests(requestRows);

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
    void loadDonationDriveQueue();
  }, [loadDonationDriveQueue]);

  const tableRows = useMemo(() => {
    return requests.map((row) => {
      const driveId = Number(row.Donation_Drive_ID || 0) || 0;
      const organizationId = Number(row.Organization_ID || 0) || 0;
      const hostOrganizationName = organizationNamesById[organizationId] || `Organization #${organizationId || 'N/A'}`;
      const normalizedStatus = normalizeStatusKey(row.Status);
      const isPendingStaff = normalizedStatus === 'pendingstaffapproval';
      const isApproved = normalizedStatus === 'approved';
      const isCompleted = normalizedStatus === 'completed' || normalizedStatus === 'done';
      const isAssignedToCurrentStaff = Number(row.Assigned_Staff_User_ID || 0) === Number(staffUserId || 0);
      const endDate = row.End_Date ? new Date(row.End_Date) : null;
      const isEndDatePassed = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= Date.now());

      return {
        ...row,
        scopeLabel: formatScopeLabel({
          isOpenForAll: row.Is_Open_For_All,
          hostOrganizationName,
          allowedGroups: allowedGroupsByDriveId[driveId] || [],
        }),
        hostOrganizationName,
        isPendingStaff,
        isApproved,
        isCompleted,
        isAssignedToCurrentStaff,
        canComplete: isApproved && isAssignedToCurrentStaff && isEndDatePassed,
      };
    });
  }, [allowedGroupsByDriveId, organizationNamesById, requests, staffUserId]);

  const stats = useMemo(() => {
    const pendingStaff = tableRows.filter((row) => row.isPendingStaff).length;
    const pendingSuperAdmin = tableRows.filter((row) => normalizeStatusKey(row.Status) === 'pendingsuperadminapproval').length;
    const completed = tableRows.filter((row) => row.isCompleted).length;
    const assignedToMe = tableRows.filter((row) => Number(row.Assigned_Staff_User_ID || 0) === Number(staffUserId || 0)).length;

    return [
      { label: 'Total Donation Drives', value: String(tableRows.length) },
      { label: 'Pending Staff Review', value: String(pendingStaff) },
      { label: 'Pending Super Admin Review', value: String(pendingSuperAdmin) },
      { label: 'Completed / Done', value: String(completed) },
      { label: 'Assigned To Me', value: String(assignedToMe) },
    ];
  }, [staffUserId, tableRows]);

  const openActionModal = (row, mode) => {
    setActionModal({
      open: true,
      mode,
      row,
      reason: '',
    });
  };

  const closeActionModal = () => {
    setActionModal({
      open: false,
      mode: 'approve',
      row: null,
      reason: '',
    });
  };

  const openCompletionModal = (row) => {
    setCompletionModal({
      open: true,
      row,
      totalRecipients: '',
      totalDonations: '',
      notes: '',
      files: [],
    });
  };

  const closeCompletionModal = () => {
    setCompletionModal({
      open: false,
      row: null,
      totalRecipients: '',
      totalDonations: '',
      notes: '',
      files: [],
    });
  };

  const handleStaffDecision = async () => {
    if (!actionModal.row?.Donation_Drive_ID) {
      return;
    }

    const isApprove = actionModal.mode === 'approve';
    const status = isApprove
      ? STATUS.pendingSuperAdmin
      : actionModal.mode === 'cancel'
        ? STATUS.cancelled
        : STATUS.rejected;

    const reason = String(actionModal.reason || '').trim();

    if (!isApprove && !reason) {
      setNotice({ kind: 'error', text: 'Reason is required for reject/cancel.' });
      return;
    }

    try {
      setIsSavingAction(true);
      setNotice({ kind: '', text: '' });

      const updatePayload = {
        Status: status,
        Status_Reason: reason || null,
      };

      const updateResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .update(updatePayload)
        .eq('Donation_Drive_ID', actionModal.row.Donation_Drive_ID)
        .eq('Status', STATUS.pendingStaff)
        .select('Donation_Drive_ID')
        .maybeSingle();

      if (updateResult.error) {
        throw updateResult.error;
      }

      if (!updateResult.data?.Donation_Drive_ID) {
        throw new Error('Donation drive is no longer pending staff approval. Refresh and try again.');
      }

      await logAuditAction({
        action: 'donation_drive_requests.staff_decision',
        description: `Staff ${actionModal.mode} donation drive #${actionModal.row.Donation_Drive_ID}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });

      setNotice({
        kind: 'success',
        text: isApprove
          ? 'Donation drive was approved by Staff and moved to Super Admin queue.'
          : `Donation drive was marked as ${status}.`,
      });

      closeActionModal();
      await loadDonationDriveQueue();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.staff_decision',
        description: `Failed staff ${actionModal.mode} decision for donation drive #${actionModal.row.Donation_Drive_ID}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSavingAction(false);
    }
  };

  const handleCompletionFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setCompletionModal((previous) => ({
      ...previous,
      files: nextFiles,
    }));
  };

  const handleSubmitCompletion = async () => {
    if (!completionModal.row?.Donation_Drive_ID) {
      return;
    }

    const recipients = Number(String(completionModal.totalRecipients || '').trim());
    const donations = Number(String(completionModal.totalDonations || '').trim());
    const notes = String(completionModal.notes || '').trim();

    if (!Number.isFinite(recipients) || recipients < 0) {
      setNotice({ kind: 'error', text: 'Total recipients must be a valid non-negative number.' });
      return;
    }

    if (!Number.isFinite(donations) || donations < 0) {
      setNotice({ kind: 'error', text: 'Total donations collected must be a valid non-negative number.' });
      return;
    }

    const fileError = validateCompletionFiles(completionModal.files);
    if (fileError) {
      setNotice({ kind: 'error', text: fileError });
      return;
    }

    try {
      setIsSavingAction(true);
      setNotice({ kind: '', text: '' });

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const authFolder = session?.user?.id;
      if (!authFolder) {
        throw new Error('Unable to resolve active staff auth session for event asset upload.');
      }

      const driveId = Number(completionModal.row.Donation_Drive_ID || 0);
      const driveSlug = toSlug(completionModal.row.Event_Title || `drive-${driveId}`);

      const uploadedFiles = [];

      for (const file of completionModal.files) {
        const safeFileName = toSafeFileName(file.name || 'asset');
        const filePath = `${authFolder}/donation-drive-event-assets/${driveSlug}-${driveId}-${Date.now()}-${safeFileName}`;

        const uploadResult = await supabase.storage
          .from(DONATION_DRIVE_EVENT_ASSETS_BUCKET)
          .upload(filePath, file, {
            upsert: false,
          });

        if (uploadResult.error) {
          throw uploadResult.error;
        }

        uploadedFiles.push({
          name: file.name,
          path: filePath,
          size: Number(file.size || 0),
          type: file.type || null,
          uploaded_at: new Date().toISOString(),
        });
      }

      const updatePayload = {
        Status: STATUS.completed,
        Total_Recipients: recipients,
        Total_Donations_Collected: donations,
        Completion_Notes: notes || null,
        Completion_Attachments: uploadedFiles,
      };

      const completionResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .update(updatePayload)
        .eq('Donation_Drive_ID', driveId)
        .eq('Status', STATUS.approved)
        .eq('Assigned_Staff_User_ID', staffUserId)
        .select('Donation_Drive_ID')
        .maybeSingle();

      if (completionResult.error) {
        throw completionResult.error;
      }

      if (!completionResult.data?.Donation_Drive_ID) {
        throw new Error('Completion failed because this drive is not eligible (must be Approved and assigned to you).');
      }

      await logAuditAction({
        action: 'donation_drive_requests.complete',
        description: `Completed donation drive #${driveId} with ${uploadedFiles.length} completion attachments.`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });

      setNotice({ kind: 'success', text: 'Donation drive marked as Completed with uploaded evidence and totals.' });
      closeCompletionModal();
      await loadDonationDriveQueue();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.complete',
        description: `Failed completion for donation drive #${completionModal.row?.Donation_Drive_ID || 'N/A'}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSavingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Update Donation Status</h1>
          <p className="text-slate-600">
            Staff reviews first, then Super Admin approval, then assigned staff can complete the event after end date with photos/documents and totals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDonationDriveQueue()}
          disabled={isLoading || isSavingAction}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Donation Drive Review Queue</h2>
          <p className="text-xs text-slate-500">Only Staff-approved requests become visible in Super Admin approval queue.</p>
        </div>

        {!tableRows.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading donation drive requests...
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Setup Type</th>
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
                      <td className="px-4 py-3 text-slate-700">{row.Donation_Setup_Type || 'Not set'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                        {row.Assigned_Staff_User_ID ? (
                          <p className="mt-1 text-[11px] text-slate-500">Assigned Staff User ID: {row.Assigned_Staff_User_ID}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.isPendingStaff ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'approve')}
                                disabled={isSavingAction}
                                className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                Staff Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'reject')}
                                disabled={isSavingAction}
                                className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'cancel')}
                                disabled={isSavingAction}
                                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </>
                          ) : row.canComplete ? (
                            <button
                              type="button"
                              onClick={() => openCompletionModal(row)}
                              disabled={isSavingAction}
                              className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                            >
                              Submit Completion Report
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">No staff action available</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {actionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                {actionModal.mode === 'approve'
                  ? 'Staff Approve Donation Drive'
                  : actionModal.mode === 'cancel'
                    ? 'Cancel Donation Drive'
                    : 'Reject Donation Drive'}
              </h3>
              <button
                type="button"
                onClick={closeActionModal}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                disabled={isSavingAction}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4 text-sm text-slate-700">
              <p>
                Event: <span className="font-semibold text-slate-900">{actionModal.row?.Event_Title || 'N/A'}</span>
              </p>
              <p>
                Scope: <span className="font-semibold text-slate-900">{actionModal.row?.scopeLabel || 'N/A'}</span>
              </p>

              {actionModal.mode !== 'approve' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Reason *</label>
                  <textarea
                    value={actionModal.reason}
                    onChange={(event) => setActionModal((prev) => ({ ...prev, reason: event.target.value }))}
                    className="min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="Provide required reason"
                    disabled={isSavingAction}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeActionModal}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={isSavingAction}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStaffDecision}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={isSavingAction}
              >
                {isSavingAction ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {completionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">Submit Completion Report</h3>
              <button
                type="button"
                onClick={closeCompletionModal}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                disabled={isSavingAction}
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <p className="text-sm text-slate-700">
                Event: <span className="font-semibold text-slate-900">{completionModal.row?.Event_Title || 'N/A'}</span>
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Total Recipients *</label>
                  <input
                    value={completionModal.totalRecipients}
                    onChange={(event) => setCompletionModal((prev) => ({ ...prev, totalRecipients: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="e.g. 120"
                    disabled={isSavingAction}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Total Donations Collected *</label>
                  <input
                    value={completionModal.totalDonations}
                    onChange={(event) => setCompletionModal((prev) => ({ ...prev, totalDonations: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="e.g. 85"
                    disabled={isSavingAction}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Completion Notes</label>
                <textarea
                  value={completionModal.notes}
                  onChange={(event) => setCompletionModal((prev) => ({ ...prev, notes: event.target.value }))}
                  className="min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  placeholder="Brief event outcome and highlights"
                  disabled={isSavingAction}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Event Attachments (JPG/PNG/WEBP/PDF) *</label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                  onChange={handleCompletionFileChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
                  disabled={isSavingAction}
                />
                <p className="mt-1 text-xs text-slate-500">
                  {completionModal.files.length
                    ? `${completionModal.files.length} file(s) selected`
                    : `Max file size: ${formatFileSize(MAX_EVENT_ASSET_SIZE_BYTES)} each.`}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={closeCompletionModal}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                disabled={isSavingAction}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSubmitCompletion}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={isSavingAction}
              >
                {isSavingAction ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Submit Completion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
