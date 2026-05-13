import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Download,
  FileText,
  Loader2,
  MapPin,
  Navigation,
  Printer,
  RefreshCw,
  Search,
  Users,
  UserCircle2,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsPDF from 'jspdf';
import { useTheme } from '../../../context/ThemeContext';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';
import {
  HAIR_SUBMISSION_STATUS,
  buildSubmissionCode,
  buildWaybillQrPayload,
  ensureSubmissionForRegistration,
  insertNotification,
} from '../../../lib/hairSubmissionWorkflow';

const DONATION_DRIVE_REQUESTS_TABLE = 'Donation_Drive_Requests';
const DONATION_DRIVE_REGISTRATIONS_TABLE = 'Donation_Drive_Registrations';
const ORGANIZATION_MEMBERS_TABLE = 'Organization_Members';
const USER_DETAILS_TABLE = 'user_details';
const PROFILE_PICTURES_BUCKET = 'profile_pictures';

const EVENT_LIST_FILTERS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'all', label: 'All' },
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

  const rgbMatch = input.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    const [r, g, b] = rgbMatch.slice(1).map((channel) => Math.max(0, Math.min(255, Number(channel) || 0)));
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

function formatDateOnly(value) {
  if (!value) return 'Date TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date TBD';
  return parsed.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTimeOnly(value) {
  if (!value) return 'Time TBD';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Time TBD';
  return parsed.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
}

function formatDateRange(startDate, endDate) {
  if (!startDate && !endDate) return 'No schedule set';
  if (!startDate) return `Until ${formatDateOnly(endDate)}`;
  if (!endDate) return `Starts ${formatDateOnly(startDate)}`;
  return `${formatDateOnly(startDate)} - ${formatDateOnly(endDate)}`;
}

function getDriveTimelineLabel(row) {
  const start = row.Start_Date ? new Date(row.Start_Date) : null;
  const end = row.End_Date ? new Date(row.End_Date) : null;
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (start && end && start <= dayEnd && end >= dayStart) return 'Today';
  if (start && start > dayEnd) return 'Upcoming';
  if (end && end < dayStart) return 'Ended';
  if (start && start <= now) return 'In Progress';
  return 'Scheduled';
}

function inFilterRange(row, filterId) {
  const start = row.Start_Date ? new Date(row.Start_Date) : null;
  const end = row.End_Date ? new Date(row.End_Date) : null;
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const weekEnd = new Date(dayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (filterId === 'all') return true;
  if (filterId === 'today') {
    if (start && end) return start <= dayEnd && end >= dayStart;
    if (start) return start >= dayStart && start <= dayEnd;
    if (end) return end >= dayStart && end <= dayEnd;
    return false;
  }
  if (filterId === 'week') {
    if (start && end) return start <= weekEnd && end >= dayStart;
    if (start) return start >= dayStart && start <= weekEnd;
    if (end) return end >= dayStart && end <= weekEnd;
    return false;
  }
  return true;
}

function buildLocationLabel(row) {
  return [row.Street, row.Barangay, row.City, row.Province, row.Region, row.Country]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function buildMapsUrl(row) {
  const lat = row.Latitude;
  const lng = row.Longitude;
  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const location = buildLocationLabel(row);
  if (!location) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export default function ViewDrivePage({ userProfile }) {
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
  const [drives, setDrives] = useState([]);
  const [activeDriveId, setActiveDriveId] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [photoUrlsByPath, setPhotoUrlsByPath] = useState({});
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [eventFilterId, setEventFilterId] = useState('all');
  const [isLoadingDrives, setIsLoadingDrives] = useState(false);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const [isWaybillModalOpen, setIsWaybillModalOpen] = useState(false);
  const [isPreparingWaybills, setIsPreparingWaybills] = useState(false);
  const [waybillRows, setWaybillRows] = useState([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const printAreaRef = useRef(null);

  const loadOrgAndDrives = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    if (!actorUserId) {
      setNotice({ kind: 'error', text: 'User profile is missing user_id. Please sign in again.' });
      return;
    }

    setIsLoadingDrives(true);
    setNotice({ kind: '', text: '' });

    try {
      const membershipResult = await supabase
        .from(ORGANIZATION_MEMBERS_TABLE)
        .select('Organization_ID, Is_Primary, Status, Created_At, Organizations:Organization_ID(Organization_Name)')
        .eq('User_ID', actorUserId)
        .order('Is_Primary', { ascending: false })
        .order('Created_At', { ascending: false });

      if (membershipResult.error) throw membershipResult.error;

      const membership = (membershipResult.data || []).find((row) => row.Organization_ID) || null;
      if (!membership?.Organization_ID) {
        setOrganizationId(null);
        setOrganizationName('');
        setDrives([]);
        setNotice({ kind: 'warning', text: 'No organization membership found for your account.' });
        return;
      }

      const orgId = Number(membership.Organization_ID || 0) || null;
      const orgName = String(membership?.Organizations?.Organization_Name || '').trim();
      setOrganizationId(orgId);
      setOrganizationName(orgName);

      const drivesResult = await supabase
        .from(DONATION_DRIVE_REQUESTS_TABLE)
        .select('Donation_Drive_ID, Event_Title, Event_Overview, Start_Date, End_Date, Street, Barangay, City, Province, Region, Country, Latitude, Longitude, Status, Donation_Setup_Type, Updated_At')
        .eq('Organization_ID', orgId)
        .order('Start_Date', { ascending: true });

      if (drivesResult.error) throw drivesResult.error;

      const rows = drivesResult.data || [];
      setDrives(rows);

      if (rows.length && !rows.some((r) => r.Donation_Drive_ID === activeDriveId)) {
        setActiveDriveId(rows[0].Donation_Drive_ID);
      } else if (!rows.length) {
        setActiveDriveId(null);
      }
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to load drives.' });
    } finally {
      setIsLoadingDrives(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);

  const loadAttendees = useCallback(async (driveId) => {
    if (!isSupabaseConfigured || !supabase || !driveId) {
      setAttendees([]);
      return;
    }

    setIsLoadingAttendees(true);

    try {
      const registrationsResult = await supabase
        .from(DONATION_DRIVE_REGISTRATIONS_TABLE)
        .select('Registration_ID, User_ID, Registration_Status, Attendance_Status, Registered_At')
        .eq('Donation_Drive_ID', driveId)
        .order('Registered_At', { ascending: true });

      if (registrationsResult.error) throw registrationsResult.error;

      const rows = registrationsResult.data || [];
      const userIds = Array.from(new Set(rows.map((row) => Number(row.User_ID || 0)).filter(Boolean)));

      if (!userIds.length) {
        setAttendees([]);
        return;
      }

      const detailsResult = await supabase
        .from(USER_DETAILS_TABLE)
        .select('user_id, first_name, middle_name, last_name, suffix, gender, photo_path, contact_number')
        .in('user_id', userIds);

      if (detailsResult.error) throw detailsResult.error;

      const detailsByUserId = (detailsResult.data || []).reduce((acc, row) => {
        acc[Number(row.user_id)] = row;
        return acc;
      }, {});

      const attendeeRows = rows.map((row) => {
        const details = detailsByUserId[Number(row.User_ID)] || {};
        return {
          registrationId: row.Registration_ID,
          userId: row.User_ID,
          fullName: buildFullName(details.first_name, details.middle_name, details.last_name, details.suffix) || `User #${row.User_ID}`,
          gender: details.gender || '',
          contactNumber: details.contact_number || '',
          photoPath: details.photo_path || '',
        };
      });

      setAttendees(attendeeRows);

      const newPhotoPaths = attendeeRows
        .map((row) => row.photoPath)
        .filter((path) => path && !photoUrlsByPath[path]);

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
      setNotice({ kind: 'error', text: error?.message || 'Unable to load attendees.' });
      setAttendees([]);
    } finally {
      setIsLoadingAttendees(false);
    }
  }, [photoUrlsByPath]);

  const prepareWaybills = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }
    const drive = drives.find((row) => row.Donation_Drive_ID === activeDriveId) || null;
    if (!drive || !attendees.length) {
      setNotice({ kind: 'warning', text: 'No registered attendees to print waybills for.' });
      return;
    }

    setIsPreparingWaybills(true);
    setNotice({ kind: '', text: '' });

    try {
      const driveId = drive.Donation_Drive_ID;
      const eventTitle = String(drive.Event_Title || `Drive #${driveId}`);
      const actorUserId = Number(userProfile?.user_id || 0) || null;

      const prepared = [];
      for (const attendee of attendees) {
        const { data: submission, error } = await ensureSubmissionForRegistration({
          donationDriveId: driveId,
          organizationId,
          userId: attendee.userId,
          createdBy: actorUserId,
        });

        if (error || !submission?.Submission_ID) {
          continue;
        }

        const submissionCode = submission.Submission_Code
          || buildSubmissionCode({ submissionId: submission.Submission_ID, createdAt: submission.Created_At });

        const qrPayload = buildWaybillQrPayload({
          submissionId: submission.Submission_ID,
          submissionCode,
          donationDriveId: driveId,
        });

        let qrDataUrl = '';
        try {
          qrDataUrl = await QRCode.toDataURL(qrPayload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            scale: 6,
          });
        } catch {
          qrDataUrl = '';
        }

        const isNewlyIssued = String(submission.Status || '').toLowerCase() === 'pending'
          && !submission.Submission_Code;

        if (isNewlyIssued) {
          await insertNotification({
            userId: attendee.userId,
            title: 'Waybill issued',
            message: `Your waybill ${submissionCode} has been issued for ${eventTitle}. Please bring it to the event for hair collection.`,
            submissionId: submission.Submission_ID,
          });
        }

        prepared.push({
          submissionId: submission.Submission_ID,
          submissionCode,
          status: submission.Status || HAIR_SUBMISSION_STATUS.PENDING,
          donor: attendee,
          qrDataUrl,
          eventTitle,
          driveId,
        });
      }

      if (!prepared.length) {
        setNotice({ kind: 'error', text: 'No waybills could be prepared. Please try again.' });
        return;
      }

      setWaybillRows(prepared);
      setIsWaybillModalOpen(true);
    } catch (error) {
      setNotice({ kind: 'error', text: error?.message || 'Unable to prepare waybills.' });
    } finally {
      setIsPreparingWaybills(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendees, drives, activeDriveId, organizationId, userProfile?.user_id]);

  const handlePrintWaybills = () => {
    if (typeof window !== 'undefined' && window.print) {
      window.print();
    }
  };

  const handleSaveWaybillsPdf = async () => {
    if (!waybillRows.length) return;
    setIsExportingPdf(true);
    try {
      const pdf = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'portrait' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;

      waybillRows.forEach((waybill, index) => {
        if (index > 0) pdf.addPage();

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text('STRANDSHARE WAYBILL', pageWidth / 2, margin + 6, { align: 'center' });

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(waybill.eventTitle, pageWidth / 2, margin + 12, { align: 'center' });

        if (waybill.qrDataUrl) {
          const qrSize = 60;
          pdf.addImage(waybill.qrDataUrl, 'PNG', (pageWidth - qrSize) / 2, margin + 18, qrSize, qrSize);
        }

        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text(waybill.submissionCode, pageWidth / 2, margin + 86, { align: 'center' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        const donorLines = [
          `Donor: ${waybill.donor.fullName}`,
          `Drive #${waybill.driveId}`,
          `Status: ${waybill.status}`,
          'Hand to event volunteer after RSVP.',
          'Bag this waybill with your donated hair.',
        ];
        donorLines.forEach((line, lineIndex) => {
          pdf.text(line, pageWidth / 2, margin + 96 + lineIndex * 5, { align: 'center' });
        });

        pdf.setFontSize(8);
        pdf.setTextColor(120);
        pdf.text(
          'Scan this QR to track status: pending -> cut & shipped -> received -> approved -> bundled -> wig created.',
          pageWidth / 2,
          pageHeight - margin,
          { align: 'center', maxWidth: pageWidth - 2 * margin },
        );
        pdf.setTextColor(0);
      });

      const safeTitle = String(waybillRows[0]?.eventTitle || 'event').replace(/[^a-z0-9-_]/gi, '-').slice(0, 60);
      pdf.save(`waybills-${safeTitle || 'event'}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  useEffect(() => {
    void loadOrgAndDrives();
  }, [loadOrgAndDrives]);

  useEffect(() => {
    if (activeDriveId) {
      void loadAttendees(activeDriveId);
    } else {
      setAttendees([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDriveId]);

  const filteredDrives = useMemo(() => {
    const query = String(eventSearchQuery || '').trim().toLowerCase();
    return drives
      .filter((row) => inFilterRange(row, eventFilterId))
      .filter((row) => {
        if (!query) return true;
        return [row.Event_Title, row.City, row.Province, buildLocationLabel(row)]
          .map((value) => String(value || '').toLowerCase())
          .some((value) => value.includes(query));
      });
  }, [drives, eventSearchQuery, eventFilterId]);

  const selectedDrive = useMemo(() => drives.find((row) => row.Donation_Drive_ID === activeDriveId) || null, [drives, activeDriveId]);

  return (
    <div className="space-y-5" style={rootStyle}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: secondaryTextColor }}>
            Organization Workspace
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl" style={headingStyle}>
            View Drive
          </h1>
          <p className="mt-1 text-sm" style={{ color: secondaryTextColor }}>
            Browse drives hosted by {organizationName || 'your organization'} and review attendee profiles per event.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadOrgAndDrives()}
          disabled={isLoadingDrives}
          className="inline-flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold shadow-sm hover:shadow disabled:opacity-60"
          style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
        >
          {isLoadingDrives ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </header>

      {notice.text && (
        <div
          className="rounded-xl border px-3 py-2 text-sm font-medium"
          style={
            notice.kind === 'error'
              ? { borderColor: '#fecaca', backgroundColor: '#fef2f2', color: '#b91c1c' }
              : { borderColor: '#fde68a', backgroundColor: '#fffbeb', color: '#b45309' }
          }
        >
          {notice.text}
        </div>
      )}

      {!drives.length && !isLoadingDrives ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
          No donation drives have been created for {organizationName || 'your organization'} yet.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2e8f0' }}>
            <div className="border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: primaryTextColor }}>Hosted Drives</h2>
                <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }}>
                  {drives.length}
                </span>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-lg border bg-slate-50 px-2.5 py-2" style={{ borderColor: '#e2e8f0' }}>
                <Search size={14} style={{ color: tertiaryTextColor }} />
                <input
                  value={eventSearchQuery}
                  onChange={(event) => setEventSearchQuery(event.target.value)}
                  placeholder="Search events"
                  className="w-full bg-transparent text-sm placeholder:text-slate-400 focus:outline-none"
                  style={{ color: primaryTextColor }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {EVENT_LIST_FILTERS.map((filter) => {
                  const isActive = eventFilterId === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setEventFilterId(filter.id)}
                      className="rounded-full border px-2.5 py-1 text-xs font-semibold transition"
                      style={
                        isActive
                          ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }
                          : { borderColor: '#e2e8f0', backgroundColor: '#ffffff', color: secondaryTextColor }
                      }
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="max-h-[650px] space-y-2 overflow-y-auto px-3 py-3">
              {!filteredDrives.length ? (
                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
                  No events matched your filter.
                </div>
              ) : (
                filteredDrives.map((row) => {
                  const isActive = row.Donation_Drive_ID === activeDriveId;
                  return (
                    <button
                      key={row.Donation_Drive_ID}
                      type="button"
                      onClick={() => setActiveDriveId(row.Donation_Drive_ID)}
                      className="w-full rounded-xl border px-3 py-2 text-left transition"
                      style={
                        isActive
                          ? { borderColor: primaryColor, backgroundColor: withColorAlpha(primaryColor, 0.1) }
                          : { borderColor: '#e2e8f0', backgroundColor: '#ffffff' }
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="line-clamp-1 text-sm font-semibold" style={{ color: primaryTextColor }}>
                            {row.Event_Title || `Drive #${row.Donation_Drive_ID}`}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-xs" style={{ color: secondaryTextColor }}>
                            {row.Status || 'Pending'}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold" style={{ color: tertiaryTextColor }}>{formatTimeOnly(row.Start_Date)}</span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: tertiaryTextColor }}>
                        <span>{formatDateOnly(row.Start_Date)}</span>
                        <span className="rounded-full border px-2 py-0.5 font-semibold" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
                          {getDriveTimelineLabel(row)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <section className="space-y-4">
            {selectedDrive ? (
              <>
                <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2e8f0' }}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                          style={{ borderColor: withColorAlpha(primaryColor, 0.4), backgroundColor: withColorAlpha(primaryColor, 0.12), color: primaryColor }}
                        >
                          {getDriveTimelineLabel(selectedDrive)}
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: tertiaryTextColor }}>
                          Event ID: #EV-{selectedDrive.Donation_Drive_ID}
                        </span>
                        <span className="rounded-full border px-2.5 py-1 text-[11px] font-semibold" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
                          {selectedDrive.Donation_Setup_Type || 'Not set'}
                        </span>
                      </div>

                      <h2 className="mt-2 text-3xl font-bold leading-tight" style={headingStyle}>
                        {selectedDrive.Event_Title || `Drive #${selectedDrive.Donation_Drive_ID}`}
                      </h2>

                      <p className="mt-2 flex items-start gap-2 text-sm" style={{ color: secondaryTextColor }}>
                        <MapPin size={15} className="mt-0.5 shrink-0" style={{ color: tertiaryTextColor }} />
                        {buildLocationLabel(selectedDrive) || 'No address provided'}
                      </p>

                      <p className="mt-1 flex items-center gap-2 text-sm" style={{ color: secondaryTextColor }}>
                        <CalendarDays size={15} style={{ color: tertiaryTextColor }} />
                        {formatDateRange(selectedDrive.Start_Date, selectedDrive.End_Date)}
                      </p>
                    </div>

                    <a
                      href={buildMapsUrl(selectedDrive) || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!buildMapsUrl(selectedDrive)}
                      className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-50"
                      style={{
                        borderColor: buildMapsUrl(selectedDrive) ? withColorAlpha(primaryColor, 0.35) : '#e2e8f0',
                        color: buildMapsUrl(selectedDrive) ? primaryColor : tertiaryTextColor,
                        pointerEvents: buildMapsUrl(selectedDrive) ? 'auto' : 'none',
                      }}
                    >
                      <Navigation size={13} />
                      Directions
                    </a>
                  </div>

                  {selectedDrive.Event_Overview ? (
                    <p className="mt-3 text-sm" style={{ color: secondaryTextColor }}>{selectedDrive.Event_Overview}</p>
                  ) : null}
                </div>

                <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2e8f0' }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: '#e2e8f0' }}>
                    <div className="flex items-center gap-2">
                      <Users size={18} style={{ color: primaryColor }} />
                      <h3 className="text-base font-semibold" style={headingStyle}>Attendees</h3>
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: withColorAlpha(tertiaryColor, 0.14), color: tertiaryColor }}>
                        {attendees.length}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isLoadingAttendees ? (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: tertiaryTextColor }}>
                          <Loader2 size={12} className="animate-spin" /> Loading attendees...
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={prepareWaybills}
                        disabled={isPreparingWaybills || !attendees.length}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {isPreparingWaybills ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Print Waybills
                      </button>
                    </div>
                  </div>

                  {!attendees.length && !isLoadingAttendees ? (
                    <div className="px-4 py-8 text-center text-sm" style={{ color: secondaryTextColor }}>
                      No attendees registered for this event yet.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                      {attendees.map((attendee) => {
                        const photoUrl = attendee.photoPath ? photoUrlsByPath[attendee.photoPath] : '';
                        return (
                          <div
                            key={attendee.registrationId}
                            className="flex items-center gap-3 rounded-xl border bg-white p-3"
                            style={{ borderColor: '#e2e8f0' }}
                          >
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
                              style={{ backgroundColor: withColorAlpha(primaryColor, 0.12) }}
                            >
                              {photoUrl ? (
                                <img src={photoUrl} alt={attendee.fullName} className="h-full w-full object-cover" />
                              ) : (
                                <UserCircle2 size={28} style={{ color: primaryColor }} />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold" style={{ color: primaryTextColor }}>{attendee.fullName}</p>
                              <p className="truncate text-xs" style={{ color: secondaryTextColor }}>
                                {[attendee.gender, attendee.contactNumber].filter(Boolean).join(' - ') || 'No profile contact'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border bg-white p-6 text-center text-sm" style={{ borderColor: '#e2e8f0', color: secondaryTextColor }}>
                Select an event from the left to view its attendees.
              </div>
            )}
          </section>
        </div>
      )}

      {isWaybillModalOpen && waybillRows.length ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 print:static print:bg-white print:p-0">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:max-h-none print:max-w-none print:rounded-none print:shadow-none">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 print:hidden" style={{ borderColor: '#e2e8f0' }}>
              <div>
                <h3 className="text-base font-semibold" style={headingStyle}>Waybill Print Preview</h3>
                <p className="text-xs" style={{ color: tertiaryTextColor }}>
                  {waybillRows.length} waybill{waybillRows.length === 1 ? '' : 's'} - {waybillRows[0]?.eventTitle}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveWaybillsPdf}
                  disabled={isExportingPdf}
                  className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
                  style={{ borderColor: withColorAlpha(primaryColor, 0.35), color: primaryColor }}
                >
                  {isExportingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  Save as PDF
                </button>
                <button
                  type="button"
                  onClick={handlePrintWaybills}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <Printer size={14} />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setIsWaybillModalOpen(false)}
                  className="rounded-md border p-1.5 text-slate-500 hover:bg-slate-50"
                  style={{ borderColor: '#e2e8f0' }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div ref={printAreaRef} className="flex-1 overflow-y-auto bg-slate-100 p-4 print:overflow-visible print:bg-white print:p-0">
              <div className="strandshare-waybill-print-area mx-auto grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 print:gap-0">
                {waybillRows.map((waybill) => (
                  <article
                    key={waybill.submissionId}
                    className="rounded-2xl border-2 border-dashed bg-white p-5 text-center shadow-sm print:m-0 print:break-inside-avoid print:rounded-none print:border-2 print:border-solid print:shadow-none"
                    style={{ borderColor: withColorAlpha(primaryColor, 0.5), pageBreakInside: 'avoid' }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.3em]" style={{ color: primaryColor }}>
                      StrandShare Waybill
                    </p>
                    <p className="mt-1 text-xs font-semibold" style={{ color: secondaryTextColor }}>
                      {waybill.eventTitle}
                    </p>

                    {waybill.qrDataUrl ? (
                      <img
                        src={waybill.qrDataUrl}
                        alt={`QR for ${waybill.submissionCode}`}
                        className="mx-auto my-3 h-40 w-40"
                      />
                    ) : (
                      <div className="mx-auto my-3 flex h-40 w-40 items-center justify-center text-xs" style={{ color: tertiaryTextColor }}>
                        QR unavailable
                      </div>
                    )}

                    <p className="text-base font-bold" style={{ color: primaryTextColor }}>{waybill.submissionCode}</p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: primaryTextColor }}>{waybill.donor.fullName}</p>
                    <p className="text-xs" style={{ color: secondaryTextColor }}>Drive #{waybill.driveId} - Status: {waybill.status}</p>

                    <p className="mt-3 text-[10px] leading-snug" style={{ color: tertiaryTextColor }}>
                      Hand to event volunteer after RSVP. Bag this waybill with the donated hair and ship to StrandShare.
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              .strandshare-waybill-print-area, .strandshare-waybill-print-area * { visibility: visible !important; }
              .strandshare-waybill-print-area { position: absolute !important; inset: 0 !important; padding: 12mm !important; background: #fff !important; }
            }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}
