import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  PackageOpen,
  RefreshCw,
  ScanLine,
  XCircle,
} from 'lucide-react';
import jsQR from 'jsqr';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import { logAuditAction } from '../../../lib/auditLogger';
import {
  HAIR_SUBMISSION_STATUS,
  parseWaybillQrPayload,
  updateSubmissionStatus,
} from '../../../lib/hairSubmissionWorkflow';

const HAIR_SUBMISSIONS_TABLE = 'Hair_Submissions';
const HAIR_SUBMISSION_DETAILS_TABLE = 'Hair_Submission_Details';
const HAIR_SUBMISSION_IMAGES_TABLE = 'Hair_Submission_Images';
const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const USER_DETAILS_TABLE = 'user_details';
const PROFILE_PICTURES_BUCKET = 'profile_pictures';
const HAIR_SUBMISSIONS_BUCKET = 'hair_submissions';
const SCAN_DEBOUNCE_MS = 2500;

const ACTIVE_STATUSES = [
  HAIR_SUBMISSION_STATUS.CUT_SHIPPED,
  HAIR_SUBMISSION_STATUS.RECEIVED,
  HAIR_SUBMISSION_STATUS.APPROVED,
  HAIR_SUBMISSION_STATUS.REJECTED,
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

function statusBadgeStyle(status, primaryColor, tertiaryColor) {
  const key = String(status || '').toLowerCase();
  if (key === HAIR_SUBMISSION_STATUS.APPROVED.toLowerCase() || key.includes('approved')) {
    return { backgroundColor: withColorAlpha(tertiaryColor, 0.16), color: tertiaryColor, borderColor: withColorAlpha(tertiaryColor, 0.4) };
  }
  if (key === HAIR_SUBMISSION_STATUS.REJECTED.toLowerCase() || key.includes('rejected')) {
    return { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' };
  }
  if (key === HAIR_SUBMISSION_STATUS.RECEIVED.toLowerCase()) {
    return { backgroundColor: withColorAlpha(primaryColor, 0.14), color: primaryColor, borderColor: withColorAlpha(primaryColor, 0.4) };
  }
  if (key === HAIR_SUBMISSION_STATUS.CUT_SHIPPED.toLowerCase()) {
    return { backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' };
  }
  return { backgroundColor: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' };
}

export default function QualityCheckPage({ userProfile }) {
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

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scannerCanvasRef = useRef(null);
  const lastScanRef = useRef({ raw: '', at: 0 });
  const isScanProcessingRef = useRef(false);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraStatus, setCameraStatus] = useState({ tone: 'info', message: 'Camera is off. Turn it on to scan a waybill.' });

  const [queue, setQueue] = useState([]);
  const [activeSubmissionId, setActiveSubmissionId] = useState(null);
  const [activeDetail, setActiveDetail] = useState(null);
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [imageUrlsByPath, setImageUrlsByPath] = useState({});

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const loadQueue = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    setIsLoadingQueue(true);
    setNotice({ kind: '', text: '' });

    try {
      const submissionsResult = await supabase
        .from(HAIR_SUBMISSIONS_TABLE)
        .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code, Created_At, Updated_At, Bundle_ID')
        .in('Status', ACTIVE_STATUSES)
        .is('Bundle_ID', null)
        .order('Updated_At', { ascending: false })
        .limit(150);

      if (submissionsResult.error) throw submissionsResult.error;

      const rows = submissionsResult.data || [];
      const userIds = Array.from(new Set(rows.map((row) => Number(row.User_ID || 0)).filter(Boolean)));
      const driveIds = Array.from(new Set(rows.map((row) => Number(row.Donation_Drive_ID || 0)).filter(Boolean)));

      let usersByUserId = {};
      if (userIds.length) {
        const { data, error } = await supabase
          .from(USER_DETAILS_TABLE)
          .select('user_id, first_name, middle_name, last_name, suffix, photo_path')
          .in('user_id', userIds);
        if (error) throw error;
        usersByUserId = (data || []).reduce((acc, row) => {
          acc[Number(row.user_id)] = row;
          return acc;
        }, {});
      }

      let drivesByDriveId = {};
      if (driveIds.length) {
        const { data, error } = await supabase
          .from(DONATION_DRIVE_REQUESTS_TABLE)
          .select('Donation_Drive_ID, Event_Title')
          .in('Donation_Drive_ID', driveIds);
        if (error) throw error;
        drivesByDriveId = (data || []).reduce((acc, row) => {
          acc[Number(row.Donation_Drive_ID)] = row;
          return acc;
        }, {});
      }

      const enriched = rows.map((row) => {
        const userId = Number(row.User_ID || 0);
        const userDetails = usersByUserId[userId] || {};
        const drive = drivesByDriveId[Number(row.Donation_Drive_ID || 0)] || {};
        return {
          submissionId: row.Submission_ID,
          userId,
          donationDriveId: row.Donation_Drive_ID,
          status: row.Status,
          submissionCode: row.Submission_Code || `HS-${row.Submission_ID}`,
          createdAt: row.Created_At,
          updatedAt: row.Updated_At,
          donorName: buildFullName(userDetails.first_name, userDetails.middle_name, userDetails.last_name, userDetails.suffix) || `User #${userId}`,
          donorPhotoPath: userDetails.photo_path || '',
          eventTitle: drive.Event_Title || `Drive #${row.Donation_Drive_ID}`,
        };
      });

      setQueue(enriched);

      if (enriched.length && !enriched.some((r) => r.submissionId === activeSubmissionId)) {
        setActiveSubmissionId(enriched[0].submissionId);
      } else if (!enriched.length) {
        setActiveSubmissionId(null);
        setActiveDetail(null);
      }

      const photoPaths = enriched.map((r) => r.donorPhotoPath).filter((path) => path && !imageUrlsByPath[path]);
      if (photoPaths.length) {
        const resolved = await Promise.all(
          photoPaths.map(async (path) => {
            try {
              const { data } = supabase.storage.from(PROFILE_PICTURES_BUCKET).getPublicUrl(path);
              return [path, data?.publicUrl || ''];
            } catch {
              return [path, ''];
            }
          }),
        );
        setImageUrlsByPath((prev) => {
          const next = { ...prev };
          resolved.forEach(([path, url]) => {
            if (url) next[path] = url;
          });
          return next;
        });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load QA queue.' });
    } finally {
      setIsLoadingQueue(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubmissionId]);

  const loadDetail = useCallback(async (submissionId) => {
    if (!submissionId || !isSupabaseConfigured || !supabase) {
      setActiveDetail(null);
      return;
    }

    setIsLoadingDetail(true);

    try {
      const detailsResult = await supabase
        .from(HAIR_SUBMISSION_DETAILS_TABLE)
        .select('*')
        .eq('Submission_ID', submissionId)
        .order('Submission_Detail_ID', { ascending: true });

      if (detailsResult.error) throw detailsResult.error;
      const detailRows = detailsResult.data || [];
      const detailIds = detailRows.map((row) => Number(row.Submission_Detail_ID || 0)).filter(Boolean);

      let imagesByDetailId = {};
      if (detailIds.length) {
        const imagesResult = await supabase
          .from(HAIR_SUBMISSION_IMAGES_TABLE)
          .select('*')
          .in('Submission_Detail_ID', detailIds);
        if (imagesResult.error) throw imagesResult.error;
        imagesByDetailId = (imagesResult.data || []).reduce((acc, row) => {
          const key = Number(row.Submission_Detail_ID);
          if (!acc[key]) acc[key] = [];
          acc[key].push(row);
          return acc;
        }, {});
      }

      const allImagePaths = Object.values(imagesByDetailId)
        .flat()
        .map((row) => row.File_Path)
        .filter((path) => path && !imageUrlsByPath[path]);

      if (allImagePaths.length) {
        const resolved = await Promise.all(
          allImagePaths.map(async (path) => {
            try {
              const { data } = supabase.storage.from(HAIR_SUBMISSIONS_BUCKET).getPublicUrl(path);
              return [path, data?.publicUrl || ''];
            } catch {
              return [path, ''];
            }
          }),
        );
        setImageUrlsByPath((prev) => {
          const next = { ...prev };
          resolved.forEach(([path, url]) => {
            if (url) next[path] = url;
          });
          return next;
        });
      }

      setActiveDetail({
        details: detailRows,
        imagesByDetailId,
      });
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load submission detail.' });
      setActiveDetail(null);
    } finally {
      setIsLoadingDetail(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadQueue();
    return () => {
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeSubmissionId) {
      void loadDetail(activeSubmissionId);
    } else {
      setActiveDetail(null);
    }
    setShowRejectionInput(false);
    setRejectionReason('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubmissionId]);

  const handleScannedText = useCallback(async (decodedText) => {
    if (isScanProcessingRef.current) return;
    isScanProcessingRef.current = true;

    try {
      const waybill = parseWaybillQrPayload(decodedText);
      if (!waybill || (!waybill.submissionId && !waybill.submissionCode)) {
        setCameraStatus({ tone: 'error', message: 'Scan did not match a hair submission waybill.' });
        return;
      }

      let lookup = null;
      if (waybill.submissionId) {
        lookup = await supabase
          .from(HAIR_SUBMISSIONS_TABLE)
          .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code')
          .eq('Submission_ID', waybill.submissionId)
          .maybeSingle();
      } else {
        lookup = await supabase
          .from(HAIR_SUBMISSIONS_TABLE)
          .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code')
          .eq('Submission_Code', waybill.submissionCode)
          .maybeSingle();
      }

      if (lookup?.error) throw lookup.error;
      const submission = lookup?.data;
      if (!submission?.Submission_ID) {
        setCameraStatus({ tone: 'error', message: `No submission found for ${waybill.submissionCode || waybill.submissionId}.` });
        return;
      }

      const statusKey = String(submission.Status || '').toLowerCase();
      const submissionLabel = submission.Submission_Code || `#${submission.Submission_ID}`;

      if (statusKey === HAIR_SUBMISSION_STATUS.PENDING.toLowerCase()) {
        setCameraStatus({
          tone: 'warning',
          message: `Waybill ${submissionLabel} has not been marked Cut & Shipped by the event staff yet. Cannot intake.`,
        });
      } else if (statusKey === HAIR_SUBMISSION_STATUS.CUT_SHIPPED.toLowerCase()) {
        const { error: receiveError } = await updateSubmissionStatus({
          submissionId: submission.Submission_ID,
          nextStatus: HAIR_SUBMISSION_STATUS.RECEIVED,
          donorUserId: submission.User_ID,
          submissionCode: submission.Submission_Code,
          changedBy: Number(userProfile?.user_id || 0) || null,
        });
        if (receiveError) throw receiveError;

        await logAuditAction({
          action: 'hair_submissions.received',
          description: `Auto-marked waybill ${submissionLabel} as Received via scan.`,
          resource: HAIR_SUBMISSIONS_TABLE,
          status: 'success',
          userProfile,
        });

        setCameraStatus({
          tone: 'success',
          message: `Waybill ${submissionLabel} marked Received. Donor notified. Scan again to approve or reject.`,
        });
      } else if (statusKey === HAIR_SUBMISSION_STATUS.RECEIVED.toLowerCase()) {
        setCameraStatus({
          tone: 'info',
          message: `Waybill ${submissionLabel} loaded. Inspect the hair and choose Approve or Reject below.`,
        });
      } else {
        setCameraStatus({
          tone: 'info',
          message: `Waybill ${submissionLabel} is already ${submission.Status}. Read-only.`,
        });
      }

      setActiveSubmissionId(submission.Submission_ID);
      await loadQueue();
    } catch (error) {
      setCameraStatus({ tone: 'error', message: error?.message || 'Unable to load scanned waybill.' });
    } finally {
      isScanProcessingRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const handleToggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
      setIsCameraOn(false);
      setCameraStatus({ tone: 'info', message: 'Camera is off. Turn it on to scan a waybill.' });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus({ tone: 'error', message: 'Camera API is unavailable on this browser/device.' });
      return;
    }

    setIsStartingCamera(true);
    setCameraStatus({ tone: 'info', message: 'Initializing camera...' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }

      setIsCameraOn(true);
      setCameraStatus({ tone: 'success', message: 'Scanner is running. Point camera at a waybill QR.' });
    } catch (error) {
      setCameraStatus({ tone: 'error', message: error?.message || 'Could not access the camera.' });
    } finally {
      setIsStartingCamera(false);
    }
  };

  useEffect(() => {
    if (!isCameraOn) return undefined;

    const intervalId = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || isScanProcessingRef.current) return;

      const frameWidth = video.videoWidth;
      const frameHeight = video.videoHeight;
      if (!frameWidth || !frameHeight) return;

      try {
        if (!scannerCanvasRef.current) {
          scannerCanvasRef.current = document.createElement('canvas');
        }
        const canvas = scannerCanvasRef.current;
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, frameWidth, frameHeight);
        const imageData = ctx.getImageData(0, 0, frameWidth, frameHeight);
        const code = jsQR(imageData.data, frameWidth, frameHeight, { inversionAttempts: 'attemptBoth' });
        const decoded = String(code?.data || '').trim();
        if (!decoded) return;

        const now = Date.now();
        if (lastScanRef.current.raw === decoded && now - lastScanRef.current.at < SCAN_DEBOUNCE_MS) return;
        lastScanRef.current = { raw: decoded, at: now };

        void handleScannedText(decoded);
      } catch {
        // ignore frame-level decode errors
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isCameraOn, handleScannedText]);

  const handleSubmitManualCode = () => {
    const value = String(manualCode || '').trim();
    if (!value) return;
    setManualCode('');
    void handleScannedText(value);
  };

  const activeQueueRow = queue.find((row) => row.submissionId === activeSubmissionId) || null;

  const handleApprove = async () => {
    if (!activeQueueRow) return;
    setIsProcessingAction(true);
    setNotice({ kind: '', text: '' });
    try {
      const { error } = await updateSubmissionStatus({
        submissionId: activeQueueRow.submissionId,
        nextStatus: HAIR_SUBMISSION_STATUS.APPROVED,
        donorUserId: activeQueueRow.userId,
        submissionCode: activeQueueRow.submissionCode,
        eventTitle: activeQueueRow.eventTitle,
        changedBy: Number(userProfile?.user_id || 0) || null,
      });
      if (error) throw error;
      setNotice({ kind: 'success', text: 'Approved. Donor notified.' });
      await logAuditAction({
        action: 'hair_submissions.approved',
        description: `Approved ${activeQueueRow.submissionCode}.`,
        resource: HAIR_SUBMISSIONS_TABLE,
        status: 'success',
        userProfile,
      });
      await loadQueue();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to approve.' });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!activeQueueRow) return;
    const reason = String(rejectionReason || '').trim();
    if (!reason) {
      setNotice({ kind: 'warning', text: 'Provide a rejection reason.' });
      return;
    }

    setIsProcessingAction(true);
    setNotice({ kind: '', text: '' });
    try {
      const { error } = await updateSubmissionStatus({
        submissionId: activeQueueRow.submissionId,
        nextStatus: HAIR_SUBMISSION_STATUS.REJECTED,
        donorUserId: activeQueueRow.userId,
        submissionCode: activeQueueRow.submissionCode,
        eventTitle: activeQueueRow.eventTitle,
        reason,
        changedBy: Number(userProfile?.user_id || 0) || null,
      });
      if (error) throw error;

      if (activeDetail?.details?.length) {
        const firstDetailId = activeDetail.details[0].Submission_Detail_ID;
        if (firstDetailId) {
          await supabase
            .from(HAIR_SUBMISSION_DETAILS_TABLE)
            .update({ Detail_Notes: reason, Status: HAIR_SUBMISSION_STATUS.REJECTED })
            .eq('Submission_Detail_ID', firstDetailId);
        }
      }

      setNotice({ kind: 'success', text: 'Rejected. Donor notified.' });
      setShowRejectionInput(false);
      setRejectionReason('');
      await logAuditAction({
        action: 'hair_submissions.rejected',
        description: `Rejected ${activeQueueRow.submissionCode}: ${reason}`,
        resource: HAIR_SUBMISSIONS_TABLE,
        status: 'success',
        userProfile,
      });
      await loadQueue();
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to reject.' });
    } finally {
      setIsProcessingAction(false);
    }
  };

  const queueByStatus = useMemo(() => {
    const groups = { 'Cut & Shipped': [], Received: [], Approved: [], Rejected: [] };
    queue.forEach((row) => {
      if (groups[row.status]) groups[row.status].push(row);
    });
    return groups;
  }, [queue]);

  const cameraNoticeStyle = (() => {
    switch (cameraStatus.tone) {
      case 'success':
        return { backgroundColor: withColorAlpha(tertiaryColor, 0.14), color: tertiaryColor, borderColor: withColorAlpha(tertiaryColor, 0.5) };
      case 'error':
        return { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' };
      case 'warning':
        return { backgroundColor: '#fffbeb', color: '#b45309', borderColor: '#fde68a' };
      default:
        return { backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor, borderColor: withColorAlpha(primaryColor, 0.45) };
    }
  })();

  const activeStatusKey = String(activeQueueRow?.status || '').toLowerCase();
  const isAwaitingScan = activeStatusKey === HAIR_SUBMISSION_STATUS.CUT_SHIPPED.toLowerCase();
  const canDecide = activeStatusKey === HAIR_SUBMISSION_STATUS.RECEIVED.toLowerCase();

  return (
    <div className="space-y-6" style={rootStyle}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={headingStyle}>Quality Check</h1>
          <p style={{ color: secondaryTextColor }}>
            Scan an incoming waybill, mark it received, then approve or reject after inspection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadQueue()}
          disabled={isLoadingQueue}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
        >
          {isLoadingQueue ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {notice.text && (
        <div
          className="rounded-xl border px-3 py-2 text-sm font-medium"
          style={
            notice.kind === 'error' ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : notice.kind === 'success' ? { borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', color: '#047857' }
                : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-white p-5" style={{ borderColor: '#e2e8f0' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ScanLine size={20} style={{ color: primaryColor }} />
              <h2 className="text-lg font-semibold" style={headingStyle}>Waybill Scanner</h2>
            </div>
            <button
              type="button"
              onClick={handleToggleCamera}
              disabled={isStartingCamera}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: isCameraOn ? '#dc2626' : tertiaryColor }}
            >
              {isStartingCamera ? <Loader2 className="animate-spin" size={16} /> : isCameraOn ? <CameraOff size={16} /> : <Camera size={16} />}
              {isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            </button>
          </div>

          <div className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-xl bg-gray-900 flex items-center justify-center">
            <video ref={videoRef} className={`h-full w-full object-cover ${isCameraOn ? '' : 'hidden'}`} autoPlay playsInline muted />
            {!isCameraOn ? (
              <div className="text-center px-6" style={{ color: '#cbd5e1' }}>
                <Camera className="mx-auto mb-2 opacity-60" size={36} />
                <p className="text-sm">Camera preview will appear here.</p>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" style={cameraNoticeStyle}>
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{cameraStatus.message}</span>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium mb-1" style={{ color: primaryTextColor }}>
              Or enter waybill code manually
            </label>
            <div className="flex gap-2">
              <input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSubmitManualCode();
                  }
                }}
                placeholder="HS-2026-000042"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                style={{ color: primaryTextColor }}
              />
              <button
                type="button"
                onClick={handleSubmitManualCode}
                disabled={!String(manualCode || '').trim()}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: primaryColor }}
              >
                Lookup
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5" style={{ borderColor: '#e2e8f0' }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={headingStyle}>Submission Review</h2>
            {activeQueueRow ? (
              <span
                className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                style={statusBadgeStyle(activeQueueRow.status, primaryColor, tertiaryColor)}
              >
                {activeQueueRow.status}
              </span>
            ) : null}
          </div>

          {!activeQueueRow ? (
            <p className="text-sm" style={{ color: secondaryTextColor }}>
              Scan a waybill or pick a row from the queue to begin.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
                  style={{ backgroundColor: withColorAlpha(primaryColor, 0.12) }}
                >
                  {activeQueueRow.donorPhotoPath && imageUrlsByPath[activeQueueRow.donorPhotoPath] ? (
                    <img src={imageUrlsByPath[activeQueueRow.donorPhotoPath]} alt={activeQueueRow.donorName} className="h-full w-full object-cover" />
                  ) : (
                    <PackageOpen size={24} style={{ color: primaryColor }} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: primaryTextColor }}>{activeQueueRow.donorName}</p>
                  <p className="text-xs" style={{ color: secondaryTextColor }}>
                    {activeQueueRow.submissionCode} - {activeQueueRow.eventTitle}
                  </p>
                </div>
              </div>

              {isLoadingDetail ? (
                <div className="flex items-center gap-2 text-sm" style={{ color: secondaryTextColor }}>
                  <Loader2 size={14} className="animate-spin" /> Loading submission details...
                </div>
              ) : activeDetail?.details?.length ? (
                <>
                  {activeDetail.details.map((detail) => {
                    const images = activeDetail.imagesByDetailId[detail.Submission_Detail_ID] || [];
                    return (
                      <div key={detail.Submission_Detail_ID} className="rounded-lg border p-3" style={{ borderColor: '#e2e8f0' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: tertiaryTextColor }}>
                          Declared Attributes
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-sm" style={{ color: primaryTextColor }}>
                          <div><span style={{ color: secondaryTextColor }}>Length:</span> {detail.Declared_Length ? `${detail.Declared_Length} in` : 'Not provided'}</div>
                          <div><span style={{ color: secondaryTextColor }}>Color:</span> {detail.Declared_Color || 'Not provided'}</div>
                          <div><span style={{ color: secondaryTextColor }}>Texture:</span> {detail.Declared_Texture || 'Not provided'}</div>
                          <div><span style={{ color: secondaryTextColor }}>Density:</span> {detail.Declared_Density || 'Not provided'}</div>
                          <div><span style={{ color: secondaryTextColor }}>Condition:</span> {detail.Declared_Condition || 'Not provided'}</div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          {[
                            { label: 'Chemically Treated', value: detail.Is_Chemically_Treated },
                            { label: 'Colored', value: detail.Is_Colored },
                            { label: 'Bleached', value: detail.Is_Bleached },
                            { label: 'Rebonded', value: detail.Is_Rebonded },
                          ].map((flag) => (
                            <span
                              key={flag.label}
                              className="rounded-full border px-2 py-1"
                              style={
                                flag.value
                                  ? { backgroundColor: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }
                                  : { backgroundColor: '#f8fafc', color: secondaryTextColor, borderColor: '#e2e8f0' }
                              }
                            >
                              {flag.label}: {flag.value ? 'Yes' : 'No'}
                            </span>
                          ))}
                        </div>

                        {detail.Detail_Notes ? (
                          <div className="mt-3 text-xs" style={{ color: secondaryTextColor }}>
                            <span className="font-semibold" style={{ color: primaryTextColor }}>Notes: </span>
                            {detail.Detail_Notes}
                          </div>
                        ) : null}

                        {images.length ? (
                          <div className="mt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: tertiaryTextColor }}>
                              Inspection Photos
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {images.map((image) => {
                                const url = imageUrlsByPath[image.File_Path];
                                return (
                                  <div key={image.Image_ID} className="aspect-square overflow-hidden rounded-lg border bg-slate-100" style={{ borderColor: '#e2e8f0' }}>
                                    {url ? (
                                      <img src={url} alt={image.Image_Type || 'hair'} className="h-full w-full object-cover" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center" style={{ color: tertiaryTextColor }}>
                                        <ImageIcon size={20} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="text-sm" style={{ color: secondaryTextColor }}>
                  No declared attributes from the donor's mobile app yet for this submission.
                </p>
              )}

              {showRejectionInput ? (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: primaryTextColor }}>
                    Rejection reason
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    rows={3}
                    placeholder="Explain why this hair did not pass QA (donor will see this)."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none"
                    style={{ color: primaryTextColor }}
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {isAwaitingScan ? (
                  <p className="text-xs" style={{ color: tertiaryTextColor }}>
                    Scan this waybill with the camera scanner above to mark it as Received.
                  </p>
                ) : null}

                {canDecide ? (
                  <>
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={isProcessingAction}
                      className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: tertiaryColor }}
                    >
                      {isProcessingAction ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Approve
                    </button>
                    {showRejectionInput ? (
                      <button
                        type="button"
                        onClick={handleReject}
                        disabled={isProcessingAction || !rejectionReason.trim()}
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: '#dc2626' }}
                      >
                        {isProcessingAction ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        Confirm Rejection
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowRejectionInput(true)}
                        disabled={isProcessingAction}
                        className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-60"
                        style={{ borderColor: '#fecaca', color: '#b91c1c' }}
                      >
                        <XCircle size={14} />
                        Reject
                      </button>
                    )}
                  </>
                ) : null}

                {!isAwaitingScan && !canDecide ? (
                  <p className="text-xs" style={{ color: tertiaryTextColor }}>
                    No further QA action available for this status.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: '#e2e8f0' }}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: '#e2e8f0' }}>
          <h2 className="text-lg font-semibold" style={headingStyle}>Active Queue</h2>
          <span className="text-xs" style={{ color: tertiaryTextColor }}>{queue.length} in flight</span>
        </div>

        {!queue.length && !isLoadingQueue ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: secondaryTextColor }}>
            No submissions in the QA queue yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-4">
            {Object.entries(queueByStatus).map(([statusLabel, rows]) => (
              <div key={statusLabel} className="rounded-lg border bg-slate-50 p-3" style={{ borderColor: '#e2e8f0' }}>
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={statusBadgeStyle(statusLabel, primaryColor, tertiaryColor)}
                  >
                    {statusLabel}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: tertiaryTextColor }}>{rows.length}</span>
                </div>
                <div className="space-y-2">
                  {!rows.length ? (
                    <p className="text-xs" style={{ color: tertiaryTextColor }}>None.</p>
                  ) : (
                    rows.map((row) => {
                      const isActive = row.submissionId === activeSubmissionId;
                      return (
                        <button
                          key={row.submissionId}
                          type="button"
                          onClick={() => setActiveSubmissionId(row.submissionId)}
                          className="w-full rounded-lg border bg-white px-3 py-2 text-left transition"
                          style={
                            isActive
                              ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.08) }
                              : { borderColor: '#e2e8f0' }
                          }
                        >
                          <p className="font-mono text-xs font-semibold" style={{ color: primaryTextColor }}>{row.submissionCode}</p>
                          <p className="mt-0.5 truncate text-xs" style={{ color: secondaryTextColor }}>{row.donorName}</p>
                          <p className="truncate text-[11px]" style={{ color: tertiaryTextColor }}>{row.eventTitle}</p>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
