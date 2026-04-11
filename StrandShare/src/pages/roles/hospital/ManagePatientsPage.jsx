import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { createClient } from '@supabase/supabase-js';
import { useTheme } from '../../../context/ThemeContext';
import {
  isSupabaseConfigured,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '../../../lib/supabaseClient';

const PATIENTS_TABLE = 'Patients';
const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const HOSPITAL_STAFF_TABLE = 'Hospital_Representative';
const PATIENT_ASSETS_BUCKET = 'patient_assets';

const EMPTY_FORM = {
  email: '',
  patientCode: '',
  firstName: '',
  middleName: '',
  lastName: '',
  suffix: '',
  birthdate: '',
  gender: '',
  dateOfDiagnosis: '',
  guardian: '',
  guardianContactNumber: '',
  guardianRelationship: '',
  medicalCondition: '',
};

const GENDER_OPTIONS = [
  { id: 'Male', label: 'Male' },
  { id: 'Female', label: 'Female' },
  { id: 'Other', label: 'Other' },
  { id: 'Prefer not to say', label: 'Prefer not to say' },
];

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

  return detailsArray[0];
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

function shuffleArray(values) {
  const output = [...values];

  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const temp = output[index];
    output[index] = output[swapIndex];
    output[swapIndex] = temp;
  }

  return output;
}

function buildRandomPatientCode() {
  return `PT${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`;
}

function normalizePatientCodeInput(value) {
  const raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = raw.replace(/^PT/, '').replace(/\D/g, '').slice(0, 6);
  return `PT${digits}`;
}

function isValidPatientCode(value) {
  return /^PT\d{6}$/.test(String(value || '').trim().toUpperCase());
}

function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%*';
  const all = `${upper}${lower}${numbers}${symbols}`;

  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    numbers[Math.floor(Math.random() * numbers.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const remaining = Array.from({ length: 8 }, () => all[Math.floor(Math.random() * all.length)]);
  return shuffleArray([...required, ...remaining]).join('');
}

function getPatientFullName(userRow, patientRow = null) {
  const details = pickPreferredUserDetails(userRow?.user_details);

  const fullName = [details?.first_name, details?.middle_name, details?.last_name, details?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (fullName) {
    return fullName;
  }

  const email = String(userRow?.email || '').trim();
  if (email) {
    return email;
  }

  if (patientRow?.Patient_Code) {
    return patientRow.Patient_Code;
  }

  return `Patient #${patientRow?.Patient_ID || 'N/A'}`;
}

function mapStorageUploadError(rawMessage) {
  const message = String(rawMessage || 'Upload failed.');
  if (message.toLowerCase().includes('row-level security')) {
    return 'Upload blocked by Storage RLS policy. Apply patient_assets storage policies first.';
  }
  return message;
}

function mapAuthSignupError(rawMessage) {
  const message = String(rawMessage || 'Unable to create authentication account.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('already registered') || lowerMessage.includes('already been registered')) {
    return 'Email is already registered. Use a different email address.';
  }

  if (lowerMessage.includes('invalid email')) {
    return 'Please enter a valid patient email address.';
  }

  if (lowerMessage.includes('password')) {
    return 'Unable to create auth account due to password policy. Please retry.';
  }

  if (lowerMessage.includes('rate limit')) {
    return 'Too many signup attempts. Please wait a moment and try again.';
  }

  return message;
}

function mapPatientInsertError(rawMessage) {
  const message = String(rawMessage || 'Unable to save patient record.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('duplicate key value') && lowerMessage.includes('patient_code')) {
    return 'Patient code already exists. Please generate a new PT code.';
  }

  if (
    lowerMessage.includes('duplicate key value')
    && (
      lowerMessage.includes('patients_user_id_unique')
      || lowerMessage.includes('patients_user_id_key')
      || (lowerMessage.includes('patients') && lowerMessage.includes('user_id'))
    )
  ) {
    return 'This user is already linked to another patient record.';
  }

  if (lowerMessage.includes('row-level security')) {
    return 'Action blocked by database policy. Verify your hospital role permissions.';
  }

  return message;
}

export default function ManagePatientsPage({ userProfile }) {
  const { theme } = useTheme();

  const [hospitalId, setHospitalId] = useState(null);
  const [hospitalName, setHospitalName] = useState('');

  const [patients, setPatients] = useState([]);
  const [patientUsers, setPatientUsers] = useState([]);

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    patientCode: buildRandomPatientCode(),
  }));

  const [patientPictureFile, setPatientPictureFile] = useState(null);
  const [medicalDocumentFile, setMedicalDocumentFile] = useState(null);
  const [patientPicturePreviewUrl, setPatientPicturePreviewUrl] = useState('');
  const [medicalDocumentPreviewUrl, setMedicalDocumentPreviewUrl] = useState('');

  const [isResolvingHospital, setIsResolvingHospital] = useState(false);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [successPopup, setSuccessPopup] = useState({ open: false, text: '' });
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  const signupClient = useMemo(() => {
    if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'strandshare-hospital-patient-signup-client',
      },
    });
  }, []);

  const patientUsersById = useMemo(() => {
    const map = new Map();
    patientUsers.forEach((user) => {
      map.set(Number(user.user_id), user);
    });
    return map;
  }, [patientUsers]);

  const computedAgeFromForm = useMemo(() => {
    const age = computeAgeFromBirthdate(form.birthdate);
    return age === '' ? '' : String(age);
  }, [form.birthdate]);

  const isMedicalDocumentImage = useMemo(
    () => String(medicalDocumentFile?.type || '').toLowerCase().startsWith('image/'),
    [medicalDocumentFile],
  );

  const isMedicalDocumentPdf = useMemo(() => {
    const fileType = String(medicalDocumentFile?.type || '').toLowerCase();
    const fileName = String(medicalDocumentFile?.name || '').toLowerCase();
    return fileType === 'application/pdf' || fileName.endsWith('.pdf');
  }, [medicalDocumentFile]);

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
        .select('Hospital_ID, hRepresentatives:Hospitals(Hospital_Name)')
        .eq('User_ID', activeUserId)
        .maybeSingle();

      if (error) throw error;

      const nextHospitalId = Number(data?.Hospital_ID || 0) || null;
      const linkedHospital = Array.isArray(data?.hRepresentatives) ? data.hRepresentatives[0] : data?.hRepresentatives;

      setHospitalId(nextHospitalId);
      setHospitalName(String(linkedHospital?.Hospital_Name || '').trim());

      if (!nextHospitalId) {
        setNotice({
          kind: 'error',
          text: 'No hospital assignment found for your account. Ask Super Admin to assign your account first.',
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
      setPatientUsers([]);
      return;
    }

    try {
      setIsLoadingPatients(true);

      const { data: patientRows, error: patientError } = await supabase
        .from(PATIENTS_TABLE)
        .select('*')
        .eq('Hospital_ID', hospitalId)
        .order('Created_At', { ascending: false });

      if (patientError) throw patientError;

      const nextPatients = patientRows || [];
      setPatients(nextPatients);

      const userIds = Array.from(
        new Set(
          nextPatients
            .map((row) => Number(row.User_ID || 0))
            .filter((id) => Number.isFinite(id) && id > 0),
        ),
      );

      if (userIds.length === 0) {
        setPatientUsers([]);
        return;
      }

      const { data: linkedUsers, error: linkedUsersError } = await supabase
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
        .in('user_id', userIds);

      if (linkedUsersError) throw linkedUsersError;
      setPatientUsers(linkedUsers || []);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load patients.' });
    } finally {
      setIsLoadingPatients(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    resolveAssignedHospital();
  }, [resolveAssignedHospital]);

  useEffect(() => {
    if (!hospitalId) {
      setPatients([]);
      setPatientUsers([]);
      return;
    }

    fetchPatients();
  }, [hospitalId, fetchPatients]);

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

  const enrichedPatients = useMemo(() => {
    return patients.map((patient) => {
      const linkedUser = patientUsersById.get(Number(patient.User_ID || 0)) || null;
      const details = pickPreferredUserDetails(linkedUser?.user_details);

      const birthdateValue = getFirstPresentValue(details, ['birthdate', 'Birthdate']);
      const ageValue = computeAgeFromBirthdate(birthdateValue);
      const genderValue = normalizePatientGender(getFirstPresentValue(details, ['gender', 'Gender']));

      return {
        ...patient,
        fullName: getPatientFullName(linkedUser, patient),
        age: ageValue === '' ? 'N/A' : String(ageValue),
        gender: genderValue || 'N/A',
        pictureUrl: resolveAssetUrl(patient.Patient_Picture),
        documentUrl: resolveAssetUrl(patient.Medical_Document),
      };
    });
  }, [patients, patientUsersById, resolveAssetUrl]);

  const filteredPatients = useMemo(() => {
    const query = normalizeText(patientSearchTerm);
    if (!query) {
      return enrichedPatients;
    }

    return enrichedPatients.filter((patient) => {
      const searchableValues = [
        patient.fullName,
        patient.age,
        patient.gender,
        patient.Medical_Condition,
        patient.Patient_Code,
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean);

      return searchableValues.some((value) => value.includes(query));
    });
  }, [enrichedPatients, patientSearchTerm]);

  const resetForm = useCallback(() => {
    setForm({
      ...EMPTY_FORM,
      patientCode: buildRandomPatientCode(),
    });
    setPatientPictureFile(null);
    setMedicalDocumentFile(null);
  }, []);

  const handleInputChange = useCallback((event) => {
    const { name, value } = event.target;

    if (name === 'patientCode') {
      const normalizedCode = normalizePatientCodeInput(value);
      setForm((previous) => ({
        ...previous,
        patientCode: normalizedCode,
      }));
      return;
    }

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }, []);

  const generatePatientCode = useCallback(() => {
    setForm((previous) => ({
      ...previous,
      patientCode: buildRandomPatientCode(),
    }));
  }, []);

  const uploadAsset = useCallback(async (file, subFolder) => {
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
  }, []);

  const cleanupUploadedAssets = useCallback(async (paths) => {
    if (!supabase || !Array.isArray(paths) || paths.length === 0) {
      return;
    }

    try {
      await supabase.storage.from(PATIENT_ASSETS_BUCKET).remove(paths);
    } catch {
      // Ignore cleanup failures so main workflow error is still shown.
    }
  }, []);

  const resolveUniquePatientCode = useCallback(async (manualInputValue) => {
    const manualCode = normalizePatientCodeInput(manualInputValue);

    if (manualCode && manualCode !== 'PT') {
      if (!isValidPatientCode(manualCode)) {
        throw new Error('Patient code must follow PT plus 6 digits (example: PT123456).');
      }

      const { data: duplicateRow, error: duplicateError } = await supabase
        .from(PATIENTS_TABLE)
        .select('Patient_ID')
        .eq('Patient_Code', manualCode)
        .maybeSingle();

      if (duplicateError) throw duplicateError;

      if (duplicateRow) {
        throw new Error('Patient code already exists. Generate a new code and try again.');
      }

      return manualCode;
    }

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = buildRandomPatientCode();

      const { data: duplicateRow, error: duplicateError } = await supabase
        .from(PATIENTS_TABLE)
        .select('Patient_ID')
        .eq('Patient_Code', candidate)
        .maybeSingle();

      if (duplicateError) throw duplicateError;

      if (!duplicateRow) {
        return candidate;
      }
    }

    throw new Error('Unable to generate unique patient code right now. Please try again.');
  }, []);

  const signupPatientAuthAccount = useCallback(async ({
    email,
    temporaryPassword,
    patientCode,
    firstName,
    lastName,
  }) => {
    if (!signupClient) {
      throw new Error('Signup client is not configured.');
    }

    const emailRedirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/confirmation-complete`
      : undefined;

    const { data, error } = await signupClient.auth.signUp({
      email,
      password: temporaryPassword,
      options: {
        emailRedirectTo,
        data: {
          role: 'Patient',
          patient_code: patientCode,
          temporary_password: temporaryPassword,
          first_name: firstName,
          last_name: lastName,
        },
      },
    });

    if (error) {
      throw new Error(mapAuthSignupError(error.message));
    }

    return data?.user?.id || null;
  }, [signupClient]);

  const resolveOrCreatePublicUser = useCallback(async ({ email, authUserId }) => {
    let publicUserRow = null;

    if (authUserId) {
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('user_id,email,role,auth_user_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (error) throw error;
      publicUserRow = data || null;
    }

    if (!publicUserRow) {
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('user_id,email,role,auth_user_id')
        .eq('email', email)
        .maybeSingle();

      if (error) throw error;
      publicUserRow = data || null;
    }

    if (!publicUserRow) {
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .insert({
          auth_user_id: authUserId,
          email,
          role: 'Patient',
          is_active: true,
        })
        .select('user_id,email,role,auth_user_id')
        .maybeSingle();

      if (error) throw error;
      if (!data?.user_id) {
        throw new Error('Unable to create users record for this patient account.');
      }

      return data;
    }

    const updatePayload = {};
    if (!publicUserRow.auth_user_id && authUserId) {
      updatePayload.auth_user_id = authUserId;
    }

    if (normalizeText(publicUserRow.role) !== 'patient') {
      updatePayload.role = 'Patient';
    }

    if (Object.keys(updatePayload).length === 0) {
      return publicUserRow;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from(USERS_TABLE)
      .update(updatePayload)
      .eq('user_id', publicUserRow.user_id)
      .select('user_id,email,role,auth_user_id')
      .maybeSingle();

    if (updateError) throw updateError;

    return updatedRow || {
      ...publicUserRow,
      ...updatePayload,
    };
  }, []);

  const upsertPublicUserDetails = useCallback(async ({
    userId,
    firstName,
    middleName,
    lastName,
    suffix,
    birthdate,
    gender,
  }) => {
    const payload = {
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      suffix: suffix || null,
      birthdate,
      gender,
      updated_at: new Date().toISOString(),
    };

    const { data: existingDetailsRows, error: findError } = await supabase
      .from(USER_DETAILS_TABLE)
      .select('user_details_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (findError) throw findError;

    const existingDetails = Array.isArray(existingDetailsRows) && existingDetailsRows.length > 0
      ? existingDetailsRows[0]
      : null;

    if (!existingDetails) {
      const { error: insertError } = await supabase
        .from(USER_DETAILS_TABLE)
        .insert({
          user_id: userId,
          ...payload,
        });

      if (insertError) throw insertError;
      return;
    }

    const { error: updateError } = await supabase
      .from(USER_DETAILS_TABLE)
      .update(payload)
      .eq('user_details_id', existingDetails.user_details_id);

    if (updateError) throw updateError;
  }, []);

  const isUserAlreadyLinkedAsPatient = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from(PATIENTS_TABLE)
      .select('Patient_ID')
      .eq('User_ID', userId)
      .maybeSingle();

    if (error) throw error;
    return Boolean(data?.Patient_ID);
  }, []);

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

    const normalizedEmail = String(form.email || '').trim().toLowerCase();
    const normalizedFirstName = String(form.firstName || '').trim();
    const normalizedMiddleName = String(form.middleName || '').trim();
    const normalizedLastName = String(form.lastName || '').trim();
    const normalizedSuffix = String(form.suffix || '').trim();
    const normalizedBirthdate = String(form.birthdate || '').trim();
    const normalizedGender = normalizePatientGender(form.gender);

    if (!normalizedEmail) {
      setNotice({ kind: 'error', text: 'Patient email is required for confirm-signup.' });
      return;
    }

    if (!normalizedFirstName || !normalizedLastName) {
      setNotice({ kind: 'error', text: 'First name and last name are required.' });
      return;
    }

    if (!normalizedBirthdate) {
      setNotice({ kind: 'error', text: 'Birthdate is required to compute age.' });
      return;
    }

    if (!normalizedGender) {
      setNotice({ kind: 'error', text: 'Gender is required.' });
      return;
    }

    const uploadedPaths = [];
    let authAccountCreated = false;

    try {
      setIsSaving(true);
      setNotice({ kind: '', text: '' });

      const patientCode = await resolveUniquePatientCode(form.patientCode);
      const temporaryPassword = generateTemporaryPassword();

      const authUserId = await signupPatientAuthAccount({
        email: normalizedEmail,
        temporaryPassword,
        patientCode,
        firstName: normalizedFirstName,
        lastName: normalizedLastName,
      });

      authAccountCreated = Boolean(authUserId);

      const publicUserRow = await resolveOrCreatePublicUser({
        email: normalizedEmail,
        authUserId,
      });

      const publicUserId = Number(publicUserRow?.user_id || 0);
      if (!publicUserId) {
        throw new Error('Unable to resolve newly created users record.');
      }

      const alreadyLinked = await isUserAlreadyLinkedAsPatient(publicUserId);
      if (alreadyLinked) {
        throw new Error('This user is already linked to another patient record.');
      }

      await upsertPublicUserDetails({
        userId: publicUserId,
        firstName: normalizedFirstName,
        middleName: normalizedMiddleName,
        lastName: normalizedLastName,
        suffix: normalizedSuffix,
        birthdate: normalizedBirthdate,
        gender: normalizedGender,
      });

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

      const patientPayload = {
        User_ID: publicUserId,
        Hospital_ID: Number(hospitalId),
        Patient_Code: patientCode,
        Date_of_Diagnosis: String(form.dateOfDiagnosis || '').trim() || null,
        Guardian: String(form.guardian || '').trim() || null,
        Guardian_Contact_Number: String(form.guardianContactNumber || '').trim() || null,
        Guardian_Relationship: String(form.guardianRelationship || '').trim() || null,
        Medical_Condition: String(form.medicalCondition || '').trim() || null,
        Patient_Picture: patientPicturePath || null,
        Medical_Document: medicalDocumentPath || null,
      };

      const { error: patientInsertError } = await supabase
        .from(PATIENTS_TABLE)
        .insert(patientPayload);

      if (patientInsertError) {
        throw new Error(mapPatientInsertError(patientInsertError.message));
      }

      resetForm();
      setNotice({ kind: '', text: '' });
      setSuccessPopup({
        open: true,
        text: 'Task done. Confirmation email was sent.',
      });

      await fetchPatients();
    } catch (error) {
      await cleanupUploadedAssets(uploadedPaths);

      const message = String(error?.message || 'Unable to create patient account and record.');
      const fallback = mapPatientInsertError(message);
      const suffix = authAccountCreated
        ? ' Auth account may already exist for this email. Check users and auth records before retrying.'
        : '';

      setNotice({ kind: 'error', text: `${fallback}${suffix}`.trim() });
    } finally {
      setIsSaving(false);
    }
  };

  const refreshPageData = async () => {
    await resolveAssignedHospital();
    await fetchPatients();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manage Patients</h1>
          <p className="mt-1 text-sm text-gray-600">
            Create patient account, user details, and patient record in one flow with confirm-signup email delivery.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshPageData}
          disabled={isResolvingHospital || isLoadingPatients || isSaving}
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
            <h2 className="text-base font-semibold text-gray-900">H-Representative Assignment</h2>
            <p className="mt-1 text-xs text-gray-500">Hospital assignment is automatically resolved from Hospital_Representative.</p>
          </div>
          <div className="text-xs text-gray-600">
            {isResolvingHospital ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 size={13} className="animate-spin" /> Resolving hospital...
              </span>
            ) : hospitalId ? (
              <span>
                Hospital: <span className="font-semibold text-gray-800">{hospitalName || `Hospital #${hospitalId}`}</span> (ID: {hospitalId})
              </span>
            ) : (
              <span className="font-medium text-red-700">No hospital assignment found</span>
            )}
          </div>
        </div>
      </section>

      {notice.kind === 'error' && notice.text && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <AlertTriangle size={16} />
          <span>{notice.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Existing Patients</h2>
              <p className="mt-1 text-xs text-gray-500">Showing full name, age, and gender from users and user_details.</p>
            </div>
            <p className="text-xs text-gray-500">Showing {filteredPatients.length} of {enrichedPatients.length}</p>
          </div>

          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={patientSearchTerm}
              onChange={(event) => setPatientSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2"
              style={{ '--tw-ring-color': theme.primaryColor }}
              placeholder="Search by name, age, gender, medical condition, or PT code"
            />
          </div>

          {isLoadingPatients ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-700">
              <Loader2 className="animate-spin" size={18} /> Loading patients...
            </div>
          ) : filteredPatients.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">
              No patients matched your current filter.
            </div>
          ) : (
            <div className="max-h-[650px] overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-[1] text-sm" style={{ backgroundColor: `${theme.primaryColor}20`, color: theme.primaryTextColor || '#111827' }}>
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Patient Full Name</th>
                    <th className="px-4 py-3 text-left font-semibold">Age</th>
                    <th className="px-4 py-3 text-left font-semibold">Gender</th>
                    <th className="px-4 py-3 text-left font-semibold">Medical Condition</th>
                    <th className="px-4 py-3 text-left font-semibold">Assets</th>
                    <th className="px-4 py-3 text-left font-semibold">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => (
                    <tr key={patient.Patient_ID} className="border-t border-gray-200 align-top">
                      <td className="px-4 py-3 text-gray-800">{patient.fullName}</td>
                      <td className="px-4 py-3 text-gray-700">{patient.age}</td>
                      <td className="px-4 py-3 text-gray-700">{patient.gender}</td>
                      <td className="max-w-xs break-words px-4 py-3 text-gray-700">{patient.Medical_Condition || 'N/A'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex flex-col gap-1">
                          {patient.Patient_Picture ? (
                            patient.pictureUrl ? (
                              <a href={patient.pictureUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">
                                View Picture
                              </a>
                            ) : (
                              <span className="break-all text-xs text-gray-500">{patient.Patient_Picture}</span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">No picture</span>
                          )}

                          {patient.Medical_Document ? (
                            patient.documentUrl ? (
                              <a href={patient.documentUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-blue-700 hover:underline">
                                View Document
                              </a>
                            ) : (
                              <span className="break-all text-xs text-gray-500">{patient.Medical_Document}</span>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">No document</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(patient.Created_At)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Create Patient Account And Record</h2>
            <p className="mt-1 text-xs text-gray-500">This will create auth signup, users, user_details, and patients records in one submit.</p>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-xs font-semibold text-gray-800">Quick Guide</p>
            <p className="mt-1 text-xs text-gray-600">1) Enter email and profile details. 2) Confirm PT code format (PT + 6 digits). 3) Submit to send confirm-signup email with PT code and temporary password.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" style={{ '--tw-ring-color': theme.primaryColor }}>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Account Setup</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Patient Email (required)</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="patient@example.com"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Patient Code (PT + 6 digits)</label>
                  <div className="flex gap-2">
                    <input
                      name="patientCode"
                      value={form.patientCode}
                      onChange={handleInputChange}
                      maxLength={8}
                      required
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 uppercase outline-none focus:ring-2"
                      placeholder="PT123456"
                    />
                    <button
                      type="button"
                      onClick={generatePatientCode}
                      className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Auto
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">Temporary password is generated automatically during save.</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Identity Details</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">First Name (required)</label>
                  <input
                    name="firstName"
                    value={form.firstName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="First name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Middle Name</label>
                  <input
                    name="middleName"
                    value={form.middleName}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="Middle name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Last Name (required)</label>
                  <input
                    name="lastName"
                    value={form.lastName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="Last name"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Suffix</label>
                  <input
                    name="suffix"
                    value={form.suffix}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="Jr, Sr, III"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Birthdate (required)</label>
                  <input
                    type="date"
                    name="birthdate"
                    value={form.birthdate}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Gender (required)</label>
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                  >
                    <option value="">Select gender</option>
                    {GENDER_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                Computed Age Preview: <span className="font-semibold text-gray-900">{computedAgeFromForm || 'N/A'}</span>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Clinical Details</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Date of Diagnosis</label>
                  <input
                    name="dateOfDiagnosis"
                    value={form.dateOfDiagnosis}
                    onChange={handleInputChange}
                    type="date"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Guardian</label>
                  <input
                    name="guardian"
                    value={form.guardian}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="Guardian full name"
                  />
                </div>

                <div className="flex items-end">
                  <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    Hospital ID for save: <span className="font-semibold text-gray-800">{hospitalId || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Guardian Contact Number</label>
                  <input
                    name="guardianContactNumber"
                    value={form.guardianContactNumber}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="e.g., +63 912 345 6789"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Guardian Relationship</label>
                  <input
                    name="guardianRelationship"
                    value={form.guardianRelationship}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                    placeholder="e.g., Mother"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Medical Condition</label>
                <textarea
                  name="medicalCondition"
                  value={form.medicalCondition}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2"
                  placeholder="Medical condition summary"
                />
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Patient Picture</label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 hover:bg-gray-100">
                    <UploadCloud size={15} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Choose image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setPatientPictureFile(event.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1 break-all text-xs text-gray-500">{patientPictureFile?.name || 'No file selected.'}</p>

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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Medical Document</label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 hover:bg-gray-100">
                    <FileText size={15} className="text-gray-600" />
                    <span className="text-sm text-gray-700">Choose file (PDF/image)</span>
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(event) => setMedicalDocumentFile(event.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                  <p className="mt-1 break-all text-xs text-gray-500">{medicalDocumentFile?.name || 'No file selected.'}</p>

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
                {isSaving ? 'Saving...' : 'Create Patient Account'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {successPopup.open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-4">
          <button
            type="button"
            aria-label="Close success popup"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setSuccessPopup({ open: false, text: '' })}
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="Patient account creation success"
            className="relative w-full max-w-md rounded-2xl border border-emerald-100 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-700">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Task Completed</h3>
                <p className="mt-1 text-sm text-gray-700">{successPopup.text}</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setSuccessPopup({ open: false, text: '' })}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: theme.primaryColor }}
              >
                OK
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
