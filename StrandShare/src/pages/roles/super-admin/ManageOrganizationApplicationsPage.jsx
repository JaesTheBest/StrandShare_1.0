import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  Info,
  Loader2,
  MailCheck,
  RefreshCcw,
  Search,
  ShieldAlert,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabaseClient';
import { useTheme } from '../../../context/ThemeContext';

const USERS_TABLE = 'users';
const UI_SETTINGS_TABLE = 'UI_Settings';
const ORGANIZATIONS_TABLE = 'Organizations';
const HOSPITALS_TABLE = 'Hospitals';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const USER_DETAILS_TABLE = 'user_details';
const ORGANIZATION_LOGOS_BUCKET = 'organization_logos';
const HOSPITAL_LOGOS_BUCKET = 'hospital_logos';
let adminAuthClient = null;

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const APPLICATION_TYPE_OPTIONS = [
  { key: 'all', label: 'All Applications' },
  { key: 'organization', label: 'Organizations' },
  { key: 'hospital', label: 'Hospitals' },
];

function normalizeStatus(value = '') {
  return String(value).trim().toLowerCase();
}

function normalizeRole(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function toIsoOrNull(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(:(\d{2}))?$/);
  if (match) {
    const seconds = match[7] || '00';
    const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${seconds}+08:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  }
  const fallback = new Date(raw);
  if (Number.isNaN(fallback.getTime())) return null;
  return fallback.toISOString();
}

function formatDate(value) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString('en-PH', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return value;
  }
}

function formatAccessWindowLabel(accessStart, accessEnd) {
  if (!accessStart && !accessEnd) {
    return 'No access window set';
  }

  const format = (value) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (error) {
      return String(value);
    }
  };

  if (accessStart && accessEnd) {
    return `${format(accessStart)} to ${format(accessEnd)}`;
  }

  if (accessStart) {
    return `Starts ${format(accessStart)}`;
  }

  return `Until ${format(accessEnd)}`;
}

function resolveOrganizationLogoUrl(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  const { data } = supabase.storage.from(ORGANIZATION_LOGOS_BUCKET).getPublicUrl(rawValue);
  return data?.publicUrl || '';
}

function resolveHospitalLogoUrl(value = '') {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  if (/^https?:\/\//i.test(rawValue)) return rawValue;

  const { data } = supabase.storage.from(HOSPITAL_LOGOS_BUCKET).getPublicUrl(rawValue);
  return data?.publicUrl || '';
}

function resolveLeadMembership(rows = []) {
  if (!rows.length) return null;

  const primary = rows.find((row) => row?.Is_Primary);
  if (primary) return primary;

  const leader = rows.find((row) => normalizeRole(row?.Membership_Role) === 'leader');
  if (leader) return leader;

  return rows[0];
}

function pickPreferredUserDetails(detailsValue) {
  if (!detailsValue) return null;
  if (Array.isArray(detailsValue)) return detailsValue.find(Boolean) || null;
  return detailsValue;
}

function mapOrganizationSchemaError(rawMessage) {
  const message = String(rawMessage || '').trim();

  if (
    message.includes("Could not find the table 'public.Organizations'")
    || message.includes("Could not find the table 'public.Organization_Members'")
    || message.includes("Could not find the table 'public.Hospitals'")
  ) {
    return 'Application tables are missing. Run organization and hospital migrations, then refresh the app.';
  }

  if (message.toLowerCase().includes('invite')) {
    return `${message} Configure REACT_APP_SUPABASE_SERVICE_ROLE_KEY to enable invite_user emails from this admin page.`;
  }

  return message;
}

function createAdminAuthClient() {
  if (adminAuthClient) {
    return adminAuthClient;
  }

  const url = process.env.REACT_APP_SUPABASE_URL;
  const serviceRoleKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  adminAuthClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'strandshare-admin-invite-auth-client',
    },
  });

  return adminAuthClient;
}

function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%*';
  const all = `${upper}${lower}${numbers}${symbols}`;

  const seeded = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  for (let i = 0; i < 8; i += 1) {
    seeded.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let index = seeded.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = seeded[index];
    seeded[index] = seeded[swapIndex];
    seeded[swapIndex] = temp;
  }

  return seeded.join('');
}

function mapInviteSendError(rawReason = '') {
  const message = String(rawReason || '').trim();
  const lower = message.toLowerCase();

  if (!message || lower === 'missing-service-role') {
    return 'Invite email service is not configured. Add REACT_APP_SUPABASE_SERVICE_ROLE_KEY in .env.local and restart the app.';
  }

  if (lower.includes('already been registered') || lower.includes('already exists')) {
    return 'Lead email is already registered in Auth. Please use an unregistered lead email or update the existing account manually.';
  }

  if (lower.includes('invalid email')) {
    return 'Lead email is invalid. Please correct it before approval.';
  }

  return message;
}

async function sendInviteUserEmail({
  email,
  organizationName,
  reviewNotes,
  accessStart,
  accessEnd,
  temporaryPassword,
  decision,
  existingAuthUserId,
}) {
  const adminClient = createAdminAuthClient();

  if (!adminClient) {
    return {
      sent: false,
      reason: 'missing-service-role',
    };
  }

  const normalizedDecision = String(decision || '').trim().toLowerCase() === 'rejected'
    ? 'rejected'
    : 'approved';

  const metadata = {
    account_type: 'organization',
    decision: normalizedDecision,
    role_label: 'Organization Lead',
    account_label: 'Organization',
    account_value: organizationName || '-',
    recipient_email: email || '-',
    review_notes: reviewNotes || '',
    has_access_window: Boolean(accessStart || accessEnd),
    access_window: formatAccessWindowLabel(accessStart, accessEnd),
    temporary_password: temporaryPassword || '',
  };

  const inviteOptions = { data: metadata };

  let { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (error && String(error.message || '').toLowerCase().includes('already')) {
    if (existingAuthUserId) {
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingAuthUserId);

      if (deleteError) {
        return {
          sent: false,
          reason: deleteError.message,
          invitedAuthUserId: null,
        };
      }

      const retryResult = await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);

      data = retryResult.data;
      error = retryResult.error;
    }
  }

  if (error) {
    return {
      sent: false,
      reason: error.message,
      invitedAuthUserId: null,
    };
  }

  if (temporaryPassword && data?.user?.id) {
    const updatePayload = {
      email_confirm: true,
      password: temporaryPassword,
    };

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(data.user.id, updatePayload);

    if (passwordError) {
      return {
        sent: false,
        reason: passwordError.message,
        invitedAuthUserId: data.user.id,
      };
    }
  } else if (data?.user?.id) {
    const { error: confirmError } = await adminClient.auth.admin.updateUserById(data.user.id, {
      email_confirm: true,
    });

    if (confirmError) {
      return {
        sent: false,
        reason: confirmError.message,
        invitedAuthUserId: data.user.id,
      };
    }
  }

  return {
    sent: true,
    reason: '',
    invitedAuthUserId: data?.user?.id || null,
  };
}

function getTabCount(rows, tabKey) {
  if (tabKey === 'all') return rows.length;
  return rows.filter((row) => normalizeStatus(row.Approval_Status) === tabKey).length;
}

export default function ManageOrganizationApplicationsPage({ userProfile }) {
  const { theme } = useTheme();

  const [uiSettings, setUiSettings] = useState(null);
  const [records, setRecords] = useState([]);
  const [activeTab, setActiveTab] = useState('pending');
  const [query, setQuery] = useState('');
  const [applicationTypeFilter, setApplicationTypeFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [approvalModal, setApprovalModal] = useState({
    open: false,
    mode: 'approve',
    organization: null,
    accessStart: '',
    accessEnd: '',
    notes: '',
  });
  const [completionModal, setCompletionModal] = useState({
    open: false,
    title: '',
    message: '',
    tone: 'success',
  });

  const adminUserId = Number(userProfile?.user_id || 0);

  const primaryColor = uiSettings?.Primary_Color || theme.primaryColor || '#0f766e';
  const secondaryColor = uiSettings?.Secondary_Color || theme.secondaryColor || '#64748b';
  const backgroundColor = uiSettings?.Background_Color || theme.backgroundColor || '#f8fafc';
  const primaryTextColor = uiSettings?.Primary_Text_Color || theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = uiSettings?.Secondary_Text_Color || theme.secondaryTextColor || '#334155';
  const headingFont = uiSettings?.Secondary_Font_Family || theme.secondaryFontFamily || theme.fontFamily || 'Poppins';
  const bodyFont = uiSettings?.Font_Family || theme.fontFamily || 'Poppins';
  const inviteEmailConfigured = Boolean(process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY);

  const rootStyle = {
    color: primaryTextColor,
    fontFamily: `${bodyFont}, sans-serif`,
  };

  const fetchUiSettings = useCallback(async () => {
    const { data, error } = await supabase
      .from(UI_SETTINGS_TABLE)
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setUiSettings(data);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setIsLoading(true);
    setNotice({ type: '', message: '' });

    try {
      const [orgResult, hospitalResult] = await Promise.all([
        supabase
          .from(ORGANIZATIONS_TABLE)
          .select('*')
          .order('Created_At', { ascending: false }),
        supabase
          .from(HOSPITALS_TABLE)
          .select('*')
          .order('Created_At', { ascending: false }),
      ]);

      if (orgResult.error) {
        throw new Error(orgResult.error.message);
      }
      if (hospitalResult.error) {
        throw new Error(hospitalResult.error.message);
      }

      const organizations = orgResult.data || [];
      const hospitals = hospitalResult.data || [];
      const organizationIds = organizations.map((org) => org.Organization_ID).filter(Boolean);
      const membersResult = organizationIds.length
        ? await supabase
          .from(ORGANIZATION_MEMBERS_TABLE)
          .select('Member_ID, Organization_ID, User_ID, Membership_Role, Is_Primary, Status, Created_At, Updated_At')
          .in('Organization_ID', organizationIds)
        : { data: [], error: null };

      if (membersResult.error) {
        throw new Error(membersResult.error.message);
      }

      const members = membersResult.data || [];
      const membersByOrganization = members.reduce((map, row) => {
        const key = row.Organization_ID;
        const current = map.get(key) || [];
        current.push(row);
        map.set(key, current);
        return map;
      }, new Map());

      const leadUserIds = organizations
        .map((org) => {
          const leadMembership = resolveLeadMembership(membersByOrganization.get(org.Organization_ID) || []);
          return leadMembership?.User_ID || org.Created_By;
        })
        .filter(Boolean);

      const allMemberUserIds = members.map((member) => member.User_ID).filter(Boolean);
      const userIds = Array.from(new Set([...leadUserIds, ...allMemberUserIds, ...organizations.map((org) => org.Created_By)]).values()).filter(Boolean);

      const usersResult = userIds.length
        ? await supabase
          .from(USERS_TABLE)
          .select('user_id, email, role, is_active, access_start, access_end, auth_user_id')
          .in('user_id', userIds)
        : { data: [], error: null };

      if (usersResult.error) {
        throw new Error(usersResult.error.message);
      }

      const userDetailsResult = userIds.length
        ? await supabase
          .from(USER_DETAILS_TABLE)
          .select('user_id, first_name, middle_name, last_name, suffix, contact_number, street, barangay, city, province, region, country')
          .in('user_id', userIds)
        : { data: [], error: null };

      if (userDetailsResult.error) {
        throw new Error(userDetailsResult.error.message);
      }

      const usersById = new Map((usersResult.data || []).map((row) => [row.user_id, row]));
      const detailsByUserId = new Map((userDetailsResult.data || []).map((row) => [row.user_id, row]));

      const organizationRows = organizations.map((org) => {
        const orgMembers = membersByOrganization.get(org.Organization_ID) || [];
        const leadMembership = resolveLeadMembership(orgMembers);
        const leadUserId = leadMembership?.User_ID || org.Created_By || null;
        const leadUser = leadUserId ? usersById.get(leadUserId) : null;
        const leadDetails = leadUserId ? pickPreferredUserDetails(detailsByUserId.get(leadUserId)) : null;

        const memberStats = orgMembers.reduce(
          (acc, row) => {
            acc.total += 1;
            if (normalizeStatus(row.Status) === 'active') acc.active += 1;
            if (normalizeStatus(row.Status) === 'inactive') acc.inactive += 1;
            if (normalizeRole(row.Membership_Role) === 'leader') acc.leaders += 1;
            return acc;
          },
          { total: 0, active: 0, inactive: 0, leaders: 0 }
        );

        return {
          Record_Key: `organization:${org.Organization_ID}`,
          Application_Type: 'organization',
          Application_Type_Label: 'Organization',
          Organization_ID: org.Organization_ID,
          Organization_Name: org.Organization_Name,
          Organization_Type: org.Organization_Type,
          Organization_Logo_URL: resolveOrganizationLogoUrl(org.Organization_Logo_URL),
          Contact_Number: org.Contact_Number,
          Street: org.Street,
          Barangay: org.Barangay,
          City: org.City,
          Province: org.Province,
          Region: org.Region,
          Country: org.Country,
          Latitude: org.Latitude,
          Longitude: org.Longitude,
          Approval_Status: org.Approval_Status || 'Pending',
          Organization_Status: org.Status || 'Inactive',
          Is_Approved: Boolean(org.Is_Approved),
          Approved_By: org.Approved_By,
          Approved_At: org.Approved_At,
          Created_By: org.Created_By,
          Created_At: org.Created_At,
          Updated_At: org.Updated_At,
          Review_Notes: org.Review_Notes,
          Lead_User_ID: leadUserId,
          Lead_Email: leadUser?.email || '',
          Lead_Role: leadUser?.role || '',
          Lead_Is_Active: leadUser?.is_active,
          Lead_Access_Start: leadUser?.access_start,
          Lead_Access_End: leadUser?.access_end,
          Lead_Auth_User_ID: leadUser?.auth_user_id || null,
          Lead_First_Name: leadDetails?.first_name || '',
          Lead_Last_Name: leadDetails?.last_name || '',
          Lead_Contact: leadDetails?.contact_number || '',
          Lead_Address: [leadDetails?.street, leadDetails?.barangay, leadDetails?.city, leadDetails?.province, leadDetails?.region, leadDetails?.country]
            .filter(Boolean)
            .join(', '),
          Members: orgMembers,
          Member_Stats: memberStats,
        };
      });

      const hospitalRows = hospitals.map((hospital) => {
        return {
          Record_Key: `hospital:${hospital.Hospital_ID}`,
          Application_Type: 'hospital',
          Application_Type_Label: 'Hospital',
          Hospital_ID: hospital.Hospital_ID,
          Organization_ID: hospital.Hospital_ID,
          Organization_Name: hospital.Hospital_Name,
          Organization_Type: 'Partner Hospital',
          Organization_Logo_URL: resolveHospitalLogoUrl(hospital.Hospital_Logo),
          Contact_Number: hospital.Contact_Number,
          Street: hospital.Street,
          Barangay: hospital.Barangay,
          City: hospital.City,
          Province: hospital.Province,
          Region: hospital.Region,
          Country: hospital.Country,
          Latitude: hospital.Latitude,
          Longitude: hospital.Longitude,
          Approval_Status: hospital.Approval_Status || 'Pending',
          Organization_Status: Boolean(hospital.Is_Approved) ? 'Active' : 'Inactive',
          Is_Approved: Boolean(hospital.Is_Approved),
          Approved_By: hospital.Approved_By,
          Approved_At: hospital.Approved_At,
          Created_By: null,
          Created_At: hospital.Created_At,
          Updated_At: hospital.Updated_At,
          Review_Notes: hospital.Review_Notes,
          Lead_User_ID: null,
          Lead_Email: '',
          Lead_Role: '',
          Lead_Is_Active: false,
          Lead_Access_Start: null,
          Lead_Access_End: null,
          Lead_Auth_User_ID: null,
          Lead_First_Name: '',
          Lead_Last_Name: '',
          Lead_Contact: '',
          Lead_Address: '',
          Members: [],
          Member_Stats: { total: 0, active: 0, inactive: 0, leaders: 0 },
        };
      });

      const allRows = [...organizationRows, ...hospitalRows].sort((left, right) => {
        const leftMs = new Date(left.Created_At || left.Updated_At || 0).getTime() || 0;
        const rightMs = new Date(right.Created_At || right.Updated_At || 0).getTime() || 0;
        return rightMs - leftMs;
      });

      setRecords(allRows);
    } catch (error) {
      setRecords([]);
      setNotice({
        type: 'error',
        message: mapOrganizationSchemaError(error?.message) || 'Unable to load applications.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUiSettings();
    loadRecords();
  }, [fetchUiSettings, loadRecords]);

  const tabFiltered = useMemo(() => {
    if (activeTab === 'all') return records;
    return records.filter((row) => normalizeStatus(row.Approval_Status) === activeTab);
  }, [activeTab, records]);

  const filteredRecords = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return tabFiltered.filter((row) => {
      const matchesType = applicationTypeFilter === 'all' || row.Application_Type === applicationTypeFilter;
      if (!matchesType) return false;
      if (!keyword) return true;

      return [
        row.Application_Type_Label,
        row.Organization_Name,
        row.Organization_Type,
        row.Lead_Email,
        row.Lead_First_Name,
        row.Lead_Last_Name,
        row.City,
        row.Province,
        row.Region,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));
    });
  }, [tabFiltered, query, applicationTypeFilter]);

  const metrics = useMemo(() => {
    return {
      pending: records.filter((row) => normalizeStatus(row.Approval_Status) === 'pending').length,
      approved: records.filter((row) => normalizeStatus(row.Approval_Status) === 'approved').length,
      rejected: records.filter((row) => normalizeStatus(row.Approval_Status) === 'rejected').length,
      total: records.length,
    };
  }, [records]);

  const openDecisionModal = (organization, mode) => {
    setApprovalModal({
      open: true,
      mode,
      organization,
      accessStart: '',
      accessEnd: '',
      notes: '',
    });
  };

  const closeDecisionModal = () => {
    setApprovalModal((prev) => ({ ...prev, open: false }));
  };

  const processDecision = async () => {
    const organization = approvalModal.organization;
    const isHospitalApplication = organization?.Application_Type === 'hospital';
    if (!organization?.Record_Key) {
      setNotice({ type: 'error', message: 'Invalid application record.' });
      return;
    }

    if (!adminUserId) {
      setNotice({ type: 'error', message: 'Missing admin user id. Re-login and try again.' });
      return;
    }

    const isApprove = approvalModal.mode === 'approve';
    const accessStartIso = toIsoOrNull(approvalModal.accessStart);
    const accessEndIso = toIsoOrNull(approvalModal.accessEnd);

    if (!isHospitalApplication && (!organization?.Organization_ID || !organization?.Lead_User_ID)) {
      setNotice({ type: 'error', message: 'Invalid organization record.' });
      return;
    }

    if (!isHospitalApplication && !organization?.Lead_Email) {
      const message = 'Lead email is required to send the invite email and complete this decision.';
      setNotice({ type: 'error', message });
      setCompletionModal({
        open: true,
        tone: 'error',
        title: isApprove ? 'Approval Failed' : 'Rejection Failed',
        message,
      });
      return;
    }

    if (!isHospitalApplication && !inviteEmailConfigured) {
      const message = mapInviteSendError('missing-service-role');
      setNotice({
        type: 'error',
        message,
      });
      setCompletionModal({
        open: true,
        tone: 'error',
        title: 'Invite Not Configured',
        message,
      });
      return;
    }

    if (!isHospitalApplication && accessStartIso && accessEndIso && new Date(accessStartIso) > new Date(accessEndIso)) {
      setNotice({ type: 'error', message: 'Access end must be later than access start.' });
      return;
    }

    setProcessingId(organization.Record_Key);
    setNotice({ type: '', message: '' });

    try {
      const nowIso = new Date().toISOString();
      if (isHospitalApplication) {
        const updateHospitalResult = await supabase
          .from(HOSPITALS_TABLE)
          .update({
            Is_Approved: isApprove,
            Approval_Status: isApprove ? 'Approved' : 'Rejected',
            Approved_By: adminUserId,
            Approved_At: nowIso,
            Review_Notes: (approvalModal.notes || '').trim() || null,
            Updated_At: nowIso,
          })
          .eq('Hospital_ID', organization.Hospital_ID);

        if (updateHospitalResult.error) {
          throw new Error(updateHospitalResult.error.message);
        }

        setNotice({
          type: 'success',
          message: isApprove ? 'Hospital application approved.' : 'Hospital application rejected.',
        });

        setCompletionModal({
          open: true,
          tone: 'success',
          title: isApprove ? 'Hospital Approved' : 'Hospital Rejected',
          message: isApprove
            ? 'Hospital application was approved successfully.'
            : 'Hospital application was rejected successfully.',
        });
      } else {
        const leadShouldBeActive = isApprove;
        let updatedAuthUserId = organization.Lead_Auth_User_ID;
        const temporaryPassword = generateTemporaryPassword();

        const inviteOutcome = await sendInviteUserEmail({
          email: organization.Lead_Email,
          organizationName: organization.Organization_Name,
          reviewNotes: approvalModal.notes,
          accessStart: accessStartIso,
          accessEnd: accessEndIso,
          temporaryPassword,
          decision: isApprove ? 'approved' : 'rejected',
          existingAuthUserId: updatedAuthUserId,
        });

        if (!inviteOutcome.sent) {
          throw new Error(mapInviteSendError(inviteOutcome.reason));
        }

        if (inviteOutcome.invitedAuthUserId) {
          updatedAuthUserId = inviteOutcome.invitedAuthUserId;
        }

        const updateOrganizationResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .update({
            Is_Approved: isApprove,
            Approval_Status: isApprove ? 'Approved' : 'Rejected',
            Approved_By: adminUserId,
            Approved_At: nowIso,
            Review_Notes: (approvalModal.notes || '').trim() || null,
            Status: isApprove ? 'Active' : 'Inactive',
            Updated_By: adminUserId,
            Updated_At: nowIso,
          })
          .eq('Organization_ID', organization.Organization_ID);

        if (updateOrganizationResult.error) {
          throw new Error(updateOrganizationResult.error.message);
        }

        const updateMembershipResult = await supabase
          .from(ORGANIZATION_MEMBERS_TABLE)
          .update({
            Status: leadShouldBeActive ? 'Active' : 'Inactive',
            Updated_At: nowIso,
          })
          .eq('Organization_ID', organization.Organization_ID)
          .eq('User_ID', organization.Lead_User_ID);

        if (updateMembershipResult.error) {
          throw new Error(updateMembershipResult.error.message);
        }

        const updateUserResult = await supabase
          .from(USERS_TABLE)
          .update({
            auth_user_id: updatedAuthUserId || null,
            role: isApprove ? 'organization' : 'user',
            is_active: leadShouldBeActive,
            access_start: isApprove ? accessStartIso : null,
            access_end: isApprove ? accessEndIso : null,
            updated_at: nowIso,
          })
          .eq('user_id', organization.Lead_User_ID);

        if (updateUserResult.error) {
          throw new Error(updateUserResult.error.message);
        }

        const accessWindowSnippet = accessStartIso || accessEndIso
          ? ` Access window: ${formatAccessWindowLabel(accessStartIso, accessEndIso)}.`
          : '';

        setNotice({
          type: 'success',
          message: isApprove
            ? `Organization approved. Supabase invite email sent to ${organization.Lead_Email || 'lead account'} with account credentials.${accessWindowSnippet}`
            : `Organization rejected. Supabase decision email sent to ${organization.Lead_Email || 'lead account'} with decision details and credentials.`,
        });

        setCompletionModal({
          open: true,
          tone: 'success',
          title: isApprove ? 'Organization Approved' : 'Organization Rejected',
          message: isApprove
            ? `Completed. Invite email with credentials was sent to ${organization.Lead_Email || 'the lead account'}.`
            : `Completed. Rejection email with decision details and credentials was sent to ${organization.Lead_Email || 'the lead account'}.`,
        });
      }

      closeDecisionModal();
      await loadRecords();
    } catch (error) {
      const mappedMessage = mapOrganizationSchemaError(error?.message) || 'Unable to process application decision.';
      setNotice({
        type: 'error',
        message: mappedMessage,
      });
      setCompletionModal({
        open: true,
        tone: 'error',
        title: isApprove ? 'Approval Failed' : 'Rejection Failed',
        message: mappedMessage,
      });
      closeDecisionModal();
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6" style={rootStyle}>
      <section
        className="rounded-2xl border bg-white p-6 shadow-sm"
        style={{ borderColor: `${secondaryColor}30`, backgroundColor }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}>Manage Applications</h2>
            <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
              Review organization and hospital applications, then approve or reject each submission.
            </p>
          </div>
          <button
            type="button"
            onClick={loadRecords}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: `${secondaryColor}55`, color: secondaryTextColor }}
          >
            <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <article className="rounded-xl border bg-white p-4" style={{ borderColor: `${secondaryColor}33` }}>
            <p className="text-sm" style={{ color: secondaryTextColor }}>Pending</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#b45309' }}>{metrics.pending}</p>
          </article>
          <article className="rounded-xl border bg-white p-4" style={{ borderColor: `${secondaryColor}33` }}>
            <p className="text-sm" style={{ color: secondaryTextColor }}>Approved</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#047857' }}>{metrics.approved}</p>
          </article>
          <article className="rounded-xl border bg-white p-4" style={{ borderColor: `${secondaryColor}33` }}>
            <p className="text-sm" style={{ color: secondaryTextColor }}>Rejected</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#be123c' }}>{metrics.rejected}</p>
          </article>
          <article className="rounded-xl border bg-white p-4" style={{ borderColor: `${secondaryColor}33` }}>
            <p className="text-sm" style={{ color: secondaryTextColor }}>Total Applications</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: '#0369a1' }}>{metrics.total}</p>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={
                activeTab === tab.key
                  ? { borderColor: primaryColor, backgroundColor: `${primaryColor}22`, color: primaryColor }
                  : { borderColor: `${secondaryColor}55`, backgroundColor: '#fff', color: secondaryTextColor }
              }
            >
              {tab.label}
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px]" style={{ color: primaryTextColor }}>
                {getTabCount(records, tab.key)}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}55` }}>
            <Search size={14} style={{ color: secondaryTextColor }} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search application, lead, email, or location"
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: primaryTextColor }}
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}55` }}>
            <Filter size={14} style={{ color: secondaryTextColor }} />
            <select
              value={applicationTypeFilter}
              onChange={(event) => setApplicationTypeFilter(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              style={{ color: primaryTextColor }}
            >
              {APPLICATION_TYPE_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {notice.message ? (
        <div className={`rounded-lg border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          {notice.type === 'success' ? (
            <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={15} /> {notice.message}</p>
          ) : (
            <p className="inline-flex items-center gap-2 font-semibold"><ShieldAlert size={15} /> {notice.message}</p>
          )}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-4 shadow-sm" style={{ borderColor: `${secondaryColor}30` }}>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm" style={{ color: secondaryTextColor }}>
            <Loader2 size={16} className="animate-spin" /> Loading applications...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm" style={{ color: secondaryTextColor }}>
            No applications found for the selected tab and filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-sm" style={{ backgroundColor: `${primaryColor}20`, color: primaryTextColor }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Application</th>
                  <th className="px-4 py-3 text-left font-semibold">Lead</th>
                  <th className="px-4 py-3 text-left font-semibold">Details</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Review</th>
                  <th className="px-4 py-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((item) => {
                  const isOrganizationApplication = item.Application_Type === 'organization';
                  const approval = normalizeStatus(item.Approval_Status);
                  const canProcess = approval === 'pending';
                  const isProcessing = processingId === item.Record_Key;

                  return (
                    <tr key={item.Record_Key} className="border-t align-middle" style={{ borderColor: `${secondaryColor}22` }}>
                      <td className="px-4 py-3">
                        <p className="font-semibold" style={{ color: primaryTextColor }}>{item.Organization_Name}</p>
                        <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>{item.Organization_Type || item.Application_Type_Label || '-'}</p>
                        <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>{[item.City, item.Province, item.Region].filter(Boolean).join(', ') || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        {isOrganizationApplication ? (
                          <>
                            <p className="font-semibold" style={{ color: primaryTextColor }}>{[item.Lead_First_Name, item.Lead_Last_Name].filter(Boolean).join(' ') || '-'}</p>
                            <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>{item.Lead_Email || '-'}</p>
                            <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>Lead ID: {item.Lead_User_ID || '-'}</p>
                          </>
                        ) : (
                          <>
                            <p className="font-semibold" style={{ color: primaryTextColor }}>No linked lead account</p>
                            <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>Hospital approvals currently update application status only.</p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: secondaryTextColor }}>
                        {isOrganizationApplication ? (
                          <>
                            <p className="inline-flex items-center gap-1"><Users size={12} /> Total: {item.Member_Stats.total}</p>
                            <p className="mt-1">Active: {item.Member_Stats.active} | Inactive: {item.Member_Stats.inactive}</p>
                            <p className="mt-1">Leaders: {item.Member_Stats.leaders}</p>
                          </>
                        ) : (
                          <>
                            <p>Contact: {item.Contact_Number || '-'}</p>
                            <p className="mt-1">Submitted: {formatDate(item.Created_At)}</p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${approval === 'pending' ? 'bg-amber-100 text-amber-800' : approval === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {item.Approval_Status}
                        </span>
                        <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>
                          Type: {item.Application_Type_Label}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: secondaryTextColor }}>
                        {isOrganizationApplication ? (
                          <>
                            <p>{formatAccessWindowLabel(item.Lead_Access_Start, item.Lead_Access_End)}</p>
                            <p className="mt-1">Lead active: {item.Lead_Is_Active ? 'Yes' : 'No'}</p>
                          </>
                        ) : (
                          <>
                            <p>Reviewed: {formatDate(item.Approved_At || item.Updated_At)}</p>
                            <p className="mt-1">Notes: {item.Review_Notes || '-'}</p>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedOrganization(item)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            <Info size={13} /> Info
                          </button>

                          {canProcess ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openDecisionModal(item, 'approve')}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                                style={{
                                  borderColor: `${primaryColor}33`,
                                  backgroundColor: `${primaryColor}12`,
                                  color: primaryColor,
                                }}
                              >
                                {isProcessing ? <Loader2 size={13} className="animate-spin" /> : (isOrganizationApplication ? <MailCheck size={13} /> : <CheckCircle2 size={13} />)} Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => openDecisionModal(item, 'reject')}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isProcessing ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Reject
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-600">Processed</span>
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
      </section>

      {selectedOrganization && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-40">
              <button
                type="button"
                aria-label="Close application details panel"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setSelectedOrganization(null)}
              />

              <aside
                className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l bg-white shadow-2xl"
                style={{
                  animation: 'manageOrganizationsInfoSlideIn 0.25s ease-out',
                  borderColor: `${secondaryColor}35`,
                  backgroundColor: '#ffffff',
                  opacity: 1,
                  backdropFilter: 'none',
                  color: primaryTextColor,
                  fontFamily: `${bodyFont}, sans-serif`,
                }}
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Application Info</p>
                    <h3 className="text-xl font-bold" style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}>
                      {selectedOrganization.Organization_Name}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedOrganization(null)}
                    aria-label="Close application details panel"
                    className="rounded-md border p-1"
                    style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4 p-5 text-sm">
            <section className="rounded-xl border bg-slate-50 p-3" style={{ borderColor: `${secondaryColor}30` }}>
              <div className="flex items-start gap-3">
                {selectedOrganization.Organization_Logo_URL ? (
                  <img
                    src={selectedOrganization.Organization_Logo_URL}
                    alt="Application logo"
                    className="h-16 w-16 rounded-lg border bg-white object-contain"
                    style={{ borderColor: `${secondaryColor}30` }}
                  />
                ) : (
                  <div
                    className="grid h-16 w-16 place-items-center rounded-lg border bg-white text-xs font-semibold"
                    style={{ borderColor: `${secondaryColor}30`, color: secondaryTextColor }}
                  >
                    No Logo
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold" style={{ color: primaryTextColor }}>
                    {selectedOrganization.Organization_Name}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: secondaryTextColor }}>
                    {selectedOrganization.Organization_Type || selectedOrganization.Application_Type_Label || 'Application'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${normalizeStatus(selectedOrganization.Approval_Status) === 'pending' ? 'bg-amber-100 text-amber-800' : normalizeStatus(selectedOrganization.Approval_Status) === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {selectedOrganization.Approval_Status || 'Pending'}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${normalizeStatus(selectedOrganization.Organization_Status) === 'active' ? 'bg-sky-100 text-sky-800' : 'bg-slate-200 text-slate-700'}`}>
                      {selectedOrganization.Organization_Status || 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-slate-50 p-3" style={{ borderColor: `${secondaryColor}30` }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Application Profile</p>
              <div className="mt-2 overflow-hidden rounded-lg border bg-white" style={{ borderColor: `${secondaryColor}24` }}>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Type</p>
                  <p className="font-medium" style={{ color: primaryTextColor }}>{selectedOrganization.Organization_Type || selectedOrganization.Application_Type_Label || '-'}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Contact</p>
                  <p className="font-medium" style={{ color: primaryTextColor }}>{selectedOrganization.Contact_Number || '-'}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Address</p>
                  <p className="leading-relaxed" style={{ color: primaryTextColor }}>
                    {[selectedOrganization.Street, selectedOrganization.Barangay, selectedOrganization.City, selectedOrganization.Province, selectedOrganization.Region, selectedOrganization.Country]
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Coordinates</p>
                  <p style={{ color: primaryTextColor }}>
                    {selectedOrganization.Latitude && selectedOrganization.Longitude
                      ? `${selectedOrganization.Latitude}, ${selectedOrganization.Longitude}`
                      : '-'}
                  </p>
                </div>
              </div>
            </section>

            {selectedOrganization.Application_Type === 'organization' ? (
              <>
                <section className="rounded-xl border bg-slate-50 p-3" style={{ borderColor: `${secondaryColor}30` }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Lead Account</p>
                  <div className="mt-2 overflow-hidden rounded-lg border bg-white" style={{ borderColor: `${secondaryColor}24` }}>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Name</p>
                      <p className="font-medium" style={{ color: primaryTextColor }}>{[selectedOrganization.Lead_First_Name, selectedOrganization.Lead_Last_Name].filter(Boolean).join(' ') || '-'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Email</p>
                      <p style={{ color: primaryTextColor }}>{selectedOrganization.Lead_Email || '-'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Contact</p>
                      <p style={{ color: primaryTextColor }}>{selectedOrganization.Lead_Contact || '-'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Address</p>
                      <p className="leading-relaxed" style={{ color: primaryTextColor }}>{selectedOrganization.Lead_Address || '-'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Role</p>
                      <p style={{ color: primaryTextColor }}>{selectedOrganization.Lead_Role || '-'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Active</p>
                      <p style={{ color: primaryTextColor }}>{selectedOrganization.Lead_Is_Active ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Access</p>
                      <p style={{ color: primaryTextColor }}>{formatAccessWindowLabel(selectedOrganization.Lead_Access_Start, selectedOrganization.Lead_Access_End)}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border bg-slate-50 p-3" style={{ borderColor: `${secondaryColor}30` }}>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Member Summary</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}24` }}>
                      <p className="text-[11px] uppercase tracking-wider" style={{ color: secondaryTextColor }}>Total</p>
                      <p className="text-lg font-semibold" style={{ color: primaryTextColor }}>{selectedOrganization.Member_Stats.total}</p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}24` }}>
                      <p className="text-[11px] uppercase tracking-wider" style={{ color: secondaryTextColor }}>Active</p>
                      <p className="text-lg font-semibold" style={{ color: primaryTextColor }}>{selectedOrganization.Member_Stats.active}</p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}24` }}>
                      <p className="text-[11px] uppercase tracking-wider" style={{ color: secondaryTextColor }}>Inactive</p>
                      <p className="text-lg font-semibold" style={{ color: primaryTextColor }}>{selectedOrganization.Member_Stats.inactive}</p>
                    </div>
                    <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: `${secondaryColor}24` }}>
                      <p className="text-[11px] uppercase tracking-wider" style={{ color: secondaryTextColor }}>Leaders</p>
                      <p className="text-lg font-semibold" style={{ color: primaryTextColor }}>{selectedOrganization.Member_Stats.leaders}</p>
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            <section className="rounded-xl border bg-slate-50 p-3" style={{ borderColor: `${secondaryColor}30` }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Approval Timeline</p>
              <div className="mt-2 overflow-hidden rounded-lg border bg-white" style={{ borderColor: `${secondaryColor}24` }}>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Submitted</p>
                  <p style={{ color: primaryTextColor }}>{formatDate(selectedOrganization.Created_At)}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Reviewed</p>
                  <p style={{ color: primaryTextColor }}>{formatDate(selectedOrganization.Approved_At || selectedOrganization.Updated_At)}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Approval</p>
                  <p style={{ color: primaryTextColor }}>{selectedOrganization.Approval_Status || '-'}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 border-b px-3 py-2" style={{ borderColor: `${secondaryColor}20` }}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Entity Status</p>
                  <p style={{ color: primaryTextColor }}>{selectedOrganization.Organization_Status || '-'}</p>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-3 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Review Notes</p>
                  <p className="leading-relaxed" style={{ color: primaryTextColor }}>{selectedOrganization.Review_Notes || '-'}</p>
                </div>
              </div>
            </section>
                </div>
              </aside>

              <style>{`
                @keyframes manageOrganizationsInfoSlideIn {
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

      {completionModal.open && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-2xl"
            style={{
              borderColor: `${secondaryColor}35`,
              color: primaryTextColor,
              fontFamily: `${bodyFont}, sans-serif`,
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Decision Result</p>
                <h3 className="text-xl font-bold" style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}>
                  {completionModal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletionModal((prev) => ({ ...prev, open: false }))}
                className="rounded-md border p-1"
                style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
              >
                <X size={16} />
              </button>
            </div>

            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                completionModal.tone === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900'
              }`}
            >
              <p className="inline-flex items-center gap-2 font-semibold">
                {completionModal.tone === 'error' ? <ShieldAlert size={15} /> : <CheckCircle2 size={15} />}
                {completionModal.tone === 'error' ? 'Failed' : 'Completed'}
              </p>
              <p className="mt-1">{completionModal.message}</p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setCompletionModal((prev) => ({ ...prev, open: false }))}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: completionModal.tone === 'error' ? '#dc2626' : primaryColor }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      {approvalModal.open && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border bg-white shadow-2xl"
            style={{
              borderColor: `${secondaryColor}35`,
              backgroundColor: '#ffffff',
              opacity: 1,
              backdropFilter: 'none',
              color: primaryTextColor,
              fontFamily: `${bodyFont}, sans-serif`,
            }}
          >
            <div className="border-b px-5 py-4" style={{ borderColor: `${secondaryColor}30` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Application Decision</p>
                  <h3 className="text-xl font-bold" style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}>
                    {approvalModal.mode === 'approve'
                      ? `Approve ${approvalModal.organization?.Application_Type === 'hospital' ? 'Hospital' : 'Organization'}`
                      : `Reject ${approvalModal.organization?.Application_Type === 'hospital' ? 'Hospital' : 'Organization'}`}
                  </h3>
                  <p className="text-sm" style={{ color: secondaryTextColor }}>{approvalModal.organization?.Organization_Name}</p>
                </div>
                <button type="button" onClick={closeDecisionModal} className="rounded-md border p-1" style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm">
              {approvalModal.organization?.Application_Type === 'organization' ? (
                <div className="rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: `${secondaryColor}30`, color: secondaryTextColor }}>
                  Supabase invite email is sent for both approve and reject decisions.
                </div>
              ) : (
                <div className="rounded-lg border bg-slate-50 px-3 py-2" style={{ borderColor: `${secondaryColor}30`, color: secondaryTextColor }}>
                  Hospital decisions update only application approval fields.
                </div>
              )}

              {approvalModal.organization?.Application_Type === 'organization' && !inviteEmailConfigured ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Invite email service is not configured in this frontend build. Configure the service-role key first, then retry this decision.
                </div>
              ) : null}

              {approvalModal.organization?.Application_Type === 'organization' && approvalModal.mode === 'approve' ? (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Access Start (Optional)</span>
                      <input
                        type="datetime-local"
                        value={approvalModal.accessStart}
                        onChange={(event) => setApprovalModal((prev) => ({ ...prev, accessStart: event.target.value }))}
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ borderColor: `${secondaryColor}44` }}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Access End (Optional)</span>
                      <input
                        type="datetime-local"
                        value={approvalModal.accessEnd}
                        onChange={(event) => setApprovalModal((prev) => ({ ...prev, accessEnd: event.target.value }))}
                        className="w-full rounded-lg border px-3 py-2 outline-none"
                        style={{ borderColor: `${secondaryColor}44` }}
                      />
                    </label>
                  </div>
                </>
              ) : null}

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: secondaryTextColor }}>Review Notes</span>
                <textarea
                  rows={3}
                  value={approvalModal.notes}
                  onChange={(event) => setApprovalModal((prev) => ({ ...prev, notes: event.target.value }))}
                  className="w-full rounded-lg border px-3 py-2 outline-none"
                  style={{ borderColor: `${secondaryColor}44` }}
                  placeholder="Optional review notes"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: `${secondaryColor}30` }}>
              <button
                type="button"
                onClick={closeDecisionModal}
                className="rounded-lg border px-3 py-2 text-sm font-semibold"
                style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={processDecision}
                disabled={
                  processingId === approvalModal.organization?.Record_Key
                  || (approvalModal.organization?.Application_Type === 'organization' && !inviteEmailConfigured)
                }
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: approvalModal.mode === 'approve' ? primaryColor : '#dc2626' }}
              >
                {processingId === approvalModal.organization?.Record_Key ? (
                  <><Loader2 size={14} className="animate-spin" /> Processing...</>
                ) : (
                  <>
                    {approvalModal.mode === 'approve' ? <ChevronRight size={14} /> : <XCircle size={14} />}
                    {approvalModal.organization?.Application_Type === 'organization'
                      ? (approvalModal.mode === 'approve'
                        ? (inviteEmailConfigured ? 'Approve And Send Email' : 'Invite Not Configured')
                        : (inviteEmailConfigured ? 'Reject And Send Email' : 'Invite Not Configured'))
                      : (approvalModal.mode === 'approve' ? 'Approve Application' : 'Reject Application')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
