import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Loader2, MailCheck, Search, ShieldCheck, UploadCloud } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import maplibregl from 'maplibre-gl';
import { useTheme } from '../../../context/ThemeContext';
import { supabase } from '../../../lib/supabaseClient';
import organizationAddressOptions from '../../../data/organizationAddressOptions.json';
import { TransitionFlipEntrance } from '../../../components/transitions/TransitionFlip';
import 'maplibre-gl/dist/maplibre-gl.css';

const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const ORGANIZATIONS_TABLE = 'Organizations';
const HOSPITALS_TABLE = 'Hospitals';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const ORGANIZATION_LOGOS_BUCKET = 'organization_logos';
const HOSPITAL_LOGOS_BUCKET = 'hospital_logos';
const MAX_LOGO_FILE_SIZE_BYTES = 5 * 1024 * 1024;
let isolatedAuthClient = null;
const DEFAULT_MAP_CENTER = { lat: 14.5995, lng: 120.9842 };
const MAP_SATELLITE_STYLE = {
  version: 8,
  sources: {
    esriSatellite: {
      type: 'raster',
      tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles © Esri',
    },
  },
  layers: [
    {
      id: 'esriSatelliteLayer',
      type: 'raster',
      source: 'esriSatellite',
    },
  ],
};
const MAP_STREET_STYLE = {
  version: 8,
  sources: {
    openStreetMap: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'openStreetMapLayer',
      type: 'raster',
      source: 'openStreetMap',
    },
  ],
};

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
const APPLICATION_TYPE_OPTIONS = [
  { id: 'organization', label: 'Apply as Organization' },
  { id: 'partner_hospital', label: 'Apply as Partner Hospital' },
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
  applicationType: '',
  organizationName: '',
  hospitalName: '',
  organizationType: '',
  contactNumber: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  country: DEFAULT_COUNTRY,
  latitude: '',
  longitude: '',
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

function normalizeApplicationType(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'partner_hospital' || normalized === 'partnerhospital' || normalized === 'hospital') {
    return 'partner_hospital';
  }
  if (normalized === 'organization' || normalized === 'org') {
    return 'organization';
  }
  return '';
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

function formatPhilippineMobileWithCountry(value = '') {
  const localNumber = formatPhilippineMobile(value);
  return localNumber ? `+63 ${localNumber}` : '+63 ';
}

function toStoredPhoneNumber(value = '') {
  const digits = normalizePhilippineMobile(value);
  return digits.length === 10 ? `+63${digits}` : '';
}

function toCoordinateOrNull(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStorageUploadError(rawMessage, bucketId = ORGANIZATION_LOGOS_BUCKET) {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('bucket') && lower.includes('not found')) {
    if (bucketId === HOSPITAL_LOGOS_BUCKET) {
      return 'Hospital logo bucket is missing. Run migration 010_hospital_logos_storage_policies.sql and retry.';
    }
    return 'Organization logo bucket is missing. Run migration 025_organization_logos_storage_policies.sql and retry.';
  }

  if (lower.includes('row-level security')) {
    if (bucketId === HOSPITAL_LOGOS_BUCKET) {
      return 'Hospital logo upload blocked by Storage RLS policy. Run migration 054_force_open_application_logos_policies.sql in Supabase SQL Editor and retry. If still blocked, a leftover restrictive policy may exist — check pg_policies output.';
    }
    return 'Organization logo upload blocked by Storage RLS policy. Run migration 054_force_open_application_logos_policies.sql in Supabase SQL Editor and retry. If still blocked, a leftover restrictive policy may exist — check pg_policies output.';
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

function LocationPinPicker({ latitude, longitude, onChange }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const initialLatitudeRef = useRef(latitude);
  const initialLongitudeRef = useRef(longitude);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState('');
  const [mapView, setMapView] = useState('satellite');

  const updateMarkerAndLocation = useCallback((nextLat, nextLng, options = {}) => {
    const map = mapRef.current;
    if (!map || !Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      return;
    }

    const target = [Number(nextLng), Number(nextLat)];
    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({ color: '#b91c1c' })
        .setLngLat(target)
        .addTo(map);
    } else {
      markerRef.current.setLngLat(target);
    }

    map.flyTo({
      center: target,
      zoom: Number.isFinite(options.zoom) ? options.zoom : Math.max(map.getZoom(), 13),
      essential: true,
    });

    if (options.notify !== false) {
      onChangeRef.current(Number(nextLat), Number(nextLng));
    }
  }, []);

  const onSelectSearchResult = useCallback((result) => {
    const nextLat = Number(result?.lat);
    const nextLng = Number(result?.lon);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      return;
    }
    updateMarkerAndLocation(nextLat, nextLng, { notify: true, zoom: 15 });
    setSelectedPlaceLabel(String(result?.display_name || '').trim());
    setSearchError('');
  }, [updateMarkerAndLocation]);

  const runLocationSearch = async () => {
    const query = String(searchQuery || '').trim();
    if (!query) {
      setSearchError('Enter a location to search.');
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    setSearchError('');

    try {
      const endpoint = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&countrycodes=ph&q=${encodeURIComponent(query)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Search request failed.');
      }

      const resultRows = await response.json();
      const normalizedResults = Array.isArray(resultRows)
        ? resultRows.filter((row) => Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lon)))
        : [];

      setSearchResults(normalizedResults);

      if (normalizedResults.length === 0) {
        setSearchError('No matching location found. Try a more specific place name.');
        return;
      }

      onSelectSearchResult(normalizedResults[0]);
    } catch (error) {
      setSearchError(String(error?.message || 'Unable to search location right now. Please try again.'));
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return undefined;
    }

    const initialLat = Number.isFinite(initialLatitudeRef.current) ? initialLatitudeRef.current : DEFAULT_MAP_CENTER.lat;
    const initialLng = Number.isFinite(initialLongitudeRef.current) ? initialLongitudeRef.current : DEFAULT_MAP_CENTER.lng;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_SATELLITE_STYLE,
      center: [initialLng, initialLat],
      zoom: Number.isFinite(initialLatitudeRef.current) && Number.isFinite(initialLongitudeRef.current) ? 13 : 5,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    if (Number.isFinite(initialLatitudeRef.current) && Number.isFinite(initialLongitudeRef.current)) {
      markerRef.current = new maplibregl.Marker({ color: '#b91c1c' })
        .setLngLat([initialLongitudeRef.current, initialLatitudeRef.current])
        .addTo(map);
    }

    map.on('click', (event) => {
      const nextLng = Number(event.lngLat.lng.toFixed(7));
      const nextLat = Number(event.lngLat.lat.toFixed(7));

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: '#b91c1c' });
      }
      updateMarkerAndLocation(nextLat, nextLng, { notify: true, zoom: 15 });
      setSelectedPlaceLabel('');
    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [updateMarkerAndLocation]);

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }
    updateMarkerAndLocation(latitude, longitude, { notify: false });
  }, [latitude, longitude, updateMarkerAndLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const nextStyle = mapView === 'street' ? MAP_STREET_STYLE : MAP_SATELLITE_STYLE;
    map.setStyle(nextStyle);
  }, [mapView]);

  return (
    <div className="space-y-3 overflow-hidden rounded-xl border border-slate-300 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">Map View</p>
        <div className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setMapView('satellite')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mapView === 'satellite' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setMapView('street')}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${mapView === 'street' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Street
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700">Search location and pin automatically</label>
        <div className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                runLocationSearch();
              }
            }}
            placeholder="Search address, barangay, city, or hospital"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
          />
          <button
            type="button"
            onClick={runLocationSearch}
            disabled={isSearching}
            className="inline-flex min-w-24 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {isSearching ? 'Finding' : 'Search'}
          </button>
        </div>
      </div>

      {searchError ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{searchError}</p>
      ) : null}

      {selectedPlaceLabel ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Selected: {selectedPlaceLabel}
        </p>
      ) : null}

      {searchResults.length > 1 ? (
        <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50">
          {searchResults.slice(0, 6).map((result) => (
            <button
              key={`${result.place_id}-${result.lat}-${result.lon}`}
              type="button"
              onClick={() => onSelectSearchResult(result)}
              className="w-full border-b border-slate-200 px-3 py-2 text-left text-xs text-slate-700 last:border-b-0 hover:bg-slate-100"
            >
              {result.display_name}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={mapContainerRef} className="h-72 w-full" />
    </div>
  );
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
    || message.includes("Could not find the table 'public.Hospitals'")
  ) {
    return 'Application tables are not ready yet. Run the latest organization/hospital migrations, then refresh the app.';
  }

  if (
    (lower.includes('column') && lower.includes('hospitals') && lower.includes('does not exist'))
    || lower.includes('is_approved')
    || lower.includes('approval_status')
    || lower.includes('approved_by')
    || lower.includes('approved_at')
    || lower.includes('review_notes')
    || lower.includes('province')
    || lower.includes('latitude')
    || lower.includes('longitude')
  ) {
    return 'Hospitals schema is missing required application columns. Run migrations 048_alter_hospitals_application_columns.sql and 049_add_hospitals_province_column.sql, then refresh.';
  }

  if (lower.includes('bucket') && lower.includes('organization_logos')) {
    return 'Organization logo bucket is missing or blocked. Run migration 054_force_open_application_logos_policies.sql, then refresh the app.';
  }
  if (lower.includes('bucket') && lower.includes('hospital_logos')) {
    return 'Hospital logo bucket is missing or blocked. Run migration 054_force_open_application_logos_policies.sql, then refresh the app.';
  }

  if (lower.includes('storage') || lower.includes('row-level security')) {
    const inferredBucket = lower.includes('hospital_logos') ? HOSPITAL_LOGOS_BUCKET : ORGANIZATION_LOGOS_BUCKET;
    return mapStorageUploadError(message, inferredBucket);
  }

  if (lower.includes('no unique or exclusion constraint matching the on conflict specification')) {
    return 'Your database is missing a required unique constraint from old migrations. The form now avoids conflict-based upserts, so please refresh and submit again.';
  }

  return message;
}

async function uploadApplicationLogo(file, entityName, bucketId = ORGANIZATION_LOGOS_BUCKET) {
  if (!supabase) {
    throw new Error('Supabase is not configured for file upload.');
  }

  const safeName = toSafeFileName(file?.name || 'organization-logo.png');
  const slug = toSlug(entityName) || 'application';
  const filePath = `applications/${slug}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucketId)
    .upload(filePath, file, {
      upsert: false,
      contentType: file?.type || 'image/png',
    });

  if (uploadError) {
    throw new Error(mapStorageUploadError(uploadError.message, bucketId));
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucketId)
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
  const [submittedApplicationType, setSubmittedApplicationType] = useState('');
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

  const applicationType = useMemo(() => normalizeApplicationType(form.applicationType), [form.applicationType]);
  const isOrganizationApplication = applicationType === 'organization';
  const isHospitalApplication = applicationType === 'partner_hospital';

  const selectedLatitude = useMemo(() => toCoordinateOrNull(form.latitude), [form.latitude]);
  const selectedLongitude = useMemo(() => toCoordinateOrNull(form.longitude), [form.longitude]);

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
      && selectedLatitude !== null
      && selectedLongitude !== null
    );
  }, [
    form.organizationName,
    form.organizationType,
    form.contactNumber,
    form.street,
    form.city,
    form.province,
    form.region,
    form.country,
    selectedLatitude,
    selectedLongitude,
  ]);

  const hasHospitalRequiredFields = useMemo(() => {
    return (
      form.hospitalName.trim()
      && normalizePhilippineMobile(form.contactNumber).length === 10
      && form.street.trim()
      && form.city.trim()
      && form.province.trim()
      && form.region.trim()
      && form.country.trim()
      && selectedLatitude !== null
      && selectedLongitude !== null
    );
  }, [
    form.hospitalName,
    form.contactNumber,
    form.street,
    form.city,
    form.province,
    form.region,
    form.country,
    selectedLatitude,
    selectedLongitude,
  ]);

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

  const hasEntityRequiredFields = useMemo(() => {
    if (isHospitalApplication) {
      return hasHospitalRequiredFields;
    }
    if (isOrganizationApplication) {
      return hasOrganizationRequiredFields;
    }
    return false;
  }, [hasHospitalRequiredFields, hasOrganizationRequiredFields, isHospitalApplication, isOrganizationApplication]);

  const hasRequiredFields = hasEntityRequiredFields && hasLeadRequiredFields;

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

  const onApplicationTypeChange = (event) => {
    const nextType = normalizeApplicationType(event.target.value);
    setErrorMessage('');
    setSuccessMessage('');
    setOtpCode('');
    setOtpNotice({ type: '', message: '' });
    setOtpVerifiedEmail('');
    setOtpVerifiedAuthUserId('');
    setOtpCooldownSeconds(0);
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setLogoPreviewUrl('');
    setLogoFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
    setForm((prev) => ({
      ...prev,
      applicationType: nextType,
      organizationName: '',
      hospitalName: '',
      organizationType: '',
      contactNumber: '',
      street: '',
      barangay: '',
      city: '',
      province: '',
      region: '',
      country: DEFAULT_COUNTRY,
      latitude: '',
      longitude: '',
    }));
  };

  const onLocationPinChange = (nextLat, nextLng) => {
    setForm((prev) => ({
      ...prev,
      latitude: Number(nextLat).toFixed(7),
      longitude: Number(nextLng).toFixed(7),
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

  const goToDetailsPage = () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!applicationType) {
      setErrorMessage('Please choose an application type before continuing.');
      return;
    }
    setActivePage(2);
  };

  const goToLeadPage = () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!hasEntityRequiredFields) {
      setErrorMessage(
        isHospitalApplication
          ? 'Please complete all partner hospital information, including map pin and valid contact number, before continuing.'
          : 'Please complete all organization information, including map pin and valid contact number, before continuing.'
      );
      return;
    }

    setActivePage(3);
  };

  const goToSelectionPage = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setActivePage(1);
  };

  const goToDetailsFromLeadPage = () => {
    setErrorMessage('');
    setSuccessMessage('');
    setActivePage(2);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (activePage === 1) {
      goToDetailsPage();
      return;
    }

    if (activePage === 2) {
      goToLeadPage();
      return;
    }

    if (!applicationType) {
      setErrorMessage('Please choose if you are applying as Organization or Partner Hospital.');
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
    const hospitalName = form.hospitalName.trim();
    const entityName = isHospitalApplication ? hospitalName : organizationName;
    const entityContactNumber = toStoredPhoneNumber(form.contactNumber);
    const leadContactNumber = toStoredPhoneNumber(form.leadContactNumber);
    const selectedLat = toCoordinateOrNull(form.latitude);
    const selectedLng = toCoordinateOrNull(form.longitude);

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
      const allowedExistingRole = !existingRole
        || ['user', 'organization', 'partner', 'hospital', 'partnerhospital'].includes(existingRole);

      if (existingUser && !allowedExistingRole) {
        throw new Error('This email is linked to a restricted account role. Use a different email for this application lead.');
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
        throw new Error('Unable to resolve local user profile for the applicant.');
      }

      if (isOrganizationApplication) {
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
        const logoBucketId = isHospitalApplication ? HOSPITAL_LOGOS_BUCKET : ORGANIZATION_LOGOS_BUCKET;
        const uploadResult = await uploadApplicationLogo(logoFile, entityName, logoBucketId);
        organizationLogoUrl = uploadResult.publicUrl;
      }

      if (isOrganizationApplication) {
        const createOrganizationResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .insert({
            Organization_Name: organizationName,
            Organization_Type: form.organizationType.trim(),
            Contact_Number: entityContactNumber,
            Organization_Logo_URL: organizationLogoUrl || null,
            Street: form.street.trim(),
            Barangay: form.barangay.trim() || null,
            City: form.city.trim(),
            Province: form.province.trim(),
            Region: form.region.trim(),
            Country: form.country.trim(),
            Latitude: selectedLat,
            Longitude: selectedLng,
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
      } else {
        const createHospitalResult = await supabase
          .from(HOSPITALS_TABLE)
          .insert({
            Hospital_Name: hospitalName,
            Hospital_Logo: organizationLogoUrl || null,
            Contact_Number: entityContactNumber,
            Street: form.street.trim(),
            Barangay: form.barangay.trim() || null,
            City: form.city.trim(),
            Province: form.province.trim(),
            Region: form.region.trim(),
            Country: form.country.trim(),
            Latitude: selectedLat,
            Longitude: selectedLng,
            Is_Approved: false,
            Approval_Status: 'Pending',
            Approved_By: null,
            Approved_At: null,
            Review_Notes: null,
            Updated_At: nowIso,
          })
          .select('Hospital_ID')
          .maybeSingle();

        if (createHospitalResult.error) {
          throw new Error(createHospitalResult.error.message);
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
        isHospitalApplication
          ? 'Application submitted successfully. Your partner hospital application is now pending Super Admin review.'
          : 'Application submitted successfully. Your organization is now pending Super Admin review.'
      );
      setSubmittedOrganizationName(entityName);
      setSubmittedApplicationType(applicationType);
      setIsSubmissionComplete(true);
    } catch (error) {
      setErrorMessage(
        mapOrganizationSchemaError(error?.message)
        || 'Unable to submit application.'
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
  const entityDisplayName = isHospitalApplication ? 'Partner Hospital' : 'Organization';
  const formTitle = isHospitalApplication
    ? 'Submit Partner Hospital Application'
    : isOrganizationApplication
      ? 'Submit Organization Application'
      : 'Submit Application';
  const stepLabel = activePage === 1
    ? 'Application Type'
    : activePage === 2
      ? `${entityDisplayName} Information`
      : 'Lead Account and Verification';

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
                    {submittedApplicationType === 'partner_hospital' ? 'Partner Hospital Application Submitted' : 'Organization Application Submitted'}
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
                <p className="mt-1">{successMessage || (submittedApplicationType === 'partner_hospital'
                  ? 'Application submitted successfully. Your partner hospital application is now pending Super Admin review.'
                  : 'Application submitted successfully. Your organization is now pending Super Admin review.')}</p>
              </div>

              <div className="rounded-lg border bg-slate-50 px-4 py-3 text-sm" style={{ borderColor: `${secondaryColor}33`, color: secondaryTextColor }}>
                Please wait for the email update to know if your application is accepted or rejected.
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
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>Application Onboarding</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl" style={{ color: primaryTextColor }}>
                  {formTitle}
                </h1>
                <p className="mt-2 max-w-2xl text-sm md:text-base" style={{ color: secondaryTextColor }}>
                  Step 1: choose application type. Step 2: complete details with map pin. Step 3: verify lead email with a 6-digit OTP before submitting.
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
              <span>Page {activePage} of 3</span>
              <span>{stepLabel}</span>
            </div>

            {activePage === 1 ? (
              <fieldset className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
                <legend className="px-2 text-sm font-bold" style={{ color: primaryTextColor }}>Application Type</legend>
                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold" style={{ borderColor: `${secondaryColor}22`, color: secondaryTextColor }}>
                  Choose what you are applying for first. Fields in the next step will change based on this selection.
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {APPLICATION_TYPE_OPTIONS.map((option) => {
                    const isSelected = applicationType === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onApplicationTypeChange({ target: { value: option.id } })}
                        className="rounded-xl border bg-white px-4 py-4 text-left transition"
                        style={{
                          borderColor: isSelected ? primaryColor : `${secondaryColor}44`,
                          backgroundColor: isSelected ? `${primaryColor}12` : '#ffffff',
                        }}
                      >
                        <p className="text-sm font-bold" style={{ color: isSelected ? primaryColor : primaryTextColor }}>
                          {option.label}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: secondaryTextColor }}>
                          {option.id === 'organization'
                            ? 'Use this if you are applying as an organization.'
                            : 'Use this if you are applying as a partner hospital.'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {activePage === 2 ? (
              <fieldset className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
                <legend className="px-2 text-sm font-bold" style={{ color: primaryTextColor }}>{entityDisplayName} Information</legend>
                <div className="rounded-xl border bg-slate-50 px-3 py-2 text-xs font-semibold" style={{ borderColor: `${secondaryColor}22`, color: secondaryTextColor }}>
                  {isHospitalApplication
                    ? 'Provide partner hospital details, contact info, full address, and exact map pin.'
                    : 'Provide organization details, contact info, full address, and exact map pin.'}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {isHospitalApplication ? (
                    <label className="space-y-1 text-sm md:col-span-2">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Hospital Name *</span>
                      <input
                        value={form.hospitalName}
                        onChange={updateField('hospitalName')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Example: StrandShare Medical Center"
                        required
                      />
                    </label>
                  ) : (
                    <>
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
                    </>
                  )}

                  <label className="space-y-1 text-sm">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>Contact Number *</span>
                    <input
                      type="tel"
                      value={formatPhilippineMobileWithCountry(form.contactNumber)}
                      onChange={onContactNumberChange('contactNumber')}
                      className={fieldClassName}
                      style={fieldStyle}
                      inputMode="numeric"
                      placeholder="+63 912 345 6789"
                      required
                    />
                    <p className="text-[11px]" style={{ color: secondaryTextColor }}>Format only: +63 912 345 6789</p>
                  </label>

                  <label className="space-y-2 text-sm md:col-span-2">
                    <span className="font-semibold" style={{ color: secondaryTextColor }}>
                      {isHospitalApplication ? 'Hospital Logo (Upload Image)' : 'Organization Logo (Upload Image)'}
                    </span>
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

                <div className="space-y-3">
                  <p className="text-sm font-semibold" style={{ color: secondaryTextColor }}>Exact Location Pin *</p>
                  <LocationPinPicker
                    latitude={selectedLatitude}
                    longitude={selectedLongitude}
                    onChange={onLocationPinChange}
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Latitude *</span>
                      <input
                        value={form.latitude}
                        onChange={updateField('latitude')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Auto-filled from map pin"
                        readOnly
                        required
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="font-semibold" style={{ color: secondaryTextColor }}>Longitude *</span>
                      <input
                        value={form.longitude}
                        onChange={updateField('longitude')}
                        className={fieldClassName}
                        style={fieldStyle}
                        placeholder="Auto-filled from map pin"
                        readOnly
                        required
                      />
                    </label>
                  </div>
                </div>
              </fieldset>
            ) : null}

            {activePage === 3 ? (
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
                      <input
                        type="tel"
                        value={formatPhilippineMobileWithCountry(form.leadContactNumber)}
                        onChange={onContactNumberChange('leadContactNumber')}
                        className={fieldClassName}
                        style={fieldStyle}
                        inputMode="numeric"
                        placeholder="+63 912 345 6789"
                        required
                      />
                      <p className="text-[11px]" style={{ color: secondaryTextColor }}>Format only: +63 912 345 6789</p>
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
            ) : null}

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
                  onClick={goToDetailsPage}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  Next: {applicationType ? `${entityDisplayName} Details` : 'Select Type'}
                </button>
              </div>
            ) : null}

            {activePage === 2 ? (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goToSelectionPage}
                  className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
                  style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
                >
                  Back
                </button>
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
                  By submitting, you confirm your details are accurate. Your {isHospitalApplication ? 'partner hospital' : 'organization'} profile will remain pending until Super Admin review.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToDetailsFromLeadPage}
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
