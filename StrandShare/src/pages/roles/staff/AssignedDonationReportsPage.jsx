import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Navigation,
  QrCode,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import jsQR from 'jsqr';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import {
  HAIR_SUBMISSION_STATUS,
  parseWaybillQrPayload,
  updateSubmissionStatus,
} from '../../../lib/hairSubmissionWorkflow';

const HAIR_SUBMISSIONS_TABLE = 'Hair_Submissions';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_REGISTRATIONS_TABLE = 'Donation_Drive_Registrations';
const ORGANIZATIONS_TABLE = 'Organizations';
const DONATION_DRIVE_EVENT_ASSETS_BUCKET = 'donation_drive_event_assets';
const MAX_EVENT_ASSET_SIZE_BYTES = 15 * 1024 * 1024;
const SCAN_DEBOUNCE_MS = 2500;
const USER_DETAILS_TABLE = 'user_details';
const UI_SETTINGS_TABLE = 'UI_Settings';

const CAMERA_VIEWPORT_STYLE = {
  width: '100%',
  maxWidth: '320px',
  minWidth: '240px',
  minHeight: '240px',
  aspectRatio: '1 / 1',
};

const WORKFLOW_TABS = [
  { id: 'rsvp', label: 'RSVP Scanner' },
  { id: 'logistics', label: 'Logistics Scanner' },
  { id: 'completion', label: 'Completion' },
];

const EVENT_LIST_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'all', label: 'Custom' },
];

const STATUS = {
  approved: 'Approved',
  completed: 'Completed',
};

function createInitialCompletionForm() {
  return {
    totalRecipients: '',
    totalDonations: '',
    notes: '',
    files: [],
  };
}

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

function withColorAlpha(colorValue, alpha, fallback = '#0275d8') {
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  const parseToRgba = (value) => {
    const input = String(value || '').trim();
    if (!input) {
      return null;
    }

    const rgbMatch = input.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      const [r, g, b] = rgbMatch.slice(1).map((channel) => {
        const parsed = Number(channel);
        return Math.max(0, Math.min(255, Number.isFinite(parsed) ? parsed : 0));
      });

      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const hexSix = input.match(/^#([0-9a-f]{6})$/i);
    if (hexSix) {
      const raw = hexSix[1];
      const r = parseInt(raw.slice(0, 2), 16);
      const g = parseInt(raw.slice(2, 4), 16);
      const b = parseInt(raw.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const hexThree = input.match(/^#([0-9a-f]{3})$/i);
    if (hexThree) {
      const [r, g, b] = hexThree[1].split('').map((channel) => `${channel}${channel}`);
      return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${safeAlpha})`;
    }

    return input;
  };

  return parseToRgba(colorValue)
    || parseToRgba(fallback)
    || `rgba(2, 117, 216, ${safeAlpha})`;
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

function scanStatusChipClass(statusValue) {
  const key = normalizeStatusKey(statusValue);

  if (key.includes('present') || key.includes('checkedin') || key.includes('completed') || key.includes('success')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (key.includes('failed') || key.includes('invalid') || key.includes('error') || key.includes('rejected')) {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }

  if (key.includes('captured') || key.includes('pending') || key.includes('processing')) {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  return 'border-slate-200 bg-slate-100 text-slate-700';
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

function formatTimeOnly(value) {
  if (!value) {
    return 'Time TBD';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Time TBD';
  }

  return parsed.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
  });
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
  const { theme } = useTheme();
  const staffUserId = Number(userProfile?.user_id || 0) || null;

  const [uiSettings, setUiSettings] = useState(null);
  const [requests, setRequests] = useState([]);
  const [organizationNamesById, setOrganizationNamesById] = useState({});
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [completionForm, setCompletionForm] = useState(createInitialCompletionForm);
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
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventFilterId, setEventFilterId] = useState('today');

  const primaryColor = String(uiSettings?.Primary_Color || theme?.primaryColor || '#0275d8').trim() || '#0275d8';
  const primaryTextColor = String(uiSettings?.Primary_Text_Color || theme?.primaryTextColor || '#0f172a').trim() || '#0f172a';
  const secondaryTextColor = String(uiSettings?.Secondary_Text_Color || theme?.secondaryTextColor || '#64748b').trim() || '#64748b';
  const backgroundColor = String(uiSettings?.Background_Color || theme?.backgroundColor || '#f8fafc').trim() || '#f8fafc';
  const pageFontFamily = String(uiSettings?.Font_Family || theme?.selectedFont || theme?.fontFamily || 'Poppins').trim() || 'Poppins';
  const secondaryFontFamily = String(uiSettings?.Secondary_Font_Family || theme?.secondaryFontFamily || pageFontFamily).trim() || pageFontFamily;

  const activeAccentStyle = useMemo(
    () => ({
      borderColor: withColorAlpha(primaryColor, 0.35),
      backgroundColor: withColorAlpha(primaryColor, 0.12),
      color: primaryColor,
    }),
    [primaryColor],
  );

  const activePanelStyle = useMemo(
    () => ({
      borderColor: withColorAlpha(primaryColor, 0.35),
      backgroundColor: withColorAlpha(primaryColor, 0.1),
    }),
    [primaryColor],
  );

  const checkedInCardStyle = useMemo(
    () => ({
      borderColor: withColorAlpha(primaryColor, 0.35),
      backgroundColor: withColorAlpha(primaryColor, 0.12),
      color: primaryTextColor,
    }),
    [primaryColor, primaryTextColor],
  );

  const cameraViewportStyle = useMemo(
    () => ({
      ...CAMERA_VIEWPORT_STYLE,
      backgroundColor: withColorAlpha(primaryTextColor, 0.94),
    }),
    [primaryTextColor],
  );

  const rsvpVideoRef = useRef(null);
  const logisticsVideoRef = useRef(null);
  const scannerCanvasRef = useRef(null);
  const lastScanRef = useRef({
    rsvp: { raw: '', at: 0 },
    logistics: { raw: '', at: 0 },
  });
  const isRsvpProcessingRef = useRef(false);

  const fetchUiSettings = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    const { data, error } = await supabase
      .from(UI_SETTINGS_TABLE)
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setUiSettings(data);
    }
  }, []);

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
          'Donation_Drive_ID, Organization_ID, Event_Title, Event_Overview, Start_Date, End_Date, Updated_At, Status, Assigned_Staff_User_ID, Street, Barangay, City, Province, Total_Recipients',
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
    void fetchUiSettings();
    void loadAssignedDrives();
  }, [fetchUiSettings, loadAssignedDrives]);

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
  const selectedDriveEndDate = toDateValue(selectedDrive?.End_Date);
  const isSelectedDriveEnded = Boolean(
    selectedDrive?.canSubmitCompletion
    || (selectedDriveEndDate && selectedDriveEndDate.getTime() <= Date.now()),
  );
  const isSelectedDriveScannable = Boolean(selectedDriveId && isSelectedDriveStarted && !isSelectedDriveEnded);
  const scannerAvailabilityMessage = useMemo(() => {
    if (!selectedDriveId) {
      return 'Select an event to prepare scanner controls.';
    }

    if (!isSelectedDriveStarted) {
      return `QR scanner will open at ${formatDateTime(selectedDrive?.Start_Date)}.`;
    }

    if (isSelectedDriveEnded) {
      return `QR scanner is closed because this event ended at ${formatDateTime(selectedDrive?.End_Date)}.`;
    }

    return '';
  }, [isSelectedDriveEnded, isSelectedDriveStarted, selectedDrive, selectedDriveId]);

  const isCompletionUnlocked = Boolean(selectedDrive?.canSubmitCompletion);
  const isScannerTabActive = activeWorkflowTab === 'rsvp' || activeWorkflowTab === 'logistics';
  const isScannerLockedByAssignment = activeWorkflowTab === 'rsvp' && !isSelectedDriveAssignedToCurrentStaff;
  const isScannerBlocked = isScannerLockedByAssignment || !isSelectedDriveScannable;
  const isScannerCameraToggleDisabled = !isSelectedDriveScannable || isScannerLockedByAssignment;
  const isManualScannerInputDisabled = !isSelectedDriveScannable || isScannerLockedByAssignment || isSaving;

  const completionGateMessage = useMemo(() => {
    if (!selectedDrive) {
      return 'Select an event to check completion requirements.';
    }

    if (isCompletionUnlocked) {
      return '';
    }

    return `Completion form will unlock after event end (${formatDateTime(selectedDrive.End_Date)}).`;
  }, [isCompletionUnlocked, selectedDrive]);

  useEffect(() => {
    setIsCameraEnabled(false);
    setCompletionForm(createInitialCompletionForm());
  }, [selectedDriveId]);

  useEffect(() => {
    if (!isSelectedDriveScannable && isCameraEnabled) {
      setIsCameraEnabled(false);
    }
  }, [isCameraEnabled, isSelectedDriveScannable]);

  const stats = useMemo(() => {
    const readyToReport = eventTabs.filter((row) => row.canSubmitCompletion).length;
    const waitingForEndDate = eventTabs.length - readyToReport;

    return [
      {
        id: 'assigned',
        shortLabel: 'Assigned Events',
        label: 'Approved events assigned to you',
        value: String(eventTabs.length),
      },
      {
        id: 'ready',
        shortLabel: 'Ready to Complete',
        label: 'Events ended and eligible for completion',
        value: String(readyToReport),
      },
      {
        id: 'waiting',
        shortLabel: 'Awaiting End Date',
        label: 'Events still in progress or upcoming',
        value: String(waitingForEndDate),
      },
    ];
  }, [eventTabs]);

  const filteredSidebarEvents = useMemo(() => {
    const query = normalizeText(eventSearchQuery);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(dayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekEndMs = weekEnd.getTime();

    return eventTabs.filter((row) => {
      const matchesQuery = !query
        || normalizeText(row.Event_Title).includes(query)
        || normalizeText(row.hostOrganizationName).includes(query)
        || normalizeText(row.dateTabLabel).includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (eventFilterId === 'today') {
        return row.isToday;
      }

      if (eventFilterId === 'week') {
        return row.isToday
          || (!row.isEnded && Number.isFinite(row.startMs) && row.startMs <= weekEndMs);
      }

      return true;
    });
  }, [eventFilterId, eventSearchQuery, eventTabs]);

  const sidebarEventGroups = useMemo(() => {
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setHours(0, 0, 0, 0);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const tomorrowStartMs = tomorrowStart.getTime();
    const tomorrowEndMs = tomorrowEnd.getTime();

    const todayRows = filteredSidebarEvents.filter((row) => row.isToday);
    const tomorrowRows = filteredSidebarEvents.filter((row) => (
      !row.isToday
      && !row.isEnded
      && Number.isFinite(row.startMs)
      && row.startMs >= tomorrowStartMs
      && row.startMs <= tomorrowEndMs
    ));
    const upcomingRows = filteredSidebarEvents.filter((row) => (
      !row.isToday
      && !row.isEnded
      && Number.isFinite(row.startMs)
      && row.startMs > tomorrowEndMs
    ));
    const endedRows = filteredSidebarEvents.filter((row) => row.isEnded);

    return [
      { id: 'today', label: 'Active Today', rows: todayRows },
      { id: 'tomorrow', label: 'Tomorrow', rows: tomorrowRows },
      { id: 'upcoming', label: 'Upcoming', rows: upcomingRows },
      { id: 'ended', label: 'Ended', rows: endedRows },
    ].filter((group) => group.rows.length > 0);
  }, [filteredSidebarEvents]);

  const selectedEventLocation = useMemo(() => {
    if (!selectedDrive) {
      return 'Location not set';
    }

    const parts = [
      selectedDrive.Street,
      selectedDrive.Barangay,
      selectedDrive.City,
      selectedDrive.Province,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    return parts.join(', ') || 'Location not set';
  }, [selectedDrive]);

  const selectedEventMapUrl = useMemo(() => {
    if (!selectedDrive || selectedEventLocation === 'Location not set') {
      return '';
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEventLocation)}`;
  }, [selectedDrive, selectedEventLocation]);

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

    if (!isSelectedDriveScannable) {
      const availabilityMessage = scannerAvailabilityMessage || 'RSVP scanner is unavailable for this event schedule.';
      setScannerNotice('rsvp', 'warning', availabilityMessage);
      setLastRsvpScan({
        status: 'failed',
        userId: null,
        scannedAt: new Date().toISOString(),
        reason: availabilityMessage,
        raw: String(decodedText || '').trim(),
      });
      return;
    }

    const parsedPayload = parseDonationQrPayload(decodedText);
    if (!parsedPayload.userId) {
      const parseMessage = 'QR does not contain a valid donor User ID.';
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
  }, [
    isSelectedDriveAssignedToCurrentStaff,
    isSelectedDriveScannable,
    loadRsvpScanHistory,
    scannerAvailabilityMessage,
    selectedDriveId,
    setScannerNotice,
    userProfile,
  ]);

  const handleLogisticsScan = useCallback(async (decodedText) => {
    if (!isSelectedDriveScannable) {
      const availabilityMessage = scannerAvailabilityMessage || 'Logistics scanner is unavailable for this event schedule.';
      setScannerNotice('logistics', 'warning', availabilityMessage);
      setLastLogisticsScan({
        status: 'failed',
        userId: null,
        driveId: selectedDriveId,
        scannedAt: new Date().toISOString(),
        raw: String(decodedText || '').trim(),
        reason: availabilityMessage,
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const trimmed = String(decodedText || '').trim();
    const waybill = parseWaybillQrPayload(trimmed);

    if (waybill && (waybill.submissionId || waybill.submissionCode)) {
      try {
        let lookup = null;
        if (waybill.submissionId) {
          lookup = await supabase
            .from(HAIR_SUBMISSIONS_TABLE)
            .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code')
            .eq('Submission_ID', waybill.submissionId)
            .maybeSingle();
        } else if (waybill.submissionCode) {
          lookup = await supabase
            .from(HAIR_SUBMISSIONS_TABLE)
            .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code')
            .eq('Submission_Code', waybill.submissionCode)
            .maybeSingle();
        }

        if (lookup?.error) {
          throw lookup.error;
        }

        const submission = lookup?.data;
        if (!submission?.Submission_ID) {
          const message = `No hair submission found for waybill ${waybill.submissionCode || waybill.submissionId}.`;
          setScannerNotice('logistics', 'error', message);
          setLastLogisticsScan({
            status: 'failed',
            userId: null,
            driveId: selectedDriveId,
            scannedAt: nowIso,
            raw: trimmed,
            reason: message,
          });
          return;
        }

        if (Number(submission.Donation_Drive_ID) !== Number(selectedDriveId)) {
          const message = `Waybill ${submission.Submission_Code || submission.Submission_ID} belongs to a different drive.`;
          setScannerNotice('logistics', 'error', message);
          setLastLogisticsScan({
            status: 'failed',
            userId: submission.User_ID || null,
            driveId: submission.Donation_Drive_ID,
            scannedAt: nowIso,
            raw: trimmed,
            reason: message,
          });
          return;
        }

        const currentStatus = String(submission.Status || '').toLowerCase();
        if (currentStatus === HAIR_SUBMISSION_STATUS.CUT_SHIPPED.toLowerCase()
          || currentStatus === HAIR_SUBMISSION_STATUS.RECEIVED.toLowerCase()
          || currentStatus === HAIR_SUBMISSION_STATUS.APPROVED.toLowerCase()
          || currentStatus === HAIR_SUBMISSION_STATUS.REJECTED.toLowerCase()
          || currentStatus === HAIR_SUBMISSION_STATUS.BUNDLED.toLowerCase()
          || currentStatus === HAIR_SUBMISSION_STATUS.WIG_CREATED.toLowerCase()) {
          const message = `Waybill ${submission.Submission_Code || submission.Submission_ID} already past Cut & Shipped (current: ${submission.Status}).`;
          setScannerNotice('logistics', 'warning', message);
          setLastLogisticsScan({
            status: 'duplicate',
            userId: submission.User_ID,
            driveId: submission.Donation_Drive_ID,
            scannedAt: nowIso,
            raw: trimmed,
            reason: message,
          });
          return;
        }

        const { error: updateError } = await updateSubmissionStatus({
          submissionId: submission.Submission_ID,
          nextStatus: HAIR_SUBMISSION_STATUS.CUT_SHIPPED,
          donorUserId: submission.User_ID,
          submissionCode: submission.Submission_Code,
          eventTitle: selectedEventName,
          changedBy: Number(userProfile?.user_id || 0) || null,
        });

        if (updateError) throw updateError;

        const successMessage = `Waybill ${submission.Submission_Code || submission.Submission_ID} marked Cut & Shipped. Donor notified.`;
        setScannerNotice('logistics', 'success', successMessage);
        setLastLogisticsScan({
          status: 'success',
          userId: submission.User_ID,
          driveId: submission.Donation_Drive_ID,
          scannedAt: nowIso,
          raw: trimmed,
          reason: successMessage,
        });

        setLogisticsScanHistoryRows((previous) => {
          const nextRow = {
            id: `wb-${submission.Submission_ID}-${Date.now()}`,
            driveId: selectedDriveId,
            eventName: selectedEventName,
            scannedAt: nowIso,
            userId: submission.User_ID,
            userName: `User #${submission.User_ID} - ${submission.Submission_Code || `HS-${submission.Submission_ID}`}`,
            status: 'Cut & Shipped',
          };
          return [nextRow, ...previous].slice(0, 200);
        });

        if (submission.User_ID) {
          void loadUserNamesByIds([submission.User_ID]);
        }

        await logAuditAction({
          action: 'hair_submissions.cut_shipped',
          description: `Marked waybill ${submission.Submission_Code || submission.Submission_ID} as Cut & Shipped`,
          resource: HAIR_SUBMISSIONS_TABLE,
          status: 'success',
          userProfile,
        });

        return;
      } catch (error) {
        const message = error?.message || 'Unable to update waybill status.';
        setScannerNotice('logistics', 'error', message);
        setLastLogisticsScan({
          status: 'failed',
          userId: null,
          driveId: selectedDriveId,
          scannedAt: nowIso,
          raw: trimmed,
          reason: message,
        });
        return;
      }
    }

    const parsedPayload = parseDonationQrPayload(decodedText);

    const infoMessage = parsedPayload.userId
      ? `Scan captured for User #${parsedPayload.userId}, but it does not match a hair submission waybill.`
      : 'Scan captured, but no waybill or User ID was detected.';

    setScannerNotice('logistics', 'warning', infoMessage);
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
  }, [
    isSelectedDriveScannable,
    loadUserNamesByIds,
    scannerAvailabilityMessage,
    selectedDriveId,
    selectedEventName,
    setScannerNotice,
    userProfile,
  ]);

  const submitManualScan = useCallback((tabKey) => {
    const isRsvp = tabKey === 'rsvp';
    const isLockedByAssignment = isRsvp && !isSelectedDriveAssignedToCurrentStaff;

    if (isLockedByAssignment) {
      setScannerNotice('rsvp', 'error', 'RSVP scanner is locked. This event is not assigned to your staff account.');
      return;
    }

    if (!isSelectedDriveScannable) {
      setScannerNotice(tabKey, 'warning', scannerAvailabilityMessage || 'QR scanner is unavailable for this event schedule.');
      return;
    }

    const nextValue = String(manualQrInput[tabKey] || '').trim();
    if (!nextValue) {
      setScannerNotice(tabKey, 'error', 'Enter QR payload text before submitting manual scan.');
      return;
    }

    if (tabKey === 'rsvp') {
      void handleRsvpScan(nextValue);
    } else {
      void handleLogisticsScan(nextValue);
    }

    setManualQrInput((previous) => ({
      ...previous,
      [tabKey]: '',
    }));
  }, [
    handleLogisticsScan,
    handleRsvpScan,
    isSelectedDriveAssignedToCurrentStaff,
    isSelectedDriveScannable,
    manualQrInput,
    scannerAvailabilityMessage,
    setScannerNotice,
  ]);

  useEffect(() => {
    if (activeWorkflowTab !== 'rsvp' && activeWorkflowTab !== 'logistics') {
      return undefined;
    }

    if (!selectedDriveId) {
      setScannerNotice(activeWorkflowTab, 'info', 'Select an event to prepare scanner controls.');
      return undefined;
    }

    if (!isSelectedDriveScannable) {
      setScannerNotice(activeWorkflowTab, 'warning', scannerAvailabilityMessage || 'QR scanner is unavailable for this event schedule.');
      return undefined;
    }

    if (!isCameraEnabled) {
      setScannerNotice(activeWorkflowTab, 'info', 'Camera is OFF for privacy. Click Turn Camera On to start scanning.');
      return undefined;
    }

    if (activeWorkflowTab === 'rsvp' && !isSelectedDriveAssignedToCurrentStaff) {
      setScannerNotice('rsvp', 'error', 'RSVP scanner is locked. This event is not assigned to your staff account.');
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
              void handleLogisticsScan(decodedText);
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
    isSelectedDriveScannable,
    scannerAvailabilityMessage,
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
        qrId: userId ? `USR-${String(userId).padStart(4, '0')}` : `RSVP-${row.id}`,
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
        qrId: row.userId ? `USR-${String(row.userId).padStart(4, '0')}` : `LOG-${row.id}`,
        status: row.status || 'Captured',
      }));
  }, [logisticsScanHistoryRows, selectedDriveId, selectedEventName, userNamesByUserId]);

  const completionScannedTableRows = useMemo(() => {
    if (!selectedDrive || !isCompletionUnlocked) {
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
        qrId: `CMP-${selectedDrive.Donation_Drive_ID}`,
        status: statusLabel,
      },
    ];
  }, [currentStaffName, isCompletionUnlocked, selectedDrive, selectedEventName]);

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
      return 'Recently Scanned Attendees';
    }

    if (activeWorkflowTab === 'logistics') {
      return 'Recently Scanned Logistics';
    }

    return 'Completion Activity';
  }, [activeWorkflowTab]);

  const activeScannedTableEmptyText = useMemo(() => {
    if (activeWorkflowTab === 'rsvp') {
      return 'No attendee has been checked in for this event yet.';
    }

    if (activeWorkflowTab === 'logistics') {
      return 'No logistics scans captured yet for this selected event.';
    }

    if (!isCompletionUnlocked) {
      return 'Completion records are hidden until this event reaches end date.';
    }

    return 'No completion record is available for this event yet.';
  }, [activeWorkflowTab, isCompletionUnlocked]);

  const checkedInCount = rsvpScannedTableRows.length;
  const expectedAttendees = Number(selectedDrive?.Total_Recipients || 0) || null;
  const checkedInPercent = expectedAttendees
    ? Math.min(100, Math.round((checkedInCount / expectedAttendees) * 100))
    : null;

  const handleCompletionFileChange = (event) => {
    const nextFiles = Array.from(event.target.files || []);
    setCompletionForm((previous) => ({
      ...previous,
      files: nextFiles,
    }));
  };

  const handleSubmitCompletion = async () => {
    const driveId = Number(selectedDrive?.Donation_Drive_ID || 0) || null;

    if (!driveId || !selectedDrive) {
      return;
    }

    if (!isCompletionUnlocked) {
      setNotice({ kind: 'warning', text: completionGateMessage || 'Completion form is locked until event end date.' });
      return;
    }

    const recipients = Number(String(completionForm.totalRecipients || '').trim());
    const donations = Number(String(completionForm.totalDonations || '').trim());
    const notes = String(completionForm.notes || '').trim();

    if (!Number.isFinite(recipients) || recipients < 0) {
      setNotice({ kind: 'error', text: 'Total recipients must be a valid non-negative number.' });
      return;
    }

    if (!Number.isFinite(donations) || donations < 0) {
      setNotice({ kind: 'error', text: 'Total donations collected must be a valid non-negative number.' });
      return;
    }

    const fileError = validateCompletionFiles(completionForm.files);
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

      const driveSlug = toSlug(selectedDrive.Event_Title || `drive-${driveId}`);
      const uploadedFiles = [];

      for (const file of completionForm.files) {
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
      setCompletionForm(createInitialCompletionForm());
      await loadAssignedDrives();
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.complete',
        description: `Failed donation drive completion submission for drive #${driveId || 'N/A'}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5" style={{ fontFamily: pageFontFamily, color: primaryTextColor, backgroundColor }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: primaryTextColor }}>
            Assigned Donation Drive
          </h1>
          <p className="mt-1 text-sm" style={{ color: secondaryTextColor, fontFamily: secondaryFontFamily }}>
            Scan attendee QR codes, monitor turnout, and complete assigned drives in one focused workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAssignedDrives()}
          disabled={isLoading || isSaving}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {notice.text && (
        <div
          className={`rounded-xl border px-3 py-2 text-sm font-medium ${
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

      {!eventTabs.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          No approved donation drive is currently assigned to your account.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Assigned Events</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {eventTabs.length}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                <Search size={14} className="text-slate-400" />
                <input
                  value={eventSearchQuery}
                  onChange={(event) => setEventSearchQuery(event.target.value)}
                  placeholder="Search events"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {EVENT_LIST_FILTERS.map((filter) => {
                  const isActive = eventFilterId === filter.id;

                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setEventFilterId(filter.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                        isActive
                          ? 'border'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                      style={isActive ? activeAccentStyle : undefined}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[650px] space-y-4 overflow-y-auto px-3 py-3">
              {!sidebarEventGroups.length ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  No events matched your filter.
                </div>
              ) : (
                sidebarEventGroups.map((group) => (
                  <div key={group.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{group.label}</p>
                      <span className="text-[11px] font-semibold text-slate-400">{group.rows.length}</span>
                    </div>

                    <div className="space-y-2">
                      {group.rows.map((row) => {
                        const isActive = Number(row.Donation_Drive_ID || 0) === Number(selectedDriveId || 0);

                        return (
                          <button
                            key={row.Donation_Drive_ID}
                            type="button"
                            onClick={() => setActiveDriveId(row.Donation_Drive_ID)}
                            className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                              isActive
                                ? 'border shadow-sm'
                                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                            style={isActive ? activePanelStyle : undefined}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="line-clamp-1 text-sm font-semibold text-slate-900">{row.Event_Title || `Drive #${row.Donation_Drive_ID}`}</p>
                                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{row.hostOrganizationName}</p>
                              </div>
                              <span className="text-[11px] font-semibold text-slate-500">{formatTimeOnly(row.Start_Date)}</span>
                            </div>

                            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                              <span>{formatDateOnly(row.Start_Date)}</span>
                              <span className="rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600">
                                {row.timelineLabel}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}

              <div className="grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
                {stats.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{item.shortLabel}</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            {!!selectedDrive && (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                          style={activeAccentStyle}
                        >
                          {selectedDrive.timelineLabel || 'Scheduled'}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Event ID: #EV-{selectedDrive.Donation_Drive_ID}
                        </span>
                      </div>

                      <h2 className="mt-2 text-3xl font-bold leading-tight text-slate-900">
                        {selectedEventName}
                      </h2>

                      <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                        <MapPin size={15} className="text-slate-400" />
                        {selectedEventLocation}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={selectedEventMapUrl || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-disabled={!selectedEventMapUrl}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          selectedEventMapUrl
                            ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            : 'pointer-events-none border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                      >
                        <Navigation size={13} />
                        Directions
                      </a>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    {selectedDrive.Event_Overview || `Event schedule: ${formatDateRange(selectedDrive.Start_Date, selectedDrive.End_Date)}`}
                  </p>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {WORKFLOW_TABS.map((tab) => {
                          const isActive = activeWorkflowTab === tab.id;

                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setActiveWorkflowTab(tab.id)}
                              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                                isActive
                                  ? 'border'
                                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50'
                              }`}
                              style={isActive ? activeAccentStyle : undefined}
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      {isScannerTabActive && (
                        <button
                          type="button"
                          onClick={() => setIsCameraEnabled((previous) => !previous)}
                          disabled={isScannerCameraToggleDisabled}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                            isCameraEnabled
                              ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                          style={!isCameraEnabled ? { borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor } : undefined}
                        >
                          <Camera size={13} />
                          {isCameraEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="space-y-3">
                      {activeWorkflowTab === 'completion' ? (
                        <div className="space-y-3">
                          {!isCompletionUnlocked ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                              {completionGateMessage}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-200 bg-white p-4">
                              <h3 className="text-base font-semibold text-slate-900">Submit Donation Drive Completion</h3>
                              <p className="mt-1 text-xs text-slate-500">
                                Completion is enabled because this event has ended. Fill all required fields and upload attachments.
                              </p>

                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Total Recipients *</label>
                                  <input
                                    value={completionForm.totalRecipients}
                                    onChange={(event) => setCompletionForm((previous) => ({ ...previous, totalRecipients: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                                    placeholder="e.g. 120"
                                    disabled={isSaving}
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Total Donations Collected *</label>
                                  <input
                                    value={completionForm.totalDonations}
                                    onChange={(event) => setCompletionForm((previous) => ({ ...previous, totalDonations: event.target.value }))}
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                                    placeholder="e.g. 85"
                                    disabled={isSaving}
                                  />
                                </div>
                              </div>

                              <div className="mt-3">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Completion Notes</label>
                                <textarea
                                  value={completionForm.notes}
                                  onChange={(event) => setCompletionForm((previous) => ({ ...previous, notes: event.target.value }))}
                                  className="min-h-[96px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                                  placeholder="Brief event outcome and highlights"
                                  disabled={isSaving}
                                />
                              </div>

                              <div className="mt-3">
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
                                  {completionForm.files.length
                                    ? `${completionForm.files.length} file(s) selected`
                                    : `Max file size: ${formatFileSize(MAX_EVENT_ASSET_SIZE_BYTES)} each.`}
                                </p>
                              </div>

                              <div className="mt-4 flex justify-end">
                                <button
                                  type="button"
                                  onClick={handleSubmitCompletion}
                                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                                  style={{ backgroundColor: primaryColor }}
                                  disabled={isSaving}
                                >
                                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                  Submit Drive Completion
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div
                            className={`rounded-xl border px-3 py-2 text-sm font-medium ${scannerStatusClass(
                              activeWorkflowTab === 'rsvp' ? scannerState.rsvp.kind : scannerState.logistics.kind,
                            )}`}
                          >
                            {activeWorkflowTab === 'rsvp' ? scannerState.rsvp.text : scannerState.logistics.text}
                          </div>

                          {isScannerBlocked ? (
                            <div
                              className="mx-auto w-full overflow-hidden rounded-xl border border-slate-200"
                              style={cameraViewportStyle}
                            >
                              <div className="relative h-full w-full">
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                  <div
                                    className="flex h-16 w-16 items-center justify-center rounded-full"
                                    style={{ backgroundColor: withColorAlpha(primaryColor, 0.12) }}
                                  >
                                    <CameraOff size={30} style={{ color: primaryColor }} />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div
                              className="mx-auto w-full overflow-hidden rounded-xl border border-slate-200"
                              style={cameraViewportStyle}
                            >
                              <div className="relative h-full w-full">
                                <video
                                  ref={activeWorkflowTab === 'rsvp' ? rsvpVideoRef : logisticsVideoRef}
                                  className="h-full w-full object-cover"
                                  autoPlay
                                  playsInline
                                  muted
                                />
                                {!isCameraEnabled && (
                                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <div
                                      className="flex h-16 w-16 items-center justify-center rounded-full"
                                      style={{ backgroundColor: withColorAlpha(primaryColor, 0.12) }}
                                    >
                                      <CameraOff size={30} style={{ color: primaryColor }} />
                                    </div>
                                  </div>
                                )}
                                <div className="pointer-events-none absolute inset-0">
                                  {isCameraEnabled && <div className="scanner-beam" />}
                                  {isCameraEnabled && (
                                    <>
                                      <div className="absolute left-4 top-4 h-8 w-8 border-l-4 border-t-4 scanner-corner" />
                                      <div className="absolute right-4 top-4 h-8 w-8 border-r-4 border-t-4 scanner-corner" />
                                      <div className="absolute bottom-4 left-4 h-8 w-8 border-b-4 border-l-4 scanner-corner" />
                                      <div className="absolute bottom-4 right-4 h-8 w-8 border-b-4 border-r-4 scanner-corner" />
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                              <QrCode size={13} />
                              {activeWorkflowTab === 'rsvp' ? 'Manual RSVP Input' : 'Manual Logistics Input'}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                value={activeWorkflowTab === 'rsvp' ? manualQrInput.rsvp : manualQrInput.logistics}
                                onChange={(event) => setManualQrInput((previous) => ({
                                  ...previous,
                                  [activeWorkflowTab === 'rsvp' ? 'rsvp' : 'logistics']: event.target.value,
                                }))}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                                placeholder={activeWorkflowTab === 'rsvp' ? 'Paste RSVP QR payload' : 'Paste logistics QR payload'}
                                disabled={isManualScannerInputDisabled}
                              />
                              <button
                                type="button"
                                onClick={() => submitManualScan(activeWorkflowTab === 'rsvp' ? 'rsvp' : 'logistics')}
                                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                                style={{ backgroundColor: primaryColor }}
                                disabled={isManualScannerInputDisabled}
                              >
                                {activeWorkflowTab === 'rsvp' ? 'Check In' : 'Capture'}
                              </button>
                            </div>
                          </div>

                          {activeWorkflowTab === 'rsvp' && lastRsvpScan && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                              <p className="font-semibold text-slate-900">Last RSVP Scan</p>
                              <p className="mt-1">User: {lastRsvpScan.userId ? `#${lastRsvpScan.userId}` : 'Unknown'}</p>
                              <p>Time: {formatDateTime(lastRsvpScan.scannedAt)}</p>
                              <p>Status: {lastRsvpScan.status}</p>
                              <p className="mt-1 text-xs text-slate-500">{lastRsvpScan.reason}</p>
                            </div>
                          )}

                          {activeWorkflowTab === 'logistics' && lastLogisticsScan && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                              <p className="font-semibold text-slate-900">Last Logistics Scan</p>
                              <p className="mt-1">User: {lastLogisticsScan.userId ? `#${lastLogisticsScan.userId}` : 'Unknown'}</p>
                              <p>Drive: {lastLogisticsScan.driveId ? `#${lastLogisticsScan.driveId}` : 'Not encoded'}</p>
                              <p>Time: {formatDateTime(lastLogisticsScan.scannedAt)}</p>
                              <p>Status: {lastLogisticsScan.status}</p>
                              <p className="mt-1 text-xs text-slate-500">{lastLogisticsScan.reason}</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <aside className="space-y-3">
                      <div className="rounded-2xl border p-4" style={checkedInCardStyle}>
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: secondaryTextColor }}>
                          Checked In
                        </p>
                        <div className="mt-2 flex items-end gap-2">
                          <p className="text-4xl font-bold leading-none">{checkedInCount}</p>
                          <p className="pb-1 text-sm" style={{ color: secondaryTextColor }}>
                            {expectedAttendees ? `/ ${expectedAttendees}` : 'attendees'}
                          </p>
                        </div>
                        <div className="mt-3 h-2 rounded-full" style={{ backgroundColor: withColorAlpha(primaryColor, 0.2) }}>
                          <div
                            className="h-2 rounded-full"
                            style={{ width: `${checkedInPercent || 0}%`, backgroundColor: primaryColor }}
                          />
                        </div>
                        <p className="mt-2 text-xs" style={{ color: secondaryTextColor }}>
                          {checkedInPercent !== null ? `${checkedInPercent}% attendance recorded` : 'Attendance baseline not set'}
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                        <p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-800">
                          <Clock3 size={14} className="text-slate-400" />
                          {formatDateRange(selectedDrive.Start_Date, selectedDrive.End_Date)}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">Host: {selectedDrive.hostOrganizationName}</p>
                      </div>

                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Scanner Reminder</p>
                        <p className="mt-1 text-xs text-amber-700">
                          Scan only RSVP QR codes generated for this selected event.
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <Users size={13} />
                          Drive Summary
                        </p>
                        <div className="space-y-2">
                          {stats.map((item) => (
                            <div key={item.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
                              <span>{item.label}</span>
                              <span className="font-semibold text-slate-900">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </aside>
                  </div>
                </div>
              </>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold text-slate-900">{activeScannedTableTitle}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Selected event: {selectedEventName}</p>
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
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Attendee Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">QR ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Time</th>
                        <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeScannedRows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-200">
                          <td className="px-4 py-3 text-slate-800">
                            <p className="font-medium">{row.userName}</p>
                            <p className="text-xs text-slate-500">{row.eventName}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.qrId || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{formatTimeOnly(row.time)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${scanStatusChipClass(row.status)}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
