import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Users2,
  X,
} from 'lucide-react';
import organizationAddressOptions from '../../../data/organizationAddressOptions.json';
import { useTheme } from '../../../context/ThemeContext';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const DONATION_REQUIREMENTS_TABLE = 'Donation_Requirements';
const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_ALLOWED_GROUPS_TABLE = 'Donation_Drive_Allowed_Groups';
const ORGANIZATIONS_TABLE = 'Organizations';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const DONATION_DRIVE_PROPOSALS_BUCKET = 'donation_drive_proposals';
const MAX_PROPOSAL_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const INITIAL_REQUEST_STATUS = 'Pending Staff Approval';
const DEFAULT_COUNTRY = 'Philippines';
const PHILIPPINE_ADDRESS_TREE = organizationAddressOptions && typeof organizationAddressOptions === 'object'
  ? organizationAddressOptions
  : {};

const DEFAULT_FORM = {
  eventTitle: '',
  eventOverview: '',
  startDate: '',
  endDate: '',
  setupType: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  country: DEFAULT_COUNTRY,
  latitude: '',
  longitude: '',
  scopeMode: 'own',
};

const WIZARD_STEPS = [
  { id: 1, key: 'event', label: 'Event Details', icon: CalendarDays, hint: 'When and what' },
  { id: 2, key: 'location', label: 'Location', icon: MapPin, hint: 'Where it happens' },
  { id: 3, key: 'scope', label: 'Scope & Review', icon: Users2, hint: 'Who can join' },
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

  const rgbMatch = input.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1).map((channel) => Math.max(0, Math.min(255, Number(channel) || 0)));
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }

  return withColorAlpha(fallback, safeAlpha, '#0275d8');
}

function toUnifiedRegionOptions(addressData) {
  const data = addressData && typeof addressData === 'object' ? addressData : {};

  const psgcRegionOptions = Object.entries(data)
    .filter(([, regionData]) => {
      return (
        regionData
        && typeof regionData === 'object'
        && !Array.isArray(regionData)
        && typeof regionData.region_name === 'string'
        && regionData.region_name.trim()
        && regionData.province_list
        && typeof regionData.province_list === 'object'
        && !Array.isArray(regionData.province_list)
      );
    })
    .map(([, regionData]) => ({
      name: regionData.region_name,
      provinces: Object.entries(regionData.province_list || {}).map(([provinceName, provinceData]) => ({
        name: provinceName,
        cities: Object.entries(provinceData?.municipality_list || {}).map(([cityName, cityData]) => ({
          name: cityName,
          barangays: Array.isArray(cityData?.barangay_list) ? cityData.barangay_list : [],
        })),
      })),
    }));

  return psgcRegionOptions
    .map((region) => ({
      ...region,
      provinces: (region.provinces || [])
        .map((province) => ({
          ...province,
          cities: (province.cities || []).slice().sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

function toSafeFileName(fileName = 'proposal.pdf') {
  return String(fileName)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function toSlug(value = '') {
  return String(value)
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

function toNumberOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toPostgresTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:(\d{2}))?$/);
  if (match) {
    const seconds = match[7] || '00';
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${seconds}+08:00`;
  }

  return raw;
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
  if (!startDate && !endDate) {
    return 'No schedule set';
  }

  const startLabel = formatDateTime(startDate);
  const endLabel = formatDateTime(endDate);

  if (!startDate) {
    return `Until ${endLabel}`;
  }

  if (!endDate) {
    return `Starts ${startLabel}`;
  }

  return `${startLabel} to ${endLabel}`;
}

function boolRuleLabel(value) {
  return value ? 'Allowed' : 'Not allowed';
}

function mapStatusMeta(statusValue) {
  const key = normalizeRoleKey(statusValue);

  if (key === 'approved') {
    return {
      label: 'Approved',
      approvalHint: 'Completed by Staff and Super Admin.',
      tone: 'success',
    };
  }

  if (key === 'rejected' || key === 'declined' || key === 'cancelled') {
    return {
      label: 'Rejected',
      approvalHint: 'Request closed. Check review notes with approvers.',
      tone: 'danger',
    };
  }

  if (key === 'pendingsuperadminapproval' || key === 'pendingadminapproval') {
    return {
      label: 'Pending Super Admin Approval',
      approvalHint: 'Staff review completed. Waiting for Super Admin decision.',
      tone: 'warning',
    };
  }

  if (key === 'pendingstaffapproval' || key === 'pending') {
    return {
      label: 'Pending Staff Approval',
      approvalHint: 'Queued for Staff review before Super Admin.',
      tone: 'info',
    };
  }

  return {
    label: String(statusValue || 'Pending'),
    approvalHint: 'Waiting for review updates.',
    tone: 'neutral',
  };
}

function statusToneStyle(tone, primaryColor) {
  switch (tone) {
    case 'success':
      return { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' };
    case 'danger':
      return { backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#b91c1c' };
    case 'warning':
      return { backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#b45309' };
    case 'info':
      return {
        backgroundColor: withColorAlpha(primaryColor, 0.12),
        borderColor: withColorAlpha(primaryColor, 0.4),
        color: primaryColor,
      };
    default:
      return { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#475569' };
  }
}

function toUniqueOrganizationNames(rows) {
  const names = (Array.isArray(rows) ? rows : [])
    .map((row) => String(row?.Group_Name || '').trim())
    .filter(Boolean);

  return Array.from(new Set(names));
}

function formatDriveScopeLabel({ isOpenForAll, hostOrganizationName, allowedGroups }) {
  if (Boolean(isOpenForAll)) {
    return 'Open to all organizations';
  }

  const uniqueGroupNames = toUniqueOrganizationNames(allowedGroups);

  if (uniqueGroupNames.length > 0) {
    return `Specific organizations: ${uniqueGroupNames.join(', ')}`;
  }

  return `Only ${hostOrganizationName || 'my organization'}`;
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load donation drive data.');
  const lower = message.toLowerCase();

  if (lower.includes('row-level security')) {
    return 'Access is blocked by database policy. Ask Super Admin to verify Organization permissions.';
  }

  if (lower.includes('donation_requirements') && lower.includes('does not exist')) {
    return 'Donation_Requirements table is missing. Run migration 029_donation_requirements_policies.sql.';
  }

  if (lower.includes('donation_drive_requests') && lower.includes('does not exist')) {
    return 'Donation_Drive_Requests table is missing. Please apply the latest donation drive migration.';
  }

  if (lower.includes('organization_members') && lower.includes('does not exist')) {
    return 'Organization_Members table is missing. Run migration 024_simplify_organization_tables_to_two_tables.sql.';
  }

  if (lower.includes('donation_drive_allowed_groups') && lower.includes('does not exist')) {
    return 'Donation_Drive_Allowed_Groups table is missing. Run migration 031_donation_drive_allowed_groups_policies.sql.';
  }

  if (lower.includes('donation_drive_proposals') && lower.includes('bucket')) {
    return 'Donation drive proposal storage bucket is missing. Run migration 030_donation_drive_proposals_storage_policies.sql.';
  }

  return message;
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('bucket') && lower.includes('not found')) {
    return `Donation drive proposal bucket is missing. Expected: ${DONATION_DRIVE_PROPOSALS_BUCKET}.`;
  }

  if (lower.includes('row-level security')) {
    return 'Proposal upload is blocked by Storage RLS policy. Run migration 030_donation_drive_proposals_storage_policies.sql.';
  }

  return message || 'Unable to upload proposal attachment.';
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to submit donation drive request.');
  const lower = message.toLowerCase();

  if (lower.includes('bucket') || lower.includes('storage')) {
    return mapStorageUploadError(message);
  }

  if (lower.includes('row-level security')) {
    return 'Submission blocked by database policy. Ensure Organization role has insert access to Donation_Drive_Requests.';
  }

  if (lower.includes('donation_drive_requests') && lower.includes('does not exist')) {
    return 'Donation_Drive_Requests table is missing. Please apply the latest donation drive migration.';
  }

  if (lower.includes('donation_drive_allowed_groups') && lower.includes('does not exist')) {
    return 'Donation_Drive_Allowed_Groups table is missing. Run migration 031_donation_drive_allowed_groups_policies.sql.';
  }

  return message;
}

async function uploadProposalAttachment({
  file,
  authFolder,
  organizationName,
  eventTitle,
}) {
  if (!supabase) {
    throw new Error('Supabase is not configured for file upload.');
  }

  const safeFileName = toSafeFileName(file?.name || 'proposal.pdf');
  const proposalSlug = toSlug(`${organizationName}-${eventTitle}`) || 'donation-drive-proposal';
  const filePath = `${authFolder}/donation-drive-proposals/${proposalSlug}-${Date.now()}-${safeFileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DONATION_DRIVE_PROPOSALS_BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: 'application/pdf',
    });

  if (uploadError) {
    throw new Error(mapStorageUploadError(uploadError.message));
  }

  return {
    filePath,
    fileName: safeFileName,
    bucketId: DONATION_DRIVE_PROPOSALS_BUCKET,
  };
}

export default function SubmitDonationsRequestPage({ userProfile }) {
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
  const labelStyle = { color: secondaryTextColor };

  const [requirements, setRequirements] = useState(null);
  const [organizationScope, setOrganizationScope] = useState(null);
  const [requests, setRequests] = useState([]);
  const [allowedGroupsByDriveId, setAllowedGroupsByDriveId] = useState({});
  const [selectableOrganizations, setSelectableOrganizations] = useState([]);
  const [selectedAllowedOrganizationIds, setSelectedAllowedOrganizationIds] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [proposalFile, setProposalFile] = useState(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalData, setSuccessModalData] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [stepError, setStepError] = useState('');

  const regionOptions = useMemo(() => toUnifiedRegionOptions(PHILIPPINE_ADDRESS_TREE), []);

  const selectedRegion = useMemo(
    () => regionOptions.find((region) => region.name === form.region) || null,
    [form.region, regionOptions],
  );

  const provinceOptions = useMemo(() => selectedRegion?.provinces || [], [selectedRegion]);

  const selectedProvince = useMemo(
    () => provinceOptions.find((province) => province.name === form.province) || null,
    [form.province, provinceOptions],
  );

  const cityOptions = useMemo(() => selectedProvince?.cities || [], [selectedProvince]);

  const selectedCity = useMemo(
    () => cityOptions.find((city) => city.name === form.city) || null,
    [cityOptions, form.city],
  );

  const barangayOptions = useMemo(() => selectedCity?.barangays || [], [selectedCity]);

  const requiresManualCityInput = Boolean(form.province) && cityOptions.length === 0;
  const requiresManualBarangayInput = Boolean(form.city) && barangayOptions.length === 0;

  const canSubmit =
    Boolean(organizationScope?.organizationId)
    && Boolean(requirements?.Donation_Requirement_ID)
    && !isLoading
    && !isSubmitting;

  const selectedAllowedOrganizationNames = useMemo(() => {
    const selectedSet = new Set(selectedAllowedOrganizationIds.map((value) => Number(value)));

    return selectableOrganizations
      .filter((row) => selectedSet.has(Number(row.Organization_ID)))
      .map((row) => String(row.Organization_Name || '').trim())
      .filter(Boolean);
  }, [selectedAllowedOrganizationIds, selectableOrganizations]);

  const requirementRows = useMemo(
    () => [
      {
        label: 'Minimum Number of Donors',
        value:
          requirements?.Minimum_Number_Donor === null || requirements?.Minimum_Number_Donor === undefined
            ? 'Not set'
            : String(requirements.Minimum_Number_Donor),
      },
      {
        label: 'Minimum Hair Length',
        value:
          requirements?.Minimum_Hair_Length === null || requirements?.Minimum_Hair_Length === undefined
            ? 'Not set'
            : `${requirements.Minimum_Hair_Length} inches`,
      },
      { label: 'Chemical Treatment', value: boolRuleLabel(Boolean(requirements?.Chemical_Treatment_Status)) },
      { label: 'Colored Hair', value: boolRuleLabel(Boolean(requirements?.Colored_Hair_Status)) },
      { label: 'Bleached Hair', value: boolRuleLabel(Boolean(requirements?.Bleached_Hair_Status)) },
      { label: 'Rebonded Hair', value: boolRuleLabel(Boolean(requirements?.Rebonded_Hair_Status)) },
      { label: 'Hair Texture Rule', value: String(requirements?.Hair_Texture_Status || 'Not set') },
      { label: 'Notes', value: String(requirements?.Notes || 'No notes provided') },
    ],
    [requirements],
  );

  const loadPageData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      setRequirements(null);
      setOrganizationScope(null);
      setRequests([]);
      setAllowedGroupsByDriveId({});
      setSelectableOrganizations([]);
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    if (!actorUserId) {
      setNotice({
        kind: 'error',
        text: 'User profile is missing user_id. Please sign in again.',
      });
      setOrganizationScope(null);
      setRequests([]);
      setAllowedGroupsByDriveId({});
      setSelectableOrganizations([]);
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const requirementsResult = await supabase
        .from(DONATION_REQUIREMENTS_TABLE)
        .select('*')
        .order('Donation_Requirement_ID', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (requirementsResult.error) {
        throw requirementsResult.error;
      }

      setRequirements(requirementsResult.data || null);

      const membershipsResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Organization_ID, Membership_Role, Is_Primary, Status, Created_At')
        .eq('User_ID', actorUserId)
        .order('Created_At', { ascending: false });

      if (membershipsResult.error) {
        throw membershipsResult.error;
      }

      const preferredMembership = resolvePreferredMembership(membershipsResult.data || []);

      if (!preferredMembership?.Organization_ID) {
        setOrganizationScope(null);
        setRequests([]);
        setAllowedGroupsByDriveId({});
        setSelectableOrganizations([]);
        setNotice({
          kind: 'warning',
          text: 'No organization membership found for your account. Ask Super Admin to assign your organization membership.',
        });
        return;
      }

      const organizationResult = await supabase
        .from(ORGANIZATIONS_TABLE)
        .select('Organization_ID, Organization_Name, Approval_Status, Status')
        .eq('Organization_ID', preferredMembership.Organization_ID)
        .maybeSingle();

      if (organizationResult.error) {
        throw organizationResult.error;
      }

      const organization = organizationResult.data;
      if (!organization?.Organization_ID) {
        setOrganizationScope(null);
        setRequests([]);
        setAllowedGroupsByDriveId({});
        setSelectableOrganizations([]);
        setNotice({
          kind: 'error',
          text: 'Organization membership found, but organization details are missing.',
        });
        return;
      }

      const scopedOrganizationId = Number(organization.Organization_ID || 0) || null;
      const scopedOrganizationName = String(organization.Organization_Name || '');

      setOrganizationScope({
        organizationId: scopedOrganizationId,
        organizationName: scopedOrganizationName,
        approvalStatus: String(organization.Approval_Status || ''),
        organizationStatus: String(organization.Status || ''),
        membershipRole: String(preferredMembership.Membership_Role || ''),
        memberStatus: String(preferredMembership.Status || ''),
      });

      const selectableOrganizationsResult = await supabase
        .from(ORGANIZATIONS_TABLE)
        .select('Organization_ID, Organization_Name, Approval_Status, Status')
        .eq('Approval_Status', 'Approved')
        .eq('Status', 'Active')
        .neq('Organization_ID', scopedOrganizationId)
        .order('Organization_Name', { ascending: true });

      if (selectableOrganizationsResult.error) {
        throw selectableOrganizationsResult.error;
      }

      const selectableRows = selectableOrganizationsResult.data || [];
      setSelectableOrganizations(selectableRows);
      setSelectedAllowedOrganizationIds((previous) => {
        return previous.filter((organizationId) => {
          return selectableRows.some(
            (row) => Number(row.Organization_ID || 0) === Number(organizationId || 0),
          );
        });
      });

      const requestsResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select(
          'Donation_Drive_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type',
        )
        .eq('Organization_ID', scopedOrganizationId)
        .order('Updated_At', { ascending: false });

      if (requestsResult.error) {
        throw requestsResult.error;
      }

      const requestRows = requestsResult.data || [];
      setRequests(requestRows);

      const driveIds = requestRows
        .map((row) => Number(row.Donation_Drive_ID || 0))
        .filter(Boolean);

      if (!driveIds.length) {
        setAllowedGroupsByDriveId({});
        return;
      }

      const allowedGroupsResult = await supabase
        .from(DONATION_DRIVE_ALLOWED_GROUPS_TABLE)
        .select('Donation_Drive_ID, Organization_ID, Group_Name')
        .in('Donation_Drive_ID', driveIds);

      if (allowedGroupsResult.error) {
        throw allowedGroupsResult.error;
      }

      const groupsByDrive = (allowedGroupsResult.data || []).reduce((accumulator, row) => {
        const driveId = Number(row.Donation_Drive_ID || 0);
        if (!driveId) {
          return accumulator;
        }

        const nextList = accumulator[driveId] || [];
        nextList.push({
          Donation_Drive_ID: driveId,
          Organization_ID: Number(row.Organization_ID || 0) || null,
          Group_Name: String(row.Group_Name || ''),
        });
        accumulator[driveId] = nextList;
        return accumulator;
      }, {});

      setAllowedGroupsByDriveId(groupsByDrive);
    } catch (error) {
      setNotice({ kind: 'error', text: mapLoadError(error?.message) });
    } finally {
      setIsLoading(false);
    }
  }, [userProfile]);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const handleFieldChange = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleScopeChange = (scopeMode) => {
    setForm((prev) => ({ ...prev, scopeMode }));

    if (scopeMode !== 'specific') {
      setSelectedAllowedOrganizationIds([]);
    }
  };

  const handleAllowedOrganizationToggle = (organizationId) => {
    const parsedOrganizationId = Number(organizationId || 0) || 0;

    if (!parsedOrganizationId) {
      return;
    }

    setSelectedAllowedOrganizationIds((previous) => {
      if (previous.includes(parsedOrganizationId)) {
        return previous.filter((value) => value !== parsedOrganizationId);
      }

      return [...previous, parsedOrganizationId];
    });
  };

  const handleRegionChange = (event) => {
    const nextRegion = event.target.value;

    setForm((prev) => ({
      ...prev,
      region: nextRegion,
      province: '',
      city: '',
      barangay: '',
    }));
  };

  const handleProvinceChange = (event) => {
    const nextProvince = event.target.value;

    setForm((prev) => ({
      ...prev,
      province: nextProvince,
      city: '',
      barangay: '',
    }));
  };

  const handleCityChange = (event) => {
    const nextCity = event.target.value;

    setForm((prev) => ({
      ...prev,
      city: nextCity,
      barangay: '',
    }));
  };

  const handleProposalFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setProposalFile(null);
      return;
    }

    const lowerFileName = String(file.name || '').toLowerCase();
    const isPdfMime = file.type === 'application/pdf';
    const hasPdfExtension = lowerFileName.endsWith('.pdf');

    if (!isPdfMime && !hasPdfExtension) {
      setProposalFile(null);
      setNotice({ kind: 'error', text: 'Proposal attachment must be a PDF file only.' });
      event.target.value = '';
      return;
    }

    if (Number(file.size || 0) > MAX_PROPOSAL_FILE_SIZE_BYTES) {
      setProposalFile(null);
      setNotice({
        kind: 'error',
        text: `Proposal PDF must be ${formatFileSize(MAX_PROPOSAL_FILE_SIZE_BYTES)} or smaller.`,
      });
      event.target.value = '';
      return;
    }

    setProposalFile(file);
    setNotice({ kind: '', text: '' });
  };

  const validateStep1 = useCallback(() => {
    if (!String(form.eventTitle || '').trim()) return 'Event title is required.';
    if (!String(form.eventOverview || '').trim()) return 'Event overview is required.';
    const startTimestamp = toPostgresTimestamp(form.startDate);
    const endTimestamp = toPostgresTimestamp(form.endDate);
    if (!startTimestamp || !endTimestamp) return 'Start date and end date are required.';
    const parsedStart = new Date(startTimestamp);
    const parsedEnd = new Date(endTimestamp);
    if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
      return 'Invalid event schedule. Please pick valid date and time values.';
    }
    if (parsedStart > parsedEnd) return 'End date must be equal to or later than start date.';
    if (!String(form.setupType || '').trim()) return 'Donation setup type is required.';
    if (!proposalFile) return 'Proposal attachment is required and must be a PDF.';
    return '';
  }, [form, proposalFile]);

  const validateStep2 = useCallback(() => {
    if (!String(form.street || '').trim()) return 'Street is required.';
    if (!String(form.region || '').trim()) return 'Region is required.';
    if (!String(form.province || '').trim()) return 'Province is required.';
    if (!String(form.city || '').trim()) return 'City/Municipality is required.';
    if (!String(form.barangay || '').trim()) return 'Barangay is required.';
    if (!String(form.country || '').trim()) return 'Country is required.';

    const latitude = toNumberOrNull(form.latitude);
    const longitude = toNumberOrNull(form.longitude);
    if (String(form.latitude || '').trim() && latitude === null) return 'Latitude must be a valid number.';
    if (String(form.longitude || '').trim() && longitude === null) return 'Longitude must be a valid number.';
    if (latitude !== null && (latitude < -90 || latitude > 90)) return 'Latitude must be between -90 and 90.';
    if (longitude !== null && (longitude < -180 || longitude > 180)) return 'Longitude must be between -180 and 180.';
    return '';
  }, [form]);

  const validateStep3 = useCallback(() => {
    if (form.scopeMode === 'specific' && selectedAllowedOrganizationIds.length < 1) {
      return 'Select at least one specific organization for this drive.';
    }
    return '';
  }, [form.scopeMode, selectedAllowedOrganizationIds]);

  const validateBeforeReview = useCallback(() => {
    if (!isSupabaseConfigured || !supabase) return 'Supabase is not configured. Submission is unavailable.';
    if (!organizationScope?.organizationId) return 'No organization assignment found. Submission is unavailable.';
    if (!requirements?.Donation_Requirement_ID) {
      return 'Donation requirements are not configured yet. Ask Staff/Super Admin to set requirements first.';
    }
    return validateStep1() || validateStep2() || validateStep3() || '';
  }, [organizationScope?.organizationId, requirements?.Donation_Requirement_ID, validateStep1, validateStep2, validateStep3]);

  const handleStepNext = () => {
    let validationError = '';
    if (currentStep === 1) validationError = validateStep1();
    else if (currentStep === 2) validationError = validateStep2();
    else if (currentStep === 3) validationError = validateStep3();

    if (validationError) {
      setStepError(validationError);
      return;
    }

    setStepError('');
    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleStepBack = () => {
    setStepError('');
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleOpenReviewModal = () => {
    const validationError = validateBeforeReview();

    if (validationError) {
      setStepError(validationError);
      setNotice({ kind: 'error', text: validationError });
      return;
    }

    setStepError('');
    setNotice({ kind: '', text: '' });
    setIsReviewModalOpen(true);
  };

  const handleConfirmSubmit = async () => {
    const actorUserId = Number(userProfile?.user_id || 0) || null;
    const organizationId = Number(organizationScope?.organizationId || 0) || null;
    const title = String(form.eventTitle || '').trim();
    const overview = String(form.eventOverview || '').trim();
    const startTimestamp = toPostgresTimestamp(form.startDate);
    const endTimestamp = toPostgresTimestamp(form.endDate);
    const setupType = String(form.setupType || '').trim();

    const validationError = validateBeforeReview();
    if (validationError) {
      setNotice({ kind: 'error', text: validationError });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured. Submission is unavailable.' });
      return;
    }

    if (!actorUserId) {
      setNotice({ kind: 'error', text: 'Unable to resolve your account profile. Please sign in again.' });
      return;
    }

    if (!organizationId) {
      setNotice({ kind: 'error', text: 'No organization assignment found. Submission is unavailable.' });
      return;
    }

    const latitude = toNumberOrNull(form.latitude);
    const longitude = toNumberOrNull(form.longitude);

    try {
      setIsSubmitting(true);
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
        throw new Error('Could not resolve active session for attachment upload. Please sign in again.');
      }

      const uploadResult = await uploadProposalAttachment({
        file: proposalFile,
        authFolder,
        organizationName: organizationScope?.organizationName || '',
        eventTitle: title,
      });

      const isOpenForAll = form.scopeMode === 'all';
      const shouldSaveSpecificGroups = form.scopeMode === 'specific';

      const payload = {
        User_ID: actorUserId,
        Organization_ID: organizationId,
        Donation_Requirement_ID: Number(requirements?.Donation_Requirement_ID || 0) || null,
        Event_Title: title,
        Event_Overview: overview,
        Start_Date: startTimestamp,
        End_Date: endTimestamp,
        Proposal_Attachment: uploadResult.filePath,
        Street: String(form.street || '').trim(),
        Region: String(form.region || '').trim(),
        Barangay: String(form.barangay || '').trim(),
        City: String(form.city || '').trim(),
        Province: String(form.province || '').trim(),
        Country: String(form.country || '').trim(),
        Longitude: longitude,
        Latitude: latitude,
        Is_Open_For_All: isOpenForAll,
        Proposal_Attachment_Bucket: uploadResult.bucketId || DONATION_DRIVE_PROPOSALS_BUCKET,
        Status: INITIAL_REQUEST_STATUS,
        Updated_At: new Date().toISOString(),
        Donation_Setup_Type: setupType,
      };

      const basePayload = { ...payload };
      delete basePayload.Proposal_Attachment_Bucket;

      let { data, error } = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .insert(payload)
        .select(
          'Donation_Drive_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type',
        )
        .single();

      if (error && String(error.message || '').toLowerCase().includes('proposal_attachment_bucket')) {
        const retryResult = await supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .insert(basePayload)
          .select(
            'Donation_Drive_ID, Event_Title, Event_Overview, Start_Date, End_Date, Proposal_Attachment, Is_Open_For_All, Status, Updated_At, Donation_Setup_Type',
          )
          .single();

        data = retryResult.data;
        error = retryResult.error;
      }

      if (error) {
        throw error;
      }

      const driveId = Number(data?.Donation_Drive_ID || 0) || null;
      let savedAllowedGroups = [];

      if (shouldSaveSpecificGroups && driveId) {
        const selectedSet = new Set(
          selectedAllowedOrganizationIds
            .map((value) => Number(value || 0))
            .filter(Boolean),
        );

        const selectedRows = selectableOrganizations.filter((row) => {
          return selectedSet.has(Number(row.Organization_ID || 0));
        });

        const hostGroupName = String(organizationScope?.organizationName || '').trim();

        const draftGroupRows = [
          {
            Donation_Drive_ID: driveId,
            Organization_ID: organizationId,
            Group_Name: hostGroupName || `Organization ${organizationId}`,
          },
          ...selectedRows.map((row) => ({
            Donation_Drive_ID: driveId,
            Organization_ID: Number(row.Organization_ID || 0) || null,
            Group_Name: String(row.Organization_Name || '').trim(),
          })),
        ];

        const dedupedRows = Object.values(
          draftGroupRows.reduce((accumulator, row) => {
            const key = Number(row.Organization_ID || 0);

            if (!key || !String(row.Group_Name || '').trim()) {
              return accumulator;
            }

            accumulator[key] = {
              Donation_Drive_ID: driveId,
              Organization_ID: key,
              Group_Name: String(row.Group_Name || '').trim(),
            };

            return accumulator;
          }, {}),
        );

        if (dedupedRows.length) {
          const { error: allowedGroupsInsertError } = await supabase
            .from(DONATION_DRIVE_ALLOWED_GROUPS_TABLE)
            .insert(dedupedRows);

          if (allowedGroupsInsertError) {
            throw allowedGroupsInsertError;
          }

          savedAllowedGroups = dedupedRows;
        }
      }

      setRequests((prev) => [data, ...prev]);
      setAllowedGroupsByDriveId((previous) => {
        if (!driveId || !savedAllowedGroups.length) {
          return previous;
        }
        return { ...previous, [driveId]: savedAllowedGroups };
      });
      setForm(DEFAULT_FORM);
      setProposalFile(null);
      setSelectedAllowedOrganizationIds([]);
      setIsReviewModalOpen(false);
      setSuccessModalData({
        driveId: data?.Donation_Drive_ID,
        title,
        status: data?.Status || INITIAL_REQUEST_STATUS,
      });
      setIsSuccessModalOpen(true);
      setNotice({ kind: 'success', text: 'Donation drive request submitted successfully.' });
      setCurrentStep(1);

      await logAuditAction({
        action: 'donation_drive_requests.create',
        description: `Created donation drive request: ${title}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'success',
        userProfile,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_drive_requests.create',
        description: `Failed to create donation drive request: ${form.eventTitle || ''}`,
        resource: DONATION_DRIVE_REQUESTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const reviewRows = useMemo(
    () => {
      const hostOrganizationName = String(organizationScope?.organizationName || '').trim();
      const previewSpecificOrganizations = Array.from(
        new Set([hostOrganizationName, ...selectedAllowedOrganizationNames].filter(Boolean)),
      );

      const reviewScopeLabel = form.scopeMode === 'all'
        ? 'Open to all organizations'
        : form.scopeMode === 'specific'
          ? previewSpecificOrganizations.length
            ? `Specific organizations: ${previewSpecificOrganizations.join(', ')}`
            : 'Specific organizations'
          : `Only ${hostOrganizationName || 'my organization'}`;

      return [
        { label: 'Event Title', value: form.eventTitle || '-' },
        { label: 'Event Overview', value: form.eventOverview || '-' },
        { label: 'Start Date', value: formatDateTime(toPostgresTimestamp(form.startDate)) },
        { label: 'End Date', value: formatDateTime(toPostgresTimestamp(form.endDate)) },
        { label: 'Donation Setup Type', value: form.setupType || '-' },
        { label: 'Drive Scope', value: reviewScopeLabel },
        { label: 'Street', value: form.street || '-' },
        { label: 'Region', value: form.region || '-' },
        { label: 'Province', value: form.province || '-' },
        { label: 'City/Municipality', value: form.city || '-' },
        { label: 'Barangay', value: form.barangay || '-' },
        { label: 'Country', value: form.country || '-' },
        { label: 'Latitude', value: String(form.latitude || 'Not provided') },
        { label: 'Longitude', value: String(form.longitude || 'Not provided') },
        {
          label: 'Proposal Attachment (PDF)',
          value: proposalFile
            ? `${proposalFile.name} (${formatFileSize(proposalFile.size)})`
            : 'No file selected',
        },
        {
          label: 'Applied Requirement Record',
          value: requirements?.Donation_Requirement_ID
            ? `Requirement #${requirements.Donation_Requirement_ID}`
            : 'Not available',
        },
      ];
    },
    [form, organizationScope?.organizationName, proposalFile, requirements?.Donation_Requirement_ID, selectedAllowedOrganizationNames],
  );

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2';
  const inputStyle = { color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` };
  const inputFocusRing = { boxShadow: 'none' };

  const fieldLabel = (text, required = true) => (
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider" style={labelStyle}>
      {text} {required ? <span style={{ color: '#dc2626' }}>*</span> : null}
    </label>
  );

  const stepCardStyle = {
    borderColor: withColorAlpha(primaryColor, 0.18),
  };

  return (
    <div className="space-y-6" style={rootStyle}>
      <header
        className="rounded-2xl border p-5 md:p-6"
        style={{
          borderColor: withColorAlpha(primaryColor, 0.25),
          background: `linear-gradient(135deg, ${withColorAlpha(primaryColor, 0.12)}, ${withColorAlpha(tertiaryColor, 0.08)})`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>
              Organization Workspace
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl" style={headingStyle}>
              Request Donation Drive
            </h1>
            <p className="mt-2 max-w-2xl text-sm" style={{ color: secondaryTextColor }}>
              Propose a hair donation drive for your organization. Each request flows through Staff review, then Super Admin approval.
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-xs font-semibold" style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}>
              <ShieldCheck size={14} />
              Hosting as: {organizationScope?.organizationName || 'Not assigned'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadPageData()}
            disabled={isLoading || isSubmitting}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm hover:shadow disabled:opacity-60"
            style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </header>

      {notice.text && (
        <div
          className="rounded-xl border px-3 py-2 text-sm font-medium"
          style={
            notice.kind === 'error'
              ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : notice.kind === 'success'
                ? { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', color: '#047857' }
                : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border bg-white" style={stepCardStyle}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: withColorAlpha(primaryColor, 0.12) }}>
          <div className="flex items-center gap-2">
            <ClipboardList size={18} style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold" style={headingStyle}>Donation Requirements</h2>
          </div>
          <div className="text-xs" style={{ color: tertiaryTextColor }}>
            Requirement ID: {requirements?.Donation_Requirement_ID || 'N/A'} - Updated: {formatDateTime(requirements?.Updated_At)}
          </div>
        </div>

        {!requirements && isLoading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-sm" style={{ color: secondaryTextColor }}>
            <Loader2 size={16} className="animate-spin" />
            Loading donation requirements...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-4">
            {requirementRows.map((row) => (
              <div key={row.label} className="rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: withColorAlpha(primaryColor, 0.1) }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
                  {row.label}
                </p>
                <p className="mt-1 text-sm font-semibold" style={{ color: primaryTextColor }}>{row.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4" style={stepCardStyle}>
        <h2 className="text-base font-semibold" style={headingStyle}>Approval Flow</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border px-3 py-1 font-semibold" style={statusToneStyle('info', primaryColor)}>
            1. Pending Staff Approval
          </span>
          <ChevronRight size={14} style={{ color: tertiaryTextColor }} />
          <span className="rounded-full border px-3 py-1 font-semibold" style={statusToneStyle('warning', primaryColor)}>
            2. Pending Super Admin Approval
          </span>
          <ChevronRight size={14} style={{ color: tertiaryTextColor }} />
          <span className="rounded-full border px-3 py-1 font-semibold" style={statusToneStyle('success', primaryColor)}>
            3. Approved
          </span>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 md:p-6" style={stepCardStyle}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={headingStyle}>New Donation Drive Request</h2>
            <p className="text-xs" style={{ color: tertiaryTextColor }}>Step {currentStep} of {WIZARD_STEPS.length} - Fields marked * are required.</p>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {WIZARD_STEPS.map((step) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            const accent = isActive
              ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.08) }
              : isComplete
                ? { borderColor: tertiaryColor, backgroundColor: withColorAlpha(tertiaryColor, 0.08) }
                : { borderColor: '#e2e8f0', backgroundColor: '#ffffff' };
            const iconColor = isActive ? primaryColor : isComplete ? tertiaryColor : tertiaryTextColor;

            return (
              <div key={step.id} className="rounded-xl border px-3 py-3" style={accent}>
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: isActive
                        ? withColorAlpha(primaryColor, 0.18)
                        : isComplete
                          ? withColorAlpha(tertiaryColor, 0.18)
                          : '#f1f5f9',
                      color: iconColor,
                    }}
                  >
                    {isComplete ? <CheckCircle2 size={16} /> : <StepIcon size={16} />}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: tertiaryTextColor }}>
                      Step {step.id}
                    </p>
                    <p className="text-sm font-bold" style={{ color: primaryTextColor }}>{step.label}</p>
                  </div>
                </div>
                <p className="mt-1 text-[11px]" style={{ color: secondaryTextColor }}>{step.hint}</p>
              </div>
            );
          })}
        </div>

        {stepError && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }}
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{stepError}</span>
          </div>
        )}

        {currentStep === 1 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              {fieldLabel('Event Title')}
              <input
                value={form.eventTitle}
                onChange={handleFieldChange('eventTitle')}
                className={inputClass}
                placeholder="e.g. Community Hair Donation Day"
                disabled={!canSubmit}
                style={inputStyle}
                onFocus={(e) => Object.assign(e.target.style, { borderColor: primaryColor, ...inputFocusRing })}
                onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; }}
              />
            </div>

            <div>
              {fieldLabel('Start Date & Time')}
              <input
                type="datetime-local"
                value={form.startDate}
                onChange={handleFieldChange('startDate')}
                className={inputClass}
                disabled={!canSubmit}
                style={inputStyle}
              />
            </div>

            <div>
              {fieldLabel('End Date & Time')}
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={handleFieldChange('endDate')}
                className={inputClass}
                disabled={!canSubmit}
                style={inputStyle}
              />
            </div>

            <div>
              {fieldLabel('Donation Setup Type')}
              <select
                value={form.setupType}
                onChange={handleFieldChange('setupType')}
                className={inputClass}
                disabled={!canSubmit}
                style={inputStyle}
              >
                <option value="">Select setup type</option>
                <option value="Onsite">Onsite</option>
                <option value="Offsite">Offsite</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>

            <div>
              {fieldLabel('Proposal Attachment (PDF only)')}
              <label
                className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition hover:bg-slate-50"
                style={{ borderColor: withColorAlpha(primaryColor, 0.4), color: primaryColor }}
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} />
                  {proposalFile ? `${proposalFile.name} (${formatFileSize(proposalFile.size)})` : 'Choose PDF file'}
                </span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleProposalFileChange}
                  className="hidden"
                  disabled={!canSubmit}
                />
              </label>
              <p className="mt-1 text-[11px]" style={{ color: tertiaryTextColor }}>
                Maximum file size: {formatFileSize(MAX_PROPOSAL_FILE_SIZE_BYTES)}.
              </p>
            </div>

            <div className="md:col-span-2">
              {fieldLabel('Event Overview')}
              <textarea
                value={form.eventOverview}
                onChange={handleFieldChange('eventOverview')}
                className={`${inputClass} min-h-[120px] resize-y`}
                placeholder="Briefly explain your event goals, audience, and expected donor turnout."
                disabled={!canSubmit}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="md:col-span-2 lg:col-span-3">
              {fieldLabel('Street')}
              <input value={form.street} onChange={handleFieldChange('street')} className={inputClass} disabled={!canSubmit} style={inputStyle} placeholder="House #, Street name" />
            </div>
            <div>
              {fieldLabel('Region')}
              <select value={form.region} onChange={handleRegionChange} className={inputClass} disabled={!canSubmit} style={inputStyle}>
                <option value="">Select region</option>
                {regionOptions.map((region) => (
                  <option key={region.name} value={region.name}>{region.name}</option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel('Province')}
              <select
                value={form.province}
                onChange={handleProvinceChange}
                className={inputClass}
                disabled={!canSubmit || !form.region}
                style={inputStyle}
              >
                <option value="">Select province</option>
                {provinceOptions.map((province) => (
                  <option key={province.name} value={province.name}>{province.name}</option>
                ))}
              </select>
            </div>
            <div>
              {fieldLabel('City / Municipality')}
              {requiresManualCityInput ? (
                <input
                  value={form.city}
                  onChange={handleFieldChange('city')}
                  className={inputClass}
                  placeholder="Type city/municipality"
                  disabled={!canSubmit || !form.province}
                  style={inputStyle}
                />
              ) : (
                <select
                  value={form.city}
                  onChange={handleCityChange}
                  className={inputClass}
                  disabled={!canSubmit || !form.province}
                  style={inputStyle}
                >
                  <option value="">Select city/municipality</option>
                  {cityOptions.map((city) => (
                    <option key={city.name} value={city.name}>{city.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              {fieldLabel('Barangay')}
              {requiresManualBarangayInput ? (
                <input
                  value={form.barangay}
                  onChange={handleFieldChange('barangay')}
                  className={inputClass}
                  placeholder="Type barangay"
                  disabled={!canSubmit || !form.city}
                  style={inputStyle}
                />
              ) : (
                <select
                  value={form.barangay}
                  onChange={handleFieldChange('barangay')}
                  className={inputClass}
                  disabled={!canSubmit || !form.city}
                  style={inputStyle}
                >
                  <option value="">Select barangay</option>
                  {barangayOptions.map((barangay) => (
                    <option key={barangay} value={barangay}>{barangay}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              {fieldLabel('Country')}
              <input value={form.country} onChange={handleFieldChange('country')} className={inputClass} disabled={!canSubmit} style={inputStyle} />
            </div>
            <div>
              {fieldLabel('Latitude', false)}
              <input
                value={form.latitude}
                onChange={handleFieldChange('latitude')}
                className={inputClass}
                placeholder="e.g. 14.5995"
                disabled={!canSubmit}
                style={inputStyle}
              />
            </div>
            <div>
              {fieldLabel('Longitude', false)}
              <input
                value={form.longitude}
                onChange={handleFieldChange('longitude')}
                className={inputClass}
                placeholder="e.g. 120.9842"
                disabled={!canSubmit}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider" style={labelStyle}>Donation Drive Scope</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  { id: 'own', title: 'Only my organization', desc: `Only ${organizationScope?.organizationName || 'your organization'} can run this drive.` },
                  { id: 'all', title: 'Open for all organizations', desc: 'Any approved organization can participate once approved.' },
                  { id: 'specific', title: 'Specific organizations only', desc: 'Choose selected approved organizations. Your organization is auto-included.' },
                ].map((option) => {
                  const isSelected = form.scopeMode === option.id;
                  return (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-3 text-sm transition"
                      style={
                        isSelected
                          ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.08) }
                          : { borderColor: '#e2e8f0', backgroundColor: '#ffffff' }
                      }
                    >
                      <input
                        type="radio"
                        name="drive-scope"
                        checked={isSelected}
                        onChange={() => handleScopeChange(option.id)}
                        disabled={!canSubmit}
                        style={{ accentColor: primaryColor }}
                      />
                      <span>
                        <span className="block font-semibold" style={{ color: primaryTextColor }}>{option.title}</span>
                        <span className="text-xs" style={{ color: secondaryTextColor }}>{option.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {form.scopeMode === 'specific' && (
              <div className="rounded-xl border px-3 py-3" style={{ borderColor: withColorAlpha(primaryColor, 0.25), backgroundColor: withColorAlpha(primaryColor, 0.04) }}>
                <p className="text-xs font-semibold" style={{ color: primaryTextColor }}>Select organizations allowed to access this drive</p>
                <p className="mt-0.5 text-[11px]" style={{ color: secondaryTextColor }}>
                  Host organization included automatically: {organizationScope?.organizationName || 'N/A'}
                </p>

                {!selectableOrganizations.length ? (
                  <p className="mt-2 text-xs" style={{ color: secondaryTextColor }}>No other approved and active organizations are available.</p>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {selectableOrganizations.map((organization) => {
                      const organizationId = Number(organization.Organization_ID || 0);
                      const isSelected = selectedAllowedOrganizationIds.includes(organizationId);

                      return (
                        <label
                          key={organizationId}
                          className="flex cursor-pointer items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-sm"
                          style={
                            isSelected
                              ? { borderColor: primaryColor, color: primaryTextColor }
                              : { borderColor: '#e2e8f0', color: primaryTextColor }
                          }
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleAllowedOrganizationToggle(organizationId)}
                            disabled={!canSubmit}
                            style={{ accentColor: primaryColor }}
                          />
                          <span className="text-xs font-medium">{organization.Organization_Name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                <p className="mt-2 text-[11px]" style={{ color: secondaryTextColor }}>
                  {selectedAllowedOrganizationNames.length
                    ? `Selected organizations: ${selectedAllowedOrganizationNames.join(', ')}`
                    : 'No specific organizations selected yet.'}
                </p>
              </div>
            )}

            <div className="rounded-xl border bg-slate-50 p-4" style={{ borderColor: withColorAlpha(primaryColor, 0.18) }}>
              <div className="flex items-center gap-2">
                <Sparkles size={16} style={{ color: primaryColor }} />
                <p className="text-sm font-semibold" style={{ color: primaryTextColor }}>Quick Preview</p>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div><span style={{ color: secondaryTextColor }}>Event:</span> <span className="font-semibold" style={{ color: primaryTextColor }}>{form.eventTitle || '-'}</span></div>
                <div><span style={{ color: secondaryTextColor }}>Setup:</span> <span className="font-semibold" style={{ color: primaryTextColor }}>{form.setupType || '-'}</span></div>
                <div><span style={{ color: secondaryTextColor }}>Schedule:</span> <span className="font-semibold" style={{ color: primaryTextColor }}>{formatDateRange(toPostgresTimestamp(form.startDate), toPostgresTimestamp(form.endDate))}</span></div>
                <div><span style={{ color: secondaryTextColor }}>Location:</span> <span className="font-semibold" style={{ color: primaryTextColor }}>{[form.city, form.province].filter(Boolean).join(', ') || '-'}</span></div>
                <div className="sm:col-span-2"><span style={{ color: secondaryTextColor }}>Proposal:</span> <span className="font-semibold" style={{ color: primaryTextColor }}>{proposalFile ? proposalFile.name : 'No file selected'}</span></div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: withColorAlpha(primaryColor, 0.12) }}>
          <button
            type="button"
            onClick={handleStepBack}
            disabled={currentStep === 1 || isSubmitting}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: '#cbd5e1', color: primaryTextColor }}
          >
            <ChevronLeft size={14} />
            Back
          </button>

          <div className="text-xs" style={{ color: tertiaryTextColor }}>
            {currentStep === WIZARD_STEPS.length ? 'Ready to review' : `Step ${currentStep} of ${WIZARD_STEPS.length}`}
          </div>

          {currentStep < WIZARD_STEPS.length ? (
            <button
              type="button"
              onClick={handleStepNext}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              Next
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenReviewModal}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              <Send size={14} />
              Review and Submit
            </button>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white" style={stepCardStyle}>
        <div className="border-b px-4 py-3" style={{ borderColor: withColorAlpha(primaryColor, 0.12) }}>
          <h2 className="text-lg font-semibold" style={headingStyle}>My Donation Drive Requests</h2>
          <p className="text-xs" style={{ color: tertiaryTextColor }}>Track if each request is open to all organizations, host-only, or limited to selected organizations.</p>
        </div>

        {!requests.length ? (
          <div className="px-4 py-5 text-sm" style={{ color: secondaryTextColor }}>
            {isLoading ? 'Loading requests...' : 'No donation drive requests yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ backgroundColor: withColorAlpha(primaryColor, 0.08) }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Event</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Schedule</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Attachment</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Scope</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Setup Type</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Status</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => {
                  const statusMeta = mapStatusMeta(row.Status);
                  const driveId = Number(row.Donation_Drive_ID || 0) || 0;
                  const scopeLabel = formatDriveScopeLabel({
                    isOpenForAll: row.Is_Open_For_All,
                    hostOrganizationName: organizationScope?.organizationName || 'my organization',
                    allowedGroups: allowedGroupsByDriveId[driveId] || [],
                  });

                  return (
                    <tr key={row.Donation_Drive_ID} className="border-t align-top" style={{ borderColor: '#e2e8f0' }}>
                      <td className="px-4 py-3" style={{ color: primaryTextColor }}>
                        <p className="font-semibold">{row.Event_Title}</p>
                        <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>{row.Event_Overview || 'No overview provided.'}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{formatDateRange(row.Start_Date, row.End_Date)}</td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>
                        {row.Proposal_Attachment ? String(row.Proposal_Attachment).split('/').pop() : 'No attachment'}
                      </td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{scopeLabel}</td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{row.Donation_Setup_Type || 'Not set'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" style={statusToneStyle(statusMeta.tone, primaryColor)}>
                          {statusMeta.label}
                        </span>
                        <p className="mt-1 text-[11px]" style={{ color: tertiaryTextColor }}>{statusMeta.approvalHint}</p>
                      </td>
                      <td className="px-4 py-3" style={{ color: tertiaryTextColor }}>{formatDateTime(row.Updated_At)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
        <div className="flex items-start gap-2">
          {canSubmit ? <CheckCircle2 size={14} className="mt-0.5" style={{ color: tertiaryColor }} /> : <AlertCircle size={14} className="mt-0.5" style={{ color: '#b45309' }} />}
          <p>
            {canSubmit
              ? `Ready to submit under ${organizationScope?.organizationName || 'your organization'}.`
              : 'Submission is disabled until your organization membership is active, requirements exist, and page data is loaded.'}
          </p>
        </div>
      </div>

      {isReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: withColorAlpha(primaryColor, 0.12) }}>
              <h3 className="text-base font-semibold" style={headingStyle}>Final Review Before Submission</h3>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="rounded-md border p-1 hover:bg-slate-50"
                style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}
                disabled={isSubmitting}
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[68vh] space-y-3 overflow-y-auto px-4 py-4">
              <p className="text-sm" style={{ color: secondaryTextColor }}>
                Please check all details below. Click confirm to submit this request for Staff review.
              </p>

              <div className="overflow-hidden rounded-lg border" style={{ borderColor: '#e2e8f0' }}>
                <table className="min-w-full text-sm">
                  <tbody>
                    {reviewRows.map((row) => (
                      <tr key={row.label} className="border-t first:border-t-0" style={{ borderColor: '#e2e8f0' }}>
                        <td className="w-[32%] px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ backgroundColor: withColorAlpha(primaryColor, 0.06), color: secondaryTextColor }}>
                          {row.label}
                        </td>
                        <td className="px-3 py-2" style={{ color: primaryTextColor }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: withColorAlpha(primaryColor, 0.12) }}>
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                style={{ borderColor: '#cbd5e1', color: primaryTextColor }}
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Confirm and Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b px-4 py-3" style={{ borderColor: withColorAlpha(tertiaryColor, 0.25) }}>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={20} style={{ color: tertiaryColor }} />
                <h3 className="text-base font-semibold" style={headingStyle}>Request Submitted</h3>
              </div>
            </div>

            <div className="space-y-2 px-4 py-4 text-sm" style={{ color: secondaryTextColor }}>
              <p>Your donation drive request has been submitted successfully.</p>
              <p><span className="font-semibold" style={{ color: primaryTextColor }}>Request ID:</span> {successModalData?.driveId || 'N/A'}</p>
              <p><span className="font-semibold" style={{ color: primaryTextColor }}>Event:</span> {successModalData?.title || 'N/A'}</p>
              <p><span className="font-semibold" style={{ color: primaryTextColor }}>Current Status:</span> {successModalData?.status || INITIAL_REQUEST_STATUS}</p>
              <p className="text-xs" style={{ color: tertiaryTextColor }}>
                Approval flow: Pending Staff Approval then Pending Super Admin Approval.
              </p>
            </div>

            <div className="flex justify-end border-t px-4 py-3" style={{ borderColor: withColorAlpha(tertiaryColor, 0.25) }}>
              <button
                type="button"
                onClick={() => setIsSuccessModalOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
