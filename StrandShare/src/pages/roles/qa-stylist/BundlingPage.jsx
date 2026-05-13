import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Package,
  PenSquare,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { logAuditAction } from '../../../lib/auditLogger';
import {
  BUNDLE_HAIR_COUNT_TARGET_MAX,
  BUNDLE_HAIR_COUNT_TARGET_MIN,
  HAIR_BUNDLE_STATUS,
  HAIR_SUBMISSION_STATUS,
  buildBundleSubmissionCode,
  buildBundleWaybillQrPayload,
  createWigBundle,
  deleteBundleDraft,
  finalizeBundleDraft,
  saveBundleDraft,
  updateBundleDraft,
} from '../../../lib/hairSubmissionWorkflow';

const HAIR_SUBMISSIONS_TABLE = 'Hair_Submissions';
const HAIR_SUBMISSION_BUNDLES_TABLE = 'Hair_Submission_Bundles';
const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const USER_DETAILS_TABLE = 'user_details';

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

function formatDateTime(value) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function bundleStatusStyle(statusKey, primaryColor, tertiaryColor, secondaryTextColor) {
  switch (statusKey) {
    case HAIR_BUNDLE_STATUS.WIG_COMPLETED.toLowerCase():
      return { backgroundColor: withColorAlpha(tertiaryColor, 0.16), color: tertiaryColor, borderColor: withColorAlpha(tertiaryColor, 0.4) };
    case HAIR_BUNDLE_STATUS.IN_PRODUCTION.toLowerCase():
      return { backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor, borderColor: withColorAlpha(primaryColor, 0.4) };
    case HAIR_BUNDLE_STATUS.DRAFT.toLowerCase():
      return { backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' };
    default:
      return { backgroundColor: '#f1f5f9', color: secondaryTextColor, borderColor: '#cbd5e1' };
  }
}

export default function BundlingPage({ userProfile }) {
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

  const [approvedHairs, setApprovedHairs] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [bundleMembersByBundleId, setBundleMembersByBundleId] = useState({});
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState([]);
  const [bundleNotes, setBundleNotes] = useState('');
  const [editingDraftId, setEditingDraftId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isFinalizingDraftId, setIsFinalizingDraftId] = useState(null);
  const [isDeletingDraftId, setIsDeletingDraftId] = useState(null);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [activePrintBundle, setActivePrintBundle] = useState(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    setIsLoading(true);
    setNotice({ kind: '', text: '' });

    try {
      const approvedResult = await supabase
        .from(HAIR_SUBMISSIONS_TABLE)
        .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code, Updated_At')
        .eq('Status', HAIR_SUBMISSION_STATUS.APPROVED)
        .is('Bundle_ID', null)
        .order('Updated_At', { ascending: true });

      if (approvedResult.error) throw approvedResult.error;
      const approvedRows = approvedResult.data || [];

      const userIds = Array.from(new Set(approvedRows.map((r) => Number(r.User_ID || 0)).filter(Boolean)));
      const driveIds = Array.from(new Set(approvedRows.map((r) => Number(r.Donation_Drive_ID || 0)).filter(Boolean)));

      let usersByUserId = {};
      if (userIds.length) {
        const { data, error } = await supabase
          .from(USER_DETAILS_TABLE)
          .select('user_id, first_name, middle_name, last_name, suffix')
          .in('user_id', userIds);
        if (error) throw error;
        usersByUserId = (data || []).reduce((acc, r) => { acc[Number(r.user_id)] = r; return acc; }, {});
      }

      let drivesByDriveId = {};
      if (driveIds.length) {
        const { data, error } = await supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .select('Donation_Drive_ID, Event_Title')
          .in('Donation_Drive_ID', driveIds);
        if (error) throw error;
        drivesByDriveId = (data || []).reduce((acc, r) => { acc[Number(r.Donation_Drive_ID)] = r; return acc; }, {});
      }

      const enrichedApproved = approvedRows.map((row) => {
        const userId = Number(row.User_ID || 0);
        const userDetails = usersByUserId[userId] || {};
        const drive = drivesByDriveId[Number(row.Donation_Drive_ID || 0)] || {};
        return {
          submissionId: row.Submission_ID,
          submissionCode: row.Submission_Code || `HS-${row.Submission_ID}`,
          userId,
          donorName: buildFullName(userDetails.first_name, userDetails.middle_name, userDetails.last_name, userDetails.suffix) || `User #${userId}`,
          eventTitle: drive.Event_Title || `Drive #${row.Donation_Drive_ID}`,
          updatedAt: row.Updated_At,
        };
      });

      setApprovedHairs(enrichedApproved);

      const bundlesResult = await supabase
        .from(HAIR_SUBMISSION_BUNDLES_TABLE)
        .select('Bundle_ID, Status, Submission_Code, Notes, Created_At, Wig_Completed_At, Created_By, Draft_Submission_IDs')
        .order('Created_At', { ascending: false })
        .limit(100);

      if (bundlesResult.error) throw bundlesResult.error;
      const bundleRows = bundlesResult.data || [];
      setBundles(bundleRows);

      const nonDraftBundleIds = bundleRows
        .filter((r) => String(r.Status || '').toLowerCase() !== HAIR_BUNDLE_STATUS.DRAFT.toLowerCase())
        .map((r) => r.Bundle_ID);
      if (nonDraftBundleIds.length) {
        const membersResult = await supabase
          .from(HAIR_SUBMISSIONS_TABLE)
          .select('Submission_ID, User_ID, Submission_Code, Status, Bundle_ID')
          .in('Bundle_ID', nonDraftBundleIds);
        if (membersResult.error) throw membersResult.error;

        const grouped = (membersResult.data || []).reduce((acc, row) => {
          const key = Number(row.Bundle_ID);
          if (!acc[key]) acc[key] = [];
          acc[key].push(row);
          return acc;
        }, {});
        setBundleMembersByBundleId(grouped);
      } else {
        setBundleMembersByBundleId({});
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load bundling data.' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredApproved = useMemo(() => {
    const q = String(searchQuery || '').trim().toLowerCase();
    if (!q) return approvedHairs;
    return approvedHairs.filter((row) =>
      [row.submissionCode, row.donorName, row.eventTitle]
        .map((v) => String(v || '').toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [approvedHairs, searchQuery]);

  const drafts = useMemo(() => bundles.filter((b) => String(b.Status || '').toLowerCase() === HAIR_BUNDLE_STATUS.DRAFT.toLowerCase()), [bundles]);
  const activeBundles = useMemo(() => bundles.filter((b) => String(b.Status || '').toLowerCase() !== HAIR_BUNDLE_STATUS.DRAFT.toLowerCase()), [bundles]);

  const toggleSelect = (submissionId) => {
    setSelectedSubmissionIds((prev) =>
      prev.includes(submissionId) ? prev.filter((x) => x !== submissionId) : [...prev, submissionId],
    );
  };

  const selectedCount = selectedSubmissionIds.length;
  const inTargetRange = selectedCount >= BUNDLE_HAIR_COUNT_TARGET_MIN && selectedCount <= BUNDLE_HAIR_COUNT_TARGET_MAX;

  const clearWorkspace = () => {
    setSelectedSubmissionIds([]);
    setBundleNotes('');
    setEditingDraftId(null);
  };

  const handleResumeDraft = (draft) => {
    const ids = Array.isArray(draft.Draft_Submission_IDs) ? draft.Draft_Submission_IDs.map((x) => Number(x) || 0).filter(Boolean) : [];
    setEditingDraftId(draft.Bundle_ID);
    setSelectedSubmissionIds(ids);
    setBundleNotes(String(draft.Notes || ''));
    setNotice({ kind: 'info', text: `Editing draft #${draft.Bundle_ID}. Save Draft to update, or Finalize Bundle when ready.` });
  };

  const handleSaveDraft = async () => {
    if (!selectedCount) {
      setNotice({ kind: 'warning', text: 'Pick at least one approved hair to save a draft.' });
      return;
    }
    setIsSavingDraft(true);
    setNotice({ kind: '', text: '' });
    try {
      if (editingDraftId) {
        const { error } = await updateBundleDraft({
          bundleId: editingDraftId,
          submissionIds: selectedSubmissionIds,
          notes: bundleNotes,
        });
        if (error) throw error;
        setNotice({ kind: 'success', text: `Draft #${editingDraftId} updated with ${selectedCount} hair${selectedCount === 1 ? '' : 's'}.` });
      } else {
        const { data, error } = await saveBundleDraft({
          submissionIds: selectedSubmissionIds,
          createdBy: Number(userProfile?.user_id || 0) || null,
          notes: bundleNotes,
        });
        if (error) throw error;
        setNotice({ kind: 'success', text: `Draft #${data.Bundle_ID} saved with ${selectedCount} hair${selectedCount === 1 ? '' : 's'}.` });
      }
      clearWorkspace();
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to save draft.' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleFinalizeDraft = async (draft) => {
    const draftIds = Array.isArray(draft.Draft_Submission_IDs) ? draft.Draft_Submission_IDs : [];
    if (!draftIds.length) {
      setNotice({ kind: 'warning', text: 'This draft has no selected hairs.' });
      return;
    }
    if (draftIds.length < BUNDLE_HAIR_COUNT_TARGET_MIN || draftIds.length > BUNDLE_HAIR_COUNT_TARGET_MAX) {
      const proceed = window.confirm(
        `Draft has ${draftIds.length} hair${draftIds.length === 1 ? '' : 's'}. Target is ${BUNDLE_HAIR_COUNT_TARGET_MIN}-${BUNDLE_HAIR_COUNT_TARGET_MAX}. Finalize anyway?`,
      );
      if (!proceed) return;
    }

    setIsFinalizingDraftId(draft.Bundle_ID);
    setNotice({ kind: '', text: '' });
    try {
      const { data, error } = await finalizeBundleDraft({
        bundleId: draft.Bundle_ID,
        finalizedBy: Number(userProfile?.user_id || 0) || null,
      });
      if (error) throw error;

      setNotice({ kind: 'success', text: `Bundle ${data.Submission_Code} is now In Production. ${data.members.length} donor${data.members.length === 1 ? '' : 's'} notified.` });
      await logAuditAction({
        action: 'hair_submission_bundles.finalize_draft',
        description: `Finalized draft into bundle ${data.Submission_Code}.`,
        resource: HAIR_SUBMISSION_BUNDLES_TABLE,
        status: 'success',
        userProfile,
      });

      if (editingDraftId === draft.Bundle_ID) clearWorkspace();
      await loadData();
      setActivePrintBundle({
        bundleId: data.Bundle_ID,
        submissionCode: data.Submission_Code,
        notes: data.Notes || '',
        memberCount: data.members.length,
        createdAt: data.Created_At,
        qrDataUrl: '',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to finalize draft.' });
    } finally {
      setIsFinalizingDraftId(null);
    }
  };

  const handleDeleteDraft = async (draft) => {
    const proceed = window.confirm(`Delete draft #${draft.Bundle_ID}? This cannot be undone.`);
    if (!proceed) return;
    setIsDeletingDraftId(draft.Bundle_ID);
    setNotice({ kind: '', text: '' });
    try {
      const { error } = await deleteBundleDraft({ bundleId: draft.Bundle_ID });
      if (error) throw error;
      setNotice({ kind: 'success', text: `Draft #${draft.Bundle_ID} deleted.` });
      if (editingDraftId === draft.Bundle_ID) clearWorkspace();
      await loadData();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to delete draft.' });
    } finally {
      setIsDeletingDraftId(null);
    }
  };

  const handleCreateBundle = async () => {
    if (!selectedCount) {
      setNotice({ kind: 'warning', text: 'Pick at least one approved hair to bundle.' });
      return;
    }

    if (!inTargetRange) {
      const proceed = window.confirm(
        `You picked ${selectedCount} hair${selectedCount === 1 ? '' : 's'}. Target is ${BUNDLE_HAIR_COUNT_TARGET_MIN}-${BUNDLE_HAIR_COUNT_TARGET_MAX}. Create bundle anyway?`,
      );
      if (!proceed) return;
    }

    setIsCreatingBundle(true);
    setNotice({ kind: '', text: '' });

    try {
      // If user is editing a draft, finalize that path instead.
      if (editingDraftId) {
        const draft = bundles.find((b) => b.Bundle_ID === editingDraftId);
        if (draft) {
          // Save current selection into the draft first, then finalize.
          await updateBundleDraft({
            bundleId: editingDraftId,
            submissionIds: selectedSubmissionIds,
            notes: bundleNotes,
          });
          const { data, error } = await finalizeBundleDraft({
            bundleId: editingDraftId,
            finalizedBy: Number(userProfile?.user_id || 0) || null,
          });
          if (error) throw error;

          setNotice({ kind: 'success', text: `Bundle ${data.Submission_Code} created from draft. ${data.members.length} donor${data.members.length === 1 ? '' : 's'} notified.` });
          clearWorkspace();
          await loadData();
          setActivePrintBundle({
            bundleId: data.Bundle_ID,
            submissionCode: data.Submission_Code,
            notes: data.Notes || '',
            memberCount: data.members.length,
            createdAt: data.Created_At,
            qrDataUrl: '',
          });
          return;
        }
      }

      const { data: bundle, error } = await createWigBundle({
        submissionIds: selectedSubmissionIds,
        createdBy: Number(userProfile?.user_id || 0) || null,
        notes: bundleNotes,
      });

      if (error) throw error;

      setNotice({ kind: 'success', text: `Bundle ${bundle.Submission_Code} created with ${bundle.members.length} hair${bundle.members.length === 1 ? '' : 's'}. All donors notified.` });
      await logAuditAction({
        action: 'hair_submission_bundles.create',
        description: `Created bundle ${bundle.Submission_Code} with ${bundle.members.length} hairs.`,
        resource: HAIR_SUBMISSION_BUNDLES_TABLE,
        status: 'success',
        userProfile,
      });

      clearWorkspace();
      await loadData();
      setActivePrintBundle({
        bundleId: bundle.Bundle_ID,
        submissionCode: bundle.Submission_Code,
        notes: bundle.Notes || '',
        memberCount: bundle.members.length,
        createdAt: bundle.Created_At,
        qrDataUrl: '',
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to create bundle.' });
    } finally {
      setIsCreatingBundle(false);
    }
  };

  const handleOpenPrint = async (bundleRow) => {
    const code = bundleRow.Submission_Code || buildBundleSubmissionCode({ bundleId: bundleRow.Bundle_ID, createdAt: bundleRow.Created_At });
    let qrDataUrl = '';
    try {
      qrDataUrl = await QRCode.toDataURL(
        buildBundleWaybillQrPayload({ bundleId: bundleRow.Bundle_ID, submissionCode: code }),
        { errorCorrectionLevel: 'M', margin: 1, scale: 8 },
      );
    } catch {
      qrDataUrl = '';
    }
    setActivePrintBundle({
      bundleId: bundleRow.Bundle_ID,
      submissionCode: code,
      notes: bundleRow.Notes || '',
      memberCount: (bundleMembersByBundleId[bundleRow.Bundle_ID] || []).length,
      createdAt: bundleRow.Created_At,
      qrDataUrl,
    });
  };

  useEffect(() => {
    if (activePrintBundle && !activePrintBundle.qrDataUrl && activePrintBundle.bundleId) {
      let cancelled = false;
      QRCode.toDataURL(
        buildBundleWaybillQrPayload({ bundleId: activePrintBundle.bundleId, submissionCode: activePrintBundle.submissionCode }),
        { errorCorrectionLevel: 'M', margin: 1, scale: 8 },
      ).then((url) => {
        if (!cancelled) {
          setActivePrintBundle((prev) => (prev && prev.bundleId === activePrintBundle.bundleId ? { ...prev, qrDataUrl: url } : prev));
        }
      });
      return () => { cancelled = true; };
    }
    return undefined;
  }, [activePrintBundle]);

  const handlePrint = () => {
    if (typeof window !== 'undefined' && window.print) window.print();
  };

  const handleSavePdf = () => {
    if (!activePrintBundle?.qrDataUrl) return;
    setIsExportingPdf(true);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.text('STRANDSHARE WIG BUNDLE WAYBILL', pageWidth / 2, margin + 6, { align: 'center' });

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('Scan on Upload Wig Stocks after wig completion', pageWidth / 2, margin + 12, { align: 'center' });

      const qrSize = 70;
      pdf.addImage(activePrintBundle.qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, margin + 18, qrSize, qrSize);

      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.text(activePrintBundle.submissionCode, pageWidth / 2, margin + 96, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Hairs in bundle: ${activePrintBundle.memberCount}`, pageWidth / 2, margin + 104, { align: 'center' });
      if (activePrintBundle.notes) {
        pdf.setFontSize(9);
        pdf.text(activePrintBundle.notes, pageWidth / 2, margin + 110, { align: 'center', maxWidth: pageWidth - 2 * margin });
      }

      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        'Keep this waybill with the bundle. After the wig is finished, scan it on Upload Wig Stocks > Complete Wig from Bundle to fan-notify donors.',
        pageWidth / 2,
        pageHeight - margin,
        { align: 'center', maxWidth: pageWidth - 2 * margin },
      );

      pdf.save(`bundle-${activePrintBundle.submissionCode}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const stats = useMemo(() => {
    const inProduction = activeBundles.filter((b) => String(b.Status || '').toLowerCase() === HAIR_BUNDLE_STATUS.IN_PRODUCTION.toLowerCase()).length;
    const wigCompleted = activeBundles.filter((b) => String(b.Status || '').toLowerCase() === HAIR_BUNDLE_STATUS.WIG_COMPLETED.toLowerCase()).length;
    return [
      { id: 'approved', label: 'Approved hairs awaiting bundle', value: approvedHairs.length },
      { id: 'drafts', label: 'Drafts', value: drafts.length },
      { id: 'inProduction', label: 'In Production', value: inProduction },
      { id: 'wigCompleted', label: 'Wig Completed', value: wigCompleted },
    ];
  }, [approvedHairs, drafts, activeBundles]);

  const countBadgeStyle = inTargetRange
    ? { backgroundColor: withColorAlpha(tertiaryColor, 0.16), color: tertiaryColor, borderColor: withColorAlpha(tertiaryColor, 0.4) }
    : selectedCount === 0
      ? { backgroundColor: '#f1f5f9', color: secondaryTextColor, borderColor: '#e2e8f0' }
      : { backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' };

  return (
    <div className="space-y-6" style={rootStyle}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={headingStyle}>Bundling</h1>
          <p style={{ color: secondaryTextColor }}>
            Group {BUNDLE_HAIR_COUNT_TARGET_MIN}-{BUNDLE_HAIR_COUNT_TARGET_MAX} approved hairs into a wig bundle. Save as draft if you are not ready, or finalize to print the bundle waybill. The post-wig scan now lives on Upload Wig Stocks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
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
            notice.kind === 'error' ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : notice.kind === 'success' ? { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', color: '#047857' }
                : notice.kind === 'info' ? { borderColor: withColorAlpha(primaryColor, 0.35), backgroundColor: withColorAlpha(primaryColor, 0.08), color: primaryColor }
                  : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.id} className="rounded-xl border bg-white p-4" style={{ borderColor: '#e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>{s.label}</p>
            <p className="mt-1 text-2xl font-bold" style={{ color: primaryTextColor }}>{s.value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex items-center gap-2">
            <Package size={18} style={{ color: primaryColor }} />
            <h2 className="text-lg font-semibold" style={headingStyle}>Approved Hairs Awaiting Bundle</h2>
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }}>
              {approvedHairs.length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-1.5" style={{ borderColor: '#e2e8f0' }}>
            <Search size={14} style={{ color: tertiaryTextColor }} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search code, donor, event"
              className="bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
              style={{ color: primaryTextColor }}
            />
          </div>
        </div>

        {!approvedHairs.length ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: secondaryTextColor }}>
            No approved hairs are awaiting bundling.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-4 md:grid-cols-2">
            {filteredApproved.map((row) => {
              const isSelected = selectedSubmissionIds.includes(row.submissionId);
              return (
                <label
                  key={row.submissionId}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border bg-white px-3 py-2.5 text-sm"
                  style={
                    isSelected
                      ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.06) }
                      : { borderColor: '#e2e8f0' }
                  }
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(row.submissionId)}
                    style={{ accentColor: primaryColor, marginTop: 2 }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-semibold" style={{ color: primaryTextColor }}>{row.submissionCode}</p>
                    <p className="truncate text-sm" style={{ color: primaryTextColor }}>{row.donorName}</p>
                    <p className="truncate text-xs" style={{ color: tertiaryTextColor }}>{row.eventTitle}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: '#e2e8f0' }}>
          {editingDraftId ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: withColorAlpha(primaryColor, 0.35), backgroundColor: withColorAlpha(primaryColor, 0.06), color: primaryColor }}>
              <PenSquare size={14} />
              <span className="font-semibold">Editing draft #{editingDraftId}</span>
              <button
                type="button"
                onClick={clearWorkspace}
                className="ml-auto text-xs font-semibold underline"
                style={{ color: secondaryTextColor }}
              >
                Cancel edit
              </button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
              style={countBadgeStyle}
            >
              {selectedCount} selected
              {!inTargetRange && selectedCount > 0 ? ` (target ${BUNDLE_HAIR_COUNT_TARGET_MIN}-${BUNDLE_HAIR_COUNT_TARGET_MAX})` : ''}
            </span>
            {selectedCount > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedSubmissionIds([])}
                className="text-xs font-semibold underline"
                style={{ color: secondaryTextColor }}
              >
                Clear selection
              </button>
            ) : null}
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: secondaryTextColor }}>Bundle notes (optional)</label>
            <textarea
              value={bundleNotes}
              onChange={(event) => setBundleNotes(event.target.value)}
              rows={2}
              placeholder="e.g. Long black bundle for upcoming hospital request"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none"
              style={{ color: primaryTextColor }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || !selectedCount}
              className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
              style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
            >
              {isSavingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {editingDraftId ? 'Update Draft' : 'Save as Draft'}
            </button>

            <button
              type="button"
              onClick={handleCreateBundle}
              disabled={isCreatingBundle || !selectedCount}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {isCreatingBundle ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
              {editingDraftId ? 'Finalize Bundle' : 'Create Bundle'}
            </button>
          </div>
        </div>
      </section>

      {drafts.length ? (
        <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: '#e2e8f0' }}>
          <div className="border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
            <div className="flex items-center gap-2">
              <PenSquare size={18} style={{ color: primaryColor }} />
              <h2 className="text-lg font-semibold" style={headingStyle}>Drafts</h2>
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: '#fffbeb', color: '#b45309' }}>
                {drafts.length}
              </span>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#e2e8f0' }}>
            {drafts.map((draft) => {
              const draftIds = Array.isArray(draft.Draft_Submission_IDs) ? draft.Draft_Submission_IDs : [];
              const isFinalizing = isFinalizingDraftId === draft.Bundle_ID;
              const isDeleting = isDeletingDraftId === draft.Bundle_ID;
              return (
                <div key={draft.Bundle_ID} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold" style={{ color: primaryTextColor }}>Draft #{draft.Bundle_ID}</span>
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' }}>
                        Draft
                      </span>
                      <span className="text-xs" style={{ color: tertiaryTextColor }}>
                        {draftIds.length} hair{draftIds.length === 1 ? '' : 's'} - saved {formatDateTime(draft.Created_At)}
                      </span>
                    </div>
                    {draft.Notes ? (
                      <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>{draft.Notes}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResumeDraft(draft)}
                      className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold"
                      style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
                    >
                      <PenSquare size={12} />
                      Resume
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFinalizeDraft(draft)}
                      disabled={isFinalizing}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: tertiaryColor }}
                    >
                      {isFinalizing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      Finalize
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft)}
                      disabled={isDeleting}
                      className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                      style={{ borderColor: '#fecaca', color: '#b91c1c' }}
                    >
                      {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-white" style={{ borderColor: '#e2e8f0' }}>
        <div className="border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: '#e2e8f0' }}>
          <h2 className="text-lg font-semibold" style={headingStyle}>Bundles</h2>
          <span className="text-xs" style={{ color: tertiaryTextColor }}>{activeBundles.length} total</span>
        </div>

        {!activeBundles.length && !isLoading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: secondaryTextColor }}>No bundles created yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ backgroundColor: withColorAlpha(primaryColor, 0.08) }}>
                <tr>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Code</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Status</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Hairs</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Notes</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Created</th>
                  <th className="px-4 py-3 text-left font-semibold" style={{ color: primaryTextColor }}>Wig Completed</th>
                  <th className="px-4 py-3 text-right font-semibold" style={{ color: primaryTextColor }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeBundles.map((bundle) => {
                  const memberCount = (bundleMembersByBundleId[bundle.Bundle_ID] || []).length;
                  const statusKey = String(bundle.Status || '').toLowerCase();
                  return (
                    <tr key={bundle.Bundle_ID} className="border-t" style={{ borderColor: '#e2e8f0' }}>
                      <td className="px-4 py-3 font-mono" style={{ color: primaryTextColor }}>{bundle.Submission_Code || `WB-${bundle.Bundle_ID}`}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold" style={bundleStatusStyle(statusKey, primaryColor, tertiaryColor, secondaryTextColor)}>
                          {bundle.Status}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{memberCount}</td>
                      <td className="px-4 py-3" style={{ color: secondaryTextColor }}>{bundle.Notes || '-'}</td>
                      <td className="px-4 py-3" style={{ color: tertiaryTextColor }}>{formatDateTime(bundle.Created_At)}</td>
                      <td className="px-4 py-3" style={{ color: tertiaryTextColor }}>{bundle.Wig_Completed_At ? formatDateTime(bundle.Wig_Completed_At) : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenPrint(bundle)}
                          className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold"
                          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
                        >
                          <FileText size={12} />
                          Print Waybill
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {activePrintBundle ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:static print:bg-white print:p-0">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 print:hidden" style={{ borderColor: '#e2e8f0' }}>
              <div>
                <h3 className="text-base font-semibold" style={headingStyle}>Bundle Waybill</h3>
                <p className="text-xs" style={{ color: tertiaryTextColor }}>{activePrintBundle.submissionCode}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSavePdf}
                  disabled={isExportingPdf || !activePrintBundle.qrDataUrl}
                  className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
                >
                  {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Save as PDF
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setActivePrintBundle(null)}
                  className="rounded-md border p-1.5 text-slate-500 hover:bg-slate-50"
                  style={{ borderColor: '#e2e8f0' }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="strandshare-bundle-print-area flex-1 overflow-y-auto bg-slate-100 p-4 print:overflow-visible print:bg-white print:p-0">
              <article
                className="mx-auto max-w-md rounded-2xl border-2 border-dashed bg-white p-6 text-center shadow-sm print:m-0 print:rounded-none print:border-2 print:border-solid print:shadow-none"
                style={{ borderColor: withColorAlpha(primaryColor, 0.5) }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: primaryColor }}>
                  StrandShare Wig Bundle Waybill
                </p>
                <p className="mt-1 text-xs font-semibold" style={{ color: secondaryTextColor }}>
                  Scan on Upload Wig Stocks when wig is completed
                </p>

                {activePrintBundle.qrDataUrl ? (
                  <img src={activePrintBundle.qrDataUrl} alt={`QR for ${activePrintBundle.submissionCode}`} className="mx-auto my-4 h-48 w-48" />
                ) : (
                  <div className="mx-auto my-4 flex h-48 w-48 items-center justify-center text-xs" style={{ color: tertiaryTextColor }}>
                    <ImageIcon size={24} />
                    <span className="ml-1">Generating QR...</span>
                  </div>
                )}

                <p className="text-lg font-bold" style={{ color: primaryTextColor }}>{activePrintBundle.submissionCode}</p>
                <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>Hairs in bundle: {activePrintBundle.memberCount}</p>
                {activePrintBundle.notes ? (
                  <p className="mt-2 text-xs italic" style={{ color: tertiaryTextColor }}>{activePrintBundle.notes}</p>
                ) : null}

                <p className="mt-4 text-[10px] leading-snug" style={{ color: tertiaryTextColor }}>
                  Keep this waybill with the bundle. After the wig is completed, scan it on Upload Wig Stocks &gt; Complete Wig from Bundle to fan-notify donors.
                </p>
              </article>
            </div>
          </div>

          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .strandshare-bundle-print-area, .strandshare-bundle-print-area * { visibility: visible !important; }
              .strandshare-bundle-print-area { position: absolute !important; inset: 0 !important; padding: 12mm !important; background: #fff !important; }
            }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}
