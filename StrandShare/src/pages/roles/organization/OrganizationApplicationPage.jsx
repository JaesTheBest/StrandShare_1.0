import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, CheckCircle2, Loader2 } from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { supabase } from '../../../lib/supabaseClient';

const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const APPLICATIONS_TABLE = 'Organization_Applications';

const initialForm = {
  organizationName: '',
  organizationType: '',
  contactNumber: '',
  logoUrl: '',
  street: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  country: 'Philippines',
  firstName: '',
  lastName: '',
  email: '',
};

const roleValue = 'organization';

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

function mapOrganizationSchemaError(rawMessage) {
  const message = String(rawMessage || '').trim();

  if (message.includes("Could not find the table 'public.Organization_Applications'")) {
    return 'Organization tables are not ready yet. Run migration 023_align_organization_schema_and_application_workflow.sql, then refresh the app.';
  }

  return message;
}

export default function OrganizationApplicationPage() {
  const { theme } = useTheme();
  const primaryColor = theme.primaryColor || '#0f766e';
  const secondaryColor = theme.secondaryColor || '#64748b';
  const tertiaryColor = theme.tertiaryColor || '#10b981';
  const backgroundColor = theme.backgroundColor || '#f8fafc';
  const primaryTextColor = theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme.secondaryTextColor || '#334155';
  const brandName = theme.brandName || 'StrandShare';
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const canSubmit = useMemo(() => {
    return (
      form.organizationName.trim() &&
      form.organizationType.trim() &&
      form.contactNumber.trim() &&
      form.street.trim() &&
      form.barangay.trim() &&
      form.city.trim() &&
      form.province.trim() &&
      form.region.trim() &&
      form.country.trim() &&
      form.firstName.trim() &&
      form.lastName.trim() &&
      form.email.trim()
    );
  }, [form]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  const goBack = () => {
    if (typeof window === 'undefined') return;
    window.location.assign('/');
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!canSubmit) {
      setErrorMessage('Please complete all required fields.');
      return;
    }

    const normalizedEmail = form.email.trim().toLowerCase();
    const firstName = toTitle(form.firstName);
    const lastName = toTitle(form.lastName);
    const nowIso = new Date().toISOString();

    setIsSubmitting(true);

    try {
      const existingApplicationQuery = await supabase
        .from(APPLICATIONS_TABLE)
        .select('Application_ID, Status')
        .eq('Applicant_Email', normalizedEmail)
        .in('Status', ['Pending', 'Approved'])
        .limit(1);

      if (existingApplicationQuery.error) {
        throw new Error(existingApplicationQuery.error.message);
      }

      if ((existingApplicationQuery.data || []).length > 0) {
        throw new Error('An active application already exists for this email. Please wait for the admin decision or use another email.');
      }

      let userRecord = null;

      const existingUserResponse = await supabase
        .from(USERS_TABLE)
        .select('user_id, email, role, auth_user_id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (existingUserResponse.error) {
        throw new Error(existingUserResponse.error.message);
      }

      if (existingUserResponse.data) {
        const normalizedRole = normalizeRole(existingUserResponse.data.role);
        const isOrganizationRole = !normalizedRole || normalizedRole === 'organization' || normalizedRole === 'partner';

        if (!isOrganizationRole) {
          throw new Error('This email is already linked to another account role. Please use a different representative email.');
        }

        const updateUserByEmail = await supabase
          .from(USERS_TABLE)
          .update({
            role: roleValue,
            is_active: false,
            updated_at: nowIso,
          })
          .eq('user_id', existingUserResponse.data.user_id)
          .select('user_id, email, role, auth_user_id')
          .maybeSingle();

        if (updateUserByEmail.error) {
          throw new Error(updateUserByEmail.error.message);
        }

        userRecord = updateUserByEmail.data || existingUserResponse.data;
      } else {
        const insertUserResult = await supabase
          .from(USERS_TABLE)
          .insert({
            email: normalizedEmail,
            role: roleValue,
            is_active: false,
            updated_at: nowIso,
          })
          .select('user_id, email, role, auth_user_id')
          .maybeSingle();

        if (insertUserResult.error) {
          throw new Error(insertUserResult.error.message);
        }

        userRecord = insertUserResult.data;
      }

      if (!userRecord?.user_id) {
        throw new Error('Unable to resolve local user profile for the organization applicant.');
      }

      const userId = Number(userRecord.user_id);

      const upsertDetailsResult = await supabase
        .from(USER_DETAILS_TABLE)
        .upsert(
          {
            user_id: userId,
            first_name: firstName,
            last_name: lastName,
            contact_number: form.contactNumber.trim(),
            street: form.street.trim(),
            barangay: form.barangay.trim(),
            city: form.city.trim(),
            province: form.province.trim(),
            region: form.region.trim(),
            country: form.country.trim(),
            updated_at: nowIso,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (upsertDetailsResult.error) {
        throw new Error(upsertDetailsResult.error.message);
      }

      const insertApplicationResult = await supabase.from(APPLICATIONS_TABLE).insert({
        User_ID: userId,
        Organization_Name: form.organizationName.trim(),
        Organization_Type: form.organizationType.trim(),
        Contact_Number: form.contactNumber.trim(),
        Organization_Logo_URL: form.logoUrl.trim() || null,
        Street: form.street.trim(),
        Barangay: form.barangay.trim(),
        City: form.city.trim(),
        Province: form.province.trim(),
        Region: form.region.trim(),
        Country: form.country.trim(),
        Applicant_First_Name: firstName,
        Applicant_Last_Name: lastName,
        Applicant_Email: normalizedEmail,
        Status: 'Pending',
        Updated_At: nowIso,
      });

      if (insertApplicationResult.error) {
        throw new Error(insertApplicationResult.error.message);
      }

      setForm(initialForm);
      setSuccessMessage(
        'Application submitted. If approved, the Super Admin will send your confirmation email and temporary login credentials.'
      );
    } catch (error) {
      setErrorMessage(
        mapOrganizationSchemaError(error?.message)
        || 'Unable to submit organization application.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
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
                  Submit your organization profile to {brandName}. Representative credentials are generated and emailed only after Super Admin approval.
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
            <fieldset className="space-y-4 rounded-xl border p-4" style={{ borderColor: `${secondaryColor}33`, backgroundColor: `${tertiaryColor}10` }}>
              <legend className="px-1 text-sm font-bold" style={{ color: primaryTextColor }}>Organization Details</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Name *</span>
                  <input
                    value={form.organizationName}
                    onChange={updateField('organizationName')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    placeholder="Example: Hope Wig Foundation"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Type *</span>
                  <input
                    value={form.organizationType}
                    onChange={updateField('organizationType')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    placeholder="NGO / Foundation / Association"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Contact Number *</span>
                  <input
                    value={form.contactNumber}
                    onChange={updateField('contactNumber')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    placeholder="+63..."
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Organization Logo URL</span>
                  <input
                    value={form.logoUrl}
                    onChange={updateField('logoUrl')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    placeholder="https://example.com/logo.png"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Street *</span>
                  <input
                    value={form.street}
                    onChange={updateField('street')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    placeholder="Street address"
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Barangay *</span>
                  <input
                    value={form.barangay}
                    onChange={updateField('barangay')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>City *</span>
                  <input
                    value={form.city}
                    onChange={updateField('city')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Province *</span>
                  <input
                    value={form.province}
                    onChange={updateField('province')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Region *</span>
                  <input
                    value={form.region}
                    onChange={updateField('region')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Country *</span>
                  <input
                    value={form.country}
                    onChange={updateField('country')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-4 rounded-xl border p-4" style={{ borderColor: `${secondaryColor}33`, backgroundColor: `${tertiaryColor}10` }}>
              <legend className="px-1 text-sm font-bold" style={{ color: primaryTextColor }}>Representative Account</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>First Name *</span>
                  <input
                    value={form.firstName}
                    onChange={updateField('firstName')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Last Name *</span>
                  <input
                    value={form.lastName}
                    onChange={updateField('lastName')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
                <label className="space-y-1 text-sm md:col-span-2">
                  <span className="font-semibold" style={{ color: secondaryTextColor }}>Email *</span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={updateField('email')}
                    className="w-full rounded-lg border bg-white px-3 py-2 outline-none ring-0 transition"
                    style={{ borderColor: `${secondaryColor}44` }}
                    required
                  />
                </label>
              </div>
            </fieldset>

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

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: secondaryTextColor }}>
                By submitting, you agree that representative credentials and access are only provisioned after Super Admin approval.
              </p>
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
                  'Submit Application'
                )}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
