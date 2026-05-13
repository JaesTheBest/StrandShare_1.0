import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const UI_SETTINGS_TABLE = 'UI_Settings';
const DONATION_REQUIREMENTS_TABLE = 'Donation_Requirements';

const DEFAULT_FORM = {
  minimumNumberDonor: '',
  minimumHairLength: '',
  chemicalTreatmentStatus: false,
  coloredHairStatus: false,
  bleachedHairStatus: false,
  rebondedHairStatus: false,
  hairTextureStatus: '',
  notes: '',
};

function normalizeRoleKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load donation requirements.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security')) {
    return 'Viewing donation requirements is blocked by database policy. Please verify role permissions.';
  }

  if (lowerMessage.includes('relation') && lowerMessage.includes('donation_requirements') && lowerMessage.includes('does not exist')) {
    return 'Donation_Requirements table is missing. Run the latest Supabase migration, then refresh.';
  }

  return message;
}

function mapSaveError(rawMessage) {
  const message = String(rawMessage || 'Unable to save donation requirements.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security')) {
    return 'Saving donation requirements is blocked by database policy. Only Super Admin and Staff can modify this page.';
  }

  if (lowerMessage.includes('relation') && lowerMessage.includes('donation_requirements') && lowerMessage.includes('does not exist')) {
    return 'Donation_Requirements table is missing. Run the latest Supabase migration, then refresh.';
  }

  return message;
}

function toNumberOrNull(value, { integer = false } = {}) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (integer) {
    return Math.trunc(parsed);
  }

  return parsed;
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

export default function ManageDonationRequirementsPage({ userProfile }) {
  const { theme } = useTheme();

  const [uiSettings, setUiSettings] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [recordId, setRecordId] = useState(null);
  const [updatedAt, setUpdatedAt] = useState('');
  const [updatedBy, setUpdatedBy] = useState(null);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const roleKey = normalizeRoleKey(userProfile?.role);
  const canManage = roleKey === 'superadmin' || roleKey === 'staff';

  const primaryColor = uiSettings?.Primary_Color || theme.primaryColor || '#0f766e';
  const secondaryColor = uiSettings?.Secondary_Color || theme.secondaryColor || '#64748b';
  const backgroundColor = uiSettings?.Background_Color || theme.backgroundColor || '#f8fafc';
  const primaryTextColor = uiSettings?.Primary_Text_Color || theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = uiSettings?.Secondary_Text_Color || theme.secondaryTextColor || '#334155';
  const headingFont = uiSettings?.Secondary_Font_Family || theme.secondaryFontFamily || theme.fontFamily || 'Poppins';
  const bodyFont = uiSettings?.Font_Family || theme.fontFamily || 'Poppins';

  const rootStyle = {
    color: primaryTextColor,
    fontFamily: `${bodyFont}, sans-serif`,
  };

  const hydrateFormFromRow = useCallback((row) => {
    if (!row) {
      setForm(DEFAULT_FORM);
      setRecordId(null);
      setUpdatedAt('');
      setUpdatedBy(null);
      return;
    }

    setForm({
      minimumNumberDonor:
        row.Minimum_Number_Donor === null || row.Minimum_Number_Donor === undefined
          ? ''
          : String(row.Minimum_Number_Donor),
      minimumHairLength:
        row.Minimum_Hair_Length === null || row.Minimum_Hair_Length === undefined
          ? ''
          : String(row.Minimum_Hair_Length),
      chemicalTreatmentStatus: Boolean(row.Chemical_Treatment_Status),
      coloredHairStatus: Boolean(row.Colored_Hair_Status),
      bleachedHairStatus: Boolean(row.Bleached_Hair_Status),
      rebondedHairStatus: Boolean(row.Rebonded_Hair_Status),
      hairTextureStatus: String(row.Hair_Texture_Status || ''),
      notes: String(row.Notes || ''),
    });

    setRecordId(Number(row.Donation_Requirement_ID || 0) || null);
    setUpdatedAt(String(row.Updated_At || ''));
    setUpdatedBy(Number(row.Updated_By || 0) || null);
  }, []);

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

  const loadDonationRequirements = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      hydrateFormFromRow(null);
      return;
    }

    try {
      setIsLoading(true);
      setNotice({ kind: '', text: '' });

      const { data, error } = await supabase
        .from(DONATION_REQUIREMENTS_TABLE)
        .select('*')
        .order('Donation_Requirement_ID', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      hydrateFormFromRow(data || null);
    } catch (error) {
      setNotice({
        kind: 'error',
        text: mapLoadError(error?.message),
      });
    } finally {
      setIsLoading(false);
    }
  }, [hydrateFormFromRow]);

  useEffect(() => {
    void fetchUiSettings();
    void loadDonationRequirements();
  }, [fetchUiSettings, loadDonationRequirements]);

  const cards = useMemo(() => {
    const allowedConditions = [
      form.chemicalTreatmentStatus,
      form.coloredHairStatus,
      form.bleachedHairStatus,
      form.rebondedHairStatus,
    ].filter(Boolean).length;

    return [
      {
        label: 'Minimum Donors',
        value: form.minimumNumberDonor ? form.minimumNumberDonor : 'Not set',
      },
      {
        label: 'Minimum Hair Length',
        value: form.minimumHairLength ? `${form.minimumHairLength} inches` : 'Not set',
      },
      {
        label: 'Allowed Hair Conditions',
        value: String(allowedConditions),
      },
      {
        label: 'Hair Texture Rule',
        value: form.hairTextureStatus ? form.hairTextureStatus : 'Not set',
      },
    ];
  }, [form]);

  const handleFieldChange = (field) => (event) => {
    const nextValue = event.target.value;
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleToggleChange = (field) => (event) => {
    const nextValue = Boolean(event.target.checked);
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const handleSave = async () => {
    if (!canManage) {
      setNotice({
        kind: 'error',
        text: 'Only Super Admin and Staff can update donation requirements.',
      });
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Saving is unavailable.',
      });
      return;
    }

    const parsedMinimumDonor = toNumberOrNull(form.minimumNumberDonor, { integer: true });
    const parsedMinimumHairLength = toNumberOrNull(form.minimumHairLength);

    if (String(form.minimumNumberDonor || '').trim() && parsedMinimumDonor === null) {
      setNotice({ kind: 'error', text: 'Minimum number of donor must be a valid whole number.' });
      return;
    }

    if (String(form.minimumHairLength || '').trim() && parsedMinimumHairLength === null) {
      setNotice({ kind: 'error', text: 'Minimum hair length must be a valid number.' });
      return;
    }

    if ((parsedMinimumDonor || 0) < 0) {
      setNotice({ kind: 'error', text: 'Minimum number of donor cannot be negative.' });
      return;
    }

    if ((parsedMinimumHairLength || 0) < 0) {
      setNotice({ kind: 'error', text: 'Minimum hair length cannot be negative.' });
      return;
    }

    if ((parsedMinimumHairLength || 0) > 999.99) {
      setNotice({ kind: 'error', text: 'Minimum hair length must be 999.99 or lower.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;

    const payload = {
      Minimum_Number_Donor: parsedMinimumDonor,
      Minimum_Hair_Length: parsedMinimumHairLength,
      Chemical_Treatment_Status: Boolean(form.chemicalTreatmentStatus),
      Colored_Hair_Status: Boolean(form.coloredHairStatus),
      Bleached_Hair_Status: Boolean(form.bleachedHairStatus),
      Rebonded_Hair_Status: Boolean(form.rebondedHairStatus),
      Hair_Texture_Status: String(form.hairTextureStatus || '').trim() || null,
      Notes: String(form.notes || '').trim() || null,
      Updated_By: actorUserId,
      Updated_At: new Date().toISOString(),
    };

    try {
      setIsSaving(true);
      setNotice({ kind: '', text: '' });

      let persistedRow = null;

      if (recordId) {
        const { data, error } = await supabase
          .from(DONATION_REQUIREMENTS_TABLE)
          .update(payload)
          .eq('Donation_Requirement_ID', recordId)
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        persistedRow = data;
      } else {
        const { data, error } = await supabase
          .from(DONATION_REQUIREMENTS_TABLE)
          .insert(payload)
          .select('*')
          .single();

        if (error) {
          throw error;
        }

        persistedRow = data;
      }

      hydrateFormFromRow(persistedRow || { ...payload, Donation_Requirement_ID: recordId });
      setNotice({ kind: 'success', text: 'Donation requirements saved successfully.' });

      await logAuditAction({
        action: 'donation_requirements.update',
        description: 'Updated donation requirement configuration.',
        resource: DONATION_REQUIREMENTS_TABLE,
        status: 'success',
        userProfile,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: mapSaveError(error?.message) });

      await logAuditAction({
        action: 'donation_requirements.update',
        description: 'Failed to update donation requirement configuration.',
        resource: DONATION_REQUIREMENTS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200';
  const cardClass = 'rounded-xl border border-slate-200 bg-white p-4';

  return (
    <div className="space-y-5" style={rootStyle}>
      <section
        className="rounded-xl border border-slate-200 p-4 md:p-5"
        style={{ background: `linear-gradient(145deg, ${backgroundColor}, #ffffff)` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>
              System Governance
            </p>
            <h1
              className="mt-1 text-2xl font-black tracking-tight md:text-3xl"
              style={{ color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` }}
            >
              Manage Donation Requirements
            </h1>
            <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
              Define the platform-wide hair donation thresholds used by operational teams.
            </p>
          </div>
          <ShieldCheck size={24} style={{ color: primaryColor }} />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold" style={{ color: secondaryTextColor }}>
            Record ID: {recordId || 'New'}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold" style={{ color: secondaryTextColor }}>
            Last Updated: {formatDateTime(updatedAt)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 font-semibold" style={{ color: secondaryTextColor }}>
            Updated By: {updatedBy || 'N/A'}
          </span>
        </div>
      </section>

      {notice.text && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            notice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : notice.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          {notice.text}
        </div>
      )}

      {!canManage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <Info size={14} />
            Only Super Admin and Staff can edit this module.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className={cardClass}>
            <p className="text-[11px] uppercase tracking-wide" style={{ color: secondaryTextColor }}>{card.label}</p>
            <p className="mt-1 text-lg font-bold" style={{ color: primaryTextColor }}>{card.value}</p>
          </article>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Minimum Number of Donor
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.minimumNumberDonor}
              onChange={handleFieldChange('minimumNumberDonor')}
              className={inputClass}
              placeholder="e.g. 1"
              disabled={isLoading || isSaving}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Minimum Hair Length (inches)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minimumHairLength}
              onChange={handleFieldChange('minimumHairLength')}
              className={inputClass}
              placeholder="e.g. 12.00"
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.chemicalTreatmentStatus}
              onChange={handleToggleChange('chemicalTreatmentStatus')}
              disabled={isLoading || isSaving}
            />
            Allow Chemically Treated Hair
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.coloredHairStatus}
              onChange={handleToggleChange('coloredHairStatus')}
              disabled={isLoading || isSaving}
            />
            Allow Colored Hair
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.bleachedHairStatus}
              onChange={handleToggleChange('bleachedHairStatus')}
              disabled={isLoading || isSaving}
            />
            Allow Bleached Hair
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.rebondedHairStatus}
              onChange={handleToggleChange('rebondedHairStatus')}
              disabled={isLoading || isSaving}
            />
            Allow Rebonded Hair
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Hair Texture Rule
            </label>
            <input
              value={form.hairTextureStatus}
              onChange={handleFieldChange('hairTextureStatus')}
              className={inputClass}
              placeholder="e.g. Straight, Wavy, Curly"
              disabled={isLoading || isSaving}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={handleFieldChange('notes')}
              className={`${inputClass} min-h-[120px] resize-y`}
              placeholder="Add additional notes or exceptions for staff reviewers."
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => loadDonationRequirements()}
            disabled={isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Reload
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={!canManage || isLoading || isSaving}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save Requirements
          </button>
        </div>
      </section>

      <p className="text-xs" style={{ color: secondaryColor }}>
        These rules are global and should be reviewed carefully before changing active workflows.
      </p>
    </div>
  );
}
