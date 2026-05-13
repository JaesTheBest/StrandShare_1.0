import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const HOSPITALS_TABLE = 'Hospitals';
const HOSPITAL_STAFF_TABLE = 'Hospital_Representative';
const USERS_TABLE = 'users';
const HOSPITAL_LOGOS_BUCKET = 'hospital_logos';
const PSGC_BASE_URL = 'https://psgc.gitlab.io/api';

const PAGE_TABS = [
  { id: 'manage', label: 'Manage H-Representatives' },
  { id: 'assign', label: 'Assign H-Representative' },
];

const EMPTY_FORM = {
  hospitalName: '',
  hospitalLogoPath: '',
  country: 'Philippines',
  region: '',
  city: '',
  barangay: '',
  street: '',
  contactNumber: '',
};

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isBlobUrl(value) {
  return String(value || '').startsWith('blob:');
}

function toSafeFileName(fileName) {
  return String(fileName || 'logo.jpg')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function toSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || 'Upload failed.');
  if (message.toLowerCase().includes('row-level security')) {
    return 'Upload blocked by Storage RLS policy. Apply the hospital_logos bucket policies and make sure your account has Super Admin role.';
  }
  return message;
}

function normalizeRoleSlug(roleValue) {
  return String(roleValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isHStaffRole(roleValue) {
  const roleSlug = normalizeRoleSlug(roleValue);
  return roleSlug === 'hospital' || roleSlug === 'hstaff' || roleSlug === 'hrepresentative';
}

function mapHospitalStaffError(rawMessage) {
  const message = String(rawMessage || 'Unable to update hospital staff assignment.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('duplicate key value')) {
    return 'This H-Representative is already assigned to a hospital.';
  }

  if (lowerMessage.includes('row-level security')) {
    return 'Action blocked by database policy. Make sure your account has Super Admin permissions.';
  }

  return message;
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function matchesRegion(regionItem, regionValue) {
  const target = normalizeText(regionValue);
  if (!target) return false;

  const names = [regionItem?.name, regionItem?.regionName]
    .filter(Boolean)
    .map((item) => normalizeText(item));

  return names.includes(target);
}

function cardClass() {
  return 'rounded-xl border border-gray-200 bg-white p-4 md:p-5';
}

function getHStaffDisplayName(user) {
  if (!user) return 'Unknown user';

  const details = Array.isArray(user.user_details)
    ? user.user_details[0]
    : user.user_details;

  const fullName = [details?.first_name, details?.middle_name, details?.last_name, details?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fullName && user.email) {
    return `${fullName} (${user.email})`;
  }

  return fullName || user.email || `User #${user.user_id || 'N/A'}`;
}

export default function ManageHospitalAccountsPage() {
  const { theme } = useTheme();
  const tableHeaderTextColor = theme?.primaryTextColor || '#111827';
  const primaryTextColor = theme?.primaryTextColor || '#111827';
  const secondaryTextColor = theme?.secondaryTextColor || '#6b7280';
  const headingFont = theme?.secondaryFontFamily || theme?.fontFamily || 'Poppins';
  const bodyFont = theme?.fontFamily || 'Poppins';

  const [activeTab, setActiveTab] = useState('manage');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [detailsHospitalId, setDetailsHospitalId] = useState(null);
  const [hospitals, setHospitals] = useState([]);
  const [hospitalStaffLinks, setHospitalStaffLinks] = useState([]);
  const [hStaffUsers, setHStaffUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [form, setForm] = useState(EMPTY_FORM);
  const [editingHospitalId, setEditingHospitalId] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoInputKey, setLogoInputKey] = useState(0);

  const [regions, setRegions] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);

  const [regionCode, setRegionCode] = useState('');
  const [provinceCode, setProvinceCode] = useState('');
  const [cityCode, setCityCode] = useState('');

  const [isLoadingHospitals, setIsLoadingHospitals] = useState(true);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isLoadingRegions, setIsLoadingRegions] = useState(false);
  const [isLoadingRegionData, setIsLoadingRegionData] = useState(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingAssignment, setIsSavingAssignment] = useState(false);
  const [isReassigning, setIsReassigning] = useState(false);
  const [deletingHospitalId, setDeletingHospitalId] = useState(null);
  const [removingLinkId, setRemovingLinkId] = useState(null);

  const [assignmentHospitalId, setAssignmentHospitalId] = useState('');
  const [assignmentUserId, setAssignmentUserId] = useState('');
  const [panelAssignUserId, setPanelAssignUserId] = useState('');
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignHospitalId, setReassignHospitalId] = useState('');
  const [reassigningLink, setReassigningLink] = useState(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [toastKind, setToastKind] = useState('success');
  const toastTimerRef = useRef(null);

  const showToast = useCallback((message, kind = 'success') => {
    const text = String(message || '').trim();
    if (!text) {
      return;
    }

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToastKind(kind === 'error' ? 'error' : 'success');
    setToastMessage(text);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage('');
    }, 2200);
  }, []);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }
    showToast(errorMessage, 'error');
    setErrorMessage('');
  }, [errorMessage, showToast]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }
    showToast(successMessage, 'success');
    setSuccessMessage('');
  }, [successMessage, showToast]);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (isBlobUrl(logoPreviewUrl)) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const filteredHospitals = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) return hospitals;

    return hospitals.filter((hospital) => {
      const values = [
        hospital.Hospital_Name,
        hospital.Contact_Number,
        hospital.Region,
        hospital.City,
        hospital.Barangay,
        hospital.Street,
      ]
        .map((item) => normalizeText(item))
        .filter(Boolean);

      return values.some((value) => value.includes(query));
    });
  }, [hospitals, searchTerm]);

  const hospitalsById = useMemo(() => {
    const map = new Map();
    hospitals.forEach((hospital) => {
      map.set(Number(hospital.Hospital_ID), hospital);
    });
    return map;
  }, [hospitals]);

  const hStaffUsersById = useMemo(() => {
    const map = new Map();
    hStaffUsers.forEach((user) => {
      map.set(Number(user.user_id), user);
    });
    return map;
  }, [hStaffUsers]);

  const assignedHospitalByUserId = useMemo(() => {
    const map = new Map();
    hospitalStaffLinks.forEach((link) => {
      map.set(Number(link.User_ID), Number(link.Hospital_ID));
    });
    return map;
  }, [hospitalStaffLinks]);

  const unassignedHStaffUsers = useMemo(
    () => hStaffUsers.filter((user) => !assignedHospitalByUserId.has(Number(user.user_id))),
    [hStaffUsers, assignedHospitalByUserId],
  );

  const assignedHStaffCount = useMemo(
    () => hStaffUsers.filter((user) => assignedHospitalByUserId.has(Number(user.user_id))).length,
    [hStaffUsers, assignedHospitalByUserId],
  );

  const detailsHospital = useMemo(
    () => (detailsHospitalId ? hospitalsById.get(Number(detailsHospitalId)) || null : null),
    [detailsHospitalId, hospitalsById],
  );

  const detailsHospitalStaffLinks = useMemo(
    () => hospitalStaffLinks.filter((link) => Number(link.Hospital_ID) === Number(detailsHospitalId)),
    [hospitalStaffLinks, detailsHospitalId],
  );

  const availableReassignHospitals = useMemo(() => {
    if (!reassigningLink) {
      return hospitals;
    }

    const currentHospitalId = Number(reassigningLink.Hospital_ID);
    return hospitals.filter((hospital) => Number(hospital.Hospital_ID) !== currentHospitalId);
  }, [hospitals, reassigningLink]);

  const visibleCities = useMemo(() => {
    if (!provinceCode) {
      return cities;
    }
    return cities.filter((city) => city.provinceCode === provinceCode);
  }, [cities, provinceCode]);

  const provinceFilterHint = useMemo(() => {
    if (!regionCode) return 'Select a region first.';
    if (provinces.length === 0) return 'No province-level division for this region.';
    return 'Optional: pick a province to narrow city/municipality options.';
  }, [regionCode, provinces.length]);

  const fetchLocationData = async (endpoint) => {
    const response = await fetch(`${PSGC_BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`Unable to load location data (${response.status})`);
    }
    return response.json();
  };

  const resolveHospitalLogoUrl = (logoValue) => {
    const source = String(logoValue || '').trim();
    if (!source) {
      return '';
    }

    if (isAbsoluteUrl(source)) {
      return source;
    }

    if (!supabase) {
      return '';
    }

    const { data } = supabase.storage.from(HOSPITAL_LOGOS_BUCKET).getPublicUrl(source);
    return data?.publicUrl || '';
  };

  const currentLogoPreview = useMemo(() => {
    if (logoPreviewUrl) {
      return logoPreviewUrl;
    }
    return resolveHospitalLogoUrl(form.hospitalLogoPath);
  }, [logoPreviewUrl, form.hospitalLogoPath]);

  const setNextLogoPreview = (nextPreview) => {
    setLogoPreviewUrl((previousPreview) => {
      if (isBlobUrl(previousPreview)) {
        URL.revokeObjectURL(previousPreview);
      }
      return nextPreview || '';
    });
  };

  const resetLogoInput = () => {
    setLogoFile(null);
    setLogoInputKey((value) => value + 1);
  };

  const resetForm = (keepSuccess = false) => {
    setForm(EMPTY_FORM);
    setEditingHospitalId(null);
    resetLogoInput();
    setNextLogoPreview('');
    setRegionCode('');
    setProvinceCode('');
    setCityCode('');
    setProvinces([]);
    setCities([]);
    setBarangays([]);
    setErrorMessage('');
    if (!keepSuccess) {
      setSuccessMessage('');
    }
  };

  const fetchHospitals = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      setIsLoadingHospitals(false);
      return;
    }

    try {
      setIsLoadingHospitals(true);
      const { data, error } = await supabase
        .from(HOSPITALS_TABLE)
        .select('*')
        .order('Created_At', { ascending: false });

      if (error) throw error;

      setHospitals(data || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load hospitals.');
    } finally {
      setIsLoadingHospitals(false);
    }
  }, []);

  const fetchHStaffUsers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setHStaffUsers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .select(`
          user_id,
          email,
          role,
          is_active,
          user_details:user_details (
            first_name,
            middle_name,
            last_name,
            suffix
          )
        `)
        .order('email', { ascending: true });

      if (error) throw error;

      const hStaffList = (data || [])
        .filter((user) => isHStaffRole(user?.role))
        .sort((a, b) => getHStaffDisplayName(a).localeCompare(getHStaffDisplayName(b), 'en', { sensitivity: 'base' }));

      setHStaffUsers(hStaffList);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load available H-Representative users.');
    }
  }, []);

  const fetchHospitalStaffLinks = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setHospitalStaffLinks([]);
      return;
    }

    try {
      setIsLoadingAssignments(true);
      const { data, error } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .select('*')
        .order('Assigned_Date', { ascending: false });

      if (error) throw error;
      setHospitalStaffLinks(data || []);
    } catch (error) {
      setErrorMessage(error.message || 'Unable to load hospital staff assignments.');
    } finally {
      setIsLoadingAssignments(false);
    }
  }, []);

  const loadRegions = useCallback(async () => {
    try {
      setIsLoadingRegions(true);
      const data = await fetchLocationData('/regions/');
      const ordered = [...(data || [])].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
      );
      setRegions(ordered);
    } catch (error) {
      setErrorMessage('Unable to load complete Philippines regions right now. Please check your network and try again.');
    } finally {
      setIsLoadingRegions(false);
    }
  }, []);

  useEffect(() => {
    fetchHospitals();
    fetchHStaffUsers();
    fetchHospitalStaffLinks();
    loadRegions();
  }, [fetchHospitals, fetchHStaffUsers, fetchHospitalStaffLinks, loadRegions]);

  const openHospitalDetails = (hospital) => {
    setDetailsHospitalId(Number(hospital.Hospital_ID));
    setPanelAssignUserId('');
  };

  const closeHospitalDetails = () => {
    setDetailsHospitalId(null);
    setPanelAssignUserId('');
  };

  const refreshAssignmentData = async () => {
    await Promise.all([fetchHospitals(), fetchHStaffUsers(), fetchHospitalStaffLinks()]);
  };

  const assignHStaffToHospital = async (hospitalIdValue, userIdValue) => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      return;
    }

    const hospitalId = Number(hospitalIdValue);
    const userId = Number(userIdValue);

    if (!hospitalId || !userId) {
      setErrorMessage('Please select both a hospital and an H-Representative user.');
      return;
    }

    const existingUserLink = hospitalStaffLinks.find((link) => Number(link.User_ID) === userId);
    if (existingUserLink) {
      const linkedHospital = hospitalsById.get(Number(existingUserLink.Hospital_ID));
      if (Number(existingUserLink.Hospital_ID) === hospitalId) {
        setErrorMessage('This H-Representative is already assigned to the selected hospital.');
      } else {
        setErrorMessage(`This H-Representative is already assigned to ${linkedHospital?.Hospital_Name || 'another hospital'}.`);
      }
      return;
    }

    try {
      setIsSavingAssignment(true);
      const { error } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .insert({
          Hospital_ID: hospitalId,
          User_ID: userId,
        });

      if (error) throw error;

      setSuccessMessage('H-Representative assigned to hospital successfully.');
      setAssignmentUserId('');
      setPanelAssignUserId('');
      await fetchHospitalStaffLinks();
    } catch (error) {
      setErrorMessage(mapHospitalStaffError(error.message));
    } finally {
      setIsSavingAssignment(false);
    }
  };

  const removeHospitalStaffLink = async (link) => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      return;
    }

    const linkId = Number(link?.Link_ID);
    if (!linkId) {
      setErrorMessage('Invalid assignment link selected.');
      return;
    }

    try {
      setRemovingLinkId(linkId);
      const { error } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .delete()
        .eq('Link_ID', linkId);

      if (error) throw error;

      setSuccessMessage('H-Representative assignment removed successfully.');
      await fetchHospitalStaffLinks();
    } catch (error) {
      setErrorMessage(mapHospitalStaffError(error.message));
    } finally {
      setRemovingLinkId(null);
    }
  };

  const openReassignModal = (link) => {
    if (!link?.Link_ID) {
      setErrorMessage('Invalid assignment link selected.');
      return;
    }

    setReassigningLink(link);
    setReassignHospitalId('');
    setIsReassignModalOpen(true);
  };

  const closeReassignModal = () => {
    if (isReassigning) {
      return;
    }

    setIsReassignModalOpen(false);
    setReassignHospitalId('');
    setReassigningLink(null);
  };

  const handleReassignStaff = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      return;
    }

    const linkId = Number(reassigningLink?.Link_ID);
    const currentHospitalId = Number(reassigningLink?.Hospital_ID);
    const nextHospitalId = Number(reassignHospitalId);

    if (!linkId) {
      setErrorMessage('Invalid assignment link selected.');
      return;
    }

    if (!nextHospitalId) {
      setErrorMessage('Please choose a hospital for reassignment.');
      return;
    }

    if (currentHospitalId === nextHospitalId) {
      setErrorMessage('Please choose a different hospital for reassignment.');
      return;
    }

    try {
      setIsReassigning(true);
      const { error } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .update({
          Hospital_ID: nextHospitalId,
          Assigned_Date: new Date().toISOString(),
        })
        .eq('Link_ID', linkId);

      if (error) throw error;

      setSuccessMessage('H-Representative reassigned successfully.');
      setIsReassignModalOpen(false);
      setReassignHospitalId('');
      setReassigningLink(null);
      await fetchHospitalStaffLinks();
    } catch (error) {
      setErrorMessage(mapHospitalStaffError(error.message));
    } finally {
      setIsReassigning(false);
    }
  };

  const handleRegionChange = async (nextRegionCode, options = {}) => {
    const preserveMessages = options.preserveMessages === true;
    const keepProvinceCode = options.keepProvinceCode || '';
    const keepCityCode = options.keepCityCode || '';
    const sourceRegions = Array.isArray(options.regionList) ? options.regionList : regions;

    const selectedRegion = sourceRegions.find((region) => region.code === nextRegionCode) || null;

    setRegionCode(nextRegionCode);
    setProvinceCode(keepProvinceCode || '');
    setCityCode(keepCityCode || '');
    setBarangays([]);

    setForm((prev) => ({
      ...prev,
      region: selectedRegion?.name || '',
      city: options.keepCityName || '',
      barangay: options.keepBarangayName || '',
    }));

    if (!nextRegionCode) {
      setProvinces([]);
      setCities([]);
      if (!preserveMessages) {
        setErrorMessage('');
        setSuccessMessage('');
      }
      return;
    }

    try {
      setIsLoadingRegionData(true);
      const [nextProvinces, nextCities] = await Promise.all([
        fetchLocationData(`/regions/${nextRegionCode}/provinces/`),
        fetchLocationData(`/regions/${nextRegionCode}/cities-municipalities/`),
      ]);

      const orderedProvinces = [...(nextProvinces || [])].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
      );
      const orderedCities = [...(nextCities || [])].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
      );

      setProvinces(orderedProvinces);
      setCities(orderedCities);

      if (!preserveMessages) {
        setErrorMessage('');
        setSuccessMessage('');
      }
    } catch (error) {
      setProvinces([]);
      setCities([]);
      setErrorMessage('Unable to load provinces and cities for the selected region.');
    } finally {
      setIsLoadingRegionData(false);
    }
  };

  const handleProvinceChange = (nextProvinceCode) => {
    setProvinceCode(nextProvinceCode);

    if (!nextProvinceCode) {
      return;
    }

    const activeCity = cities.find((city) => city.code === cityCode);
    if (activeCity && activeCity.provinceCode !== nextProvinceCode) {
      setCityCode('');
      setBarangays([]);
      setForm((prev) => ({
        ...prev,
        city: '',
        barangay: '',
      }));
    }
  };

  const handleCityChange = async (nextCityCode, options = {}) => {
    const preserveMessages = options.preserveMessages === true;
    const keepBarangayCode = options.keepBarangayCode || '';
    const keepBarangayName = options.keepBarangayName || '';
    const sourceCities = Array.isArray(options.cityList) ? options.cityList : cities;

    const selectedCity = options.selectedCity
      || sourceCities.find((city) => city.code === nextCityCode)
      || null;

    setCityCode(nextCityCode);
    setBarangays([]);

    if (selectedCity?.provinceCode) {
      setProvinceCode(selectedCity.provinceCode);
    }

    setForm((prev) => ({
      ...prev,
      city: selectedCity?.name || '',
      barangay: keepBarangayName,
    }));

    if (!nextCityCode) {
      if (!preserveMessages) {
        setErrorMessage('');
        setSuccessMessage('');
      }
      return;
    }

    try {
      setIsLoadingBarangays(true);
      const nextBarangays = await fetchLocationData(`/cities-municipalities/${nextCityCode}/barangays/`);
      const orderedBarangays = [...(nextBarangays || [])].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
      );

      setBarangays(orderedBarangays);

      if (keepBarangayCode) {
        const selectedBarangay = orderedBarangays.find((barangay) => barangay.code === keepBarangayCode);
        if (selectedBarangay) {
          setForm((prev) => ({
            ...prev,
            barangay: selectedBarangay.name,
          }));
        }
      }

      if (!preserveMessages) {
        setErrorMessage('');
        setSuccessMessage('');
      }
    } catch (error) {
      setErrorMessage('Unable to load barangays for the selected city/municipality.');
    } finally {
      setIsLoadingBarangays(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleLogoFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    if (selectedFiles.length > 1) {
      setErrorMessage('Only one logo image is allowed. Please select a single file.');
      resetLogoInput();
      return;
    }

    const file = selectedFiles[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('H-Representative logo must be an image file.');
      resetLogoInput();
      return;
    }

    const preview = URL.createObjectURL(file);
    setLogoFile(file);
    setNextLogoPreview(preview);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleRemoveLogo = () => {
    resetLogoInput();
    setNextLogoPreview('');
    setForm((prev) => ({
      ...prev,
      hospitalLogoPath: '',
    }));
    setErrorMessage('');
    setSuccessMessage('');
  };

  const uploadHospitalLogo = async (file) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const authUserId = session?.user?.id;
    if (!authUserId) {
      throw new Error('You must be logged in to upload hospital logos.');
    }

    const safeFileName = toSafeFileName(file.name);
    const hospitalSlug = toSlug(form.hospitalName) || 'hospital';
    const filePath = `${authUserId}/hospital-logo/${hospitalSlug}/${Date.now()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(HOSPITAL_LOGOS_BUCKET)
      .upload(filePath, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (uploadError) {
      throw uploadError;
    }

    const { data: publicUrlData } = supabase.storage
      .from(HOSPITAL_LOGOS_BUCKET)
      .getPublicUrl(filePath);

    return {
      filePath,
      publicUrl: publicUrlData?.publicUrl || '',
    };
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      return;
    }

    const hasProvinces = provinces.length > 0;
    const isEditing = Boolean(editingHospitalId);
    const hasRegionValue = Boolean(String(form.region || '').trim());
    const hasCityValue = Boolean(String(form.city || '').trim());
    const hasBarangayValue = Boolean(String(form.barangay || '').trim());

    if (!form.hospitalName.trim()) {
      setErrorMessage('H-Representative name is required.');
      return;
    }

    if (!hasRegionValue || (!regionCode && !isEditing)) {
      setErrorMessage('Please choose a valid region.');
      return;
    }

    if (hasProvinces && !provinceCode && !isEditing) {
      setErrorMessage('Please choose a province for better address precision.');
      return;
    }

    if (!hasCityValue || (!cityCode && !isEditing)) {
      setErrorMessage('Please choose a city/municipality.');
      return;
    }

    if (!hasBarangayValue) {
      setErrorMessage('Please choose a barangay.');
      return;
    }

    if (!form.street.trim()) {
      setErrorMessage('Street address is required.');
      return;
    }

    const previousLogoPath = String(form.hospitalLogoPath || '').trim();
    let nextLogoPath = previousLogoPath || null;
    let uploadedLogoPath = '';

    try {
      setIsSaving(true);

      if (logoFile) {
        setIsUploadingLogo(true);
        const { filePath, publicUrl } = await uploadHospitalLogo(logoFile);
        uploadedLogoPath = filePath;
        nextLogoPath = filePath;

        setForm((prev) => ({
          ...prev,
          hospitalLogoPath: filePath,
        }));

        setNextLogoPreview(publicUrl);
        resetLogoInput();
      }

      const payload = {
        Hospital_Name: form.hospitalName.trim(),
        Hospital_Logo: nextLogoPath,
        Country: form.country.trim() || 'Philippines',
        Region: form.region,
        City: form.city,
        Barangay: form.barangay,
        Street: form.street.trim(),
        Contact_Number: form.contactNumber.trim() || null,
      };

      if (editingHospitalId) {
        const { error } = await supabase
          .from(HOSPITALS_TABLE)
          .update({
            ...payload,
            Updated_At: new Date().toISOString(),
          })
          .eq('Hospital_ID', editingHospitalId);

        if (error) throw error;

        if (
          previousLogoPath
          && previousLogoPath !== nextLogoPath
          && !isAbsoluteUrl(previousLogoPath)
        ) {
            await supabase.storage.from(HOSPITAL_LOGOS_BUCKET).remove([previousLogoPath]);
        }

        setSuccessMessage('H-Representative updated successfully.');
      } else {
        const { error } = await supabase
          .from(HOSPITALS_TABLE)
          .insert(payload);

        if (error) throw error;

        setSuccessMessage('H-Representative added successfully.');
      }

      setErrorMessage('');
      await fetchHospitals();
      resetForm(true);
      setIsModalOpen(false);
    } catch (error) {
      if (uploadedLogoPath && uploadedLogoPath !== previousLogoPath && !isAbsoluteUrl(uploadedLogoPath)) {
        try {
          await supabase.storage.from(HOSPITAL_LOGOS_BUCKET).remove([uploadedLogoPath]);
        } catch {
          // Best effort rollback of orphan upload.
        }
      }

      setErrorMessage(mapStorageUploadError(error.message) || 'Unable to save hospital record.');
    } finally {
      setIsUploadingLogo(false);
      setIsSaving(false);
    }
  };

  const handleEditHospital = async (hospital) => {
    setIsModalOpen(true);
    setSuccessMessage('');
    setErrorMessage('');

    const nextForm = {
      hospitalName: hospital.Hospital_Name || '',
      hospitalLogoPath: hospital.Hospital_Logo || '',
      country: hospital.Country || 'Philippines',
      region: hospital.Region || '',
      city: hospital.City || '',
      barangay: hospital.Barangay || '',
      street: hospital.Street || '',
      contactNumber: hospital.Contact_Number || '',
    };

    setForm(nextForm);
    setEditingHospitalId(hospital.Hospital_ID);
    resetLogoInput();
    setNextLogoPreview(resolveHospitalLogoUrl(hospital.Hospital_Logo));

    try {
      if (regions.length === 0) {
        await loadRegions();
      }

      const availableRegions = regions.length > 0 ? regions : await fetchLocationData('/regions/');
      if (regions.length === 0) {
        setRegions(availableRegions);
      }

      const matchedRegion = availableRegions.find((region) => matchesRegion(region, hospital.Region));

      if (!matchedRegion) {
        setRegionCode('');
        setProvinceCode('');
        setCityCode('');
        setProvinces([]);
        setCities([]);
        setBarangays([]);
        return;
      }

      await handleRegionChange(matchedRegion.code, {
        preserveMessages: true,
        keepCityName: hospital.City || '',
        keepBarangayName: hospital.Barangay || '',
        regionList: availableRegions,
      });

      const regionCities = await fetchLocationData(`/regions/${matchedRegion.code}/cities-municipalities/`);
      const orderedCities = [...(regionCities || [])].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }),
      );
      setCities(orderedCities);

      const normalizedHospitalCity = normalizeText(hospital.City);
      const matchedCity = orderedCities.find((city) => {
        const possibleNames = [city?.name, city?.oldName, city?.description]
          .filter(Boolean)
          .map((value) => normalizeText(value));

        return possibleNames.some(
          (name) => name === normalizedHospitalCity || name.includes(normalizedHospitalCity) || normalizedHospitalCity.includes(name),
        );
      });

      if (!matchedCity) {
        setProvinceCode('');
        setCityCode('');
        setBarangays([]);
        return;
      }

      if (matchedCity.provinceCode) {
        setProvinceCode(matchedCity.provinceCode);
      }

      await handleCityChange(matchedCity.code, {
        preserveMessages: true,
        keepBarangayName: hospital.Barangay || '',
        cityList: orderedCities,
        selectedCity: matchedCity,
      });
    } catch {
      setErrorMessage('Unable to fully preload address options for this hospital. You can still update details manually.');
    }
  };

  const handleDeleteHospital = async (hospital) => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      return;
    }

    const confirmed = window.confirm(`Delete hospital "${hospital.Hospital_Name}"? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setDeletingHospitalId(hospital.Hospital_ID);
      const logoPath = String(hospital.Hospital_Logo || '').trim();

      const { error: unlinkError } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .delete()
        .eq('Hospital_ID', hospital.Hospital_ID);

      if (unlinkError) throw unlinkError;

      const { error } = await supabase
        .from(HOSPITALS_TABLE)
        .delete()
        .eq('Hospital_ID', hospital.Hospital_ID);

      if (error) throw error;

      if (logoPath && !isAbsoluteUrl(logoPath)) {
        try {
          await supabase.storage.from(HOSPITAL_LOGOS_BUCKET).remove([logoPath]);
        } catch {
          // Best effort cleanup; hospital row has already been deleted.
        }
      }

      setSuccessMessage('H-Representative deleted successfully.');
      setErrorMessage('');
      await fetchHospitals();
      await fetchHospitalStaffLinks();

      if (editingHospitalId === hospital.Hospital_ID) {
        resetForm(true);
      }
    } catch (error) {
      setErrorMessage(error.message || 'Unable to delete hospital.');
    } finally {
      setDeletingHospitalId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manage H-Representative Accounts</h1>
          <p className="text-sm text-gray-600 mt-1">
            Add and maintain hospital records used by H-Representative, patients, and wig request routing.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            resetForm();
            setIsModalOpen(true);
          }}
          className="text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Plus size={18} />
          Add H-Representative
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
            style={
              activeTab === tab.id
                ? {
                    borderColor: `${theme.primaryColor}55`,
                    backgroundColor: `${theme.primaryColor}18`,
                    color: theme.primaryColor,
                  }
                : {
                    borderColor: '#d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                  }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'manage' && (
        <section className={cardClass()}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div className="relative w-full md:max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by name, location, or contact number"
                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm bg-white focus:ring-2 outline-none"
                style={{ '--tw-ring-color': theme.primaryColor }}
              />
            </div>

            <button
              type="button"
              onClick={fetchHospitals}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold"
              style={{
                borderColor: `${theme.primaryColor}33`,
                backgroundColor: `${theme.primaryColor}12`,
                color: theme.primaryColor,
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {isLoadingHospitals ? (
            <div className="py-10 text-gray-700 flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18} /> Loading hospitals...
            </div>
          ) : filteredHospitals.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <Building2 size={40} className="mx-auto mb-2 text-gray-300" />
              <p>No hospitals found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-center">
                <thead className="text-sm" style={{ backgroundColor: `${theme.primaryColor}20`, color: tableHeaderTextColor }}>
                  <tr>
                    <th className="px-4 py-3 text-center font-semibold">H-Representative</th>
                    <th className="px-4 py-3 text-center font-semibold">Contact</th>
                    <th className="px-4 py-3 text-center font-semibold">Address</th>
                    <th className="px-4 py-3 text-center font-semibold">Updated</th>
                    <th className="px-4 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHospitals.map((hospital) => (
                    <tr key={hospital.Hospital_ID} className="border-t border-gray-200 align-middle">
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-2 text-center">
                          {resolveHospitalLogoUrl(hospital.Hospital_Logo) ? (
                            <img
                              src={resolveHospitalLogoUrl(hospital.Hospital_Logo)}
                              alt="H-Representative logo"
                              className="h-10 w-10 rounded-md border border-gray-200 object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400">
                              <Building2 size={16} />
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-gray-900">{hospital.Hospital_Name || 'N/A'}</div>
                            <div className="text-xs text-gray-500 mt-1">ID: {hospital.Hospital_ID}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-center">{hospital.Contact_Number || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-700 text-center">
                        {[hospital.Street, hospital.Barangay, hospital.City, hospital.Region, hospital.Country]
                          .filter(Boolean)
                          .join(', ') || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 text-center">{formatDateTime(hospital.Updated_At || hospital.Created_At)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openHospitalDetails(hospital)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            title="View hospital details"
                          >
                            <Info size={13} /> Info
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEditHospital(hospital)}
                            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-semibold"
                            style={{
                              borderColor: `${theme.primaryColor}33`,
                              backgroundColor: `${theme.primaryColor}12`,
                              color: theme.primaryColor,
                            }}
                          >
                            <Pencil size={13} /> Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteHospital(hospital)}
                            disabled={deletingHospitalId === hospital.Hospital_ID}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                          >
                            {deletingHospitalId === hospital.Hospital_ID ? (
                              <Loader2 className="animate-spin" size={13} />
                            ) : (
                              <Trash2 size={13} />
                            )}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'assign' && (
        <section className={cardClass()}>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Assign H-Representative To H-Representative</h3>
              <p className="text-xs text-gray-500 mt-1">
                Source: public.users with linked public.user_details. Role accepted: H-Representative or hospital.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Available: {unassignedHStaffUsers.length} | Assigned: {assignedHStaffCount} | Total H-Representative: {hStaffUsers.length}
              </p>
            </div>

            <button
              type="button"
              onClick={refreshAssignmentData}
              disabled={isLoadingHospitals || isLoadingAssignments || isSavingAssignment}
              className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
              style={{
                borderColor: `${theme.primaryColor}33`,
                backgroundColor: `${theme.primaryColor}12`,
                color: theme.primaryColor,
              }}
            >
              <RefreshCw size={14} /> Refresh H-Representative Data
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">H-Representative</label>
              <select
                value={assignmentHospitalId}
                onChange={(event) => setAssignmentHospitalId(event.target.value)}
                disabled={hospitals.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                style={{ '--tw-ring-color': theme.primaryColor }}
              >
                <option value="">{hospitals.length === 0 ? 'No hospitals available' : 'Select hospital'}</option>
                {hospitals.map((hospital) => (
                  <option key={hospital.Hospital_ID} value={hospital.Hospital_ID}>
                    {hospital.Hospital_Name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">H-Representative</label>
              <select
                value={assignmentUserId}
                onChange={(event) => setAssignmentUserId(event.target.value)}
                disabled={unassignedHStaffUsers.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                style={{ '--tw-ring-color': theme.primaryColor }}
              >
                <option value="">
                  {hStaffUsers.length === 0
                    ? 'No H-Representative users found in users/user_details'
                    : unassignedHStaffUsers.length === 0
                      ? 'All H-Representative users are already assigned'
                      : 'Select H-Representative'}
                </option>
                {unassignedHStaffUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {getHStaffDisplayName(user)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => assignHStaffToHospital(assignmentHospitalId, assignmentUserId)}
                disabled={
                  isSavingAssignment
                  || !assignmentHospitalId
                  || !assignmentUserId
                  || hospitals.length === 0
                  || unassignedHStaffUsers.length === 0
                }
                className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {isSavingAssignment ? 'Assigning...' : 'Assign H-Representative'}
              </button>
            </div>
          </div>

          {hStaffUsers.length === 0 && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              No H-Representative users were found. Check public.users.role values and ensure matching records exist in public.user_details.
            </div>
          )}

          {isLoadingAssignments ? (
            <div className="py-10 text-gray-700 flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18} /> Loading assignments...
            </div>
          ) : hospitalStaffLinks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No H-Representative assignments yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-sm" style={{ backgroundColor: `${theme.primaryColor}20`, color: tableHeaderTextColor }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">H-Representative</th>
                    <th className="px-4 py-3 text-left font-semibold">H-Representative</th>
                    <th className="px-4 py-3 text-left font-semibold">Assigned Date</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitalStaffLinks.map((link) => {
                    const linkedHospital = hospitalsById.get(Number(link.Hospital_ID));
                    const linkedUser = hStaffUsersById.get(Number(link.User_ID));

                    return (
                      <tr key={link.Link_ID} className="border-t border-gray-200">
                        <td className="px-4 py-3 text-gray-800">{linkedHospital?.Hospital_Name || `H-Representative #${link.Hospital_ID}`}</td>
                        <td className="px-4 py-3 text-gray-700">{getHStaffDisplayName(linkedUser)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(link.Assigned_Date)}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openReassignModal(link)}
                              disabled={isReassigning || hospitals.length < 2}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                            >
                              <ArrowRightLeft size={12} />
                              Reassign
                            </button>

                            <button
                              type="button"
                              onClick={() => removeHospitalStaffLink(link)}
                              disabled={removingLinkId === link.Link_ID}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              {removingLinkId === link.Link_ID ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                              Unassign
                            </button>
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
      )}

      {isReassignModalOpen && reassigningLink && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110] bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Reassign H-Representative</h3>
                <p className="mt-1 text-xs text-gray-500">Move this staff member to a different hospital.</p>
              </div>
              <button
                type="button"
                onClick={closeReassignModal}
                disabled={isReassigning}
                className="text-gray-400 hover:text-red-500 disabled:opacity-60"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <p className="font-medium text-gray-900">{getHStaffDisplayName(hStaffUsersById.get(Number(reassigningLink.User_ID)))}</p>
                <p className="mt-1 text-xs text-gray-500">
                  Current hospital: {hospitalsById.get(Number(reassigningLink.Hospital_ID))?.Hospital_Name || `H-Representative #${reassigningLink.Hospital_ID}`}
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">New hospital</label>
                <select
                  value={reassignHospitalId}
                  onChange={(event) => setReassignHospitalId(event.target.value)}
                  disabled={availableReassignHospitals.length === 0 || isReassigning}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 focus:ring-2 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  style={{ '--tw-ring-color': theme.primaryColor }}
                >
                  <option value="">
                    {availableReassignHospitals.length === 0 ? 'No other hospital available' : 'Select target hospital'}
                  </option>
                  {availableReassignHospitals.map((hospital) => (
                    <option key={hospital.Hospital_ID} value={hospital.Hospital_ID}>
                      {hospital.Hospital_Name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-4">
              <button
                type="button"
                onClick={closeReassignModal}
                disabled={isReassigning}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReassignStaff}
                disabled={
                  isReassigning
                  || !reassignHospitalId
                  || availableReassignHospitals.length === 0
                }
                className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {isReassigning ? <Loader2 className="animate-spin" size={14} /> : <ArrowRightLeft size={14} />}
                {isReassigning ? 'Reassigning...' : 'Confirm Reassign'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {detailsHospital && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[95]">
              <button
                type="button"
                aria-label="Close hospital details panel"
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={closeHospitalDetails}
              />

              <aside
                className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l bg-white shadow-2xl"
                style={{
                  animation: 'manageHospitalInfoSlideIn 0.25s ease-out',
                  borderColor: `${theme.secondaryColor}35`,
                  backgroundColor: '#ffffff',
                  opacity: 1,
                  backdropFilter: 'none',
                  color: primaryTextColor,
                  fontFamily: `${bodyFont}, sans-serif`,
                }}
              >
                <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}>
                      H-Representative Details
                    </h3>
                    <p className="mt-0.5 text-xs" style={{ color: secondaryTextColor }}>
                      View and manage assigned H-Representative.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeHospitalDetails}
                    aria-label="Close hospital details panel"
                    className="rounded-md border p-1"
                    style={{ borderColor: `${theme.secondaryColor}44`, color: secondaryTextColor }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-xl border bg-slate-50 p-4" style={{ borderColor: `${theme.secondaryColor}30` }}>
            <div className="flex items-start gap-3">
              {resolveHospitalLogoUrl(detailsHospital.Hospital_Logo) ? (
                <img
                  src={resolveHospitalLogoUrl(detailsHospital.Hospital_Logo)}
                  alt="H-Representative logo"
                  className="h-14 w-14 rounded-lg border object-cover bg-white"
                  style={{ borderColor: `${theme.secondaryColor}30` }}
                />
              ) : (
                <div className="h-14 w-14 rounded-lg border bg-white flex items-center justify-center" style={{ borderColor: `${theme.secondaryColor}30`, color: secondaryTextColor }}>
                  <Building2 size={20} />
                </div>
              )}

              <div className="min-w-0">
                <p className="text-sm font-semibold break-words" style={{ color: primaryTextColor }}>{detailsHospital.Hospital_Name || 'N/A'}</p>
                <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>H-Representative ID: {detailsHospital.Hospital_ID}</p>
                <p className="mt-2 text-xs" style={{ color: secondaryTextColor }}>Contact: {detailsHospital.Contact_Number || 'N/A'}</p>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed" style={{ color: secondaryTextColor }}>
              {[detailsHospital.Street, detailsHospital.Barangay, detailsHospital.City, detailsHospital.Region, detailsHospital.Country]
                .filter(Boolean)
                .join(', ') || 'No address on record.'}
            </p>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: `${theme.secondaryColor}30` }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: primaryTextColor }}>Quick Assign H-Representative</p>
            <div className="space-y-2">
              <select
                value={panelAssignUserId}
                onChange={(event) => setPanelAssignUserId(event.target.value)}
                disabled={unassignedHStaffUsers.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white text-sm focus:ring-2 outline-none"
                style={{ '--tw-ring-color': theme.primaryColor, color: primaryTextColor }}
              >
                <option value="">
                  {hStaffUsers.length === 0
                    ? 'No H-Representative users found in users/user_details'
                    : unassignedHStaffUsers.length === 0
                      ? 'All H-Representative users are already assigned'
                      : 'Select unassigned H-Representative'}
                </option>
                {unassignedHStaffUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {getHStaffDisplayName(user)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => assignHStaffToHospital(detailsHospital.Hospital_ID, panelAssignUserId)}
                disabled={isSavingAssignment || !panelAssignUserId || unassignedHStaffUsers.length === 0}
                className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {isSavingAssignment ? 'Assigning...' : 'Assign To This H-Representative'}
              </button>
            </div>
                  </div>

                  <div className="rounded-xl border p-4" style={{ borderColor: `${theme.secondaryColor}30` }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: primaryTextColor }}>Assigned H-Representative</p>

            {detailsHospitalStaffLinks.length === 0 ? (
              <p className="text-sm" style={{ color: secondaryTextColor }}>No H-Representative assigned yet.</p>
            ) : (
              <div className="space-y-2">
                {detailsHospitalStaffLinks.map((link) => {
                  const linkedUser = hStaffUsersById.get(Number(link.User_ID));

                  return (
                    <div key={link.Link_ID} className="rounded-lg border bg-gray-50 px-3 py-2" style={{ borderColor: `${theme.secondaryColor}30` }}>
                      <p className="text-sm font-medium break-words" style={{ color: primaryTextColor }}>
                        {getHStaffDisplayName(linkedUser)}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>Assigned: {formatDateTime(link.Assigned_Date)}</p>

                      <button
                        type="button"
                        onClick={() => removeHospitalStaffLink(link)}
                        disabled={removingLinkId === link.Link_ID}
                        className="mt-2 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                      >
                        {removingLinkId === link.Link_ID ? <Loader2 className="animate-spin" size={11} /> : <Trash2 size={11} />}
                        Unassign
                      </button>

                      <button
                        type="button"
                        onClick={() => openReassignModal(link)}
                        disabled={isReassigning || hospitals.length < 2}
                        className="mt-2 ml-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      >
                        <ArrowRightLeft size={11} />
                        Reassign
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
                  </div>
                </div>
              </aside>

              <style>{`
                @keyframes manageHospitalInfoSlideIn {
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

      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90] backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-bold text-gray-800">
                  {editingHospitalId ? 'Edit H-Representative' : 'Add New H-Representative'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                  <MapPin size={14} />
                  Address selectors use complete Philippines JSON from PSGC.
                </p>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" style={{ '--tw-ring-color': theme.primaryColor }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">H-Representative Name</label>
                  <input
                    name="hospitalName"
                    value={form.hospitalName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                    placeholder="e.g., Jose B. Lingad Memorial General H-Representative"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
                  <input
                    name="contactNumber"
                    value={form.contactNumber}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                    placeholder="e.g., +63 912 345 6789"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">H-Representative Logo</label>
                  <input
                    key={logoInputKey}
                    type="file"
                    accept="image/*"
                    multiple={false}
                    onChange={handleLogoFileChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Only one image is allowed. Uploads to Supabase bucket: hospital_logos.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input
                    name="country"
                    value={form.country}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  />
                </div>
              </div>

              <div
                className="rounded-xl border p-4"
                style={{
                  borderColor: `${theme.primaryColor}33`,
                  backgroundColor: `${theme.primaryColor}08`,
                }}
              >
                <div className="flex flex-col gap-1 mb-3">
                  <p className="text-sm font-semibold text-gray-800">Logo Preview</p>
                  <p className="text-xs text-gray-500">Single logo image only. Choosing a new file replaces the previous one.</p>
                </div>

                {currentLogoPreview ? (
                  <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                    <img
                      src={currentLogoPreview}
                      alt="H-Representative logo preview"
                      className="h-56 w-full object-contain bg-white"
                    />
                  </div>
                ) : (
                  <div className="h-56 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-sm text-gray-400">
                    No logo selected yet
                  </div>
                )}

                {logoFile?.name && (
                  <p className="mt-2 text-xs text-gray-600">Selected file: {logoFile.name}</p>
                )}

                {form.hospitalLogoPath && (
                  <p className="mt-2 text-[11px] text-gray-600 break-all">
                    Stored path: {form.hospitalLogoPath}
                  </p>
                )}

                {(currentLogoPreview || form.hospitalLogoPath) && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                  >
                    <Trash2 size={12} /> Remove Logo
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
                  <select
                    value={regionCode}
                    onChange={(event) => {
                      handleRegionChange(event.target.value);
                    }}
                    disabled={isLoadingRegions}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  >
                    <option value="">
                      {isLoadingRegions ? 'Loading regions...' : 'Select region'}
                    </option>
                    {regions.map((region) => (
                      <option key={region.code} value={region.code}>
                        {region.name}
                        {region.regionName && region.regionName !== region.name ? ` (${region.regionName})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                  <select
                    value={provinceCode}
                    onChange={(event) => handleProvinceChange(event.target.value)}
                    disabled={!regionCode || isLoadingRegionData || provinces.length === 0}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">
                      {isLoadingRegionData
                        ? 'Loading provinces...'
                        : provinces.length > 0
                          ? 'Select province (optional filter)'
                          : 'No provinces for this region'}
                    </option>
                    {provinces.map((province) => (
                      <option key={province.code} value={province.code}>
                        {province.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">{provinceFilterHint}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City / Municipality</label>
                  <select
                    value={cityCode}
                    onChange={(event) => {
                      handleCityChange(event.target.value);
                    }}
                    disabled={!regionCode || isLoadingRegionData}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">
                      {isLoadingRegionData
                        ? 'Loading cities/municipalities...'
                        : regionCode
                          ? 'Select city/municipality'
                          : 'Select region first'}
                    </option>
                    {visibleCities.map((city) => (
                      <option key={city.code} value={city.code}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Barangay</label>
                  <select
                    value={
                      barangays.find((barangay) => normalizeText(barangay.name) === normalizeText(form.barangay))?.code || ''
                    }
                    onChange={(event) => {
                      const selectedBarangay = barangays.find((barangay) => barangay.code === event.target.value);
                      setForm((prev) => ({
                        ...prev,
                        barangay: selectedBarangay?.name || '',
                      }));
                    }}
                    disabled={!cityCode || isLoadingBarangays}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="">
                      {isLoadingBarangays
                        ? 'Loading barangays...'
                        : cityCode
                          ? 'Select barangay'
                          : 'Select city/municipality first'}
                    </option>
                    {barangays.map((barangay) => (
                      <option key={barangay.code} value={barangay.code}>
                        {barangay.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input
                  name="street"
                  value={form.street}
                  onChange={handleInputChange}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  placeholder="House/Building No., Street, Subdivision"
                />
              </div>

              <div className="flex gap-3 mt-8 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsModalOpen(false);
                  }}
                  className="flex-1 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSaving || isUploadingLogo}
                  className="flex-1 py-2 text-white rounded-lg flex justify-center items-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {isSaving
                    ? (isUploadingLogo ? 'Uploading...' : 'Saving...')
                    : editingHospitalId
                      ? 'Update H-Representative'
                      : 'Add H-Representative'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {toastMessage && (
        <div
          className={`fixed right-6 bottom-6 z-[60] rounded-lg border px-4 py-2.5 text-sm font-semibold shadow-lg flex items-center gap-2 ${
            toastKind === 'error'
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toastKind === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
