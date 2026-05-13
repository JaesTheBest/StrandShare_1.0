import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  UserCircle2,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTheme } from '../../../context/ThemeContext';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const USERS_TABLE = 'users';
const USER_DETAILS_TABLE = 'user_details';
const PROFILE_PICTURES_BUCKET = 'profile_pictures';
const ROLE_OPTIONS = ['Member', 'Officer', 'Leader'];
const STATUS_OPTIONS = ['Active', 'Inactive'];
const APPLICATION_PENDING_ROLE = 'Pending Approval';
const APPLICATION_REJECTED_ROLE = 'Rejected';
const MEMBER_TABS = [
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending Approval' },
  { id: 'rejected', label: 'Rejected' },
];

function withColorAlpha(colorValue, alpha, fallback = '#0275d8') {
  const safeAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 1));
  const input = String(colorValue || '').trim();
  const hexMatch = input.match(/^#([0-9a-f]{6})$/i);
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16);
    const g = parseInt(hexMatch[1].slice(2, 4), 16);
    const b = parseInt(hexMatch[1].slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
  }
  return withColorAlpha(fallback, safeAlpha, '#0275d8');
}

function buildFullName(first, middle, last, suffix) {
  return [first, middle, last, suffix]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function formatDate(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit' });
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRoleKey(value) {
  return normalizeText(value).replace(/[\s_-]+/g, '');
}

function resolvePreferredMembership(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((row) => Boolean(row.Is_Primary))
    || list.find((row) => normalizeRoleKey(row.Membership_Role) === 'leader')
    || list[0]
    || null
  );
}

export default function ManageOrganizationMembersPage({ userProfile }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0275d8';
  const tertiaryColor = theme?.tertiaryColor || '#10b981';
  const primaryTextColor = theme?.primaryTextColor || '#0f172a';
  const secondaryTextColor = theme?.secondaryTextColor || '#64748b';
  const tertiaryTextColor = theme?.tertiaryTextColor || '#94a3b8';
  const headingFont = theme?.secondaryFontFamily || theme?.fontFamily || 'Poppins';
  const bodyFont = theme?.fontFamily || 'Poppins';

  const rootStyle = { color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` };
  const headingStyle = { color: primaryTextColor, fontFamily: `${headingFont}, sans-serif` };

  const [organizationId, setOrganizationId] = useState(null);
  const [organizationName, setOrganizationName] = useState('');
  const [currentMembershipRole, setCurrentMembershipRole] = useState('');
  const [members, setMembers] = useState([]);
  const [photoUrlsByPath, setPhotoUrlsByPath] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('active');
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('Member');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [pendingMemberId, setPendingMemberId] = useState(null);
  const [decisionModal, setDecisionModal] = useState({
    open: false,
    type: '',
    member: null,
    isSubmitting: false,
  });

  const isLeader = useMemo(() => {
    const roleKey = normalizeRoleKey(currentMembershipRole);
    return roleKey === 'leader';
  }, [currentMembershipRole]);

  const loadMembers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    if (!actorUserId) {
      setNotice({ kind: 'error', text: 'User profile is missing user_id. Please sign in again.' });
      return;
    }

    setIsLoading(true);
    setNotice({ kind: '', text: '' });

    try {
      const myMembershipsResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Organization_ID, Membership_Role, Is_Primary, Status, Created_At, Organizations:Organization_ID(Organization_Name)')
        .eq('User_ID', actorUserId)
        .order('Is_Primary', { ascending: false })
        .order('Created_At', { ascending: false });

      if (myMembershipsResult.error) throw myMembershipsResult.error;

      const preferred = resolvePreferredMembership(myMembershipsResult.data || []);
      if (!preferred?.Organization_ID) {
        setOrganizationId(null);
        setOrganizationName('');
        setMembers([]);
        setNotice({ kind: 'warning', text: 'No organization membership found for your account.' });
        return;
      }

      const orgId = Number(preferred.Organization_ID || 0) || null;
      setOrganizationId(orgId);
      setOrganizationName(String(preferred?.Organizations?.Organization_Name || '').trim());
      setCurrentMembershipRole(String(preferred.Membership_Role || ''));

      const membersResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Member_ID, User_ID, Membership_Role, Is_Primary, Status, Created_At')
        .eq('Organization_ID', orgId)
        .order('Is_Primary', { ascending: false })
        .order('Created_At', { ascending: true });

      if (membersResult.error) throw membersResult.error;

      const memberRows = membersResult.data || [];
      const userIds = Array.from(new Set(memberRows.map((row) => Number(row.User_ID || 0)).filter(Boolean)));

      let usersByUserId = {};
      let detailsByUserId = {};

      if (userIds.length) {
        const [usersResult, detailsResult] = await Promise.all([
          supabase.from(USERS_TABLE).select('user_id, email, role').in('user_id', userIds),
          supabase.from(USER_DETAILS_TABLE).select('user_id, first_name, middle_name, last_name, suffix, gender, photo_path').in('user_id', userIds),
        ]);

        if (usersResult.error) throw usersResult.error;
        if (detailsResult.error) throw detailsResult.error;

        usersByUserId = (usersResult.data || []).reduce((acc, row) => {
          acc[Number(row.user_id)] = row;
          return acc;
        }, {});
        detailsByUserId = (detailsResult.data || []).reduce((acc, row) => {
          acc[Number(row.user_id)] = row;
          return acc;
        }, {});
      }

      const enriched = memberRows.map((row) => {
        const userId = Number(row.User_ID || 0);
        const userRow = usersByUserId[userId] || {};
        const detailsRow = detailsByUserId[userId] || {};
        return {
          memberId: row.Member_ID,
          userId,
          email: userRow.email || '',
          systemRole: userRow.role || '',
          membershipRole: row.Membership_Role || 'Member',
          status: normalizeText(row.Status) === 'inactive' ? 'Inactive' : 'Active',
          isPrimary: Boolean(row.Is_Primary),
          createdAt: row.Created_At,
          fullName: buildFullName(detailsRow.first_name, detailsRow.middle_name, detailsRow.last_name, detailsRow.suffix) || `User #${userId}`,
          photoPath: detailsRow.photo_path || '',
        };
      });

      setMembers(enriched);

      const newPhotoPaths = enriched.map((row) => row.photoPath).filter((path) => path && !photoUrlsByPath[path]);
      if (newPhotoPaths.length) {
        const resolvedEntries = await Promise.all(
          newPhotoPaths.map(async (path) => {
            try {
              const { data } = supabase.storage.from(PROFILE_PICTURES_BUCKET).getPublicUrl(path);
              return [path, data?.publicUrl || ''];
            } catch {
              return [path, ''];
            }
          }),
        );
        setPhotoUrlsByPath((prev) => {
          const next = { ...prev };
          resolvedEntries.forEach(([path, url]) => {
            if (url) next[path] = url;
          });
          return next;
        });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load members.' });
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleAddMember = async () => {
    if (!organizationId) {
      setNotice({ kind: 'error', text: 'Organization scope is missing.' });
      return;
    }

    const email = String(addEmail || '').trim().toLowerCase();
    if (!email) {
      setNotice({ kind: 'error', text: 'Enter the email of an existing StrandShare user.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;

    setIsAddingMember(true);
    setNotice({ kind: '', text: '' });

    try {
      const userResult = await supabase
        .from(USERS_TABLE)
        .select('user_id, email')
        .ilike('email', email)
        .maybeSingle();

      if (userResult.error) throw userResult.error;
      const targetUser = userResult.data;
      if (!targetUser?.user_id) {
        setNotice({ kind: 'error', text: 'No StrandShare user found with that email. Ask Super Admin to invite them first.' });
        return;
      }

      const targetUserId = Number(targetUser.user_id);

      const existingResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Member_ID')
        .eq('Organization_ID', organizationId)
        .eq('User_ID', targetUserId)
        .maybeSingle();

      if (existingResult.error && existingResult.error.code !== 'PGRST116') {
        throw existingResult.error;
      }

      if (existingResult.data?.Member_ID) {
        setNotice({ kind: 'warning', text: 'That user is already a member of this organization.' });
        return;
      }

      const insertResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .insert({
          Organization_ID: organizationId,
          User_ID: targetUserId,
          Membership_Role: addRole || 'Member',
          Is_Primary: false,
          Status: 'Active',
          Created_By: actorUserId,
        })
        .select('Member_ID')
        .single();

      if (insertResult.error) throw insertResult.error;

      setAddEmail('');
      setAddRole('Member');
      setNotice({ kind: 'success', text: `${targetUser.email} added as ${addRole}.` });

      await logAuditAction({
        action: 'organization_members.add',
        description: `Added ${targetUser.email} as ${addRole} to organization ${organizationId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'success',
        userProfile,
      });

      await loadMembers();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to add member.' });
      await logAuditAction({
        action: 'organization_members.add',
        description: `Failed to add ${addEmail} to organization ${organizationId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setIsAddingMember(false);
    }
  };

  const handleUpdateMember = async (memberId, patch) => {
    setPendingMemberId(memberId);
    setNotice({ kind: '', text: '' });

    try {
      const updatePayload = { ...patch, Updated_At: new Date().toISOString() };
      const { error } = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .update(updatePayload)
        .eq('Member_ID', memberId);

      if (error) throw error;

      setMembers((prev) =>
        prev.map((row) => (row.memberId === memberId ? {
          ...row,
          membershipRole: patch.Membership_Role ?? row.membershipRole,
          status: patch.Status ?? row.status,
        } : row)),
      );

      setNotice({ kind: 'success', text: 'Member updated.' });

      await logAuditAction({
        action: 'organization_members.update',
        description: `Updated member ${memberId}: ${JSON.stringify(patch)}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'success',
        userProfile,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to update member.' });
      await logAuditAction({
        action: 'organization_members.update',
        description: `Failed to update member ${memberId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setPendingMemberId(null);
    }
  };

  const openDecisionModal = (type, member) => {
    if (!isLeader || !member) {
      return;
    }
    setDecisionModal({
      open: true,
      type,
      member,
      isSubmitting: false,
    });
  };

  const closeDecisionModal = () => {
    if (decisionModal.isSubmitting) {
      return;
    }
    setDecisionModal({
      open: false,
      type: '',
      member: null,
      isSubmitting: false,
    });
  };

  const handleConfirmDecision = async () => {
    const targetMember = decisionModal.member;
    if (!targetMember?.memberId) {
      closeDecisionModal();
      return;
    }

    let patch = null;
    let successText = 'Member updated.';
    const modalType = decisionModal.type;

    if (modalType === 'approve') {
      patch = { Membership_Role: 'Member', Status: 'Active' };
      successText = `${targetMember.fullName} approved as Member.`;
    } else if (modalType === 'reject') {
      patch = { Membership_Role: APPLICATION_REJECTED_ROLE, Status: 'Inactive' };
      successText = `${targetMember.fullName} moved to Rejected.`;
    } else if (modalType === 'reaccept') {
      patch = { Membership_Role: 'Member', Status: 'Active' };
      successText = `${targetMember.fullName} re-accepted as Member.`;
    }

    if (!patch) {
      closeDecisionModal();
      return;
    }

    setDecisionModal((prev) => ({ ...prev, isSubmitting: true }));
    setPendingMemberId(targetMember.memberId);
    setNotice({ kind: '', text: '' });

    try {
      const updatePayload = { ...patch, Updated_At: new Date().toISOString() };
      const { error } = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .update(updatePayload)
        .eq('Member_ID', targetMember.memberId);

      if (error) throw error;

      setMembers((prev) =>
        prev.map((row) => (row.memberId === targetMember.memberId ? {
          ...row,
          membershipRole: patch.Membership_Role ?? row.membershipRole,
          status: patch.Status ?? row.status,
        } : row)),
      );

      setNotice({ kind: 'success', text: successText });

      await logAuditAction({
        action: 'organization_members.application_decision',
        description: `${modalType} member ${targetMember.memberId}: ${JSON.stringify(patch)}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'success',
        userProfile,
      });

      closeDecisionModal();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to update member application.' });
      await logAuditAction({
        action: 'organization_members.application_decision',
        description: `Failed ${modalType} for member ${targetMember.memberId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'failed',
        userProfile,
      });
      setDecisionModal((prev) => ({ ...prev, isSubmitting: false }));
    } finally {
      setPendingMemberId(null);
    }
  };

  const handleRemoveMember = async (member) => {
    if (member.isPrimary) {
      setNotice({ kind: 'warning', text: 'Primary leader cannot be removed.' });
      return;
    }

    const confirmed = window.confirm(`Remove ${member.fullName} from ${organizationName || 'this organization'}?`);
    if (!confirmed) return;

    setPendingMemberId(member.memberId);
    setNotice({ kind: '', text: '' });

    try {
      const { error } = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .delete()
        .eq('Member_ID', member.memberId);

      if (error) throw error;

      setMembers((prev) => prev.filter((row) => row.memberId !== member.memberId));
      setNotice({ kind: 'success', text: `${member.fullName} removed from ${organizationName || 'organization'}.` });

      await logAuditAction({
        action: 'organization_members.remove',
        description: `Removed member ${member.memberId} (${member.email}) from organization ${organizationId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'success',
        userProfile,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to remove member.' });
      await logAuditAction({
        action: 'organization_members.remove',
        description: `Failed to remove member ${member.memberId}`,
        resource: ORGANIZATION_MEMBERS_TABLE,
        status: 'failed',
        userProfile,
      });
    } finally {
      setPendingMemberId(null);
    }
  };

  const membersByTab = useMemo(() => {
    const pendingRoleKey = normalizeRoleKey(APPLICATION_PENDING_ROLE);
    const rejectedRoleKey = normalizeRoleKey(APPLICATION_REJECTED_ROLE);

    return {
      active: members.filter((row) => {
        const roleKey = normalizeRoleKey(row.membershipRole);
        return roleKey !== pendingRoleKey && roleKey !== rejectedRoleKey;
      }),
      pending: members.filter((row) => normalizeRoleKey(row.membershipRole) === pendingRoleKey),
      rejected: members.filter((row) => normalizeRoleKey(row.membershipRole) === rejectedRoleKey),
    };
  }, [members]);

  const filteredMembers = useMemo(() => {
    const scopedMembers = membersByTab[activeTab] || [];
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return scopedMembers;
    return scopedMembers.filter((row) => (
      [row.fullName, row.email, row.membershipRole, row.status]
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(query))
    ));
  }, [activeTab, membersByTab, searchQuery]);

  const stats = useMemo(() => {
    const activeCount = members.filter((row) => normalizeText(row.status) === 'active').length;
    const leaderCount = members.filter((row) => normalizeRoleKey(row.membershipRole) === 'leader').length;
    return [
      { id: 'total', label: 'Total Members', value: members.length },
      { id: 'active', label: 'Active', value: activeCount },
      { id: 'pending', label: 'Pending Approval', value: membersByTab.pending.length },
      { id: 'rejected', label: 'Rejected', value: membersByTab.rejected.length },
      { id: 'leaders', label: 'Leaders', value: leaderCount },
    ];
  }, [members, membersByTab.pending.length, membersByTab.rejected.length]);

  return (
    <div className="space-y-5" style={rootStyle}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>
            Organization Workspace
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl" style={headingStyle}>
            Manage Organization Members
          </h1>
          <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
            Review active members plus pending and rejected membership applications for {organizationName || 'your organization'}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadMembers()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm hover:shadow disabled:opacity-60"
          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
        >
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {notice.text && (
        <div
          className="rounded-xl border px-3 py-2 text-sm font-medium"
          style={
            notice.kind === 'error'
              ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : notice.kind === 'success'
                ? { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', color: '#047857' }
                : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.id} className="rounded-xl border bg-white p-4" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>{stat.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: primaryTextColor }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-white p-4 md:p-5" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex items-center gap-2">
          <UserPlus size={18} style={{ color: primaryColor }} />
          <h2 className="text-lg font-semibold" style={headingStyle}>Add Member</h2>
        </div>
        <p className="mt-1 text-xs" style={{ color: tertiaryTextColor }}>
          User must already have a StrandShare account. New invites must come from Super Admin.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
          <input
            type="email"
            value={addEmail}
            onChange={(event) => setAddEmail(event.target.value)}
            placeholder="member@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none"
            style={{ color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` }}
            disabled={isAddingMember || !organizationId || !isLeader}
          />
          <select
            value={addRole}
            onChange={(event) => setAddRole(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none"
            style={{ color: primaryTextColor, fontFamily: `${bodyFont}, sans-serif` }}
            disabled={isAddingMember || !organizationId || !isLeader}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddMember}
            disabled={isAddingMember || !organizationId || !isLeader}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {isAddingMember ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Add Member
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex items-center gap-2">
            <Users size={18} style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold" style={headingStyle}>Member Applications</h2>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }}>
              {filteredMembers.length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5" style={{ borderColor: '#e2e8f0' }}>
            <Search size={14} style={{ color: tertiaryTextColor }} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search applications"
              className="bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
              style={{ color: primaryTextColor }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
          {MEMBER_TABS.map((tab) => {
            const count = (membersByTab[tab.id] || []).length;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={
                  isSelected
                    ? {
                        borderColor: withColorAlpha(primaryColor, 0.45),
                        backgroundColor: withColorAlpha(primaryColor, 0.12),
                        color: primaryColor,
                      }
                    : {
                        borderColor: '#e2e8f0',
                        backgroundColor: '#ffffff',
                        color: secondaryTextColor,
                      }
                }
              >
                <span>{tab.label}</span>
                <span>{count}</span>
              </button>
            );
          })}
        </div>

        {!filteredMembers.length && !isLoading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: secondaryTextColor }}>
            {activeTab === 'pending'
              ? 'No pending member applications.'
              : activeTab === 'rejected'
                ? 'No rejected member applications.'
                : 'No members found for the current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ backgroundColor: withColorAlpha(primaryColor, 0.08) }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Member</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Email</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Membership Role</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Status</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Joined</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: primaryTextColor }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const photoUrl = member.photoPath ? photoUrlsByPath[member.photoPath] : '';
                  const isProcessing = pendingMemberId === member.memberId;

                  return (
                    <tr key={member.memberId} className="border-t align-middle" style={{ borderColor: '#e2e8f0' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full"
                            style={{ backgroundColor: withColorAlpha(primaryColor, 0.12) }}
                          >
                            {photoUrl ? (
                              <img src={photoUrl} alt={member.fullName} className="h-full w-full object-cover" />
                            ) : (
                              <UserCircle2 size={24} style={{ color: primaryColor }} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold" style={{ color: primaryTextColor }}>
                              {member.fullName}
                              {member.isPrimary ? (
                                <span className="ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ borderColor: withColorAlpha(tertiaryColor, 0.4), backgroundColor: withColorAlpha(tertiaryColor, 0.12), color: tertiaryColor }}>
                                  <Crown size={10} />
                                  Primary
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-xs" style={{ color: tertiaryTextColor }}>User #{member.userId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{member.email || '-'}</td>
                      <td className="px-4 py-3">
                        {activeTab === 'active' ? (
                          <select
                            value={member.membershipRole}
                            onChange={(event) => handleUpdateMember(member.memberId, { Membership_Role: event.target.value })}
                            disabled={member.isPrimary || isProcessing || !isLeader}
                            className="rounded-lg border px-2 py-1 text-sm focus:outline-none disabled:opacity-60"
                            style={{ borderColor: '#cbd5e1', color: primaryTextColor }}
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                            {!ROLE_OPTIONS.includes(member.membershipRole) ? (
                              <option value={member.membershipRole}>{member.membershipRole}</option>
                            ) : null}
                          </select>
                        ) : (
                          <span className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold" style={{ borderColor: '#cbd5e1', color: secondaryTextColor }}>
                            {member.membershipRole || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {activeTab === 'active' ? (
                          <select
                            value={STATUS_OPTIONS.includes(member.status) ? member.status : 'Active'}
                            onChange={(event) => handleUpdateMember(member.memberId, { Status: event.target.value })}
                            disabled={member.isPrimary || isProcessing || !isLeader}
                            className="rounded-lg border px-2 py-1 text-sm focus:outline-none disabled:opacity-60"
                            style={{ borderColor: '#cbd5e1', color: primaryTextColor }}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="inline-flex rounded-full border px-2 py-1 text-xs font-semibold" style={{ borderColor: '#cbd5e1', color: secondaryTextColor }}>
                            {member.status || '-'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" style={{ color: tertiaryTextColor }}>{formatDate(member.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {activeTab === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openDecisionModal('approve', member)}
                              disabled={isProcessing || !isLeader}
                              className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                              style={{ borderColor: '#86efac', color: '#166534' }}
                            >
                              {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => openDecisionModal('reject', member)}
                              disabled={isProcessing || !isLeader}
                              className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                              style={{ borderColor: '#fecaca', color: '#b91c1c' }}
                            >
                              {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                              Reject
                            </button>
                          </div>
                        ) : activeTab === 'rejected' ? (
                          <button
                            type="button"
                            onClick={() => openDecisionModal('reaccept', member)}
                            disabled={isProcessing || !isLeader}
                            className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                            style={{ borderColor: '#93c5fd', color: '#1d4ed8' }}
                          >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                            Re-accept
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            disabled={member.isPrimary || isProcessing || !isLeader}
                            className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
                            style={{ borderColor: '#fecaca', color: '#b91c1c' }}
                          >
                            {isProcessing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            Remove
                          </button>
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

      {decisionModal.open && decisionModal.member ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
              Membership Decision
            </p>
            <h3 className="mt-1 text-lg font-semibold" style={headingStyle}>
              {decisionModal.type === 'approve'
                ? 'Approve Application'
                : decisionModal.type === 'reject'
                  ? 'Reject Application'
                  : 'Re-accept Member'}
            </h3>
            <p className="mt-2 text-sm" style={{ color: secondaryTextColor }}>
              {decisionModal.type === 'approve'
                ? `Approve ${decisionModal.member.fullName} as Member and set status to Active?`
                : decisionModal.type === 'reject'
                  ? `Reject ${decisionModal.member.fullName} and move to Rejected tab?`
                  : `Re-accept ${decisionModal.member.fullName} as Member and set status to Active?`}
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDecisionModal}
                disabled={decisionModal.isSubmitting}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={decisionModal.isSubmitting}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{
                  backgroundColor: decisionModal.type === 'reject' ? '#b91c1c' : primaryColor,
                }}
              >
                {decisionModal.isSubmitting ? <Loader2 size={14} className="animate-spin" /> : null}
                {decisionModal.type === 'approve'
                  ? 'Confirm Approve'
                  : decisionModal.type === 'reject'
                    ? 'Confirm Reject'
                    : 'Confirm Re-accept'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {!isLeader && organizationId ? (
        <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
          <div className="flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" style={{ color: '#b45309' }} />
            <p>
              You are viewing membership in read-only mode. Only Leaders can approve/reject applications or edit members.
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
        <div className="flex items-start gap-2">
          <CheckCircle2 size={14} className="mt-0.5" style={{ color: tertiaryColor }} />
          <p>
            Membership rows live in <code>Organization_Members</code>. Adding requires the user already exist in <code>users</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
