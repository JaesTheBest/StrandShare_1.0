import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MailCheck, RefreshCcw, ShieldAlert, XCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabaseClient';
import { useTheme } from '../../../context/ThemeContext';

const APPLICATIONS_TABLE = 'Organization_Applications';
const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const ORGANIZATIONS_TABLE = 'Organizations';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';

function toTitleCase(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeStatus(value = '') {
  return String(value).trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return '-';

  try {
    return new Date(value).toLocaleString('en-PH', {
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

function createIsolatedSignupClient() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase configuration. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function mapAuthProvisioningError(rawMessage) {
  const message = String(rawMessage || '').trim();
  const lower = message.toLowerCase();

  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('duplicate')) {
    return 'Representative auth account already exists for this email. Link it in users.auth_user_id first, then approve again.';
  }

  return message;
}

function mapOrganizationSchemaError(rawMessage) {
  const message = String(rawMessage || '').trim();

  if (message.includes("Could not find the table 'public.Organization_Applications'")) {
    return 'Organization application tables are missing. Run migration 023_align_organization_schema_and_application_workflow.sql and refresh the app.';
  }

  return message;
}

export default function ManageOrganizationApplicationsPage({ userProfile }) {
  const { theme } = useTheme();
  const primaryColor = theme.primaryColor || '#0f766e';
  const secondaryColor = theme.secondaryColor || '#64748b';
  const backgroundColor = theme.backgroundColor || '#f8fafc';
  const primaryTextColor = theme.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme.secondaryTextColor || '#334155';

  const [applications, setApplications] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewNotes, setReviewNotes] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [notice, setNotice] = useState({ type: '', message: '' });

  const adminUserId = Number(userProfile?.user_id || 0);

  const loadApplications = useCallback(async () => {
    setIsLoading(true);
    setNotice({ type: '', message: '' });

    try {
      const { data, error } = await supabase
        .from(APPLICATIONS_TABLE)
        .select('*')
        .order('Created_At', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      setApplications(data || []);
    } catch (error) {
      setApplications([]);
      setNotice({
        type: 'error',
        message: mapOrganizationSchemaError(error?.message) || 'Unable to load organization applications.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const filteredApplications = useMemo(() => {
    if (statusFilter === 'all') {
      return applications;
    }

    return applications.filter((item) => normalizeStatus(item.Status) === statusFilter);
  }, [applications, statusFilter]);

  const metrics = useMemo(() => {
    return applications.reduce(
      (accumulator, item) => {
        const normalized = normalizeStatus(item.Status);
        if (normalized === 'pending') accumulator.pending += 1;
        if (normalized === 'approved') accumulator.approved += 1;
        if (normalized === 'rejected') accumulator.rejected += 1;
        return accumulator;
      },
      { pending: 0, approved: 0, rejected: 0 }
    );
  }, [applications]);

  const createRepresentativeAuthAccount = useCallback(async ({
    email,
    temporaryPassword,
    firstName,
    lastName,
    organizationName,
  }) => {
    const signupClient = createIsolatedSignupClient();

    try {
      const redirectTo = typeof window !== 'undefined'
        ? `${window.location.origin}/confirmation-complete`
        : undefined;

      const { data, error } = await signupClient.auth.signUp({
        email,
        password: temporaryPassword,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            role: 'organization',
            source: 'organization_approval',
            first_name: toTitleCase(firstName),
            last_name: toTitleCase(lastName),
            account_type: 'Organization Representative',
            account_identifier_label: 'Organization',
            account_identifier_value: toTitleCase(organizationName) || email,
            temporary_password: temporaryPassword,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      const authUserId = data?.user?.id;
      if (!authUserId) {
        throw new Error('Authentication user id was not returned after signup.');
      }

      return authUserId;
    } catch (error) {
      throw new Error(mapAuthProvisioningError(error?.message));
    } finally {
      await signupClient.auth.signOut().catch(() => undefined);
    }
  }, []);

  const processApplication = async (application, decision) => {
    if (!application?.Application_ID || !application?.User_ID) {
      setNotice({ type: 'error', message: 'Invalid application record.' });
      return;
    }

    if (!adminUserId) {
      setNotice({
        type: 'error',
        message: 'Current admin profile is missing user_id. Please re-login and try again.',
      });
      return;
    }

    const currentStatus = normalizeStatus(application.Status);
    if (currentStatus !== 'pending') {
      setNotice({ type: 'error', message: 'Only pending applications can be processed.' });
      return;
    }

    setProcessingId(application.Application_ID);
    setNotice({ type: '', message: '' });

    try {
      const nowIso = new Date().toISOString();
      const decisionLabel = decision === 'approve' ? 'Approved' : 'Rejected';
      const note = (reviewNotes[application.Application_ID] || '').trim();
      const representativeEmail = String(application.Applicant_Email || '').trim().toLowerCase();

      let createdOrganizationId = null;
      let approvalCredentialsNotice = '';

      const userLookupResult = await supabase
        .from(USERS_TABLE)
        .select('user_id, email, role, is_active, auth_user_id')
        .eq('user_id', application.User_ID)
        .maybeSingle();

      if (userLookupResult.error) {
        throw new Error(userLookupResult.error.message);
      }

      const userRow = userLookupResult.data;
      if (!userRow?.user_id) {
        throw new Error('Applicant user profile no longer exists in users table.');
      }

      if (decision === 'approve') {
        const normalizedEmail = representativeEmail || String(userRow.email || '').trim().toLowerCase();
        if (!normalizedEmail) {
          throw new Error('Representative email is missing from the application.');
        }

        const representativeFirstName = toTitleCase(application.Applicant_First_Name);
        const representativeLastName = toTitleCase(application.Applicant_Last_Name);

        const upsertDetailsResult = await supabase
          .from(USER_DETAILS_TABLE)
          .upsert(
            {
              user_id: application.User_ID,
              first_name: representativeFirstName,
              last_name: representativeLastName,
              contact_number: application.Contact_Number || null,
              street: application.Street || null,
              barangay: application.Barangay || null,
              city: application.City || null,
              province: application.Province || null,
              region: application.Region || null,
              country: application.Country || null,
              updated_at: nowIso,
            },
            {
              onConflict: 'user_id',
            }
          );

        if (upsertDetailsResult.error) {
          throw new Error(upsertDetailsResult.error.message);
        }

        let authUserId = userRow.auth_user_id || null;
        if (!authUserId) {
          const temporaryPassword = generateTemporaryPassword();
          authUserId = await createRepresentativeAuthAccount({
            email: normalizedEmail,
            temporaryPassword,
            firstName: representativeFirstName,
            lastName: representativeLastName,
            organizationName: application.Organization_Name,
          });

          approvalCredentialsNotice = ' Confirmation email with temporary login credentials was sent.';
        } else {
          approvalCredentialsNotice = ' Existing auth account is already linked for this representative.';
        }

        const organizationPayload = {
          Organization_Name: toTitleCase(application.Organization_Name),
          Organization_Type: toTitleCase(application.Organization_Type),
          Contact_Number: application.Contact_Number,
          Organization_Logo_URL: application.Organization_Logo_URL || null,
          Street: application.Street,
          Barangay: application.Barangay,
          City: application.City,
          Province: application.Province,
          Region: application.Region,
          Country: application.Country,
          Latitude: application.Latitude,
          Longitude: application.Longitude,
          Status: 'Active',
          Is_Approved: true,
          Approval_Status: 'Approved',
          Approved_By: adminUserId,
          Approved_At: nowIso,
          Review_Notes: note || null,
          Created_By: adminUserId,
          Updated_By: adminUserId,
          Updated_At: nowIso,
        };

        const createOrganizationResult = await supabase
          .from(ORGANIZATIONS_TABLE)
          .insert(organizationPayload)
          .select('Organization_ID')
          .maybeSingle();

        if (createOrganizationResult.error) {
          throw new Error(createOrganizationResult.error.message);
        }

        createdOrganizationId = createOrganizationResult.data?.Organization_ID || null;

        const updateUserResult = await supabase
          .from(USERS_TABLE)
          .update({
            auth_user_id: authUserId,
            email: normalizedEmail,
            role: 'organization',
            is_active: true,
            updated_at: nowIso,
          })
          .eq('user_id', application.User_ID);

        if (updateUserResult.error) {
          throw new Error(updateUserResult.error.message);
        }

        if (createdOrganizationId) {
          const addMembershipResult = await supabase.from(ORGANIZATION_MEMBERS_TABLE).upsert(
            {
              Organization_ID: createdOrganizationId,
              User_ID: application.User_ID,
              Membership_Role: 'Leader',
              Is_Primary: true,
              Status: 'Active',
              Created_By: adminUserId,
            },
            {
              onConflict: 'Organization_ID,User_ID',
            }
          );

          if (addMembershipResult.error) {
            throw new Error(addMembershipResult.error.message);
          }
        }
      }

      if (decision === 'reject') {
        const normalizedEmail = representativeEmail || String(userRow.email || '').trim().toLowerCase();
        const setInactiveResult = await supabase
          .from(USERS_TABLE)
          .update({
            email: normalizedEmail || null,
            role: 'organization',
            is_active: false,
            updated_at: nowIso,
          })
          .eq('user_id', application.User_ID);

        if (setInactiveResult.error) {
          throw new Error(setInactiveResult.error.message);
        }
      }

      const updateApplicationResult = await supabase
        .from(APPLICATIONS_TABLE)
        .update({
          Status: decisionLabel,
          Reviewed_By: adminUserId,
          Reviewed_At: nowIso,
          Review_Notes: note || null,
          Organization_ID: createdOrganizationId,
          Updated_At: nowIso,
        })
        .eq('Application_ID', application.Application_ID);

      if (updateApplicationResult.error) {
        throw new Error(updateApplicationResult.error.message);
      }

      setNotice({
        type: 'success',
        message:
          decision === 'approve'
            ? `Application approved. Organization access has been activated.${approvalCredentialsNotice}`
            : 'Application rejected successfully.',
      });

      setReviewNotes((prev) => ({
        ...prev,
        [application.Application_ID]: '',
      }));

      await loadApplications();
    } catch (error) {
      setNotice({
        type: 'error',
        message: mapOrganizationSchemaError(error?.message) || 'Unable to process organization application.',
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6" style={{ color: primaryTextColor }}>
      <section
        className="rounded-xl border bg-white p-6 shadow-sm"
        style={{ borderColor: `${secondaryColor}33`, backgroundColor: `${backgroundColor}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold" style={{ color: primaryTextColor }}>Manage Organization Applications</h2>
            <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
              Review pending applications, approve qualified organizations, and activate representative access.
            </p>
          </div>
          <button
            type="button"
            onClick={loadApplications}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: `${secondaryColor}44`, color: secondaryTextColor }}
          >
            <RefreshCcw size={14} className={isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">{metrics.pending}</p>
          </article>
          <article className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">{metrics.approved}</p>
          </article>
          <article className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Rejected</p>
            <p className="mt-1 text-2xl font-bold text-rose-900">{metrics.rejected}</p>
          </article>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {['all', 'pending', 'approved', 'rejected'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatusFilter(value)}
              className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider transition"
              style={
                statusFilter === value
                  ? { borderColor: primaryColor, backgroundColor: primaryColor, color: '#ffffff' }
                  : { borderColor: `${secondaryColor}44`, backgroundColor: '#ffffff', color: secondaryTextColor }
              }
            >
              {value}
            </button>
          ))}
        </div>
      </section>

      {notice.message ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {notice.type === 'success' ? (
            <p className="inline-flex items-center gap-2 font-semibold"><CheckCircle2 size={15} /> {notice.message}</p>
          ) : (
            <p className="inline-flex items-center gap-2 font-semibold"><ShieldAlert size={15} /> {notice.message}</p>
          )}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: `${secondaryColor}33` }}>
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm" style={{ color: secondaryTextColor }}>
            <Loader2 size={16} className="animate-spin" /> Loading organization applications...
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="px-4 py-14 text-center text-sm" style={{ color: secondaryTextColor }}>No organization applications found for this filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Organization</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Applicant</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Address</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Submitted</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredApplications.map((item) => {
                  const status = normalizeStatus(item.Status);
                  const isPending = status === 'pending';
                  const isProcessing = processingId === item.Application_ID;

                  return (
                    <tr key={item.Application_ID} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{item.Organization_Name}</p>
                        <p className="text-xs text-gray-600">{item.Organization_Type}</p>
                        <p className="mt-1 text-xs text-gray-600">{item.Contact_Number || '-'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">
                          {item.Applicant_First_Name} {item.Applicant_Last_Name}
                        </p>
                        <p className="text-xs text-gray-600">{item.Applicant_Email || '-'}</p>
                        <p className="text-xs text-gray-500">User ID: {item.User_ID}</p>
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-700">
                        {[item.Street, item.Barangay, item.City, item.Province, item.Region, item.Country]
                          .filter(Boolean)
                          .join(', ')}
                      </td>
                      <td className="px-4 py-4 text-xs text-gray-700">
                        {formatDate(item.Created_At)}
                        <p className="mt-1 text-[11px] text-gray-500">Reviewed: {formatDate(item.Reviewed_At)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${
                            status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.Status}
                        </span>
                        {item.Review_Notes ? (
                          <p className="mt-2 text-xs text-gray-600">Note: {item.Review_Notes}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {isPending ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={reviewNotes[item.Application_ID] || ''}
                              onChange={(event) =>
                                setReviewNotes((prev) => ({
                                  ...prev,
                                  [item.Application_ID]: event.target.value,
                                }))
                              }
                              placeholder="Optional review notes"
                              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:border-teal-500"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => processApplication(item, 'approve')}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                                style={{ backgroundColor: primaryColor }}
                              >
                                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <MailCheck size={12} />}
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => processApplication(item, 'reject')}
                                disabled={isProcessing}
                                className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                                Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">Decision locked for processed application.</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
