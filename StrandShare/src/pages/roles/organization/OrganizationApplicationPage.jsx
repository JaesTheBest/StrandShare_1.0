import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Loader2, MailCheck, ShieldCheck, UploadCloud } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useTheme } from '../../../context/ThemeContext';
import { supabase } from '../../../lib/supabaseClient';
import organizationAddressOptions from '../../../data/organizationAddressOptions.json';
import { TransitionFlipEntrance } from '../../../components/transitions/TransitionFlip';

const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const ORGANIZATIONS_TABLE = 'Organizations';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const ORGANIZATION_LOGOS_BUCKET = 'organization_logos';
const MAX_LOGO_FILE_SIZE_BYTES = 5 * 1024 * 1024;
let isolatedAuthClient = null;

const ORGANIZATION_TYPE_OPTIONS = [
  'Non-Government Organization (NGO)',
  'Foundation',
  'Nonprofit Association',
  'Patient Support Group',
  'Community-Based Organization',
  'Faith-Based Organization',
  'Corporate Social Responsibility Partner',
  'Government Agency',
  'Other',
];

const DEFAULT_COUNTRY = 'Philippines';
const PHILIPPINE_ADDRESS_TREE = organizationAddressOptions && typeof organizationAddressOptions === 'object'
  ? organizationAddressOptions
  : {};

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

  if (psgcRegionOptions.length > 0) {
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

  const countries = Array.isArray(data.countries) ? data.countries : [];
  const countryNode = countries.find((country) => country?.name === DEFAULT_COUNTRY) || countries[0] || null;
  const regions = Array.isArray(countryNode?.regions) ? countryNode.regions : [];

  return regions
    .map((region) => ({
      name: String(region?.name || '').trim(),
      provinces: (Array.isArray(region?.provinces) ? region.provinces : []).map((province) => ({
        name: String(province?.name || '').trim(),
        cities: (Array.isArray(province?.cities) ? province.cities : []).map((cityName) => ({
          name: String(cityName || '').trim(),
          barangays: [],
        })),
      })),
    }))
    .filter((region) => region.name)
    .map((region) => ({
      ...region,
      provinces: (region.provinces || [])
        .filter((province) => province.name)
        .map((province) => ({
          ...province,
          cities: (province.cities || [])
            .filter((city) => city.name)
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

const initialForm = {
  organizationName: '',
  organizationType: '',
  contactNumber: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  country: DEFAULT_COUNTRY,
  firstName: '',
  middleName: '',
  suffix: '',
  birthdate: '',
  gender: '',
  lastName: '',
  leadContactNumber: '',
  leadStreet: '',
  leadBarangay: '',
  leadCity: '',
  leadProvince: '',
  leadRegion: '',
  leadCountry: DEFAULT_COUNTRY,
  email: '',
};

const LEAD_GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

function toTitle(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeRole(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function toSafeFileName(fileName = 'organization-logo.png') {
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
    .slice(0, 60);
}

function normalizePhilippineMobile(value = '') {
  let digits = String(value || '').replace(/\D/g, '');

  if (digits.startsWith('63')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

function formatPhilippineMobile(value = '') {
  const digits = normalizePhilippineMobile(value);

  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
}

function toStoredPhoneNumber(value = '') {
  const digits = normalizePhilippineMobile(value);
  return digits.length === 10 ? `+63${digits}` : '';
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('bucket') && lower.includes('not found')) {
    return 'Organization logo bucket is missing. Run migration 025_organization_logos_storage_policies.sql and retry.';
  }

  if (lower.includes('row-level security')) {
    return 'Logo upload blocked by Storage RLS policy. Run migration 025_organization_logos_storage_policies.sql and retry.';
  }

  return message;
}

function createIsolatedAuthClient() {
  if (isolatedAuthClient) {
    return isolatedAuthClient;
  }

  const url = process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase configuration. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
  }

  isolatedAuthClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'strandshare-org-application-otp-client',
    },
  });

  return isolatedAuthClient;
}

function isValidEmail(value = '') {
  const normalized = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function mapEmailOtpError(rawMessage) {
  const message = String(rawMessage || 'Unable to process email verification.').trim();
  const lower = message.toLowerCase();

  if (
    lower.includes('after 25 seconds')
    || lower.includes('after 60 seconds')
    || lower.includes('for security purposes')
    || lower.includes('rate limit')
  ) {
    return 'Too many requests. Please wait around 60 seconds before requesting another code.';
  }

  if (lower.includes('token has expired') || lower.includes('expired')) {
    return 'This code already expired. Request a new 6-digit code.';
  }

  if (lower.includes('token') && lower.includes('invalid')) {
    return 'Invalid code. Please check the 6-digit code and try again.';
  }

  if (lower.includes('email') && lower.includes('invalid')) {
    return 'Please enter a valid email address first.';
  }

  return message;
}

function mapOrganizationSchemaError(rawMessage) {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (
    message.includes("Could not find the table 'public.Organizations'")
    || message.includes("Could not find the table 'public.Organization_Members'")
  ) {
    return 'Organization tables are not ready yet. Run migration 024_simplify_organization_tables_to_two_tables.sql, then refresh the app.';
  }

  if (lower.includes('bucket') && lower.includes('organization_logos')) {
    return 'Organization logo bucket is missing. Run migration 025_organization_logos_storage_policies.sql, then refresh the app.';
  }

  if (lower.includes('storage') || lower.includes('row-level security')) {
    return mapStorageUploadError(message);
  }

  if (lower.includes('no unique or exclusion constraint matching the on conflict specification')) {
    return 'Your database is missing a required unique constraint from old migrations. The form now avoids conflict-based upserts, so please refresh and submit again.';
  }

  return message;
}

async function uploadOrganizationLogo(file, organizationName) {
  if (!supabase) {
    throw new Error('Supabase is not configured for file upload.');
  }

  const safeName = toSafeFileName(file?.name || 'organization-logo.png');
  const slug = toSlug(organizationName) || 'organization';
  const filePath = `applications/${slug}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(ORGANIZATION_LOGOS_BUCKET)
    .upload(filePath, file, {
      upsert: false,
      contentType: file?.type || 'image/png',
    });

  if (uploadError) {
    throw new Error(mapStorageUploadError(uploadError.message));
  }

  const { data: publicUrlData } = supabase.storage
    .from(ORGANIZATION_LOGOS_BUCKET)
    .getPublicUrl(filePath);

  const publicUrl = publicUrlData?.publicUrl;

  if (!publicUrl) {
    throw new Error('Could not resolve uploaded organization logo URL.');
  }

  return {
    filePath,
    publicUrl,
  };
}

export default function OrganizationApplicationPage() {
  const { theme } = useTheme();
  const primaryColor = theme.primaryColor || '#0f766e';
  const secondaryColor = theme.secondaryColor || '#64748b';
  const backgroundColor = theme.backgroundColor || '#f8fafc';
  const primaryTextColor = theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme.secondaryTextColor || '#334155';
  const [form, setForm] = useState(initialForm);
  const [activePage, setActivePage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmissionComplete, setIsSubmissionComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submittedOrganizationName, setSubmittedOrganizationName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState({ type: '', message: '' });
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCooldownSeconds, setOtpCooldownSeconds] = useState(0);
  const [otpVerifiedEmail, setOtpVerifiedEmail] = useState('');
  const [otpVerifiedAuthUserId, setOtpVerifiedAuthUserId] = useState('');
  const logoInputRef = useRef(null);
  const otpClientRef = useRef(null);
  const fieldClassName = 'w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2';
  const fieldStyle = {
    borderColor: `${secondaryColor}55`,
    '--tw-ring-color': `${primaryColor}55`,
  };

  const regionOptions = useMemo(() => {
    return toUnifiedRegionOptions(PHILIPPINE_ADDRESS_TREE);
  }, []);

  const selectedRegion = useMemo(() => {
    return regionOptions.find((region) => region.name === form.region) || null;
  }, [form.region, regionOptions]);

  const provinceOptions = useMemo(() => {
    return Array.isArray(selectedRegion?.provinces) ? selectedRegion.provinces : [];
  }, [selectedRegion]);

  const selectedProvince = useMemo(() => {
    return provinceOptions.find((province) => province.name === form.province) || null;
  }, [form.province, provinceOptions]);

  const cityOptions = useMemo(() => {
    return Array.isArray(selectedProvince?.cities) ? selectedProvince.cities : [];
  }, [selectedProvince]);

  const selectedCity = useMemo(() => {
    return cityOptions.find((city) => city.name === form.city) || null;
  }, [form.city, cityOptions]);

  const barangayOptions = useMemo(() => {
    return Array.isArray(selectedCity?.barangays) ? selectedCity.barangays : [];
  }, [selectedCity]);

  const leadRegionOptions = useMemo(() => {
    return regionOptions;
  }, [regionOptions]);

  const selectedLeadRegion = useMemo(() => {
    return leadRegionOptions.find((region) => region.name === form.leadRegion) || null;
  }, [form.leadRegion, leadRegionOptions]);

  const leadProvinceOptions = useMemo(() => {
    return Array.isArray(selectedLeadRegion?.provinces) ? selectedLeadRegion.provinces : [];
  }, [selectedLeadRegion]);

  const selectedLeadProvince = useMemo(() => {
    return leadProvinceOptions.find((province) => province.name === form.leadProvince) || null;
  }, [form.leadProvince, leadProvinceOptions]);

  const leadCityOptions = useMemo(() => {
    return Array.isArray(selectedLeadProvince?.cities) ? selectedLeadProvince.cities : [];
  }, [selectedLeadProvince]);

  const selectedLeadCity = useMemo(() => {
    return leadCityOptions.find((city) => city.name === form.leadCity) || null;
  }, [form.leadCity, leadCityOptions]);

  const leadBarangayOptions = useMemo(() => {
    return Array.isArray(selectedLeadCity?.barangays) ? selectedLeadCity.barangays : [];
  }, [selectedLeadCity]);

  const normalizedEmail = useMemo(() => {
    return form.email.trim().toLowerCase();
  }, [form.email]);

  const isEmailOtpVerified = useMemo(() => {
    return Boolean(
      otpVerifiedAuthUserId
      && otpVerifiedEmail
      && otpVerifiedEmail === normalizedEmail
    );
  }, [normalizedEmail, otpVerifiedAuthUserId, otpVerifiedEmail]);

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  useEffect(() => {
    if (otpCooldownSeconds <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setOtpCooldownSeconds((previous) => (previous > 1 ? previous - 1 : 0));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [otpCooldownSeconds]);

  const hasOrganizationRequiredFields = useMemo(() => {
    return (
      form.organizationName.trim()
      && form.organizationType.trim()
      && normalizePhilippineMobile(form.contactNumber).length === 10
      && form.street.trim()
      && form.city.trim()
      && form.province.trim()
      && form.region.trim()
      && form.country.trim()
    );
  }, [form.organizationName, form.organizationType, form.contactNumber, form.street, form.city, form.province, form.region, form.country]);

  const hasLeadRequiredFields = useMemo(() => {
    return (
      form.firstName.trim()
      && form.lastName.trim()
      && normalizePhilippineMobile(form.leadContactNumber).length === 10
      && form.leadStreet.trim()
      && form.leadCity.trim()
      && form.leadProvince.trim()
      && form.leadRegion.trim()
      && form.leadCountry.trim()
      && form.email.trim()
    );
  }, [form.firstName, form.lastName, form.leadContactNumber, form.leadStreet, form.leadCity, form.leadProvince, form.leadRegion, form.leadCountry, form.email]);

  const hasRequiredFields = hasOrganizationRequiredFields && hasLeadRequiredFields;

  const canSubmit = hasRequiredFields && isEmailOtpVerified;

  const clearOtpVerificationState = (nextNotice = { type: '', message: '' }) => {
    setOtpCode('');
    setOtpVerifiedEmail('');
    setOtpVerifiedAuthUserId('');
    setOtpNotice(nextNotice);
  };

  const updateField = (field) => (event) => {
    const nextValue = event.target.value;

    if (field === 'email') {
      const normalizedNextEmail = String(nextValue || '').trim().toLowerCase();
      const shouldResetOtp = normalizedNextEmail !== otpVerifiedEmail;

      if (shouldResetOtp) {
        clearOtpVerificationState(
          normalizedNextEmail
            ? { type: 'info', message: 'Email changed. Request and verify a new 6-digit code.' }
            : { type: '', message: '' }
        );
      }
    }

    setForm((prev) => ({
      ...prev,
      [field]: nextValue,
    }));
  };

  const onCountryChange = (event) => {
    const countryName = event.target.value || DEFAULT_COUNTRY;
    setForm((prev) => ({
      ...prev,
      country: countryName,
      region: '',
      province: '',
      city: '',
      barangay: '',
    }));
  };

  const onRegionChange = (event) => {
    const regionName = event.target.value;
    setForm((prev) => ({
      ...prev,
      region: regionName,
      province: '',
      city: '',
      barangay: '',
    }));
  };

  const onProvinceChange = (event) => {
    const provinceName = event.target.value;
    setForm((prev) => ({
      ...prev,
      province: provinceName,
      city: '',
      barangay: '',
    }));
  };

  const onCityChange = (event) => {
    const cityName = event.target.value;
    setForm((prev) => ({
      ...prev,
      city: cityName,
      barangay: '',
    }));
  };

  const onLeadCountryChange = (event) => {
    const countryName = event.target.value || DEFAULT_COUNTRY;
    setForm((prev) => ({
      ...prev,
      leadCountry: countryName,
      leadRegion: '',
      leadProvince: '',
      leadCity: '',
      leadBarangay: '',
    }));
  };

  const onLeadRegionChange = (event) => {
    const regionName = event.target.value;
    setForm((prev) => ({
      ...prev,
      leadRegion: regionName,
      leadProvince: '',
      leadCity: '',
      leadBarangay: '',
    }));
  };

  const onLeadProvinceChange = (event) => {
    const provinceName = event.target.value;
    setForm((prev) => ({
      ...prev,
      leadProvince: provinceName,
      leadCity: '',
      leadBarangay: '',
    }));
  };

  const onLeadCityChange = (event) => {
    const cityName = event.target.value;
    setForm((prev) => ({
      ...prev,
      leadCity: cityName,
      leadBarangay: '',
    }));
  };

  const onContactNumberChange = (field) => (event) => {
    const digits = normalizePhilippineMobile(event.target.value);
    setForm((prev) => ({
      ...prev,
      [field]: digits,
    }));
  };

  const onLogoFileChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      setLogoPreviewUrl('');
      setLogoFile(null);
      return;
    }

    if (!String(file.type || '').startsWith('image/')) {
      setErrorMessage('Only image files are allowed for organization logo upload.');
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
      setErrorMessage('Logo image must be 5MB or smaller.');
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setErrorMessage('');
    setLogoPreviewUrl(nextPreviewUrl);
    setLogoFile(file);
  };

  const sendEmailOtpCode = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!isValidEmail(normalizedEmail)) {
      setOtpNotice({ type: 'error', message: 'Enter a valid email address first.' });
      return;
    }

    if (otpCooldownSeconds > 0 || isSendingOtp) {
      return;
    }

    setIsSendingOtp(true);

    try {
      const otpClient = createIsolatedAuthClient();
      otpClientRef.current = otpClient;

      const { error } = await otpClient.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw error;
      }

      setOtpCode('');
      setOtpVerifiedEmail('');
      setOtpVerifiedAuthUserId('');
      setOtpNotice({
        type: 'success',
        message: `A 6-digit code was sent to ${normalizedEmail}. Enter it below to verify your email.`,
      });
      setOtpCooldownSeconds(60);
    } catch (error) {
      setOtpNotice({
        type: 'error',
        message: mapEmailOtpError(error?.message),
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const verifyEmailOtpCode = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    const normalizedCode = String(otpCode || '').replace(/\D/g, '').slice(0, 6);

    if (!isValidEmail(normalizedEmail)) {
      setOtpNotice({ type: 'error', message: 'Enter a valid email address first.' });
      return;
    }

    if (normalizedCode.length !== 6) {
      setOtpNotice({ type: 'error', message: 'Please enter the 6-digit code sent to your email.' });
      return;
    }

    setIsVerifyingOtp(true);

    try {
      const otpClient = otpClientRef.current || createIsolatedAuthClient();
      otpClientRef.current = otpClient;

      const { data, error } = await otpClient.auth.verifyOtp({
        email: normalizedEmail,
        token: normalizedCode,
        type: 'email',
      });

      if (error) {
        throw error;
      }

      const verifiedAuthUserId = data?.user?.id || '';

      if (!verifiedAuthUserId) {
        throw new Error('Verification passed, but account information could not be resolved. Please try again.');
      }

      setOtpCode(normalizedCode);
      setOtpVerifiedEmail(normalizedEmail);
      setOtpVerifiedAuthUserId(verifiedAuthUserId);
      setOtpNotice({
        type: 'success',
        message: 'Email verified successfully. You can now submit your organization application.',
      });

      await otpClient.auth.signOut().catch(() => undefined);
    } catch (error) {
      setOtpVerifiedEmail('');
      setOtpVerifiedAuthUserId('');
      setOtpNotice({
        type: 'error',
        message: mapEmailOtpError(error?.message),
      });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const goBack = () => {
    if (typeof window === 'undefined') return;
    window.location.assign('/');
  };

  const goToLeadPage = () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!hasOrganizationRequiredFields) {
      setErrorMessage('Please complete all organization information, including a valid contact number, before continuing.');
      return;
    }

    setActivePage(2);
  };

  const goToOrganizationPage = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setActivePage(1);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (activePage === 1) {
      goToLeadPage();
      return;
    }

    if (!hasRequiredFields) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    if (!isEmailOtpVerified) {
      setErrorMessage('Please verify your email with the 6-digit code before submitting.');
      return;
    }

    const firstName = toTitle(form.firstName);
    const middleName = toTitle(form.middleName);
    const suffix = toTitle(form.suffix);
    const gender = toTitle(form.gender);
    const lastName = toTitle(form.lastName);
    const nowIso = new Date().toISOString();
    const joinedDate = nowIso.slice(0, 10);
    const organizationName = form.organizationName.trim();
    const organizationContactNumber = toStoredPhoneNumber(form.contactNumber);
    const leadContactNumber = toStoredPhoneNumber(form.leadContactNumber);

    setIsSubmitting(true);

    try {
      const existingUserResponse = await supabase
        .from(USERS_TABLE)
        .select('user_id, email, role, auth_user_id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUserResponse.error) {
        throw new Error(existingUserResponse.error.message);
      }

      const existingUser = existingUserResponse.data || null;
      const existingRole = normalizeRole(existingUser?.role);
      const allowedExistingRole = !existingRole || existingRole === 'user' || existingRole === 'organization' || existingRole === 'partner';

      if (existingUser && !allowedExistingRole) {
        throw new Error('This email is linked to a restricted account role. Use a different email for the organization lead.');
      }

      if (existingUser?.auth_user_id && otpVerifiedAuthUserId && existingUser.auth_user_id !== otpVerifiedAuthUserId) {
        throw new Error('The verified OTP account does not match this email. Request a new code and verify again.');
      }

      const authUserId = existingUser?.auth_user_id || otpVerifiedAuthUserId || null;

      if (!authUserId) {
        throw new Error('Email verification session expired. Please request and verify a new 6-digit code.');
      }

      let userId = Number(existingUser?.user_id || 0);

      if (existingUser?.user_id) {
        const updateUserResult = await supabase
          .from(USERS_TABLE)
          .update({
            auth_user_id: authUserId,
            role: 'user',
            access_start: null,
            access_end: null,
            is_active: false,
            updated_at: nowIso,
          })
          .eq('user_id', existingUser.user_id)
          .select('user_id')
          .maybeSingle();

        if (updateUserResult.error) {
          throw new Error(updateUserResult.error.message);
        }

        userId = Number(updateUserResult.data?.user_id || existingUser.user_id);
      } else {
        const insertUserResult = await supabase
          .from(USERS_TABLE)
          .insert({
            auth_user_id: authUserId,
            email: normalizedEmail,
            role: 'user',
            access_start: null,
            access_end: null,
            is_active: false,
            updated_at: nowIso,
          })
          .select('user_id')
          .maybeSingle();

        if (insertUserResult.error) {
          throw new Error(insertUserResult.error.message);
        }

        userId = Number(insertUserResult.data?.user_id || 0);
      }

      if (!userId) {
        throw new Error('Unable to resolve local user profile for the organization applicant.');
      }

      const existingMembersResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Organization_ID')
        .eq('User_ID', userId);

      if (existingMembersResult.error) {
        throw new Error(existingMembersResult.error.message);
      }

      const linkedOrganizationIds = (existingMembersResult.data || [])
        .map((row) => row.Organization_ID)
        .filter(Boolean);

      if (linkedOrganizationIds.length > 0) {
        const activeOrganizationsResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .select('Organization_ID, Approval_Status')
          .in('Organization_ID', linkedOrganizationIds)
          .in('Approval_Status', ['Pending', 'Approved'])
          .limit(1);

        if (activeOrganizationsResult.error) {
          throw new Error(activeOrganizationsResult.error.message);
        }

        if ((activeOrganizationsResult.data || []).length > 0) {
          throw new Error('An active organization request already exists for this lead account.');
        }
      }

      const userDetailsPayload = {
        user_id: userId,
        first_name: firstName,
        middle_name: middleName || null,
        suffix: suffix || null,
        birthdate: form.birthdate || null,
        gender: gender || null,
        last_name: lastName,
        contact_number: leadContactNumber,
        street: form.leadStreet.trim(),
        barangay: form.leadBarangay.trim() || null,
        city: form.leadCity.trim(),
        province: form.leadProvince.trim(),
        region: form.leadRegion.trim(),
        country: form.leadCountry.trim(),
        updated_at: nowIso,
      };

      const existingDetailsResult = await supabase
        .from(USER_DETAILS_TABLE)
        .select('user_id')
        .eq('user_id', userId)
        .limit(1);

      if (existingDetailsResult.error) {
        throw new Error(existingDetailsResult.error.message);
      }

      if ((existingDetailsResult.data || []).length > 0) {
        const updateDetailsResult = await supabase
          .from(USER_DETAILS_TABLE)
          .update(userDetailsPayload)
          .eq('user_id', userId);

        if (updateDetailsResult.error) {
          throw new Error(updateDetailsResult.error.message);
        }
      } else {
        const insertDetailsResult = await supabase
          .from(USER_DETAILS_TABLE)
          .insert({
            ...userDetailsPayload,
            joined_date: joinedDate,
          });

        if (insertDetailsResult.error) {
          throw new Error(insertDetailsResult.error.message);
        }
      }

      let organizationLogoUrl = '';

      if (logoFile) {
        const uploadResult = await uploadOrganizationLogo(logoFile, form.organizationName.trim());
        organizationLogoUrl = uploadResult.publicUrl;
      }

      const createOrganizationResult = await supabase
        .from(ORGANIZATIONS_TABLE)
        .insert({
          Organization_Name: organizationName,
          Organization_Type: form.organizationType.trim(),
          Contact_Number: organizationContactNumber,
          Organization_Logo_URL: organizationLogoUrl || null,
          Street: form.street.trim(),
          Barangay: form.barangay.trim() || null,
          City: form.city.trim(),
          Province: form.province.trim(),
          Region: form.region.trim(),
          Country: form.country.trim(),
          Status: 'Inactive',
          Is_Approved: false,
          Approval_Status: 'Pending',
          Created_By: userId,
          Updated_By: userId,
          Updated_At: nowIso,
        })
        .select('Organization_ID')
        .maybeSingle();

      if (createOrganizationResult.error) {
        throw new Error(createOrganizationResult.error.message);
      }

      const organizationId = createOrganizationResult.data?.Organization_ID;

      if (!organizationId) {
        throw new Error('Organization record was not created. Please try again.');
      }

      const membershipPayload = {
        Organization_ID: organizationId,
        User_ID: userId,
        Membership_Role: 'Leader',
        Is_Primary: true,
        Status: 'Inactive',
        Created_By: userId,
        Updated_At: nowIso,
      };

      const existingMembershipResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Member_ID')
        .eq('Organization_ID', organizationId)
        .eq('User_ID', userId)
        .limit(1);

      if (existingMembershipResult.error) {
        throw new Error(existingMembershipResult.error.message);
      }

      const existingMemberId = existingMembershipResult.data?.[0]?.Member_ID || null;

      if (existingMemberId) {
        const updateMembershipResult = await supabase
          .from(ORGANIZATION_MEMBERS_TABLE)
          .update(membershipPayload)
          .eq('Member_ID', existingMemberId);

        if (updateMembershipResult.error) {
          throw new Error(updateMembershipResult.error.message);
        }
      } else {
        const insertMembershipResult = await supabase
          .from(ORGANIZATION_MEMBERS_TABLE)
          .insert(membershipPayload);

        if (insertMembershipResult.error) {
          throw new Error(insertMembershipResult.error.message);
        }
      }

      setForm(initialForm);
      setLogoFile(null);
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      setLogoPreviewUrl('');
      setOtpCode('');
      setOtpNotice({ type: '', message: '' });
      setOtpVerifiedEmail('');
      setOtpVerifiedAuthUserId('');
      setOtpCooldownSeconds(0);
      setActivePage(1);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
      if (otpClientRef.current) {
        await otpClientRef.current.auth.signOut().catch(() => undefined);
      }
      setSuccessMessage(
        'Application submitted successfully. Your organization is now pending Super Admin review.'
      );
      setSubmittedOrganizationName(organizationName);
      setIsSubmissionComplete(true);
    } catch (error) {
      setErrorMessage(
        mapOrganizationSchemaError(error?.message)
        || 'Unable to submit organization application.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const incomingTransition = (() => {
    try {
      return typeof window !== 'undefined' ? sessionStorage.getItem('strandshare:incoming-transition') : '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    if (incomingTransition === 'apply') {
      try { sessionStorage.removeItem('strandshare:incoming-transition'); } catch { /* ignore */ }
    }
  }, [incomingTransition]);

  const Wrapper = incomingTransition === 'apply' ? TransitionFlipEntrance : React.Fragment;

  if (isSubmissionComplete) {
    return (
      <div className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor }}>
        <div className="mx-auto max-w-3xl">
          <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: `${secondaryColor}44` }}>
            <header
              className="border-b px-5 py-5 md:px-7"
              style={{
                borderColor: `${secondaryColor}33`,
                background: `linear-gradient(120deg, ${primaryColor}22, #ffffff)`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>Application Status</p>
                  <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl" style={{ color: primaryTextColor }}>
                    Organization Application Submitted
                  </h1>
                  {submittedOrganizationName ? (
                    <p className="mt-2 text-sm md:text-base" style={{ color: secondaryTextColor }}>
                      {submittedOrganizationName}
                    </p>
                  ) : null}
                </div>
                <div
                  className="grid h-12 w-12 place-items-center rounded-xl text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <CheckCircle2 size={22} />
                </div>
              </div>
            </header>

            <div className="space-y-4 px-5 py-6 md:px-7 md:py-7">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Success</p>
                <p className="mt-1">{successMessage || 'Application submitted successfully. Your organization is now pending Super Admin review.'}</p>
              </div>

              <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm" style={{ borderColor: `${secondaryColor}33`, color: secondaryTextColor }}>
                Please wait for the email update to know if your organization application is accepted or rejected.
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <ArrowLeft size={16} /> Back To Landing Page
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <Wrapper>
    <div className="min-h-screen px-4 py-8 md:px-8" style={{ backgroundColor }}>
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={goBack}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"
          style={{ borderColor: `${secondaryColor}55`, color: secondaryTextColor }}
        >
          <ArrowLeft size={14} /> Back To Landing
        </button>

        <section className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: `${secondaryColor}44` }}>
          <header
            className="border-b px-5 py-5 md:px-7"
            style={{
              borderColor: `${secondaryColor}33`,
              background: `linear-gradient(120deg, ${primaryColor}22, #ffffff)`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>Organization Onboarding</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl" style={{ color: primaryTextColor }}>
                  Submit Organization Application
                </h1>
                <p className="mt-2 max-w-2xl text-sm md:text-base" style={{ color: secondaryTextColor }}>
                  Fill in the organization profile first, then the lead details. Verify the lead email with a 6-digit OTP before submitting.
                </p>
              </div>
              <div
                className="grid h-12 w-12 place-items-center rounded-xl text-white"
                style={{ backgroundColor: primaryColor }}
              >
                <Building2 size={22} />
              </div>
            </div>
          </header>

          <form onSubmit={onSubmit} className="space-y-6 px-5 py-6 md:px-7 md:py-7">
            <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-4 py-2 text-xs font-semibold" style={{ borderColor: `${secondaryColor}33`, color: secondaryTextColor }}>
              <span>Page {activePage} of 2</span>
              <span>{activePage === 1 ? 'Organization Information' : 'Lead Account and Verification'}</span>
            </div>

            {activePage === 1 ? (
              <fieldset className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
                <legend className="px-2 text-sm font-bold" style={{ color: primaryTextColor }}>Organization Information</legend>
                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold" style={{ borderColor: `${secondaryColor}22`, color: secondaryTextColor }}>
                  Provide the organization name, type, contact, logo, and full address.
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Name *</span>
                    <input
                      value={form.organizationName}
                      onChange={updateField('organizationName')}
                      className={fieldClassName}
                      style={fieldStyle}
                      placeholder="Example: Hope Wig Foundation"
                      required
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Type *</span>
                    <select
                      value={form.organizationType}
                      onChange={updateField('organizationType')}
                      className={fieldClassName}
                      style={fieldStyle}
                      required
                    >
                      <option value="">Select organization type</option>
                      {ORGANIZATION_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Contact Number *</span>
                    <div className="flex overflow-hidden rounded-xl border" style={{ borderColor: `${secondaryColor}55` }}>
                      <span className="grid place-items-center border-r bg-slate-100 px-3 text-sm font-semibold text-slate-600" style={{ borderColor: `${secondaryColor}44` }}>
                        +63
                      </span>
                      <input
                        type="tel"
                        value={formatPhilippineMobile(form.contactNumber)}
                        onChange={onContactNumberChange('contactNumber')}
                        className="w-full bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none"
                        placeholder="912 123 1234"
                        required
                      />
                    </div>
                    <p className="text-[11px]" style={{ color: secondaryTextColor }}>Format: +63 912 123 1234</p>
                  </label>

                  <label className="space-y-2 text-sm md:col-span-2">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Logo (Upload Image)</span>
                    <div className="rounded-xl border border-dashed bg-slate-50 p-4" style={{ borderColor: `${secondaryColor}55` }}>
                      <div className="flex flex-wrap items-center gap-3">
                        <label
                          htmlFor="organizationLogo"
                          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold"
                          style={{ borderColor: `${secondaryColor}55`, color: secondaryTextColor }}
                        >
                          <UploadCloud size={14} /> Choose Logo
                        </label>
                        <input
                          id="organizationLogo"
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/jpg"
                          onChange={onLogoFileChange}
                          className="hidden"
                        />
                        <p className="text-xs" style={{ color: secondaryTextColor }}>
                          PNG, JPG, or WEBP up to 5MB.
                        </p>
                      </div>

                      {logoFile ? (
                        <p className="mt-2 text-xs" style={{ color: secondaryTextColor }}>
                          Selected file: <span className="font-semibold">{logoFile.name}</span>
                        </p>
                      ) : null}

                      {logoPreviewUrl ? (
                        <div className="mt-3 overflow-hidden rounded-lg border" style={{ borderColor: `${secondaryColor}44` }}>
                          <img
                            src={logoPreviewUrl}
                            alt="Organization logo preview"
                            className="h-28 w-full object-contain bg-slate-50"
                          />
                        </div>
                      ) : null}
                    </div>
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Street *</span>
                    <input
                      value={form.street}
                      onChange={updateField('street')}
                      className={fieldClassName}
                      style={fieldStyle}
                      placeholder="Street address"
                      required
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Country *</span>
                    <select
                      value={form.country}
                      onChange={onCountryChange}
                      className={fieldClassName}
                      style={fieldStyle}
                      required
                    >
                      <option value={DEFAULT_COUNTRY}>{DEFAULT_COUNTRY}</option>
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Region *</span>
                    <select
                      value={form.region}
                      onChange={onRegionChange}
                      disabled={!form.country || regionOptions.length === 0}
                      className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                      style={fieldStyle}
                      required
                    >
                      <option value="">Select region</option>
                      {regionOptions.map((region) => (
                        <option key={region.name} value={region.name}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Province *</span>
                    <select
                      value={form.province}
                      onChange={onProvinceChange}
                      disabled={!form.region || provinceOptions.length === 0}
                      className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                      style={fieldStyle}
                      required
                    >
                      <option value="">Select province</option>
                      {provinceOptions.map((province) => (
                        <option key={province.name} value={province.name}>
                          {province.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>City / Municipality *</span>
                    <select
                      value={form.city}
                      onChange={onCityChange}
                      disabled={!form.province || cityOptions.length === 0}
                      className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                      style={fieldStyle}
                      required
                    >
                      <option value="">Select city / municipality</option>
                      {cityOptions.map((city) => (
                        <option key={city.name} value={city.name}>
                          {city.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Barangay</span>
                    {barangayOptions.length > 0 ? (
                      <select
                        value={form.barangay}
                        onChange={updateField('barangay')}
                        disabled={!form.city}
                        className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                        style={fieldStyle}
                      >
                        <option value="">Select barangay</option>
                        {barangayOptions.map((barangay) => (
                          <option key={barangay} value={barangay}>
                            {barangay}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={form.barangay}
                        onChange={updateField('barangay')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Type barangay if not listed"
                      />
                    )}
                  </label>
                </div>
              </fieldset>
            ) : (
              <>
                <fieldset className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
                  <legend className="px-2 text-sm font-bold" style={{ color: primaryTextColor }}>Lead Account Details</legend>
                  <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold" style={{ borderColor: `${secondaryColor}22`, color: secondaryTextColor }}>
                    Enter the lead representative details to be saved in user_details.
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>First Name *</span>
                      <input
                        value={form.firstName}
                        onChange={updateField('firstName')}
                        className={fieldClassName}
                        style={fieldStyle}
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Middle Name (Optional)</span>
                      <input
                        value={form.middleName}
                        onChange={updateField('middleName')}
                        className={fieldClassName}
                        style={fieldStyle}
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Last Name *</span>
                      <input
                        value={form.lastName}
                        onChange={updateField('lastName')}
                        className={fieldClassName}
                        style={fieldStyle}
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Suffix (Optional)</span>
                      <input
                        value={form.suffix}
                        onChange={updateField('suffix')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Jr., Sr., III"
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Birthdate (Optional)</span>
                      <input
                        type="date"
                        value={form.birthdate}
                        onChange={updateField('birthdate')}
                        className={fieldClassName}
                        style={fieldStyle}
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Gender (Optional)</span>
                      <select
                        value={form.gender}
                        onChange={updateField('gender')}
                        className={fieldClassName}
                        style={fieldStyle}
                      >
                        <option value="">Select gender</option>
                        {LEAD_GENDER_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Lead Contact Number *</span>
                      <div className="flex overflow-hidden rounded-xl border" style={{ borderColor: `${secondaryColor}55` }}>
                        <span className="grid place-items-center border-r bg-slate-100 px-3 text-sm font-semibold text-slate-600" style={{ borderColor: `${secondaryColor}44` }}>
                          +63
                        </span>
                        <input
                          type="tel"
                          value={formatPhilippineMobile(form.leadContactNumber)}
                          onChange={onContactNumberChange('leadContactNumber')}
                          className="w-full bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none"
                          placeholder="912 123 1234"
                          required
                        />
                      </div>
                      <p className="text-[11px]" style={{ color: secondaryTextColor }}>Format: +63 912 123 1234</p>
                    </label>

                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Email *</span>
                      <input
                        type="email"
                        value={form.email}
                        onChange={updateField('email')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="name@example.com"
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Street *</span>
                      <input
                        value={form.leadStreet}
                        onChange={updateField('leadStreet')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Street address"
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Country *</span>
                      <select
                        value={form.leadCountry}
                        onChange={onLeadCountryChange}
                        className={fieldClassName}
                        style={fieldStyle}
                        required
                      >
                        <option value={DEFAULT_COUNTRY}>{DEFAULT_COUNTRY}</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Region *</span>
                      <select
                        value={form.leadRegion}
                        onChange={onLeadRegionChange}
                        disabled={!form.leadCountry || leadRegionOptions.length === 0}
                        className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                        style={fieldStyle}
                        required
                      >
                        <option value="">Select region</option>
                        {leadRegionOptions.map((region) => (
                          <option key={region.name} value={region.name}>
                            {region.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Province *</span>
                      <select
                        value={form.leadProvince}
                        onChange={onLeadProvinceChange}
                        disabled={!form.leadRegion || leadProvinceOptions.length === 0}
                        className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                        style={fieldStyle}
                        required
                      >
                        <option value="">Select province</option>
                        {leadProvinceOptions.map((province) => (
                          <option key={province.name} value={province.name}>
                            {province.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>City / Municipality *</span>
                      <select
                        value={form.leadCity}
                        onChange={onLeadCityChange}
                        disabled={!form.leadProvince || leadCityOptions.length === 0}
                        className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                        style={fieldStyle}
                        required
                      >
                        <option value="">Select city / municipality</option>
                        {leadCityOptions.map((city) => (
                          <option key={city.name} value={city.name}>
                            {city.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Barangay</span>
                      {leadBarangayOptions.length > 0 ? (
                        <select
                          value={form.leadBarangay}
                          onChange={updateField('leadBarangay')}
                          disabled={!form.leadCity}
                          className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                          style={fieldStyle}
                        >
                          <option value="">Select barangay</option>
                          {leadBarangayOptions.map((barangay) => (
                            <option key={barangay} value={barangay}>
                              {barangay}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={form.leadBarangay}
                          onChange={updateField('leadBarangay')}
                          className={fieldClassName}
                          style={fieldStyle}
                          placeholder="Type barangay if not listed"
                        />
                      )}
                    </label>
                  </div>
                </fieldset>

                <fieldset className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
                  <legend className="px-2 text-sm font-bold" style={{ color: primaryTextColor }}>Verify Lead Email</legend>
                  <div className="rounded-xl border bg-slate-50 p-4" style={{ borderColor: `${secondaryColor}33` }}>
                    <p className="text-sm font-bold" style={{ color: primaryTextColor }}>Email Verification</p>
                    <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>
                      Send a code to the lead email, then enter the 6-digit OTP below. Submission unlocks only after verification.
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={sendEmailOtpCode}
                        disabled={isSendingOtp || otpCooldownSeconds > 0 || !isValidEmail(normalizedEmail)}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {isSendingOtp ? <Loader2 size={14} className="animate-spin" /> : <MailCheck size={14} />}
                        {isSendingOtp ? 'Sending...' : otpCooldownSeconds > 0 ? `Resend in ${otpCooldownSeconds}s` : 'Send 6-digit Code'}
                      </button>
                      <span className="text-[11px]" style={{ color: secondaryTextColor }}>
                        Codes expire quickly for security.
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                      <input
                        value={otpCode}
                        onChange={(event) => setOtpCode(String(event.target.value || '').replace(/\D/g, '').slice(0, 6))}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="Enter 6-digit code"
                        className={fieldClassName}
                        style={fieldStyle}
                      />
                      <button
                        type="button"
                        onClick={verifyEmailOtpCode}
                        disabled={isVerifyingOtp || otpCode.length !== 6 || !isValidEmail(normalizedEmail)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ borderColor: `${secondaryColor}55`, color: secondaryTextColor }}
                      >
                        {isVerifyingOtp ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        {isVerifyingOtp ? 'Verifying...' : 'Verify Code'}
                      </button>
                    </div>

                    {otpNotice.message ? (
                      <p
                        className={`mt-3 rounded-lg px-3 py-2 text-xs ${
                          otpNotice.type === 'error'
                            ? 'border border-rose-200 bg-rose-50 text-rose-800'
                            : otpNotice.type === 'success'
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {otpNotice.message}
                      </p>
                    ) : null}

                    {isEmailOtpVerified ? (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 size={14} /> Email verified. You can now submit.
                      </p>
                    ) : (
                      <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        <ShieldCheck size={14} /> Verify email first to enable submission.
                      </p>
                    )}
                  </div>
                </fieldset>
              </>
            )}

            {errorMessage ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={16} /> Success</p>
                <p className="mt-1">{successMessage}</p>
              </div>
            ) : null}

            {activePage === 1 ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={goToLeadPage}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Next: Lead Account
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs" style={{ color: secondaryTextColor }}>
                  By submitting, you confirm your details are accurate. Your organization profile will remain pending until Super Admin review.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToOrganizationPage}
                    className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
                    style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !canSubmit}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Submitting...
                      </>
                    ) : (
                      canSubmit ? 'Submit Application' : 'Verify Email To Submit'
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
    </Wrapper>
  );
}
