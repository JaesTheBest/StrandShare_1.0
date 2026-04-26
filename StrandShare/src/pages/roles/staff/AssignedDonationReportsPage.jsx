import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Send, X } from 'lucide-react';
import jsQR from 'jsqr';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_REGISTRATIONS_TABLE = 'Donation_Drive_Registrations';
const ORGANIZATIONS_TABLE = 'Organizations';
const DONATION_DRIVE_EVENT_ASSETS_BUCKET = 'donation_drive_event_assets';
const MAX_EVENT_ASSET_SIZE_BYTES = 15 * 1024 * 1024;
const SCAN_DEBOUNCE_MS = 2500;
const USER_DETAILS_TABLE = 'user_details';

const CAMERA_VIEWPORT_STYLE = {
  minWidth: '280px',
  minHeight: '220px',
  maxWidth: '720px',
  maxHeight: '480px',
};

const WORKFLOW_TABS = [
  { id: 'rsvp', label: 'RSVP Scanner' },
  { id: 'logistics', label: 'Logistics Scanner' },
  { id: 'completion', label: 'Completion' },
];

const STATUS = {
  approved: 'Approved',
  completed: 'Completed',
};

function buildFullName(firstName, lastName, fallback = 'Unknown') {
  const fullName = [firstName, lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  return fullName || fallback;
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseDonationQrPayload(rawValue) {
  const raw = String(rawValue || '').trim();
  let userId = null;
  let driveId = null;

  if (!raw) {
    return { raw, userId, driveId };
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      userId = toPositiveInteger(
        parsed.User_ID
        || parsed.user_id
        || parsed.userId
        || parsed.uid
        || parsed?.user?.User_ID
        || parsed?.user?.user_id
        || parsed?.user?.id,
      );

      driveId = toPositiveInteger(
        parsed.Donation_Drive_ID
        || parsed.donation_drive_id
        || parsed.donationDriveId
        || parsed.drive_id
        || parsed.event_id,
      );
    }
  } catch (error) {
    // Plain text QR payloads are valid; JSON parse failure is expected for those.
  }

  if (!userId) {
    const userIdMatch = raw.match(/(?:\buser[_\s-]?id\b|\buid\b)\s*[:=]\s*(\d{1,12})/i);
    userId = toPositiveInteger(userIdMatch?.[1]);
  }

  if (!driveId) {
    const driveIdMatch = raw.match(/(?:\bdonation[_\s-]?drive[_\s-]?id\b|\bdrive[_\s-]?id\b|\bevent[_\s-]?id\b)\s*[:=]\s*(\d{1,12})/i);
    driveId = toPositiveInteger(driveIdMatch?.[1]);
  }

  if ((!userId || !driveId) && /^https?:\/\//i.test(raw)) {
    try {
      const parsedUrl = new URL(raw);

      if (!userId) {
        userId = toPositiveInteger(
          parsedUrl.searchParams.get('user_id')
          || parsedUrl.searchParams.get('uid')
          || parsedUrl.searchParams.get('userId'),
        );
      }

      if (!driveId) {
        driveId = toPositiveInteger(
          parsedUrl.searchParams.get('donation_drive_id')
          || parsedUrl.searchParams.get('drive_id')
          || parsedUrl.searchParams.get('event_id'),
        );
      }
    } catch (error) {
      // Non-URL raw payloads are handled elsewhere.
    }
  }

  if (!userId) {
    userId = toPositiveInteger(raw);
  }

  return {
    raw,
    userId,
    driveId,
  };
}

function mapScannerError(rawMessage) {
  const message = String(rawMessage || 'Unable to start camera scanner.');
  const lower = message.toLowerCase();

  if (lower.includes('notallowederror') || lower.includes('permission denied')) {
    return 'Camera permission was denied. Allow camera access and try again.';
  }

  if (lower.includes('notfounderror') || lower.includes('no cameras')) {
    return 'No camera device was found for QR scanning.';
  }

  if (lower.includes('notreadableerror') || lower.includes('trackstarterror') || lower.includes('device is in use')) {
    return 'Camera is currently in use by another app/tab. Close other camera apps and try again.';
  }

  if (lower.includes('https') || lower.includes('secure context')) {
    return 'QR scanner requires HTTPS (or localhost) to access camera.';
  }

  return message;
}

function scannerStatusClass(kind) {
  if (kind === 'error') {
    return 'border-rose-200 bg-rose-50 text-rose-800';
  }

  if (kind === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  }

  if (kind === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700';
}

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

function toDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function formatDateOnly(value) {
  const parsed = toDateValue(value);
  if (!parsed) {
    return 'Date TBD';
  }

  return parsed.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatDateTabLabel(startDate, endDate) {
  if (!startDate && !endDate) {
    return 'Date TBD';
  }

  if (!startDate) {
    return `Until ${formatDateOnly(endDate)}`;
  }

  if (!endDate) {
    return `Starts ${formatDateOnly(startDate)}`;
  }

  return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
}

function getDriveTimelineMeta(row) {
  const startDate = toDateValue(row.Start_Date);
  const endDate = toDateValue(row.End_Date);
  const now = new Date();
  const nowMs = now.getTime();
  const dayStart = new Date(now);

  dayStart.setHours(0, 0, 0, 0);

  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + (24 * 60 * 60 * 1000) - 1;
  const startMs = startDate ? startDate.getTime() : Number.NaN;
  const endMs = endDate ? endDate.getTime() : Number.NaN;
  const updatedMs = toDateValue(row.Updated_At)?.getTime() || Number.MAX_SAFE_INTEGER;
  const hasStart = Number.isFinite(startMs);
  const hasEnd = Number.isFinite(endMs);

  const isToday = (
    (hasStart && hasEnd && startMs <= dayEndMs && endMs >= dayStartMs)
    || (hasStart && !hasEnd && startMs >= dayStartMs && startMs <= dayEndMs)
    || (!hasStart && hasEnd && endMs >= dayStartMs && endMs <= dayEndMs)
  );

  const isUpcoming = hasStart ? startMs > dayEndMs : false;
  const isEnded = hasEnd ? endMs < dayStartMs : (hasStart ? startMs < dayStartMs : false);

  let timelineLabel = 'Scheduled';
  if (isToday) {
    timelineLabel = 'Today';
  } else if (isUpcoming) {
    timelineLabel = 'Upcoming';
  } else if (isEnded) {
    timelineLabel = 'Ended';
  } else if (hasStart && startMs <= nowMs) {
    timelineLabel = 'In Progress';
  }

  const sortMs = hasStart ? startMs : (hasEnd ? endMs : updatedMs);
  const proximity = hasStart ? Math.abs(startMs - nowMs) : Number.MAX_SAFE_INTEGER;

  return {
    startMs,
    sortMs,
    proximity,
    isToday,
    isUpcoming,
    isEnded,
    timelineLabel,
    dateTabLabel: formatDateTabLabel(row.Start_Date, row.End_Date),
  };
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
  const message = String(rawMessage || 'Unable to load assigned donation drive events.');
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Viewing assigned donation drive events is blocked by database policy. Verify staff select permissions for Donation_Drive_Requests.';
  }

  return message;
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to submit donation drive completion.');
  const lower = message.toLowerCase();

  if (lower.includes('donation_drive_event_assets') && lower.includes('bucket')) {
    return `Donation drive event assets bucket is missing. Expected: ${DONATION_DRIVE_EVENT_ASSETS_BUCKET}.`;
  }

  if (lower.includes('row-level security')) {
    return 'Donation drive completion was blocked by database policy. Verify staff update permissions for Donation_Drive_Requests.';
  }

  return message;
}

function mapRegistrationSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to update RSVP attendance.');
  const lower = message.toLowerCase();

  if (lower.includes('donation_drive_registrations') && (lower.includes('does not exist') || lower.includes('not found'))) {
    return 'Donation_Drive_Registrations table is missing. Run the latest Supabase migration and refresh this page.';
  }

  if (lower.includes('row-level security')) {
    return 'RSVP update was blocked by database policy. Only the assigned staff for this event can access Donation_Drive_Registrations.';
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
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [activeWorkflowTab, setActiveWorkflowTab] = useState('rsvp');
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [scannerState, setScannerState] = useState({
    rsvp: { kind: 'info', text: 'Select an event to prepare RSVP scanning.' },
    logistics: { kind: 'info', text: 'Select an event to prepare logistics scanning.' },
  });
  const [lastRsvpScan, setLastRsvpScan] = useState(null);
  const [lastLogisticsScan, setLastLogisticsScan] = useState(null);
  const [manualQrInput, setManualQrInput] = useState({
    rsvp: '',
    logistics: '',
  });
  const [rsvpScanHistoryRows, setRsvpScanHistoryRows] = useState([]);
  const [logisticsScanHistoryRows, setLogisticsScanHistoryRows] = useState([]);
  const [userNamesByUserId, setUserNamesByUserId] = useState({});
  const [isRsvpHistoryLoading, setIsRsvpHistoryLoading] = useState(false);

  const rsvpVideoRef = useRef(null);
  const logisticsVideoRef = useRef(null);
  const scannerCanvasRef = useRef(null);
  const lastScanRef = useRef({
    rsvp: { raw: '', at: 0 },
    logistics: { raw: '', at: 0 },
  });
  const isRsvpProcessingRef = useRef(false);

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
      const endDate = toDateValue(row.End_Date);
      const isEndDatePassed = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() <= Date.now());

      return {
        ...row,
        hostOrganizationName,
        canSubmitCompletion: isEndDatePassed,
      };
    });
  }, [organizationNamesById, requests]);

  const eventTabs = useMemo(() => {
    return tableRows
      .map((row) => ({
        ...row,
        ...getDriveTimelineMeta(row),
      }))
      .sort((left, right) => {
        if (left.isToday !== right.isToday) {
          return left.isToday ? -1 : 1;
        }

        if (left.isUpcoming !== right.isUpcoming) {
          return left.isUpcoming ? -1 : 1;
        }

        if (left.isEnded !== right.isEnded) {
          return left.isEnded ? 1 : -1;
        }

        if (left.sortMs !== right.sortMs) {
          return left.sortMs - right.sortMs;
        }

        return Number(right.Donation_Drive_ID || 0) - Number(left.Donation_Drive_ID || 0);
      });
  }, [tableRows]);

  useEffect(() => {
    if (!eventTabs.length) {
      setActiveDriveId(null);
      return;
    }

    if (eventTabs.some((row) => row.Donation_Drive_ID === activeDriveId)) {
      return;
    }

    const todayDrive = eventTabs.find((row) => row.isToday);
    const upcomingDrive = eventTabs
      .filter((row) => row.isUpcoming && Number.isFinite(row.startMs))
      .sort((left, right) => left.startMs - right.startMs)[0];
    const nearestDrive = [...eventTabs].sort((left, right) => left.proximity - right.proximity)[0];
    const nextDrive = todayDrive || upcomingDrive || nearestDrive || eventTabs[0];

    setActiveDriveId(nextDrive?.Donation_Drive_ID || null);
  }, [activeDriveId, eventTabs]);

  const selectedDrive = useMemo(() => {
    if (!eventTabs.length) {
      return null;
    }

    return eventTabs.find((row) => row.Donation_Drive_ID === activeDriveId) || eventTabs[0];
  }, [activeDriveId, eventTabs]);

  const selectedDriveId = Number(selectedDrive?.Donation_Drive_ID || 0) || null;
  const selectedDriveAssignedStaffUserId = Number(selectedDrive?.Assigned_Staff_User_ID || 0) || null;
  const isSelectedDriveAssignedToCurrentStaff = Boolean(
    selectedDriveId
    && selectedDriveAssignedStaffUserId
    && staffUserId
    && selectedDriveAssignedStaffUserId === staffUserId,
  );
  const selectedEventName = selectedDrive?.Event_Title || (selectedDriveId ? `Drive #${selectedDriveId}` : 'No selected event');
  const currentStaffName = buildFullName(
    userProfile?.first_name,
    userProfile?.last_name,
    userProfile?.email || `Staff #${staffUserId || 'N/A'}`,
  );

  const selectedDriveStartDate = toDateValue(selectedDrive?.Start_Date);
  const isSelectedDriveStarted = !selectedDriveStartDate || selectedDriveStartDate.getTime() <= Date.now();

  const stats = useMemo(() => {
    const readyToReport = eventTabs.filter((row) => row.canSubmitCompletion).length;
    const waitingForEndDate = eventTabs.length - readyToReport;

    return [
      { label: 'Assigned Approved Drives', value: String(eventTabs.length) },
      { label: 'Ready For Completion', value: String(readyToReport) },
      { label: 'Waiting End Date', value: String(waitingForEndDate) },
    ];
  }, [eventTabs]);

  const setScannerNotice = useCallback((tabKey, kind, text) => {
    setScannerState((previous) => ({
      ...previous,
      [tabKey]: { kind, text },
    }));
  }, []);

  const loadUserNamesByIds = useCallback(async (userIds) => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const uniqueUserIds = Array.from(
      new Set(
        (Array.isArray(userIds) ? userIds : [])
          .map((value) => Number(value || 0))
          .filter(Boolean),
      ),
    );

    if (!uniqueUserIds.length) {
      return;
    }

    try {
      const { data, error } = await supabase
        .from(USER_DETAILS_TABLE)
        .select('user_id, first_name, last_name')
        .in('user_id', uniqueUserIds);

      if (error) {
        return;
      }

      setUserNamesByUserId((previous) => {
        const next = { ...previous };

        for (const row of data || []) {
          const userId = Number(row?.user_id || 0);
          if (!userId) {
            continue;
          }

          next[userId] = buildFullName(row?.first_name, row?.last_name, `User #${userId}`);
        }

        return next;
      });
    } catch (error) {
      // Name lookup failure should not block scanner workflows.
    }
  }, []);

  const loadRsvpScanHistory = useCallback(async () => {
    if (!selectedDriveId || !isSupabaseConfigured || !supabase) {
      setRsvpScanHistoryRows([]);
      return;
    }

    if (!isSelectedDriveAssignedToCurrentStaff) {
      setRsvpScanHistoryRows([]);
      setScannerNotice('rsvp', 'error', 'RSVP scanner is locked. This event is not assigned to your staff account.');
      return;
    }

    try {
      setIsRsvpHistoryLoading(true);

      let rsvpResult = await supabase
        .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
        .select('Registration_ID, Donation_Drive_ID, User_ID, Attendance_Status, Updated_At, Attendance_Marked_At')
        .eq('Donation_Drive_ID', selectedDriveId)
        .order('Updated_At', { ascending: false })
        .limit(300);

      if (rsvpResult.error && normalizeText(rsvpResult.error.message).includes('attendance_marked_at')) {
        rsvpResult = await supabase
          .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
          .select('Registration_ID, Donation_Drive_ID, User_ID, Attendance_Status, Updated_At')
          .eq('Donation_Drive_ID', selectedDriveId)
          .order('Updated_At', { ascending: false })
          .limit(300);
      }

      if (rsvpResult.error) {
        throw rsvpResult.error;
      }

      const presentRows = (rsvpResult.data || [])
        .filter((row) => normalizeText(row.Attendance_Status) === 'present')
        .map((row) => ({
          id: Number(row.Registration_ID || 0) || Date.now(),
          driveId: Number(row.Donation_Drive_ID || 0) || selectedDriveId,
          userId: Number(row.User_ID || 0) || null,
          scannedAt: row.Attendance_Marked_At || row.Updated_At || null,
          status: 'Present',
        }))
        .sort((left, right) => {
          const leftMs = toDateValue(left.scannedAt)?.getTime() || 0;
          const rightMs = toDateValue(right.scannedAt)?.getTime() || 0;
          return rightMs - leftMs;
        });

      setRsvpScanHistoryRows(presentRows);
      await loadUserNamesByIds(presentRows.map((row) => row.userId));
    } catch (error) {
      const mappedMessage = mapRegistrationSaveError(error?.message);
      setScannerNotice('rsvp', 'error', mappedMessage);
    } finally {
      setIsRsvpHistoryLoading(false);
    }
  }, [isSelectedDriveAssignedToCurrentStaff, loadUserNamesByIds, selectedDriveId, setScannerNotice]);

  useEffect(() => {
    void loadRsvpScanHistory();
  }, [loadRsvpScanHistory]);

  useEffect(() => {
    if (!selectedDriveId || !isSupabaseConfigured || !supabase) {
      return undefined;
    }

    const channel = supabase
      .channel(`staff-rsvp-scan-history-${selectedDriveId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: DONATION_DRIVE_REGISTRATIONS_TABLE,
          filter: `Donation_Drive_ID=eq.${selectedDriveId}`,
        },
        () => {
          void loadRsvpScanHistory();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRsvpScanHistory, selectedDriveId]);

  const handleRsvpScan = useCallback(async (decodedText) => {
    if (isRsvpProcessingRef.current) {
      return;
    }

    const driveId = Number(selectedDriveId || 0);
    if (!driveId) {
      return;
    }

    if (!isSelectedDriveAssignedToCurrentStaff) {
      const assignmentMessage = 'RSVP scanner is locked. This event is not assigned to your staff account.';
      setNotice({ kind: 'error', text: assignmentMessage });
      setScannerNotice('rsvp', 'error', assignmentMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: null,
        scannedAt: new Date().toISOString(),
        reason: assignmentMessage,
        raw: String(decodedText || '').trim(),
      });
      return;
    }

    const parsedPayload = parseDonationQrPayload(decodedText);
    if (!parsedPayload.userId) {
      const parseMessage = 'QR does not contain a valid donor User ID.';
      setNotice({ kind: 'error', text: parseMessage });
      setScannerNotice('rsvp', 'error', parseMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: null,
        scannedAt: new Date().toISOString(),
        reason: parseMessage,
        raw: parsedPayload.raw,
      });
      return;
    }

    if (!parsedPayload.driveId) {
      const missingDriveMessage = 'QR is missing Donation Drive ID. Use the RSVP QR generated for this selected event.';
      setNotice({ kind: 'error', text: missingDriveMessage });
      setScannerNotice('rsvp', 'error', missingDriveMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: parsedPayload.userId,
        scannedAt: new Date().toISOString(),
        reason: missingDriveMessage,
        raw: parsedPayload.raw,
      });
      return;
    }

    if (parsedPayload.driveId && parsedPayload.driveId !== driveId) {
      const mismatchMessage = `QR belongs to drive #${parsedPayload.driveId}, but selected event is #${driveId}.`;
      setNotice({ kind: 'error', text: mismatchMessage });
      setScannerNotice('rsvp', 'error', mismatchMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: parsedPayload.userId,
        scannedAt: new Date().toISOString(),
        reason: mismatchMessage,
        raw: parsedPayload.raw,
      });
      return;
    }

    isRsvpProcessingRef.current = true;

    try {
      setScannerNotice('rsvp', 'info', `Checking RSVP registration for User #${parsedPayload.userId}...`);

      const nowIso = new Date().toISOString();

      let registrationResult = await supabase
        .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
        .select('Registration_ID, Donation_Drive_ID, User_ID, Registration_Status, Attendance_Status, Updated_At, Attendance_Marked_At')
        .eq('Donation_Drive_ID', driveId)
        .eq('User_ID', parsedPayload.userId)
        .maybeSingle();

      if (registrationResult.error && normalizeText(registrationResult.error.message).includes('attendance_marked_at')) {
        registrationResult = await supabase
          .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
          .select('Registration_ID, Donation_Drive_ID, User_ID, Registration_Status, Attendance_Status, Updated_At')
          .eq('Donation_Drive_ID', driveId)
          .eq('User_ID', parsedPayload.userId)
          .maybeSingle();
      }

      if (registrationResult.error) {
        throw registrationResult.error;
      }

      const registration = registrationResult.data;
      if (!registration?.Registration_ID) {
        const notRegisteredMessage = `User #${parsedPayload.userId} has no RSVP registration for this event.`;
        setNotice({ kind: 'warning', text: notRegisteredMessage });
        setScannerNotice('rsvp', 'warning', notRegisteredMessage);
        setLastRsvpScan({
          status: 'failed',
          userId: parsedPayload.userId,
          scannedAt: nowIso,
          reason: notRegisteredMessage,
          raw: parsedPayload.raw,
        });
        return;
      }

      const registrationStatusKey = normalizeStatusKey(registration.Registration_Status);
      if (registrationStatusKey !== 'approved') {
        const registrationStatusLabel = registration.Registration_Status || 'Unknown';
        const notApprovedMessage = `User #${parsedPayload.userId} RSVP is not Approved (current: ${registrationStatusLabel}).`;
        setNotice({ kind: 'warning', text: notApprovedMessage });
        setScannerNotice('rsvp', 'warning', notApprovedMessage);
        setLastRsvpScan({
          status: 'failed',
          userId: parsedPayload.userId,
          scannedAt: nowIso,
          reason: notApprovedMessage,
          raw: parsedPayload.raw,
        });
        return;
      }

      const attendanceStatusKey = normalizeText(registration.Attendance_Status);
      if (attendanceStatusKey === 'present') {
        const presentAt = registration.Attendance_Marked_At || registration.Updated_At || nowIso;
        const alreadyPresentMessage = `User #${parsedPayload.userId} is already marked Present (${formatDateTime(presentAt)}).`;

        setNotice({ kind: 'warning', text: alreadyPresentMessage });
        setScannerNotice('rsvp', 'warning', alreadyPresentMessage);
        setLastRsvpScan({
          status: 'already-present',
          userId: parsedPayload.userId,
          scannedAt: presentAt,
          reason: alreadyPresentMessage,
          raw: parsedPayload.raw,
        });
        return;
      }

      let updateResult = await supabase
        .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
        .update({
          Registration_Status: 'Approved',
          Attendance_Status: 'Present',
          Updated_At: nowIso,
          Attendance_Marked_At: nowIso,
        })
        .eq('Registration_ID', registration.Registration_ID)
        .eq('Donation_Drive_ID', driveId)
        .eq('User_ID', parsedPayload.userId)
        .select('Registration_ID, Attendance_Status, Updated_At, Attendance_Marked_At')
        .maybeSingle();

      if (updateResult.error && normalizeText(updateResult.error.message).includes('attendance_marked_at')) {
        updateResult = await supabase
          .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
          .update({
            Registration_Status: 'Approved',
            Attendance_Status: 'Present',
            Updated_At: nowIso,
          })
          .eq('Registration_ID', registration.Registration_ID)
          .eq('Donation_Drive_ID', driveId)
          .eq('User_ID', parsedPayload.userId)
          .select('Registration_ID, Attendance_Status, Updated_At')
          .maybeSingle();
      }

      if (updateResult.error) {
        throw updateResult.error;
      }

      if (!updateResult.data?.Registration_ID) {
        throw new Error('Attendance update failed. The registration may have changed. Please scan again.');
      }

      const presentAt = updateResult.data.Attendance_Marked_At || updateResult.data.Updated_At || nowIso;
      const successMessage = `RSVP checked in: User #${parsedPayload.userId} marked Present at ${formatDateTime(presentAt)}.`;

      setNotice({ kind: 'success', text: successMessage });
      setScannerNotice('rsvp', 'success', successMessage);
      setLastRsvpScan({
        status: 'success',
        userId: parsedPayload.userId,
        scannedAt: presentAt,
        reason: successMessage,
        raw: parsedPayload.raw,
      });

      void loadRsvpScanHistory();

      await logAuditAction({
        action: 'donation_drive_registrations.mark_present',
        description: `Marked RSVP attendance as Present for user #${parsedPayload.userId} in donation drive #${driveId}.`,
        resource: DONATION_DRIVE_REGISTRATIONS_TABLE,
        status: 'success',
        userProfile,
      });
    } catch (error) {
      const mappedMessage = mapRegistrationSaveError(error?.message);

      setNotice({ kind: 'error', text: mappedMessage });
      setScannerNotice('rsvp', 'error', mappedMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: null,
        scannedAt: new Date().toISOString(),
        reason: mappedMessage,
        raw: String(decodedText || '').trim(),
      });

      await logAuditAction({
        action: 'donation_drive_registrations.mark_present',
        description: `Failed RSVP attendance update for drive #${driveId}.`,
        resource: DONATION_DRIVE_REGISTRATIONS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      isRsvpProcessingRef.current = false;
    }
  }, [isSelectedDriveAssignedToCurrentStaff, loadRsvpScanHistory, selectedDriveId, setScannerNotice, userProfile]);

  const handleLogisticsScan = useCallback((decodedText) => {
    const parsedPayload = parseDonationQrPayload(decodedText);
    const nowIso = new Date().toISOString();

    const infoMessage = parsedPayload.userId
      ? `Logistics scan captured for User #${parsedPayload.userId}. Workflow actions are not connected yet.`
      : 'Logistics scan captured, but no User ID was detected from QR payload.';

    setNotice({ kind: parsedPayload.userId ? 'warning' : 'error', text: infoMessage });
    setScannerNotice('logistics', parsedPayload.userId ? 'warning' : 'error', infoMessage);
    setLastLogisticsScan({
      status: parsedPayload.userId ? 'captured' : 'failed',
      userId: parsedPayload.userId,
      driveId: parsedPayload.driveId,
      scannedAt: nowIso,
      raw: parsedPayload.raw,
      reason: infoMessage,
    });

    setLogisticsScanHistoryRows((previous) => {
      const nextRow = {
        id: `${selectedDriveId || 'drive'}-${Date.now()}`,
        driveId: selectedDriveId,
        eventName: selectedEventName,
        scannedAt: nowIso,
        userId: parsedPayload.userId,
        userName: parsedPayload.userId ? `User #${parsedPayload.userId}` : 'Unknown user',
        status: parsedPayload.userId ? 'Captured' : 'Invalid QR',
      };

      return [nextRow, ...previous].slice(0, 200);
    });

    if (parsedPayload.userId) {
      void loadUserNamesByIds([parsedPayload.userId]);
    }
  }, [loadUserNamesByIds, selectedDriveId, selectedEventName, setScannerNotice]);

  const submitManualScan = useCallback((tabKey) => {
    const nextValue = String(manualQrInput[tabKey] || '').trim();
    if (!nextValue) {
      setNotice({ kind: 'error', text: 'Enter QR payload text before submitting manual scan.' });
      return;
    }

    if (tabKey === 'rsvp') {
      void handleRsvpScan(nextValue);
    } else {
      handleLogisticsScan(nextValue);
    }

    setManualQrInput((previous) => ({
      ...previous,
      [tabKey]: '',
    }));
  }, [handleLogisticsScan, handleRsvpScan, manualQrInput]);

  useEffect(() => {
    if (activeWorkflowTab !== 'rsvp' && activeWorkflowTab !== 'logistics') {
      return undefined;
    }

    if (!isCameraEnabled) {
      setScannerNotice(activeWorkflowTab, 'info', 'Camera is OFF for privacy. Click Turn Camera On to start scanning.');
      return undefined;
    }

    if (!selectedDriveId) {
      return undefined;
    }

    if (activeWorkflowTab === 'rsvp' && !isSelectedDriveAssignedToCurrentStaff) {
      setScannerNotice('rsvp', 'error', 'RSVP scanner is locked. This event is not assigned to your staff account.');
      return undefined;
    }

    if (activeWorkflowTab === 'rsvp' && !isSelectedDriveStarted) {
      setScannerNotice('rsvp', 'warning', 'RSVP scanner becomes active when the event start date is reached.');
      return undefined;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerNotice(activeWorkflowTab, 'error', 'Camera API is unavailable on this browser/device.');
      return undefined;
    }

    const scannerTab = activeWorkflowTab;
    const scannerVideo = scannerTab === 'rsvp' ? rsvpVideoRef.current : logisticsVideoRef.current;
    if (!scannerVideo) {
      return undefined;
    }

    let isDisposed = false;
    let mediaStream = null;
    let intervalId = 0;
    let frameIsBusy = false;

    const startScanner = async () => {
      try {
        setScannerNotice(scannerTab, 'info', 'Initializing camera scanner...');

        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (isDisposed) {
          return;
        }

        scannerVideo.srcObject = mediaStream;
        scannerVideo.muted = true;
        scannerVideo.playsInline = true;
        await scannerVideo.play();

        if (isDisposed) {
          return;
        }

        setScannerNotice(scannerTab, 'success', 'Scanner is running. Point camera at donor QR code.');

        intervalId = window.setInterval(() => {
          if (isDisposed || frameIsBusy || scannerVideo.readyState < 2) {
            return;
          }

          const frameWidth = scannerVideo.videoWidth;
          const frameHeight = scannerVideo.videoHeight;
          if (!frameWidth || !frameHeight) {
            return;
          }

          frameIsBusy = true;

          try {
            if (!scannerCanvasRef.current) {
              scannerCanvasRef.current = document.createElement('canvas');
            }

            const canvas = scannerCanvasRef.current;
            canvas.width = frameWidth;
            canvas.height = frameHeight;

            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) {
              return;
            }

            context.drawImage(scannerVideo, 0, 0, frameWidth, frameHeight);
            const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
            const detectedCode = jsQR(imageData.data, frameWidth, frameHeight, {
              inversionAttempts: 'attemptBoth',
            });

            const decodedText = String(detectedCode?.data || '').trim();
            if (!decodedText) {
              return;
            }

            const now = Date.now();
            const previous = lastScanRef.current[scannerTab];

            if (previous.raw === decodedText && now - previous.at < SCAN_DEBOUNCE_MS) {
              return;
            }

            lastScanRef.current[scannerTab] = {
              raw: decodedText,
              at: now,
            };

            if (scannerTab === 'rsvp') {
              void handleRsvpScan(decodedText);
            } else {
              handleLogisticsScan(decodedText);
            }
          } catch (error) {
            // Ignore frame-level decode issues and continue scanning.
          } finally {
            frameIsBusy = false;
          }
        }, 180);
      } catch (error) {
        if (isDisposed) {
          return;
        }

        setScannerNotice(scannerTab, 'error', mapScannerError(error?.message));
      }
    };

    void startScanner();

    return () => {
      isDisposed = true;

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      if (scannerVideo) {
        scannerVideo.pause();
        scannerVideo.srcObject = null;
      }

      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [
    activeWorkflowTab,
    handleLogisticsScan,
    handleRsvpScan,
    isCameraEnabled,
    isSelectedDriveAssignedToCurrentStaff,
    isSelectedDriveStarted,
    selectedDriveId,
    setScannerNotice,
  ]);

  const rsvpScannedTableRows = useMemo(() => {
    return rsvpScanHistoryRows.map((row) => {
      const userId = Number(row.userId || 0) || null;

      return {
        id: row.id,
        time: row.scannedAt,
        eventName: selectedEventName,
        userName: userId ? (userNamesByUserId[userId] || `User #${userId}`) : 'Unknown user',
        status: row.status || 'Present',
      };
    });
  }, [rsvpScanHistoryRows, selectedEventName, userNamesByUserId]);

  const logisticsScannedTableRows = useMemo(() => {
    return logisticsScanHistoryRows
      .filter((row) => Number(row.driveId || 0) === Number(selectedDriveId || 0))
      .map((row) => ({
        id: row.id,
        time: row.scannedAt,
        eventName: row.eventName || selectedEventName,
        userName: row.userId ? (userNamesByUserId[row.userId] || row.userName || `User #${row.userId}`) : 'Unknown user',
        status: row.status || 'Captured',
      }));
  }, [logisticsScanHistoryRows, selectedDriveId, selectedEventName, userNamesByUserId]);

  const completionScannedTableRows = useMemo(() => {
    if (!selectedDrive) {
      return [];
    }

    const statusLabel = normalizeStatusKey(selectedDrive.Status) === 'completed'
      ? 'Completed'
      : 'Pending Completion';

    return [
      {
        id: `completion-${selectedDrive.Donation_Drive_ID}`,
        time: selectedDrive.Updated_At || selectedDrive.End_Date || selectedDrive.Start_Date || null,
        eventName: selectedEventName,
        userName: currentStaffName,
        status: statusLabel,
      },
    ];
  }, [currentStaffName, selectedDrive, selectedEventName]);

  const activeScannedRows = useMemo(() => {
    if (activeWorkflowTab === 'rsvp') {
      return rsvpScannedTableRows;
    }

    if (activeWorkflowTab === 'logistics') {
      return logisticsScannedTableRows;
    }

    return completionScannedTableRows;
  }, [activeWorkflowTab, completionScannedTableRows, logisticsScannedTableRows, rsvpScannedTableRows]);

  const activeScannedTableTitle = useMemo(() => {
    if (activeWorkflowTab === 'rsvp') {
      return 'RSVP Scanned QR List';
    }

    if (activeWorkflowTab === 'logistics') {
      return 'Logistics Scanned QR List';
    }

    return 'Completion List';
  }, [activeWorkflowTab]);

  const activeScannedTableEmptyText = useMemo(() => {
    if (activeWorkflowTab === 'rsvp') {
      return 'No RSVP scans marked Present yet for this selected drive.';
    }

    if (activeWorkflowTab === 'logistics') {
      return 'No logistics scans captured yet for this selected drive.';
    }

    return 'No completion record is available for this selected drive yet.';
  }, [activeWorkflowTab]);

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
        description: `Submitted donation drive completion for drive #${driveId} with ${uploadedFiles.length} attachment(s).`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });

      setNotice({ kind: 'success', text: 'Donation drive completion submitted successfully.' });
      closeCompletionModal();
      await loadAssignedDrives();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.complete',
        description: `Failed donation drive completion submission for drive #${completionModal.row?.Donation_Drive_ID || 'N/A'}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate metrics for right-side data cards
  const checkedInCount = rsvpScanHistoryRows.filter(
    (row) => Number(row.driveId || 0) === Number(selectedDriveId || 0)
  ).length;
  const registrationTotal = selectedDrive?.Registration_Count || 0;
  const capacityPercentage = registrationTotal > 0 ? Math.round((checkedInCount / registrationTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-slate-900">Assigned Donation Drive</h1>
          <p className="text-slate-600">
            Select one event by date first so you always know which drive is active before scanning donors and submitting completion proof.
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

      {/* THREE-COLUMN LAYOUT: Left Sidebar + Center Scanner + Right Data Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* LEFT SIDEBAR: Event List */}
        <div className="lg:col-span-1">
          {!!eventTabs.length && (
            <div className="sticky top-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-900">Assigned Events</h2>
                <p className="mt-1 text-xs text-slate-500">Tap to select and lock the event for scanning.</p>
              </div>
              <div className="max-h-[600px] space-y-2 overflow-y-auto px-3 py-3">
                {eventTabs.map((row) => {
                  const isActive = row.Donation_Drive_ID === selectedDrive?.Donation_Drive_ID;

                  return (
                    <button
                      key={row.Donation_Drive_ID}
                      type="button"
                      onClick={() => setActiveDriveId(row.Donation_Drive_ID)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                        {row.dateTabLabel}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs font-semibold">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</p>
                      <span
                        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          isActive
                            ? 'border-white/40 bg-white/10 text-white'
                            : row.isToday
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : row.isUpcoming
                                ? 'border-blue-200 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-slate-100 text-slate-700'
                        }`}
                      >
                        {row.timelineLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* CENTER: Scanner & Workflows */}
        <div className="lg:col-span-2 space-y-4">
          {!!selectedDrive && (
            <>
              {/* Selected Drive Info */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Active Event</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs">
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Event</p>
                    <p className="mt-1 line-clamp-1 font-semibold text-slate-900">{selectedEventName}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Organization</p>
                    <p className="mt-1 line-clamp-1 text-slate-700">{selectedDrive.hostOrganizationName}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                    <p className="mt-1 text-slate-700">{formatDateRange(selectedDrive.Start_Date, selectedDrive.End_Date)}</p>
                  </div>
                  <div>
                    <p className="font-semibold uppercase tracking-wide text-slate-500">Status</p>
                    <span className="mt-1 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Approved
                    </span>
                  </div>
                </div>
              </div>

              {/* RSVP Scanner Section */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">RSVP Scanner</h2>
                    <button
                      type="button"
                      onClick={() => setIsCameraEnabled((previous) => !previous)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        isCameraEnabled
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {isCameraEnabled ? 'Off' : 'On'}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Align QR code within frame</p>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${scannerStatusClass(scannerState.rsvp.kind)}`}>
                    {scannerState.rsvp.text}
                  </div>

                  {!isSelectedDriveStarted ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                      RSVP scanning is locked until start date: {formatDateTime(selectedDrive.Start_Date)}
                    </div>
                  ) : (
                    <div
                      className="mx-auto w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                      style={CAMERA_VIEWPORT_STYLE}
                    >
                      <video
                        ref={rsvpVideoRef}
                        className="h-full w-full bg-slate-900 object-cover"
                        autoPlay
                        playsInline
                        muted
                      />
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Manual Entry</p>
                    <div className="flex flex-col gap-2">
                      <input
                        value={manualQrInput.rsvp}
                        onChange={(event) => setManualQrInput((previous) => ({ ...previous, rsvp: event.target.value }))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                        placeholder="E.G., ATT-8492"
                      />
                      <button
                        type="button"
                        onClick={() => submitManualScan('rsvp')}
                        className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Check In
                      </button>
                    </div>
                  </div>

                  {lastRsvpScan && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">Last Scan</p>
                      <p className="mt-1 text-xs">User #{lastRsvpScan.userId} — {formatDateTime(lastRsvpScan.scannedAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">{lastRsvpScan.reason}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Tabs: Logistics & Completion */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {WORKFLOW_TABS.map((tab) => {
                      const isActive = activeWorkflowTab === tab.id;

                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveWorkflowTab(tab.id)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            isActive
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4">
                  {activeWorkflowTab === 'logistics' && (
                    <>
                      <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${scannerStatusClass(scannerState.logistics.kind)}`}>
                        {scannerState.logistics.text}
                      </div>

                      <div
                        className="mx-auto w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                        style={CAMERA_VIEWPORT_STYLE}
                      >
                        <video
                          ref={logisticsVideoRef}
                          className="h-full w-full bg-slate-900 object-cover"
                          autoPlay
                          playsInline
                          muted
                        />
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Manual Entry</p>
                        <div className="flex flex-col gap-2">
                          <input
                            value={manualQrInput.logistics}
                            onChange={(event) => setManualQrInput((previous) => ({ ...previous, logistics: event.target.value }))}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                            placeholder="Paste QR payload if camera scan is unavailable"
                          />
                          <button
                            type="button"
                            onClick={() => submitManualScan('logistics')}
                            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Submit
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                        Logistics scanner is active for capture only. Status transitions will be connected in the next update.
                      </div>

                      {lastLogisticsScan && (
                        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                          <p className="font-semibold text-slate-900">Last Logistics Scan</p>
                          <p className="mt-1 text-xs">User #{lastLogisticsScan.userId} — Drive #{lastLogisticsScan.driveId}</p>
                          <p className="mt-1 text-xs text-slate-500">{lastLogisticsScan.reason}</p>
                        </div>
                      )}
                    </>
                  )}

                  {activeWorkflowTab === 'completion' && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900 mb-1">Submit Completion</p>
                      <p className="text-xs mb-3">Completion can be submitted only after event end date.</p>
                      {selectedDrive.canSubmitCompletion ? (
                        <button
                          type="button"
                          onClick={() => openCompletionModal(selectedDrive)}
                          disabled={isSaving}
                          className="inline-flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                        >
                          <Send size={13} />
                          Submit Drive Completion
                        </button>
                      ) : null}
                    </div>
                  )}

                  {activeWorkflowTab === 'rsvp' && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                      <p className="text-xs">Use the RSVP Scanner above to check in attendees and mark attendance.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT SIDEBAR: Data Cards */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-3">
            {/* Checked In Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Checked In</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {checkedInCount}<span className="text-lg text-slate-500">/{registrationTotal}</span>
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${capacityPercentage}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-600">{capacityPercentage}% Capacity</p>
            </div>

            {/* Supply Alert Card */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-amber-700" />
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Supply Alert</p>
                  <p className="mt-1 text-sm font-semibold text-amber-900">Wig Storage Unit</p>
                  <p className="mt-1 text-xs text-amber-700">Capacity threshold warning</p>
                </div>
              </div>
            </div>

            {/* Recently Scanned Summary */}
            {rsvpScannedTableRows.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recently Scanned</p>
                <div className="mt-3 space-y-2">
                  {rsvpScannedTableRows.slice(-3).map((row) => (
                    <div key={row.id} className="text-xs border-t border-slate-100 pt-2">
                      <p className="font-semibold text-slate-900 line-clamp-1">{row.userName}</p>
                      <p className="mt-0.5 text-slate-500">{formatDateTime(row.time)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SCANNED HISTORY TABLE (Full Width) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{activeScannedTableTitle}</h2>
          <p className="text-xs text-slate-500">Selected event: {selectedEventName}. Columns: Time, Event Name, User Name, Status.</p>
        </div>

        {(activeWorkflowTab === 'rsvp' && isRsvpHistoryLoading) ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            <Loader2 size={16} className="animate-spin" />
            Loading RSVP scanned history...
          </div>
        ) : !activeScannedRows.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-600">
            <AlertCircle size={16} />
            {activeScannedTableEmptyText}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Event Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">User Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeScannedRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 text-slate-700">{formatDateTime(row.time)}</td>
                    <td className="px-4 py-3 text-slate-800">{row.eventName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.userName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.status}</td>
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
              <h3 className="text-base font-semibold text-slate-900">Submit Donation Drive Completion</h3>
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
                Submit Drive Completion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
