import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Shield,
  X,
  Calendar,
  Loader2,
  Mail,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import Select from 'react-select';
import { useTheme } from '../../../context/ThemeContext';
import {
  supabase,
  isSupabaseConfigured,
} from '../../../lib/supabaseClient';

const DEFAULT_ROLES = ['Super Admin', 'Admin', 'Partner', 'Staff'];

function mapInviteErrorMessage(rawMessage) {
  const message = String(rawMessage || 'Unexpected error while sending invitation email.');

  if (
    message.includes('after 25 seconds') ||
    message.includes('after 60 seconds') ||
    message.includes('For security purposes')
  ) {
    return 'Rate limit reached. Please wait around 60 seconds before sending another invitation.';
  }

  if (message.includes('User already registered')) {
    return 'This email is already registered. Use Upgrade Existing instead.';
  }

  if (message.includes('Invalid email')) {
    return 'Please enter a valid email address.';
  }

  if (message.includes('Error sending confirmation email')) {
    return 'Supabase could not send the confirmation email. Check Auth > Email settings (SMTP/provider) and make sure your Site URL/Redirect URLs are configured.';
  }

  return message;
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export default function ManageUserAccountsPage() {
  const { theme } = useTheme();

  const [users, setUsers] = useState([]);
  const [allRoles, setAllRoles] = useState([]);
  const [roleFilter, setRoleFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('invite');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successKind, setSuccessKind] = useState('invite');
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState('');
  const [resendingEmail, setResendingEmail] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteNoAccessTime, setInviteNoAccessTime] = useState(false);

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: 'Staff',
    accessStart: '',
    accessEnd: '',
  });

  const [upgradeSearch, setUpgradeSearch] = useState('');
  const [upgradeResults, setUpgradeResults] = useState([]);
  const [upgradeSelected, setUpgradeSelected] = useState(null);
  const [upgradeRole, setUpgradeRole] = useState('Staff');
  const [upgradeForm, setUpgradeForm] = useState({ accessStart: '', accessEnd: '' });
  const [upgradeSaving, setUpgradeSaving] = useState(false);
  const [upgradeSearching, setUpgradeSearching] = useState(false);
  const [upgradeHasSearched, setUpgradeHasSearched] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured. Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
      setShowErrorModal(true);
      setLoading(false);
      return;
    }

    fetchUsers();
    fetchAllRoles();

    const subscription = supabase
      .channel('public:users-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select(`
          user_id, email, role, access_start, access_end, is_active,
          user_details:user_details ( first_name, last_name, joined_date )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedData = (data || []).map((user) => {
        const details = Array.isArray(user.user_details) ? user.user_details[0] : user.user_details;
        return {
          id: user.user_id,
          email: user.email,
          role: user.role || 'N/A',
          accessStart: formatDateTime(user.access_start),
          accessEnd: formatDateTime(user.access_end),
          status: user.is_active ? 'Active' : 'Inactive',
          firstName: details?.first_name || 'N/A',
          lastName: details?.last_name || '',
          joinedDate: details?.joined_date || '',
        };
      });

      setUsers(formattedData);
    } catch (error) {
      setErrorMessage(error.message || 'Error fetching users.');
      setShowErrorModal(true);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRoles = async () => {
    const { data, error } = await supabase.from('users').select('role');

    if (!error && data) {
      const uniqueRoles = Array.from(new Set(data.map((u) => u.role).filter(Boolean)));
      setAllRoles(uniqueRoles.length > 0 ? uniqueRoles : DEFAULT_ROLES);
    } else {
      setAllRoles(DEFAULT_ROLES);
    }
  };

  const handleInviteUser = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const normalizedEmail = formData.email.toLowerCase().trim();
      const accessStart = inviteNoAccessTime ? null : formData.accessStart || null;
      const accessEnd = inviteNoAccessTime ? null : formData.accessEnd || null;

      if (!inviteNoAccessTime && (!accessStart || !accessEnd)) {
        throw new Error('Please set access start and access end, or enable No Access Time for a permanent account.');
      }

      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('email')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingUser) {
        throw new Error(`Email ${formData.email} is already registered in the system.`);
      }

      const {
        data: { session: adminSession },
      } = await supabase.auth.getSession();

      const tempPassword = `Strand-${Math.floor(100000 + Math.random() * 900000)}!Aa`;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: tempPassword,
        options: {
          emailRedirectTo: `${window.location.origin}/complete-account`,
          data: {
            firstName: formData.firstName,
            lastName: formData.lastName,
            role: formData.role,
            accessStart,
            accessEnd,
          },
        },
      });

      if (signUpError) throw signUpError;

      // If signUp swapped the current session, restore the original admin session.
      if (adminSession && signUpData?.session?.user?.id !== adminSession.user.id) {
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });
      }

      setIsModalOpen(false);
      setInvitedEmail(formData.email);
      setSuccessKind('invite');
      setShowSuccessModal(true);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        role: 'Staff',
        accessStart: '',
        accessEnd: '',
      });
      setInviteNoAccessTime(false);

      fetchUsers();
    } catch (error) {
      const msg = mapInviteErrorMessage(error?.message);
      setErrorMessage(msg);
      setShowErrorModal(true);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  useEffect(() => {
    const term = upgradeSearch.trim();
    if (!term) {
      setUpgradeResults([]);
      setUpgradeHasSearched(false);
      setUpgradeSelected(null);
      return undefined;
    }

    setUpgradeSearching(true);
    const handle = setTimeout(async () => {
      try {
        const emailQuery = supabase
          .from('users')
          .select(`
            user_id, email, role, is_active, access_start, access_end,
            user_details ( first_name, last_name )
          `)
          .ilike('email', `%${term}%`);

        const nameQuery = supabase
          .from('user_details')
          .select(`
            user_id, first_name, last_name,
            users!inner ( user_id, email, role, is_active, access_start, access_end )
          `)
          .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);

        const [emailRes, nameRes] = await Promise.all([emailQuery, nameQuery]);
        if (emailRes.error) throw emailRes.error;
        if (nameRes.error) throw nameRes.error;

        const mergedMap = new Map();

        (emailRes.data || []).forEach((u) => {
          mergedMap.set(u.user_id, {
            user_id: u.user_id,
            email: u.email,
            role: u.role,
            first_name: u.user_details?.[0]?.first_name || u.user_details?.first_name || '',
            last_name: u.user_details?.[0]?.last_name || u.user_details?.last_name || '',
          });
        });

        (nameRes.data || []).forEach((d) => {
          const u = d.users;
          if (!u) return;
          mergedMap.set(u.user_id, {
            user_id: u.user_id,
            email: u.email,
            role: u.role,
            first_name: d.first_name || '',
            last_name: d.last_name || '',
          });
        });

        setUpgradeResults(Array.from(mergedMap.values()));
        setUpgradeHasSearched(true);
      } catch (err) {
        setUpgradeResults([]);
        setUpgradeHasSearched(true);
      } finally {
        setUpgradeSearching(false);
      }
    }, 300);

    return () => clearTimeout(handle);
  }, [upgradeSearch]);

  const handleUpgradeSubmit = async (e) => {
    e.preventDefault();
    if (!upgradeSelected || !upgradeForm.accessStart || !upgradeForm.accessEnd) return;

    setUpgradeSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          role: upgradeRole,
          access_start: upgradeForm.accessStart,
          access_end: upgradeForm.accessEnd,
          is_active: true,
        })
        .eq('user_id', upgradeSelected);

      if (error) throw error;

      setSuccessKind('upgrade');
      setShowSuccessModal(true);
      setIsModalOpen(false);
      setUpgradeSelected(null);
      setUpgradeSearch('');
      setUpgradeResults([]);
      setUpgradeHasSearched(false);
      setUpgradeForm({ accessStart: '', accessEnd: '' });
      fetchUsers();
    } catch (err) {
      setErrorMessage(err.message);
      setShowErrorModal(true);
    } finally {
      setUpgradeSaving(false);
    }
  };

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const roleMatch = roleFilter.length === 0 || roleFilter.some((r) => r.value === user.role);
        const statusMatch =
          statusFilter.length === 0 || statusFilter.some((s) => s.value === user.status);
        return roleMatch && statusMatch;
      }),
    [users, roleFilter, statusFilter],
  );

  const roleOptions = allRoles.map((role) => ({ value: role, label: role }));
  const statusOptions = ['Active', 'Inactive'].map((status) => ({ value: status, label: status }));

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      borderColor: state.isFocused ? theme.primaryColor : base.borderColor,
      boxShadow: state.isFocused ? `0 0 0 1px ${theme.primaryColor}` : 'none',
      '&:hover': {
        borderColor: theme.primaryColor,
      },
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: `${theme.primaryColor}20`,
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: theme.primaryColorDark,
    }),
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Manage User Accounts</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">Invite users, upgrade roles, and monitor account access windows.</p>
        </div>
        <button
          onClick={() => {
            setActiveTab('invite');
            setIsModalOpen(true);
          }}
          className="text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm"
          style={{ backgroundColor: theme.primaryColor }}
        >
          <Plus size={18} />
          <span>Invite / Upgrade</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-4 mb-4">
        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Role</label>
          <Select
            isMulti
            options={roleOptions}
            value={roleFilter}
            onChange={(value) => setRoleFilter(value || [])}
            placeholder="All Roles"
            classNamePrefix="react-select"
            styles={selectStyles}
          />
        </div>
        <div className="w-64">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Filter by Status</label>
          <Select
            isMulti
            options={statusOptions}
            value={statusFilter}
            onChange={(value) => setStatusFilter(value || [])}
            placeholder="All Status"
            classNamePrefix="react-select"
            styles={selectStyles}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        {loading ? (
          <div className="p-10 flex justify-center text-gray-700 dark:text-gray-300 gap-2">
            <Loader2 className="animate-spin" /> Loading...
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="text-sm" style={{ backgroundColor: `${theme.primaryColor}20`, color: theme.primaryColorDark }}>
              <tr>
                <th className="p-4">User Name</th>
                <th className="p-4">Role</th>
                <th className="p-4">Joined Date</th>
                <th className="p-4">Role Duration</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search size={40} className="text-gray-300 dark:text-gray-600" />
                      <p>No users found for selected filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-100 flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase"
                        style={{ backgroundColor: `${theme.primaryColor}22`, color: theme.primaryColorDark }}
                      >
                        {user.firstName.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold">{user.firstName} {user.lastName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{user.email}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1 w-fit"
                        style={{ backgroundColor: `${theme.primaryColor}18`, color: theme.primaryColorDark, borderColor: `${theme.primaryColor}33` }}
                      >
                        <Shield size={12} /> {user.role}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700 dark:text-gray-300">
                      {user.joinedDate
                        ? new Date(user.joinedDate).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="p-4 text-gray-600 dark:text-gray-300 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{user.accessStart || 'N/A'}</span>
                        <span className="text-gray-400">to</span>
                        <span>{user.accessEnd || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${user.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-full transition-all" aria-label="Edit user">
                          <Edit2 size={16} />
                        </button>
                        <button className="p-2 text-red-700 bg-red-50 border border-red-100 hover:bg-red-100 rounded-full transition-all" aria-label="Delete user">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
              {successKind === 'invite' ? <Mail size={40} /> : <CheckCircle size={40} />}
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
              {successKind === 'invite' ? 'Invitation Email Sent' : 'Account Upgraded'}
            </h3>
            {successKind === 'invite' ? (
              <div>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">An invitation email has been sent to:</p>
                <p className="font-bold text-lg mb-6" style={{ color: theme.primaryColor }}>{invitedEmail}</p>
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-6">
                  The user will receive an email with a confirmation link to complete account setup.
                </p>
              </div>
            ) : (
              <p className="text-gray-500 dark:text-gray-300 text-sm mb-6">
                The selected account has been upgraded to the specified role and activated.
              </p>
            )}

            {successKind === 'invite' ? (
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    setResendingEmail(true);
                    try {
                      const { error } = await supabase.auth.resend({
                        type: 'signup',
                        email: invitedEmail,
                        options: {
                          emailRedirectTo: `${window.location.origin}/complete-account`,
                        },
                      });
                      if (error) throw error;
                      alert('Invitation email resent successfully.');
                    } catch (error) {
                      alert(mapInviteErrorMessage(error?.message));
                    } finally {
                      setResendingEmail(false);
                    }
                  }}
                  disabled={resendingEmail}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  {resendingEmail ? (
                    <>
                      <Loader2 className="animate-spin" size={18} /> Sending...
                    </>
                  ) : (
                    <>
                      <Mail size={18} /> Resend Email
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowSuccessModal(false)}
                  className="flex-1 py-3 text-white rounded-xl font-bold"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  Close
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-3 text-white rounded-xl font-bold"
                style={{ backgroundColor: theme.primaryColor }}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {showErrorModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
              <AlertTriangle size={40} />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Error</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6 text-sm">{errorMessage}</p>
            <button
              onClick={() => setShowErrorModal(false)}
              className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Add New User</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={24} /></button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'invite' ? '' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
                style={
                  activeTab === 'invite'
                    ? { backgroundColor: `${theme.primaryColor}20`, color: theme.primaryColorDark, borderColor: `${theme.primaryColor}33` }
                    : {}
                }
                onClick={() => setActiveTab('invite')}
              >
                Invite New User
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${activeTab === 'upgrade' ? '' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}
                style={
                  activeTab === 'upgrade'
                    ? { backgroundColor: `${theme.secondaryColor}20`, color: theme.secondaryColorDark, borderColor: `${theme.secondaryColor}33` }
                    : {}
                }
                onClick={() => setActiveTab('upgrade')}
              >
                Upgrade Existing
              </button>
            </div>

            {activeTab === 'invite' && (
              <form onSubmit={handleInviteUser} className="space-y-4">
                <div className="p-3 rounded-lg text-xs border" style={{ backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColorDark, borderColor: `${theme.primaryColor}33` }}>
                  System will send a confirmation email. User must click the link to complete registration.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                    <input required name="firstName" value={formData.firstName} onChange={handleInputChange} type="text" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.primaryColor }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                    <input required name="lastName" value={formData.lastName} onChange={handleInputChange} type="text" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.primaryColor }} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                  <input required name="email" value={formData.email} onChange={handleInputChange} type="email" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.primaryColor }} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select required name="role" value={formData.role} onChange={handleInputChange} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.primaryColor }}>
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin">Admin</option>
                    <option value="Partner">Partner</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Start</label>
                    <input required={!inviteNoAccessTime} disabled={inviteNoAccessTime} name="accessStart" value={formData.accessStart} onChange={handleInputChange} type="date" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" style={{ '--tw-ring-color': theme.primaryColor }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access End</label>
                    <input required={!inviteNoAccessTime} disabled={inviteNoAccessTime} name="accessEnd" value={formData.accessEnd} onChange={handleInputChange} type="date" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" style={{ '--tw-ring-color': theme.primaryColor }} />
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setInviteNoAccessTime((prev) => {
                        const next = !prev;
                        if (next) {
                          setFormData((curr) => ({ ...curr, accessStart: '', accessEnd: '' }));
                        }
                        return next;
                      });
                    }}
                    className="w-full py-2 rounded-lg border text-sm font-semibold transition-colors"
                    style={
                      inviteNoAccessTime
                        ? { backgroundColor: `${theme.primaryColor}20`, color: theme.primaryColorDark, borderColor: `${theme.primaryColor}33` }
                        : {}
                    }
                  >
                    {inviteNoAccessTime ? 'No Access Time Enabled (Permanent Account)' : 'Set As Permanent Account (No Access Time)'}
                  </button>
                </div>

                <div className="flex gap-3 mt-8 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                  <button type="submit" disabled={saving} className="flex-1 py-2 text-white rounded-lg flex justify-center items-center gap-2" style={{ backgroundColor: theme.primaryColor }}>
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Mail size={18} />}
                    {saving ? 'Sending...' : 'Send Invite'}
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'upgrade' && (
              <form onSubmit={handleUpgradeSubmit} className="space-y-4">
                <div className="p-3 rounded-lg text-xs border" style={{ backgroundColor: `${theme.secondaryColor}12`, color: theme.secondaryColorDark, borderColor: `${theme.secondaryColor}33` }}>
                  Upgrade an existing account to a higher access level.
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search User (name or email)</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={upgradeSearch}
                      onChange={(e) => setUpgradeSearch(e.target.value)}
                      placeholder="Start typing to search..."
                      className="w-full p-2 pl-9 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      style={{ '--tw-ring-color': theme.secondaryColor }}
                    />
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                  <div className="mt-2 max-h-40 overflow-auto border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 bg-gray-50 dark:bg-gray-900">
                    {upgradeSearching && (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Searching...</div>
                    )}
                    {!upgradeSearching && upgradeResults.length === 0 && upgradeHasSearched && (
                      <div className="p-3 text-sm text-gray-500 dark:text-gray-400">No matching users found.</div>
                    )}
                    {!upgradeSearching && upgradeResults.map((u) => (
                      <label key={u.user_id} className="flex items-center gap-3 p-3 hover:bg-white dark:hover:bg-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="upgradeUser"
                          value={u.user_id}
                          checked={upgradeSelected === u.user_id}
                          onChange={() => setUpgradeSelected(u.user_id)}
                          className="text-blue-600"
                        />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800 dark:text-gray-100">{u.first_name || '—'} {u.last_name || ''}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500">Current role: {u.role || 'N/A'}</div>
                        </div>
                      </label>
                    ))}
                    {!upgradeHasSearched && !upgradeSearching && upgradeResults.length === 0 && (
                      <div className="p-3 text-sm text-gray-400">Start typing to search existing users.</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role</label>
                  <select
                    required
                    value={upgradeRole}
                    onChange={(e) => setUpgradeRole(e.target.value)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                    style={{ '--tw-ring-color': theme.secondaryColor }}
                  >
                    <option value="Super Admin">Super Admin</option>
                    <option value="Admin">Admin</option>
                    <option value="Partner">Partner</option>
                    <option value="Staff">Staff</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Start</label>
                    <input required name="upgradeAccessStart" value={upgradeForm.accessStart} onChange={(e) => setUpgradeForm((prev) => ({ ...prev, accessStart: e.target.value }))} type="date" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.secondaryColor }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access End</label>
                    <input required name="upgradeAccessEnd" value={upgradeForm.accessEnd} onChange={(e) => setUpgradeForm((prev) => ({ ...prev, accessEnd: e.target.value }))} type="date" className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" style={{ '--tw-ring-color': theme.secondaryColor }} />
                  </div>
                </div>

                <div className="flex gap-3 mt-8 pt-2">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
                  <button
                    type="submit"
                    disabled={upgradeSaving || !upgradeSelected || !upgradeForm.accessStart || !upgradeForm.accessEnd}
                    className="flex-1 py-2 text-white rounded-lg flex justify-center items-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: theme.secondaryColor }}
                  >
                    {upgradeSaving ? <Loader2 className="animate-spin" size={18} /> : <Shield size={18} />}
                    {upgradeSaving ? 'Upgrading...' : `Upgrade to ${upgradeRole}`}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
