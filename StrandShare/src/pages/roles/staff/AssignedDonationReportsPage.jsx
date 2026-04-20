import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const ORGANIZATIONS_TABLE = 'Organizations';
const DONATION_DRIVE_EVENT_ASSETS_BUCKET = 'donation_drive_event_assets';
const MAX_EVENT_ASSET_SIZE_BYTES = 15 * 1024 * 1024;

const STATUS = {
  approved: 'Approved',
  completed: 'Completed',
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

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load assigned donation drives.');
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Viewing assigned donation drives is blocked by database policy. Verify staff select permissions for Donation_Drive_Requests.';
  }

  return message;
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to submit completion report.');
  const lower = message.toLowerCase();

  if (lower.includes('donation_drive_event_assets') && lower.includes('bucket')) {
    return `Donation drive event assets bucket is missing. Expected: ${DONATION_DRIVE_EVENT_ASSETS_BUCKET}.`;
  }

  if (lower.includes('row-level security')) {
    return 'Completion report was blocked by database policy. Verify staff update permissions for Donation_Drive_Requests.';
  }

  return message;
}

async function uploadEventAsset({ filePath, file }) {
  const { error } = await supabase.storage
    .from(DONATION_DRIVE_EVENT_ASSETS_BUCKET)
    .upload(filePath, file, {
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return {
    bucketId: DONATION_DRIVE_EVENT_ASSETS_BUCKET,
  };
}

export default function AssignedDonationReportsPage({ userProfile }) {
  const staffUserId = Number(userProfile?.user_id || 0) || null;

  const [requests, setRequests] = useState([]);
  const [organizationNamesById, setOrganizationNamesById] = useState({});
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completionModal, setCompletionModal] = useState({
    open: false,
    row: null,
    totalRecipients: '',
    totalDonations: '',
    notes: '',
    files: [],
  });

  const loadAssignedDrives = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      setRequests([]);
      setOrganizationNamesById({});
      return;
    }

    if (!staffUserId) {
      setNotice({ kind: 'error', text: 'Unable to resolve your staff account ID.' });
      setRequests([]);
      setOrganizationNamesById({});
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const requestsResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select(
          'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Updated_At, Status, Assigned_Staff_User_ID',
        )
        .eq('Assigned_Staff_User_ID', staffUserId)
        .order('Updated_At', { ascending: false })
        .limit(200);

      if (requestsResult.error) {
        throw requestsResult.error;
      }

      const approvedRows = (requestsResult.data || []).filter((row) => normalizeStatusKey(row.Status) === 'approved');
      setRequests(approvedRows);

      const organizationIds = Array.from(
        new Set(
          approvedRows
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
    } catch (error) {
      setNotice({ kind: 'error', text: mapLoadError(error?.message) });
    } finally {
      setIsLoading(false);
    }
  }, [staffUserId]);

  useEffect(() => {
    void loadAssignedDrives();
  }, [loadAssignedDrives]);

  const tableRows = useMemo(() => {
    return requests.map((row) => {
      const organizationId = Number(row.Organization_ID || 0) || 0;
      const hostOrganizationName = organizationNamesById[organizationId] || `Organization #${organizationId || 'N/A'}`;
      const endDate = row.End_Date ? new Date(row.End_Date) : null;
      const isEndDatePassed = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= Date.now());

      return {
        ...row,
        hostOrganizationName,
        canSubmitCompletion: isEndDatePassed,
      };
    });
  }, [organizationNamesById, requests]);

  const stats = useMemo(() => {
    const readyToReport = tableRows.filter((row) => row.canSubmitCompletion).length;
    const waitingForEndDate = tableRows.length - readyToReport;

    return [
      { label: 'Assigned Approved Drives', value: String(tableRows.length) },
      { label: 'Ready To Report', value: String(readyToReport) },
      { label: 'Waiting End Date', value: String(waitingForEndDate) },
    ];
  }, [tableRows]);

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
      setIsSaving(true);
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

        const uploadResult = await uploadEventAsset({
          filePath,
          file,
        });

        uploadedFiles.push({
          name: file.name,
          path: filePath,
          bucket_id: uploadResult.bucketId || DONATION_DRIVE_EVENT_ASSETS_BUCKET,
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
        description: `Submitted completion report for donation drive #${driveId} with ${uploadedFiles.length} attachment(s).`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });

      setNotice({ kind: 'success', text: 'Completion report submitted successfully.' });
      closeCompletionModal();
      await loadAssignedDrives();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.complete',
        description: `Failed completion report submission for donation drive #${completionModal.row?.Donation_Drive_ID || 'N/A'}`,
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
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Assigned Donation Reports</h1>
          <p className="text-slate-600">
            Only Approved drives assigned to you appear here. Submit completion report once the event end date is reached.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAssignedDrives()}
          disabled={isLoading || isSaving}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Assigned Approved Queue</h2>
          <p className="text-xs text-slate-500">Submit post-event completion proof and totals from this page.</p>
        </div>

        {!tableRows.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Loading assigned donation drives...
              </>
            ) : (
              <>
                <AlertCircle size={16} />
                No approved donation drives are assigned to you.
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
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.Donation_Drive_ID} className="border-t border-slate-200 align-top">
                    <td className="px-4 py-3 text-slate-800">
                      <p className="font-semibold text-slate-900">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.Event_Overview || 'No event overview provided.'}</p>
                      <p className="mt-1 text-xs text-slate-500">Updated: {formatDateTime(row.Updated_At)}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.hostOrganizationName}</td>
                    <td className="px-4 py-3 text-slate-700">{formatDateRange(row.Start_Date, row.End_Date)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        Approved
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.canSubmitCompletion ? (
                        <button
                          type="button"
                          onClick={() => openCompletionModal(row)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          <Send size={13} />
                          Submit Completion Report
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500">Wait until event end date before reporting.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {completionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-semibold text-slate-900">Submit Completion Report</h3>
              <button
                type="button"
                onClick={closeCompletionModal}
                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                disabled={isSaving}
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
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Total Donations Collected *</label>
                  <input
                    value={completionModal.totalDonations}
                    onChange={(event) => setCompletionModal((prev) => ({ ...prev, totalDonations: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                    placeholder="e.g. 85"
                    disabled={isSaving}
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
                  disabled={isSaving}
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
                  disabled={isSaving}
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
                disabled={isSaving}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSubmitCompletion}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={isSaving}
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Submit Completion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
