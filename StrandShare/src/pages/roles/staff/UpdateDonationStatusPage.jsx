import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Download, Filter, Info, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';
const DONATION_DRIVE_PROPOSALS_BUCKET = 'donation_drive_proposals';
const DONATION_DRIVE_EVENT_ASSETS_BUCKET = 'donation_drive_event_assets';
const STORAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;
const LEGACY_BUCKET_ID_MAP = {
  'donation-drive-proposals': DONATION_DRIVE_PROPOSALS_BUCKET,
  'donation-drive-event-assets': DONATION_DRIVE_EVENT_ASSETS_BUCKET,
};

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
    timeZone: 'Asia/Manila',
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

function toAttachmentAccessKey(bucketId, path) {
  return `${String(bucketId || '').trim()}::${String(path || '').trim()}`;
}

function toAttachmentFileName(pathOrUrl, fallback = 'attachment') {
  const raw = String(pathOrUrl || '').trim();
  if (!raw) {
    return fallback;
  }

  const withoutQuery = raw.split('?')[0];
  const parts = withoutQuery.split('/').filter(Boolean);
  return parts[parts.length - 1] || fallback;
}

function isPdfLike(pathOrUrl) {
  return /\.pdf(?:$|[?#])/i.test(String(pathOrUrl || '').trim());
}

function isImageLike(pathOrUrl) {
  return /\.(?:png|jpe?g|webp|gif|bmp|svg)(?:$|[?#])/i.test(String(pathOrUrl || '').trim());
}

function toCanonicalDonationBucketId(bucketId, fallbackBucketId = '') {
  const rawBucketId = String(bucketId || '').trim();
  if (!rawBucketId) {
    return String(fallbackBucketId || '').trim();
  }

  const mappedBucketId = LEGACY_BUCKET_ID_MAP[rawBucketId.toLowerCase()];
  return mappedBucketId || rawBucketId;
}

function extractSupabaseStorageTarget(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!/^https?:\/\//i.test(raw)) {
    return null;
  }

  try {
    const parsed = new URL(raw);

    const bucketAndPathMatch =
      parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i)
      || parsed.pathname.match(/\/storage\/v1\/object\/([^/]+)\/(.+)$/i);

    if (!bucketAndPathMatch) {
      return null;
    }

    const parsedBucketId = decodeURIComponent(String(bucketAndPathMatch[1] || '').trim());
    const parsedPath = decodeURIComponent(String(bucketAndPathMatch[2] || '').trim());

    if (!parsedPath) {
      return null;
    }

    return {
      bucketId: parsedBucketId,
      path: parsedPath,
    };
  } catch (error) {
    return null;
  }
}

function resolveStorageTarget(bucketName, storagePath) {
  const defaultBucketId = toCanonicalDonationBucketId(bucketName);
  const rawPath = String(storagePath || '').trim();

  if (!rawPath) {
    return {
      bucketId: defaultBucketId,
      path: '',
      externalUrl: '',
    };
  }

  const parsedStorageTarget = extractSupabaseStorageTarget(rawPath);
  if (parsedStorageTarget) {
    return {
      bucketId: toCanonicalDonationBucketId(parsedStorageTarget.bucketId, defaultBucketId),
      path: parsedStorageTarget.path,
      externalUrl: '',
    };
  }

  if (/^https?:\/\//i.test(rawPath)) {
    return {
      bucketId: defaultBucketId,
      path: '',
      externalUrl: rawPath,
    };
  }

  return {
    bucketId: defaultBucketId,
    path: rawPath,
    externalUrl: '',
  };
}

async function resolveStorageAccessUrl(bucketName, storagePath) {
  const resolvedTarget = resolveStorageTarget(bucketName, storagePath);

  if (resolvedTarget.externalUrl) {
    return resolvedTarget.externalUrl;
  }

  if (!resolvedTarget.path) {
    return '';
  }

  if (!supabase || !resolvedTarget.bucketId) {
    return '';
  }

  const signedResult = await supabase.storage
    .from(resolvedTarget.bucketId)
    .createSignedUrl(resolvedTarget.path, STORAGE_SIGNED_URL_TTL_SECONDS);

  if (!signedResult.error && signedResult.data?.signedUrl) {
    return signedResult.data.signedUrl;
  }

  const { data } = supabase.storage.from(resolvedTarget.bucketId).getPublicUrl(resolvedTarget.path);
  return data?.publicUrl || '';
}

function toCompletionAttachmentRows(value) {
  if (!value) {
    return [];
  }

  const rows = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value);
          } catch (error) {
            return [];
          }
        })()
      : [];

  return rows
    .map((row) => {
      const rawBucketId = String(row?.bucket_id || '').trim();
      const bucketId = toCanonicalDonationBucketId(rawBucketId, DONATION_DRIVE_EVENT_ASSETS_BUCKET);
      const rawPath = String(row?.path || '').trim();
      const resolvedTarget = resolveStorageTarget(bucketId, rawPath);
      const path = resolvedTarget.path || rawPath;

      return {
        name: String(row?.name || 'Attachment').trim() || 'Attachment',
        path,
        bucketId,
        type: String(row?.type || '').trim(),
        size: Number(row?.size || 0) || 0,
        uploadedAt: String(row?.uploaded_at || '').trim(),
        url: resolvedTarget.externalUrl || '',
      };
    })
    .filter((row) => row.path);
}

function formatAddress(row) {
  return [row?.Street, row?.Barangay, row?.City, row?.Province, row?.Region, row?.Country]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function toDateStamp(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
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

  if (lower.includes('row-level security')) {
    return 'Workflow update was blocked by database policy. Verify migration 032 and role policies.';
  }

  return message;
}

export default function UpdateDonationStatusPage({ userProfile }) {
  const [requests, setRequests] = useState([]);
  const [organizationNamesById, setOrganizationNamesById] = useState({});
  const [allowedGroupsByDriveId, setAllowedGroupsByDriveId] = useState({});
  const [detailsRow, setDetailsRow] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingAction, setIsSavingAction] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [organizationFilter, setOrganizationFilter] = useState('all');
  const [setupTypeFilter, setSetupTypeFilter] = useState('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [detailsProposalAccessUrl, setDetailsProposalAccessUrl] = useState('');
  const [detailsAttachmentAccessUrls, setDetailsAttachmentAccessUrls] = useState({});
  const [isResolvingProofLinks, setIsResolvingProofLinks] = useState(false);
  const [actionModal, setActionModal] = useState({
    open: false,
    mode: 'approve',
    row: null,
    reason: '',
  });

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

      const selectColumnsWithBucket = 'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Proposal_Attachment_Bucket, Is_Open_For_All, Status, Updated_At, Created_At, Donation_Setup_Type, Assigned_Staff_User_ID, Status_Reason, Street, Barangay, City, Province, Region, Country, Latitude, Longitude, Staff_Reviewed_By, Staff_Reviewed_At, Super_Admin_Reviewed_By, Super_Admin_Reviewed_At, Completion_Notes, Total_Recipients, Total_Donations_Collected, Completion_Attachments';
      const selectColumnsLegacy = 'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Created_At, Donation_Setup_Type, Assigned_Staff_User_ID, Status_Reason, Street, Barangay, City, Province, Region, Country, Latitude, Longitude, Staff_Reviewed_By, Staff_Reviewed_At, Super_Admin_Reviewed_By, Super_Admin_Reviewed_At, Completion_Notes, Total_Recipients, Total_Donations_Collected, Completion_Attachments';

      let requestsResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select(selectColumnsWithBucket)
        .order('Updated_At', { ascending: false })
        .limit(200);

      if (requestsResult.error && String(requestsResult.error.message || '').toLowerCase().includes('proposal_attachment_bucket')) {
        requestsResult = await supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .select(selectColumnsLegacy)
          .order('Updated_At', { ascending: false })
          .limit(200);
      }

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
      const isCompleted = normalizedStatus === 'completed' || normalizedStatus === 'done';
      const completionAttachments = toCompletionAttachmentRows(row.Completion_Attachments);
      const rawProposalBucketId = String(row.Proposal_Attachment_Bucket || '').trim();
      const proposalBucketId = toCanonicalDonationBucketId(rawProposalBucketId, DONATION_DRIVE_PROPOSALS_BUCKET);
      const proposalAttachmentTarget = resolveStorageTarget(proposalBucketId, row.Proposal_Attachment);
      const proposalAttachmentPath = proposalAttachmentTarget.path || String(row.Proposal_Attachment || '').trim();
      const proposalProofUrl = proposalAttachmentTarget.externalUrl || '';

      return {
        ...row,
        statusKey: normalizedStatus,
        scopeLabel: formatScopeLabel({
          isOpenForAll: row.Is_Open_For_All,
          hostOrganizationName,
          allowedGroups: allowedGroupsByDriveId[driveId] || [],
        }),
        hostOrganizationName,
        addressLabel: formatAddress(row),
        proposalBucketId,
        proposalAttachmentPath,
        proposalProofUrl,
        completionAttachments,
        hasLocation: row.Latitude !== null && row.Latitude !== undefined && row.Longitude !== null && row.Longitude !== undefined,
        isPendingStaff,
        isCompleted,
      };
    });
  }, [allowedGroupsByDriveId, organizationNamesById, requests]);

  useEffect(() => {
    let isCancelled = false;

    const resolveDetailsProofLinks = async () => {
      if (!detailsRow) {
        setDetailsProposalAccessUrl('');
        setDetailsAttachmentAccessUrls({});
        setIsResolvingProofLinks(false);
        return;
      }

      setIsResolvingProofLinks(true);

      try {
        const proposalUrl = await resolveStorageAccessUrl(
          detailsRow.proposalBucketId,
          detailsRow.proposalAttachmentPath || detailsRow.Proposal_Attachment,
        );

        const attachmentEntries = await Promise.all(
          (detailsRow.completionAttachments || []).map(async (attachment) => {
            const key = toAttachmentAccessKey(attachment.bucketId, attachment.path);
            const url = await resolveStorageAccessUrl(attachment.bucketId, attachment.path);
            return [key, url];
          }),
        );

        if (isCancelled) {
          return;
        }

        setDetailsProposalAccessUrl(proposalUrl || detailsRow.proposalProofUrl || '');
        setDetailsAttachmentAccessUrls(
          Object.fromEntries(attachmentEntries.filter((entry) => Boolean(entry[1]))),
        );
      } finally {
        if (!isCancelled) {
          setIsResolvingProofLinks(false);
        }
      }
    };

    void resolveDetailsProofLinks();

    return () => {
      isCancelled = true;
    };
  }, [detailsRow]);

  const stats = useMemo(() => {
    const pendingStaff = tableRows.filter((row) => row.isPendingStaff).length;
    const pendingSuperAdmin = tableRows.filter((row) => normalizeStatusKey(row.Status) === 'pendingsuperadminapproval').length;
    const completed = tableRows.filter((row) => row.isCompleted).length;

    return [
      { label: 'Total Donation Drives', value: String(tableRows.length) },
      { label: 'Pending Staff Review', value: String(pendingStaff) },
      { label: 'Pending Super Admin Review', value: String(pendingSuperAdmin) },
      { label: 'Completed / Done', value: String(completed) },
    ];
  }, [tableRows]);

  const organizationFilterOptions = useMemo(() => {
    const options = tableRows
      .map((row) => ({
        value: String(row.Organization_ID || ''),
        label: row.hostOrganizationName,
      }))
      .filter((row) => row.value && row.label);

    const uniqueOptions = Array.from(new Map(options.map((row) => [row.value, row])).values());
    return [{ value: 'all', label: 'All Organizations' }, ...uniqueOptions];
  }, [tableRows]);

  const setupTypeFilterOptions = useMemo(() => {
    const options = tableRows
      .map((row) => String(row.Donation_Setup_Type || '').trim())
      .filter(Boolean);
    const uniqueOptions = Array.from(new Set(options));
    return ['all', ...uniqueOptions];
  }, [tableRows]);

  const filteredRows = useMemo(() => {
    const fromStamp = toDateStamp(dateFromFilter);
    const toStamp = toDateStamp(dateToFilter);

    return tableRows.filter((row) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'pendingsuperadminapproval') {
          if (!['pendingsuperadminapproval', 'pendingadminapproval'].includes(row.statusKey)) {
            return false;
          }
        } else if (statusFilter === 'completed') {
          if (!['completed', 'done'].includes(row.statusKey)) {
            return false;
          }
        } else if (statusFilter === 'rejected') {
          if (!['rejected', 'declined'].includes(row.statusKey)) {
            return false;
          }
        } else if (row.statusKey !== statusFilter) {
          return false;
        }
      }

      if (organizationFilter !== 'all' && String(row.Organization_ID || '') !== organizationFilter) {
        return false;
      }

      const setupTypeValue = String(row.Donation_Setup_Type || '').trim();
      if (setupTypeFilter !== 'all' && setupTypeValue !== setupTypeFilter) {
        return false;
      }

      if (fromStamp !== null || toStamp !== null) {
        const rowStamp = toDateStamp(row.Start_Date);
        if (rowStamp === null) {
          return false;
        }

        if (fromStamp !== null && rowStamp < fromStamp) {
          return false;
        }

        if (toStamp !== null && rowStamp > toStamp) {
          return false;
        }
      }

      return true;
    });
  }, [dateFromFilter, dateToFilter, organizationFilter, setupTypeFilter, statusFilter, tableRows]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Review Donation Drive</h1>
          <p className="text-slate-600">
            Review requests, check proofs and details, then approve, reject, or cancel with complete context.
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter size={14} />
          Filters
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800 focus:border-slate-400 focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="pendingstaffapproval">Pending Staff Approval</option>
              <option value="pendingsuperadminapproval">Pending Super Admin Approval</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Organization
            <select
              value={organizationFilter}
              onChange={(event) => setOrganizationFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800 focus:border-slate-400 focus:outline-none"
            >
              {organizationFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Setup Type
            <select
              value={setupTypeFilter}
              onChange={(event) => setSetupTypeFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800 focus:border-slate-400 focus:outline-none"
            >
              {setupTypeFilterOptions.map((option) => (
                <option key={option} value={option}>{option === 'all' ? 'All setup types' : option}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date From
            <input
              type="date"
              value={dateFromFilter}
              onChange={(event) => setDateFromFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date To
            <input
              type="date"
              value={dateToFilter}
              onChange={(event) => setDateToFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm normal-case text-slate-800 focus:border-slate-400 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>Showing {filteredRows.length} of {tableRows.length} drive request(s).</span>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('all');
              setOrganizationFilter('all');
              setSetupTypeFilter('all');
              setDateFromFilter('');
              setDateToFilter('');
            }}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Donation Drive Review Queue</h2>
          <p className="text-xs text-slate-500">Open Info in each row to review complete details and proof before making a decision.</p>
        </div>

        {!filteredRows.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading donation drive requests...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                No donation drive requests match the selected filters.
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
                {filteredRows.map((row) => {
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
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setDetailsRow(row)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Info size={13} />
                            Info
                          </button>

                          {row.isPendingStaff ? (
                            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300">
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'approve')}
                                disabled={isSavingAction}
                                className="border-r border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                              >
                                Staff Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'reject')}
                                disabled={isSavingAction}
                                className="border-r border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => openActionModal(row, 'cancel')}
                                disabled={isSavingAction}
                                className="bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            </div>
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

      {detailsRow && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[80]">
              <button
                type="button"
                aria-label="Close donation drive details"
                onClick={() => setDetailsRow(null)}
                className="absolute inset-0 bg-slate-900/55"
              />

              <aside
                className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
                style={{ animation: 'staffDonationInfoSlideIn 0.28s ease-out' }}
              >
                <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Donation Drive Details</p>
                      <h3 className="text-lg font-bold text-slate-900">{detailsRow.Event_Title || `Drive #${detailsRow.Donation_Drive_ID}`}</h3>
                      <p className="mt-1 text-xs text-slate-500">Organization: {detailsRow.hostOrganizationName}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDetailsRow(null)}
                      className="rounded-md border border-slate-300 p-1 text-slate-500 hover:bg-slate-50"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 p-5 text-sm text-slate-700">
                  <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Snapshot</p>
                    <div className="mt-2 space-y-2">
                      <p>
                        <span className="font-semibold text-slate-900">Status:</span>{' '}
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${mapStatusMeta(detailsRow.Status).className}`}>
                          {mapStatusMeta(detailsRow.Status).label}
                        </span>
                      </p>
                      <p><span className="font-semibold text-slate-900">Setup Type:</span> {detailsRow.Donation_Setup_Type || 'Not set'}</p>
                      <p><span className="font-semibold text-slate-900">Schedule:</span> {formatDateRange(detailsRow.Start_Date, detailsRow.End_Date)}</p>
                      <p><span className="font-semibold text-slate-900">Scope:</span> {detailsRow.scopeLabel}</p>
                      <p><span className="font-semibold text-slate-900">Updated:</span> {formatDateTime(detailsRow.Updated_At)}</p>
                      <p><span className="font-semibold text-slate-900">Created:</span> {formatDateTime(detailsRow.Created_At)}</p>
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event Overview</p>
                    <p className="mt-2 leading-relaxed text-slate-700">{detailsRow.Event_Overview || 'No event overview provided.'}</p>
                    <p className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">Decision Context:</span>{' '}
                      {detailsRow.Status_Reason || 'No prior reason recorded.'}
                    </p>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Location</p>
                    <p className="mt-2">{detailsRow.addressLabel || 'No address submitted.'}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Coordinates:{' '}
                      {detailsRow.hasLocation
                        ? `${detailsRow.Latitude}, ${detailsRow.Longitude}`
                        : 'No coordinates submitted.'}
                    </p>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proof Attachments</p>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposal Attachment</p>
                      {detailsRow.Proposal_Attachment ? (
                        <div className="mt-2 space-y-1">
                          <p className="text-[11px] text-slate-500">Bucket: {detailsRow.proposalBucketId || 'Not specified'}</p>
                          <p className="break-all text-xs text-slate-500">{detailsRow.proposalAttachmentPath || detailsRow.Proposal_Attachment}</p>

                          {detailsProposalAccessUrl ? (
                            <>
                              <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
                                {isImageLike(detailsRow.proposalAttachmentPath || detailsProposalAccessUrl) ? (
                                  <img
                                    src={detailsProposalAccessUrl}
                                    alt={detailsRow.Event_Title || 'Proposal attachment preview'}
                                    className="h-72 w-full object-contain bg-slate-100"
                                  />
                                ) : isPdfLike(detailsRow.proposalAttachmentPath || detailsProposalAccessUrl) ? (
                                  <iframe
                                    title={`Proposal preview ${detailsRow.Donation_Drive_ID || ''}`}
                                    src={detailsProposalAccessUrl}
                                    className="h-72 w-full"
                                  />
                                ) : (
                                  <div className="px-3 py-2 text-xs text-slate-500">
                                    Preview is not available for this file type. Use download instead.
                                  </div>
                                )}
                              </div>

                              <a
                                href={detailsProposalAccessUrl}
                                download={toAttachmentFileName(detailsRow.proposalAttachmentPath || detailsRow.Proposal_Attachment, 'proposal.pdf')}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <Download size={13} />
                                Download Proposal
                              </a>
                            </>
                          ) : isResolvingProofLinks ? (
                            <p className="text-xs text-slate-500">Preparing secure preview and download link...</p>
                          ) : (
                            <p className="text-xs text-slate-500">Unable to build proposal proof URL for this record.</p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">No proposal attachment uploaded.</p>
                      )}
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completion Attachments</p>
                      {!detailsRow.completionAttachments.length ? (
                        <p className="mt-2 text-xs text-slate-500">No completion attachments uploaded yet.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {detailsRow.completionAttachments.map((attachment) => (
                            <div key={`${attachment.path}-${attachment.uploadedAt}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
                              <p className="font-semibold text-slate-800">{attachment.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {attachment.type || 'Unknown type'} | {formatFileSize(attachment.size)} | Uploaded {formatDateTime(attachment.uploadedAt)}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500">Bucket: {attachment.bucketId || 'Not specified'}</p>
                              <p className="mt-1 break-all text-xs text-slate-500">{attachment.path}</p>

                              {detailsAttachmentAccessUrls[toAttachmentAccessKey(attachment.bucketId, attachment.path)] || attachment.url ? (
                                <a
                                  href={detailsAttachmentAccessUrls[toAttachmentAccessKey(attachment.bucketId, attachment.path)] || attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  Open Proof
                                </a>
                              ) : isResolvingProofLinks ? (
                                <p className="mt-2 text-xs text-slate-500">Preparing secure proof link...</p>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Review Action</p>
                    {detailsRow.isPendingStaff ? (
                      <div className="mt-3 inline-flex overflow-hidden rounded-lg border border-slate-300">
                        <button
                          type="button"
                          onClick={() => openActionModal(detailsRow, 'approve')}
                          disabled={isSavingAction}
                          className="border-r border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          Staff Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(detailsRow, 'reject')}
                          disabled={isSavingAction}
                          className="border-r border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={() => openActionModal(detailsRow, 'cancel')}
                          disabled={isSavingAction}
                          className="bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">This drive is not in Pending Staff Approval status.</p>
                    )}
                  </section>
                </div>
              </aside>

              <style>{`
                @keyframes staffDonationInfoSlideIn {
                  from {
                    transform: translateX(100%);
                  }
                  to {
                    transform: translateX(0);
                  }
                }
              `}</style>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
