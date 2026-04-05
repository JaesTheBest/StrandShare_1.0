import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UploadCloud,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const PATIENTS_TABLE = 'Patients';
const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const LEGACY_USER_DETAILS_TABLE = 'User_Details';
const HOSPITAL_STAFF_TABLE = 'Hospital_Staff';
const PATIENT_ASSETS_BUCKET = 'patient_assets';

const EMPTY_FORM = {
  userId: '',
  patientCode: '',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  age: '',
  gender: '',
  medicalCondition: '',
};

function normalizeRoleSlug(roleValue) {
  return String(roleValue || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isPatientRole(roleValue) {
  return normalizeRoleSlug(roleValue) === 'patient';
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function getFirstPresentValue(source, keys) {
  for (const key of keys) {
    const rawValue = source?.[key];
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    const normalizedValue = String(rawValue).trim();
    if (normalizedValue) {
      return rawValue;
    }
  }

  return '';
}

function pickPreferredUserDetails(detailsValue) {
  const detailsArray = Array.isArray(detailsValue)
    ? detailsValue
    : detailsValue
      ? [detailsValue]
      : [];

  if (detailsArray.length === 0) {
    return null;
  }

  const scoreDetails = (details) => {
    let score = 0;

    if (getFirstPresentValue(details, ['birthdate', 'Birthdate', 'birth_date', 'Birth_Date', 'date_of_birth', 'Date_Of_Birth', 'dob', 'DOB'])) {
      score += 4;
    }

    if (getFirstPresentValue(details, ['gender', 'Gender'])) {
      score += 3;
    }

    if (getFirstPresentValue(details, ['first_name', 'First_Name'])) {
      score += 1;
    }

    if (getFirstPresentValue(details, ['last_name', 'Last_Name'])) {
      score += 1;
    }

    return score;
  };

  return detailsArray.reduce((best, current) => {
    if (!best) {
      return current;
    }

    const bestScore = scoreDetails(best);
    const currentScore = scoreDetails(current);

    return currentScore > bestScore ? current : best;
  }, null);
}

function toPositiveInt(value) {
  const normalized = Number(String(value ?? '').trim());
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return null;
  }
  return normalized;
}

function extractPatientLinkedUserId(row) {
  return toPositiveInt(row?.User_ID ?? row?.user_id ?? row?.userId);
}

function normalizePatientGender(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');

  if (!normalized) {
    return '';
  }

  if (normalized === 'm' || normalized === 'male') {
    return 'Male';
  }

  if (normalized === 'f' || normalized === 'female') {
    return 'Female';
  }

  if (normalized === 'other' || normalized === 'non binary' || normalized === 'non-binary' || normalized === 'nonbinary') {
    return 'Other';
  }

  if (normalized === 'prefer not to say' || normalized === 'prefer-not-to-say') {
    return 'Prefer not to say';
  }

  return '';
}

function toSafeFileName(fileName) {
  return String(fileName || 'file')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';

  return parsed.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapPatientInsertError(rawMessage) {
  const message = String(rawMessage || 'Unable to save patient record.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('duplicate key value') && lowerMessage.includes('patient_code')) {
    return 'Patient code already exists. Please use a different patient code.';
  }

  if (
    lowerMessage.includes('duplicate key value')
    && (
      lowerMessage.includes('patients_user_id_unique')
      || lowerMessage.includes('patients_user_id_key')
      || (lowerMessage.includes('patients') && lowerMessage.includes('user_id'))
    )
  ) {
    return 'Selected patient-role user is already linked to another patient record.';
  }

  if (lowerMessage.includes('row-level security')) {
    return 'Action blocked by database policy. Make sure your account has H-Staff permissions.';
  }

  return message;
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || 'Upload failed.');
  if (message.toLowerCase().includes('row-level security')) {
    return 'Upload blocked by Storage RLS policy. Apply the patient_assets bucket policies first.';
  }
  return message;
}

function formatRoleLabel(roleValue) {
  const roleSlug = normalizeRoleSlug(roleValue);
  if (roleSlug === 'patient') return 'Patient';
  if (roleSlug === 'superadmin') return 'Super Admin';
  if (roleSlug === 'hospital' || roleSlug === 'hstaff') return 'H-Staff';
  if (roleSlug === 'partner') return 'Partner';
  if (roleSlug === 'staff') return 'Staff';
  return roleValue || 'N/A';
}

function getPatientUserName(user) {
  if (!user) return 'Unknown user';

  const details = pickPreferredUserDetails(user.user_details);

  const fullName = [details?.first_name, details?.middle_name, details?.last_name, details?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return fullName || user.email || `User #${user.user_id}`;
}

function computeAgeFromBirthdate(birthdateValue) {
  if (!birthdateValue) {
    return '';
  }

  let birthDate;

  if (typeof birthdateValue === 'string') {
    const normalizedValue = birthdateValue.trim().split('T')[0];
    const dateMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (dateMatch) {
      const year = Number(dateMatch[1]);
      const month = Number(dateMatch[2]);
      const day = Number(dateMatch[3]);
      birthDate = new Date(year, month - 1, day);
    } else {
      birthDate = new Date(birthdateValue);
    }
  } else {
    birthDate = new Date(birthdateValue);
  }

  if (Number.isNaN(birthDate.getTime())) {
    return '';
  }

  const today = new Date();
  let years = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    years -= 1;
  }

  if (years < 0 || years > 130) {
    return '';
  }

  return years;
}

function getPatientUserLabel(user) {
  if (!user) return 'Unknown patient user';

  const details = pickPreferredUserDetails(user.user_details);

  const fullName = [details?.first_name, details?.middle_name, details?.last_name, details?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fullName && user.email) {
    return `${fullName} (${user.email})`;
  }

  return fullName || user.email || `User #${user.user_id}`;
}

export default function ManagePatientsPage({ userProfile }) {
  const { theme } = useTheme();

  const [hospitalId, setHospitalId] = useState(null);
  const [hospitalName, setHospitalName] = useState('');

  const [patients, setPatients] = useState([]);
  const [patientUsers, setPatientUsers] = useState([]);

  const [form, setForm] = useState(EMPTY_FORM);
  const [patientPictureFile, setPatientPictureFile] = useState(null);
  const [medicalDocumentFile, setMedicalDocumentFile] = useState(null);
  const [patientPicturePreviewUrl, setPatientPicturePreviewUrl] = useState('');
  const [medicalDocumentPreviewUrl, setMedicalDocumentPreviewUrl] = useState('');

  const [isResolvingHospital, setIsResolvingHospital] = useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isLoadingPatientUsers, setIsLoadingPatientUsers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [existingUserSearchTerm, setExistingUserSearchTerm] = useState('');
  const [isSelectingExistingUser, setIsSelectingExistingUser] = useState(false);
  const [patientLinkedUserIds, setPatientLinkedUserIds] = useState([]);
  const [existingUserResults, setExistingUserResults] = useState([]);
  const [isSearchingExistingUsers, setIsSearchingExistingUsers] = useState(false);
  const [existingUserHasSearched, setExistingUserHasSearched] = useState(false);
  const existingUserSearchRequestRef = useRef(0);

  const patientUsersById = useMemo(() => {
    const map = new Map();
    patientUsers.forEach((user) => {
      map.set(Number(user.user_id), user);
    });
    return map;
  }, [patientUsers]);

  const linkedPatientUserIdSet = useMemo(() => {
    const set = new Set();
    patientLinkedUserIds.forEach((id) => {
      set.add(Number(id));
    });
    return set;
  }, [patientLinkedUserIds]);

  const selectedExistingUser = useMemo(
    () => (form.userId ? patientUsersById.get(Number(form.userId)) || null : null),
    [form.userId, patientUsersById],
  );

  const isMedicalDocumentImage = useMemo(
    () => String(medicalDocumentFile?.type || '').toLowerCase().startsWith('image/'),
    [medicalDocumentFile],
  );

  const isMedicalDocumentPdf = useMemo(() => {
    const fileType = String(medicalDocumentFile?.type || '').toLowerCase();
    const fileName = String(medicalDocumentFile?.name || '').toLowerCase();
    return fileType === 'application/pdf' || fileName.endsWith('.pdf');
  }, [medicalDocumentFile]);

  const linkedPatientsCount = useMemo(
    () => patients.filter((patient) => Boolean(extractPatientLinkedUserId(patient))).length,
    [patients],
  );

  const filteredPatients = useMemo(() => {
    const query = normalizeText(patientSearchTerm);
    if (!query) {
      return patients;
    }

    return patients.filter((patient) => {
      const linkedUser = patientUsersById.get(Number(patient.User_ID));
      const linkedUserLabel = patient.User_ID
        ? (linkedUser ? getPatientUserLabel(linkedUser) : `User #${patient.User_ID}`)
        : '';

      const searchableValues = [
        patient.Patient_Code,
        patient.First_Name,
        patient.Middle_Name,
        patient.Last_Name,
        patient.Suffix,
        patient.Gender,
        patient.Medical_Condition,
        linkedUserLabel,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean);

      return searchableValues.some((value) => value.includes(query));
    });
  }, [patients, patientSearchTerm, patientUsersById]);

  const resolveAssetUrl = useCallback((assetPath) => {
    const path = String(assetPath || '').trim();
    if (!path || !supabase) {
      return '';
    }

    const { data } = supabase.storage.from(PATIENT_ASSETS_BUCKET).getPublicUrl(path);
    return data?.publicUrl || '';
  }, []);

  const resolveAssignedHospital = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      return;
    }

    const activeUserId = Number(userProfile?.user_id);
    if (!activeUserId) {
      setHospitalId(null);
      setHospitalName('');
      setNotice({
        kind: 'error',
        text: 'Unable to resolve your account ID. Please sign in again.',
      });
      return;
    }

    try {
      setIsResolvingHospital(true);
      const { data, error } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .select('Hospital_ID, Hospitals:Hospitals(Hospital_Name)')
        .eq('User_ID', activeUserId)
        .maybeSingle();

      if (error) throw error;

      const nextHospitalId = Number(data?.Hospital_ID || 0) || null;
      const linkedHospital = Array.isArray(data?.Hospitals) ? data.Hospitals[0] : data?.Hospitals;

      setHospitalId(nextHospitalId);
      setHospitalName(linkedHospital?.Hospital_Name || '');

      if (!nextHospitalId) {
        setNotice({
          kind: 'error',
          text: 'No hospital assignment found for your H-Staff account. Ask Super Admin to assign your account to a hospital first.',
        });
      }
    } catch (error) {
      setHospitalId(null);
      setHospitalName('');
      setNotice({
        kind: 'error',
        text: error.message || 'Unable to load your hospital assignment.',
      });
    } finally {
      setIsResolvingHospital(false);
    }
  }, [userProfile?.user_id]);

  const fetchPatients = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !hospitalId) {
      setPatients([]);
      return;
    }

    try {
      setIsLoadingPatients(true);
      const { data, error } = await supabase
        .from(PATIENTS_TABLE)
        .select('*')
        .eq('Hospital_ID', hospitalId)
        .order('Created_At', { ascending: false });

      if (error) throw error;
      setPatients(data || []);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load patients.' });
    } finally {
      setIsLoadingPatients(false);
    }
  }, [hospitalId]);

  const fetchPatientUsers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setPatientUsers([]);
      return;
    }

    try {
      setIsLoadingPatientUsers(true);
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .select(`
          user_id,
          email,
          role,
          user_details:user_details (
            first_name,
            middle_name,
            last_name,
            suffix,
            birthdate,
            gender
          )
        `)
        .order('email', { ascending: true });

      if (error) throw error;

      const patientRoleUsers = (data || [])
        .filter((user) => isPatientRole(user?.role))
        .sort((a, b) => getPatientUserLabel(a).localeCompare(getPatientUserLabel(b), 'en', { sensitivity: 'base' }));

      setPatientUsers(patientRoleUsers);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load existing patient-role users.' });
    } finally {
      setIsLoadingPatientUsers(false);
    }
  }, []);

  const fetchPatientLinkedUserIds = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setPatientLinkedUserIds([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from(PATIENTS_TABLE)
        .select('*');

      if (error) throw error;

      const ids = Array.from(
        new Set(
          (data || [])
            .map((row) => extractPatientLinkedUserId(row))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      );

      setPatientLinkedUserIds(ids);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load linked patient user IDs.' });
    }
  }, []);

  useEffect(() => {
    resolveAssignedHospital();
    fetchPatientUsers();
    fetchPatientLinkedUserIds();
  }, [resolveAssignedHospital, fetchPatientUsers, fetchPatientLinkedUserIds]);

  useEffect(() => {
    if (!patientPictureFile) {
      setPatientPicturePreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(patientPictureFile);
    setPatientPicturePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [patientPictureFile]);

  useEffect(() => {
    if (!medicalDocumentFile) {
      setMedicalDocumentPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(medicalDocumentFile);
    setMedicalDocumentPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [medicalDocumentFile]);

  useEffect(() => {
    if (!hospitalId) {
      setPatients([]);
      return;
    }

    fetchPatients();
  }, [hospitalId, fetchPatients]);

  useEffect(() => {
    const term = existingUserSearchTerm.trim();
    existingUserSearchRequestRef.current += 1;
    const requestId = existingUserSearchRequestRef.current;

    if (!term) {
      setExistingUserResults([]);
      setExistingUserHasSearched(false);
      setIsSearchingExistingUsers(false);
      return undefined;
    }

    if (!isSupabaseConfigured || !supabase) {
      setExistingUserResults([]);
      setExistingUserHasSearched(true);
      setIsSearchingExistingUsers(false);
      return undefined;
    }

    setIsSearchingExistingUsers(true);
    const handle = setTimeout(async () => {
      try {
        const activeLinkedUserIdSet = linkedPatientUserIdSet;

        const emailQuery = supabase
          .from(USERS_TABLE)
          .select(`
            user_id,
            email,
            role,
            user_details (
              first_name,
              middle_name,
              last_name,
              suffix,
              birthdate,
              gender
            )
          `)
          .ilike('email', `%${term}%`);

        const nameQuery = supabase
          .from('user_details')
          .select(`
            user_id,
            first_name,
            middle_name,
            last_name,
            suffix,
            birthdate,
            gender,
            users!inner (
              user_id,
              email,
              role
            )
          `)
          .or(`first_name.ilike.%${term}%,middle_name.ilike.%${term}%,last_name.ilike.%${term}%`);

        const [emailRes, nameRes] = await Promise.all([emailQuery, nameQuery]);

        if (existingUserSearchRequestRef.current !== requestId) {
          return;
        }

        if (emailRes.error) throw emailRes.error;
        if (nameRes.error) throw nameRes.error;

        const mergedMap = new Map();

        (emailRes.data || []).forEach((user) => {
          const details = Array.isArray(user.user_details)
            ? user.user_details[0]
            : user.user_details;

          mergedMap.set(Number(user.user_id), {
            user_id: user.user_id,
            email: user.email,
            role: user.role,
            user_details: details || null,
          });
        });

        (nameRes.data || []).forEach((detailRow) => {
          const userRow = Array.isArray(detailRow.users)
            ? detailRow.users[0]
            : detailRow.users;

          if (!userRow?.user_id) {
            return;
          }

          mergedMap.set(Number(userRow.user_id), {
            user_id: userRow.user_id,
            email: userRow.email,
            role: userRow.role,
            user_details: {
              first_name: detailRow.first_name,
              middle_name: detailRow.middle_name,
              last_name: detailRow.last_name,
              suffix: detailRow.suffix,
              birthdate: detailRow.birthdate,
              gender: detailRow.gender,
            },
          });
        });

        const results = Array.from(mergedMap.values())
          .filter((user) => isPatientRole(user?.role))
          .filter((user) => !activeLinkedUserIdSet.has(Number(user.user_id)))
          .sort((a, b) => getPatientUserLabel(a).localeCompare(getPatientUserLabel(b), 'en', { sensitivity: 'base' }));

        if (existingUserSearchRequestRef.current !== requestId) {
          return;
        }

        setExistingUserResults(results);
        setExistingUserHasSearched(true);
      } catch {
        if (existingUserSearchRequestRef.current !== requestId) {
          return;
        }

        setExistingUserResults([]);
        setExistingUserHasSearched(true);
      } finally {
        if (existingUserSearchRequestRef.current === requestId) {
          setIsSearchingExistingUsers(false);
        }
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [existingUserSearchTerm, linkedPatientUserIdSet]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setPatientPictureFile(null);
    setMedicalDocumentFile(null);
    setExistingUserSearchTerm('');
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const fetchPatientUserDetailsByUserId = useCallback(async (userIdValue) => {
    const targetUserId = Number(userIdValue || 0);
    if (!targetUserId || !supabase) {
      return null;
    }

    const detailQueries = [
      {
        tableName: USER_DETAILS_TABLE,
        select: 'first_name,middle_name,last_name,suffix,birthdate,gender',
        matchColumn: 'user_id',
      },
      {
        tableName: LEGACY_USER_DETAILS_TABLE,
        select: 'First_Name,Middle_name,Last_Name,Suffix,Birthdate,Gender',
        matchColumn: 'User_ID',
      },
    ];

    for (const queryConfig of detailQueries) {
      const { data, error } = await supabase
        .from(queryConfig.tableName)
        .select(queryConfig.select)
        .eq(queryConfig.matchColumn, targetUserId);

      if (error || !Array.isArray(data) || data.length === 0) {
        continue;
      }

      const prioritized = data.find((item) => {
        const candidateBirthdate = item?.birthdate ?? item?.Birthdate ?? item?.birth_date ?? item?.Birth_Date ?? item?.date_of_birth ?? item?.Date_Of_Birth ?? item?.dob ?? item?.DOB;
        const candidateGender = item?.gender ?? item?.Gender;
        return Boolean(candidateBirthdate || candidateGender);
      });

      if (prioritized) {
        return prioritized;
      }

      return data[0];
    }

    return null;
  }, []);

  const fetchPatientUserById = useCallback(async (userIdValue) => {
    const targetUserId = Number(userIdValue || 0);
    if (!targetUserId || !supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select(`
        user_id,
        email,
        role,
        user_details:user_details (
          first_name,
          middle_name,
          last_name,
          suffix,
          birthdate,
          gender
        )
      `)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return null;
    }

    const rawDetails = pickPreferredUserDetails(data.user_details);

    if (rawDetails) {
      return {
        ...data,
        user_details: rawDetails,
      };
    }

    const fallbackDetails = await fetchPatientUserDetailsByUserId(targetUserId);
    if (!fallbackDetails) {
      return data;
    }

    return {
      ...data,
      user_details: fallbackDetails,
    };
  }, [fetchPatientUserDetailsByUserId]);

  const isPatientUserAlreadyLinked = useCallback(async (userIdValue) => {
    const targetUserId = Number(userIdValue || 0);
    if (!targetUserId || !supabase) {
      return false;
    }

    const { data, error } = await supabase
      .from(PATIENTS_TABLE)
      .select('*');

    if (error) {
      throw error;
    }

    return Array.isArray(data)
      && data.some((row) => extractPatientLinkedUserId(row) === targetUserId);
  }, []);

  const handleSelectExistingUser = async (userIdValue) => {
    const nextUserId = Number(userIdValue || 0);
    if (!nextUserId) {
      return;
    }

    if (linkedPatientUserIdSet.has(nextUserId)) {
      setNotice({ kind: 'error', text: 'Selected patient-role user is already linked to another patient record.' });
      return;
    }

    try {
      setIsSelectingExistingUser(true);
      const latestUser = await fetchPatientUserById(nextUserId);

      if (!latestUser) {
        setNotice({ kind: 'error', text: 'Selected user was not found. Please refresh and try again.' });
        return;
      }

      if (!isPatientRole(latestUser.role)) {
        setNotice({ kind: 'error', text: 'Selected user is no longer tagged as patient role.' });
        return;
      }

      const alreadyLinkedInDb = await isPatientUserAlreadyLinked(latestUser.user_id);
      if (alreadyLinkedInDb) {
        setPatientLinkedUserIds((prev) => {
          const unique = new Set(prev.map((item) => Number(item)));
          unique.add(Number(latestUser.user_id));
          return Array.from(unique);
        });
        setExistingUserResults((prev) => prev.filter((user) => Number(user.user_id) !== Number(latestUser.user_id)));
        setNotice({ kind: 'error', text: 'Selected patient-role user is already linked to another patient record.' });
        return;
      }

      if (linkedPatientUserIdSet.has(Number(latestUser.user_id))) {
        setNotice({ kind: 'error', text: 'Selected patient-role user is already linked to another patient record.' });
        return;
      }

      let details = pickPreferredUserDetails(latestUser.user_details);

      const hasBirthdateOrGender = Boolean(
        getFirstPresentValue(details, ['birthdate', 'Birthdate', 'birth_date', 'Birth_Date', 'date_of_birth', 'Date_Of_Birth', 'dob', 'DOB'])
        || getFirstPresentValue(details, ['gender', 'Gender']),
      );

      if (!details || !hasBirthdateOrGender) {
        const fallbackDetails = await fetchPatientUserDetailsByUserId(latestUser.user_id);
        if (fallbackDetails) {
          details = fallbackDetails;
        }
      }

      const detailFirstName = details?.first_name ?? details?.First_Name ?? '';
      const detailMiddleName = details?.middle_name ?? details?.Middle_Name ?? details?.Middle_name ?? '';
      const detailLastName = details?.last_name ?? details?.Last_Name ?? '';
      const detailSuffix = details?.suffix ?? details?.Suffix ?? '';
      const detailBirthdate = details?.birthdate
        ?? details?.Birthdate
        ?? details?.birth_date
        ?? details?.Birth_Date
        ?? details?.date_of_birth
        ?? details?.Date_Of_Birth
        ?? details?.dob
        ?? details?.DOB
        ?? '';
      const detailGender = details?.gender ?? details?.Gender ?? '';
      const computedAge = computeAgeFromBirthdate(detailBirthdate);
      const normalizedGender = normalizePatientGender(detailGender);

      setForm((prev) => ({
        ...prev,
        userId: String(latestUser.user_id),
        firstName: detailFirstName,
        middleName: detailMiddleName,
        lastName: detailLastName,
        suffix: detailSuffix,
        age: computedAge !== '' ? String(computedAge) : '',
        gender: normalizedGender,
      }));

      setPatientUsers((prev) => {
        const next = [...prev.filter((item) => Number(item.user_id) !== Number(latestUser.user_id)), latestUser];
        return next.sort((a, b) => getPatientUserLabel(a).localeCompare(getPatientUserLabel(b), 'en', { sensitivity: 'base' }));
      });

      setExistingUserSearchTerm(getPatientUserLabel(latestUser));
      setNotice({ kind: '', text: '' });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to fetch selected patient-role account details.' });
    } finally {
      setIsSelectingExistingUser(false);
    }
  };

  const handleClearSelectedExistingUser = () => {
    resetForm();
    setExistingUserResults([]);
    setExistingUserHasSearched(false);
    setNotice({ kind: '', text: '' });
  };

  const generatePatientCode = () => {
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    setForm((prev) => ({ ...prev, patientCode: `PT-${datePart}-${randomPart}` }));
  };

  const uploadAsset = async (file, subFolder) => {
    if (!file || !supabase) {
      return '';
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user?.id) {
      throw new Error('Unable to resolve authenticated user for file upload.');
    }

    const path = `${user.id}/${subFolder}/${Date.now()}-${toSafeFileName(file.name)}`;

    const { error } = await supabase.storage
      .from(PATIENT_ASSETS_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(mapStorageUploadError(error.message));
    }

    return path;
  };

  const cleanupUploadedAssets = async (paths) => {
    if (!supabase || !Array.isArray(paths) || paths.length === 0) {
      return;
    }

    try {
      await supabase.storage.from(PATIENT_ASSETS_BUCKET).remove(paths);
    } catch {
      // Ignore cleanup failures so we can still show the main insert error.
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      return;
    }

    if (!hospitalId) {
      setNotice({
        kind: 'error',
        text: 'You are not assigned to any hospital. Ask Super Admin to assign your account first.',
      });
      return;
    }

    if (!String(form.patientCode).trim()) {
      setNotice({ kind: 'error', text: 'Patient code is required.' });
      return;
    }

    if (!String(form.firstName).trim() || !String(form.lastName).trim()) {
      setNotice({ kind: 'error', text: 'Patient first name and last name are required.' });
      return;
    }

    const selectedUserId = Number(form.userId || 0);
    if (selectedUserId) {
      try {
        const linkedInDb = linkedPatientUserIdSet.has(selectedUserId)
          || await isPatientUserAlreadyLinked(selectedUserId);

        if (linkedInDb) {
          setPatientLinkedUserIds((prev) => {
            const unique = new Set(prev.map((item) => Number(item)));
            unique.add(selectedUserId);
            return Array.from(unique);
          });
          setNotice({ kind: 'error', text: 'Selected patient-role user is already linked to another patient record.' });
          return;
        }
      } catch (error) {
        setNotice({ kind: 'error', text: error.message || 'Unable to validate selected patient-role user link.' });
        return;
      }
    }

    const uploadedPaths = [];

    try {
      setIsSaving(true);
      setNotice({ kind: '', text: '' });

      const patientPicturePath = patientPictureFile
        ? await uploadAsset(patientPictureFile, 'patient-picture')
        : '';

      if (patientPicturePath) {
        uploadedPaths.push(patientPicturePath);
      }

      const medicalDocumentPath = medicalDocumentFile
        ? await uploadAsset(medicalDocumentFile, 'medical-document')
        : '';

      if (medicalDocumentPath) {
        uploadedPaths.push(medicalDocumentPath);
      }

      const payload = {
        User_ID: selectedUserId || null,
        Hospital_ID: Number(hospitalId),
        Patient_Code: String(form.patientCode || '').trim(),
        First_Name: String(form.firstName || '').trim(),
        Middle_Name: String(form.middleName || '').trim() || null,
        Last_Name: String(form.lastName || '').trim(),
        Suffix: String(form.suffix || '').trim() || null,
        Age: form.age ? Number(form.age) : null,
        Gender: String(form.gender || '').trim() || null,
        Medical_Condition: String(form.medicalCondition || '').trim() || null,
        Patient_Picture: patientPicturePath || null,
        Medical_Document: medicalDocumentPath || null,
      };

      const { error } = await supabase
        .from(PATIENTS_TABLE)
        .insert(payload);

      if (error) throw error;

      resetForm();
      setNotice({ kind: 'success', text: 'Patient record added successfully.' });
      await fetchPatients();
      await fetchPatientUsers();
      await fetchPatientLinkedUserIds();
    } catch (error) {
      await cleanupUploadedAssets(uploadedPaths);
      setNotice({ kind: 'error', text: mapPatientInsertError(error.message) });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshPageData = async () => {
    await Promise.all([resolveAssignedHospital(), fetchPatientUsers(), fetchPatients(), fetchPatientLinkedUserIds()]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manage Patients</h1>
          <p className="text-sm text-gray-600 mt-1">
            Add patient records for your assigned hospital and optionally link existing patient-role user accounts.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshPageData}
          disabled={isResolvingHospital || isLoadingPatients || isLoadingPatientUsers || isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-60"
          style={{
            borderColor: `${theme.primaryColor}33`,
            backgroundColor: `${theme.primaryColor}12`,
            color: theme.primaryColor,
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Hospital Assignment</h2>
            <p className="text-xs text-gray-500 mt-1">Hospital_ID is auto-filled from Hospital_Staff based on your H-Staff account.</p>
          </div>
          <div className="text-xs text-gray-600">
            {isResolvingHospital ? (
              <span className="inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> Resolving hospital...</span>
            ) : hospitalId ? (
              <span>
                Hospital: <span className="font-semibold text-gray-800">{hospitalName || `Hospital #${hospitalId}`}</span> (ID: {hospitalId})
              </span>
            ) : (
              <span className="text-red-700 font-medium">No hospital assignment found</span>
            )}
          </div>
        </div>
      </section>

      {notice.text && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-medium flex items-center gap-2 ${
            notice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {notice.kind === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Existing Patients</h2>
              <p className="text-xs text-gray-500 mt-1">Search current records first to avoid duplicate entries.</p>
            </div>
            <p className="text-xs text-gray-500">Showing {filteredPatients.length} of {patients.length}</p>
          </div>

          <div className="mb-4 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={patientSearchTerm}
              onChange={(event) => setPatientSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm bg-white focus:ring-2 outline-none"
              style={{ '--tw-ring-color': theme.primaryColor }}
              placeholder="Search by code, name, condition, gender, or linked user"
            />
          </div>

          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">Total: {patients.length}</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">Linked users: {linkedPatientsCount}</span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">Unlinked: {Math.max(patients.length - linkedPatientsCount, 0)}</span>
          </div>

          {isLoadingPatients ? (
            <div className="py-10 text-gray-700 flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18} /> Loading patients...
            </div>
          ) : patients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No patient records yet for this hospital.
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No patients matched your search.
            </div>
          ) : (
            <div className="max-h-[650px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="text-sm sticky top-0 z-[1]" style={{ backgroundColor: `${theme.primaryColor}20`, color: theme.primaryTextColor || '#111827' }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Code</th>
                    <th className="px-4 py-3 text-left font-semibold">Patient Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Linked User</th>
                    <th className="px-4 py-3 text-left font-semibold">Age/Gender</th>
                    <th className="px-4 py-3 text-left font-semibold">Medical Condition</th>
                    <th className="px-4 py-3 text-left font-semibold">Assets</th>
                    <th className="px-4 py-3 text-left font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => {
                    const linkedUser = patientUsersById.get(Number(patient.User_ID));
                    const pictureUrl = resolveAssetUrl(patient.Patient_Picture);
                    const documentUrl = resolveAssetUrl(patient.Medical_Document);

                    return (
                      <tr key={patient.Patient_ID} className="border-t border-gray-200 align-top">
                        <td className="px-4 py-3 font-semibold text-gray-800">{patient.Patient_Code || `Patient #${patient.Patient_ID}`}</td>
                        <td className="px-4 py-3 text-gray-700">
                          {[patient.First_Name, patient.Middle_Name, patient.Last_Name, patient.Suffix]
                            .filter(Boolean)
                            .join(' ') || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {patient.User_ID
                            ? (linkedUser ? getPatientUserLabel(linkedUser) : `User #${patient.User_ID}`)
                            : 'Not linked'}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {patient.Age || 'N/A'} / {patient.Gender || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs break-words">{patient.Medical_Condition || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-700">
                          <div className="flex flex-col gap-1">
                            {patient.Patient_Picture ? (
                              pictureUrl ? (
                                <a href={pictureUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">
                                  View Picture
                                </a>
                              ) : (
                                <span className="text-xs text-gray-500 break-all">{patient.Patient_Picture}</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-400">No picture</span>
                            )}

                            {patient.Medical_Document ? (
                              documentUrl ? (
                                <a href={documentUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">
                                  View Document
                                </a>
                              ) : (
                                <span className="text-xs text-gray-500 break-all">{patient.Medical_Document}</span>
                              )
                            ) : (
                              <span className="text-xs text-gray-400">No document</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(patient.Created_At)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Enter New Patient</h2>
            <p className="text-xs text-gray-500 mt-1">Fill required fields first: Patient Code, First Name, and Last Name.</p>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-800">Quick Guide</p>
            <p className="mt-1 text-xs text-gray-600">1) Optionally link an existing patient account. 2) Fill identity and medical details. 3) Attach picture/document then click Add Patient.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" style={{ '--tw-ring-color': theme.primaryColor }}>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Identity</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Existing Patient User (optional)</label>
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={existingUserSearchTerm}
                      onChange={(event) => {
                        setExistingUserSearchTerm(event.target.value);
                        if (!event.target.value.trim() && form.userId) {
                          handleClearSelectedExistingUser();
                        }
                      }}
                      className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 bg-white focus:ring-2 outline-none"
                      placeholder="Search patient-role user by name or email"
                    />
                  </div>

                  <div className="mt-2 max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white">
                    {!existingUserSearchTerm.trim() ? (
                      <p className="px-3 py-2 text-xs text-gray-500">Type to search existing patient-role accounts.</p>
                    ) : isSearchingExistingUsers || isSelectingExistingUser ? (
                      <p className="px-3 py-2 text-xs text-gray-500 inline-flex items-center gap-1.5">
                        <Loader2 size={13} className="animate-spin" /> Loading results...
                      </p>
                    ) : existingUserHasSearched && existingUserResults.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-500">No matching available patient-role users.</p>
                    ) : (
                      existingUserResults.map((user) => (
                        <label key={user.user_id} className="flex items-center gap-3 p-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="radio"
                            name="existingPatientUser"
                            checked={Number(form.userId) === Number(user.user_id)}
                            onChange={() => handleSelectExistingUser(user.user_id)}
                            className="text-blue-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 break-words">{getPatientUserName(user)}</p>
                            <p className="text-xs text-gray-500 break-all">{user.email || 'No email'}</p>
                            <p className="mt-0.5 text-[11px] text-gray-500">Current role: {formatRoleLabel(user.role)}</p>
                            <p className="mt-1 text-[11px] font-semibold text-emerald-700">Available to link</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>

                  {form.userId && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-xs font-medium text-emerald-900 break-words">
                        Selected: {selectedExistingUser ? getPatientUserLabel(selectedExistingUser) : `User #${form.userId}`}
                      </p>
                      <button
                        type="button"
                        onClick={handleClearSelectedExistingUser}
                        className="shrink-0 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient Code</label>
                  <div className="flex gap-2">
                    <input
                      name="patientCode"
                      value={form.patientCode}
                      onChange={handleInputChange}
                      required
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                      placeholder="e.g., PT-250404-4821"
                    />
                    <button
                      type="button"
                      onClick={generatePatientCode}
                      className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Auto
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    name="firstName"
                    value={form.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Middle Name</label>
                  <input
                    name="middleName"
                    value={form.middleName}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    name="lastName"
                    value={form.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
                  <input
                    name="suffix"
                    value={form.suffix}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                    placeholder="e.g., Jr., III"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Clinical Details</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  <input
                    name="age"
                    value={form.age}
                    onChange={handleInputChange}
                    type="number"
                    min="0"
                    max="130"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  >
                    <option value="">Select gender</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Hospital ID for save: <span className="font-semibold text-gray-800">{hospitalId || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Medical Condition</label>
                <textarea
                  name="medicalCondition"
                  value={form.medicalCondition}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white focus:ring-2 outline-none"
                  placeholder="Medical condition summary"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Patient Picture</label>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 cursor-pointer hover:bg-gray-100">
                    <UploadCloud size={15} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Choose image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setPatientPictureFile(event.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500 break-all">{patientPictureFile?.name || 'No file selected.'}</p>

                  {patientPicturePreviewUrl && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <img
                        src={patientPicturePreviewUrl}
                        alt="Patient preview"
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medical Document</label>
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 cursor-pointer hover:bg-gray-100">
                    <FileText size={15} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Choose file (PDF/image)</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(event) => setMedicalDocumentFile(event.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500 break-all">{medicalDocumentFile?.name || 'No file selected.'}</p>

                  {medicalDocumentPreviewUrl && isMedicalDocumentImage && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
                      <img
                        src={medicalDocumentPreviewUrl}
                        alt="Medical document preview"
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  )}

                  {medicalDocumentPreviewUrl && !isMedicalDocumentImage && isMedicalDocumentPdf && (
                    <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                      <iframe
                        title="Medical document PDF preview"
                        src={medicalDocumentPreviewUrl}
                        className="h-40 w-full rounded border border-gray-100"
                      />
                      <a
                        href={medicalDocumentPreviewUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Open PDF preview
                      </a>
                    </div>
                  )}

                  {medicalDocumentPreviewUrl && !isMedicalDocumentImage && !isMedicalDocumentPdf && (
                    <p className="mt-2 text-xs text-gray-500">Preview is not available for this file type.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                disabled={isSaving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Clear
              </button>

              <button
                type="submit"
                disabled={isSaving || !hospitalId}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {isSaving ? 'Saving...' : 'Add Patient'}
              </button>
            </div>
          </form>
        </section>
      </div>

    </div>
  );
}
