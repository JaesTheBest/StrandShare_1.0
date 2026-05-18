import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Inbox,
  Loader2,
  MapPin,
  Printer,
  Search,
  Users,
  X,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../../../lib/supabaseClient';
import { useTheme } from '../../../context/ThemeContext';

const EVENT_REQUESTS_TABLE = 'Event_Requests';
const EVENT_ATTENDEES_TABLE = 'Event_Attendees';
const USERS_TABLE = 'users';

function formatDateTime(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
}

function buildAddress(event) {
  if (!event) return '';
  return [
    event.Street,
    event.Barangay,
    event.City_Municipality,
    event.Province,
    event.Region,
    event.Country,
  ]
    .filter(Boolean)
    .join(', ');
}

export default function AssignedEventOperationsPage({ userProfile }) {
  const { theme } = useTheme();
  const primaryColor = theme?.primaryColor || '#0f766e';

  const [staffUserId, setStaffUserId] = useState(userProfile?.user_id || null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [isLoadingAttendees, setIsLoadingAttendees] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState({ kind: '', text: '' });

  const [events, setEvents] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState('');

  const resolveStaffUserId = useCallback(async () => {
    if (staffUserId) return staffUserId;
    if (!supabase) return null;

    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData?.session?.user?.id || null;
    if (!authUserId) return null;

    const result = await supabase
      .from(USERS_TABLE)
      .select('user_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    const resolved = result?.data?.user_id || null;
    setStaffUserId(resolved);
    return resolved;
  }, [staffUserId]);

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({ kind: 'error', text: 'Supabase is not configured.' });
      return;
    }

    const resolvedStaffId = await resolveStaffUserId();
    if (!resolvedStaffId) {
      setNotice({ kind: 'error', text: 'Unable to resolve your staff profile.' });
      return;
    }

    if (!silent) setIsLoadingEvents(true);
    setNotice({ kind: '', text: '' });

    try {
      const result = await supabase
        .from(EVENT_REQUESTS_TABLE)
        .select('*')
        .eq('Assigned_Staff_User_ID', resolvedStaffId)
        .order('Start_Date', { ascending: true })
        .limit(300);

      if (result.error) throw result.error;

      const nextEvents = result.data || [];
      setEvents(nextEvents);
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to load assigned events.' });
      if (!silent) setEvents([]);
    } finally {
      setIsLoadingEvents(false);
    }
  }, [resolveStaffUserId]);

  const loadAttendees = useCallback(async (eventApplicationId) => {
    if (!eventApplicationId || !supabase) {
      setAttendees([]);
      return;
    }

    setIsLoadingAttendees(true);
    try {
      const result = await supabase
        .from(EVENT_ATTENDEES_TABLE)
        .select('*')
        .eq('Event_Application_ID', eventApplicationId)
        .order('Created_At', { ascending: true });

      if (result.error) throw result.error;
      setAttendees(result.data || []);
    } catch (error) {
      setAttendees([]);
      setNotice({ kind: 'error', text: error.message || 'Unable to load attendees.' });
    } finally {
      setIsLoadingAttendees(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectedEvent = useMemo(() => (
    events.find((row) => Number(row.Event_Request_ID || 0) === Number(selectedRequestId || 0)) || null
  ), [events, selectedRequestId]);

  // Auto-select first event when nothing is selected yet
  useEffect(() => {
    if (selectedRequestId == null && events.length > 0) {
      setSelectedRequestId(events[0].Event_Request_ID);
    }
  }, [events, selectedRequestId]);

  // Load attendees whenever the selected event changes
  useEffect(() => {
    if (selectedEvent?.Event_Application_ID) {
      loadAttendees(selectedEvent.Event_Application_ID);
    } else {
      setAttendees([]);
    }
    setAttendeeSearch('');
  }, [selectedEvent, loadAttendees]);

  // Realtime: keep assigned events + attendees in sync
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;

    const requestsChannel = supabase
      .channel('assigned-events-requests-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: EVENT_REQUESTS_TABLE },
        (payload) => {
          if (!staffUserId) return;
          const matchesStaff = (row) => Number(row?.Assigned_Staff_User_ID) === Number(staffUserId);

          if (payload.eventType === 'INSERT') {
            if (!matchesStaff(payload.new)) return;
            setEvents((prev) => {
              const exists = prev.some((row) => Number(row.Event_Request_ID) === Number(payload.new.Event_Request_ID));
              return exists ? prev : [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setEvents((prev) => {
              const inList = prev.some((row) => Number(row.Event_Request_ID) === Number(payload.new.Event_Request_ID));
              if (matchesStaff(payload.new)) {
                if (inList) {
                  return prev.map((row) => (
                    Number(row.Event_Request_ID) === Number(payload.new.Event_Request_ID)
                      ? payload.new
                      : row
                  ));
                }
                return [...prev, payload.new];
              }
              return inList
                ? prev.filter((row) => Number(row.Event_Request_ID) !== Number(payload.new.Event_Request_ID))
                : prev;
            });
          } else if (payload.eventType === 'DELETE') {
            setEvents((prev) => prev.filter((row) => (
              Number(row.Event_Request_ID) !== Number(payload.old?.Event_Request_ID)
            )));
          }
        },
      )
      .subscribe();

    const attendeesChannel = supabase
      .channel('assigned-events-attendees-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: EVENT_ATTENDEES_TABLE },
        (payload) => {
          const targetEventAppId = selectedEvent?.Event_Application_ID;
          if (!targetEventAppId) return;
          const isForSelected = Number(payload.new?.Event_Application_ID ?? payload.old?.Event_Application_ID) === Number(targetEventAppId);
          if (!isForSelected) return;

          if (payload.eventType === 'INSERT') {
            setAttendees((prev) => {
              const exists = prev.some((row) => Number(row.Event_Attendee_ID) === Number(payload.new.Event_Attendee_ID));
              return exists ? prev : [...prev, payload.new];
            });
          } else if (payload.eventType === 'UPDATE') {
            setAttendees((prev) => prev.map((row) => (
              Number(row.Event_Attendee_ID) === Number(payload.new.Event_Attendee_ID)
                ? payload.new
                : row
            )));
          } else if (payload.eventType === 'DELETE') {
            setAttendees((prev) => prev.filter((row) => (
              Number(row.Event_Attendee_ID) !== Number(payload.old?.Event_Attendee_ID)
            )));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(attendeesChannel);
    };
  }, [staffUserId, selectedEvent?.Event_Application_ID]);

  const handleAttendanceStatusChange = async (attendee, nextStatus) => {
    setIsSaving(true);
    setNotice({ kind: '', text: '' });

    try {
      const result = await supabase
        .from(EVENT_ATTENDEES_TABLE)
        .update({ Attendance_Status: nextStatus })
        .eq('Event_Attendee_ID', attendee.Event_Attendee_ID)
        .select('*')
        .single();

      if (result.error) throw result.error;

      setAttendees((current) => current.map((row) => (
        Number(row.Event_Attendee_ID || 0) === Number(result.data.Event_Attendee_ID || 0)
          ? result.data
          : row
      )));
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to update attendee status.' });
    } finally {
      setIsSaving(false);
    }
  };

  const printWaybill = async (attendee) => {
    if (!selectedEvent) return;

    setIsSaving(true);
    setNotice({ kind: '', text: '' });

    try {
      const resolvedStaffId = await resolveStaffUserId();
      const printedAt = new Date().toISOString();

      const updateResult = await supabase
        .from(EVENT_ATTENDEES_TABLE)
        .update({
          Waybill_Printed_At: printedAt,
          Waybill_Printed_By: resolvedStaffId || null,
        })
        .eq('Event_Attendee_ID', attendee.Event_Attendee_ID)
        .select('*')
        .single();

      if (updateResult.error) throw updateResult.error;

      const updatedAttendee = updateResult.data;
      setAttendees((current) => current.map((row) => (
        Number(row.Event_Attendee_ID || 0) === Number(updatedAttendee.Event_Attendee_ID || 0)
          ? updatedAttendee
          : row
      )));

      const waybillCode = updatedAttendee.Waybill_Code || `EVT-WB-${updatedAttendee.Event_Attendee_ID}`;
      const printWindow = window.open('', '_blank', 'width=760,height=900');
      if (!printWindow) {
        throw new Error('Browser blocked popup window for printing. Please allow popups and try again.');
      }
      const html = `
        <html>
          <head>
            <title>Waybill ${waybillCode}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h1 { margin: 0 0 12px; font-size: 22px; }
              h2 { margin: 20px 0 8px; font-size: 16px; }
              .line { margin: 6px 0; font-size: 14px; }
              .box { border: 2px solid #1e293b; border-radius: 8px; padding: 14px; margin-top: 12px; }
              .code { font-size: 24px; letter-spacing: 2px; font-weight: 700; }
            </style>
          </head>
          <body>
            <h1>Hair Submission Waybill</h1>
            <div class="box">
              <div class="line"><strong>Waybill Code:</strong> <span class="code">${waybillCode}</span></div>
              <div class="line"><strong>Printed At:</strong> ${formatDateTime(printedAt)}</div>
            </div>

            <h2>Event Details</h2>
            <div class="line"><strong>Event:</strong> ${selectedEvent.Event_Name || 'N/A'}</div>
            <div class="line"><strong>Venue:</strong> ${selectedEvent.Venue_Name || buildAddress(selectedEvent) || 'N/A'}</div>
            <div class="line"><strong>Schedule:</strong> ${formatDateTime(selectedEvent.Start_Date)} - ${formatDateTime(selectedEvent.End_Date)}</div>

            <h2>Attendee Details</h2>
            <div class="line"><strong>Name:</strong> ${updatedAttendee.Full_Name || 'N/A'}</div>
            <div class="line"><strong>Email:</strong> ${updatedAttendee.Email || 'N/A'}</div>
            <div class="line"><strong>Contact:</strong> ${updatedAttendee.Contact_Number || 'N/A'}</div>
          </body>
        </html>
      `;

      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();

      setNotice({ kind: 'success', text: `Waybill printed for ${updatedAttendee.Full_Name}.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error.message || 'Unable to print waybill.' });
    } finally {
      setIsSaving(false);
    }
  };

  const filteredAttendees = useMemo(() => {
    const term = attendeeSearch.trim().toLowerCase();
    if (!term) return attendees;
    return attendees.filter((row) => {
      const haystack = [
        row.Full_Name,
        row.Email,
        row.Contact_Number,
        row.Waybill_Code,
        row.Attendance_Status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [attendees, attendeeSearch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Assigned Event Operations</h1>
        <p className="text-sm text-slate-600">View events admin assigned to you, search attendees, and print waybills.</p>
      </div>

      {notice.text && (
        <div className={`rounded-lg px-4 py-3 text-sm ${notice.kind === 'error' ? 'border border-rose-200 bg-rose-50 text-rose-700' : 'border border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {notice.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px,1fr]">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <Inbox size={14} />
                Assigned Events
              </h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                {events.length}
              </span>
            </div>
          </div>
          <div className="max-h-[640px] overflow-auto">
            {isLoadingEvents && events.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-5 text-sm text-slate-600">
                <Loader2 size={15} className="animate-spin" />Loading...
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Inbox size={20} />
                </div>
                <p className="mt-2.5 text-sm font-semibold text-slate-700">No assigned events</p>
                <p className="text-xs text-slate-500">Events appear here once admin assigns you to an approved request.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {events.map((row) => {
                  const active = Number(row.Event_Request_ID || 0) === Number(selectedRequestId || 0);
                  return (
                    <li key={row.Event_Request_ID}>
                      <button
                        type="button"
                        onClick={() => setSelectedRequestId(row.Event_Request_ID)}
                        className={`flex w-full flex-col gap-1 px-4 py-3.5 text-left transition ${
                          active ? 'bg-teal-50/60' : 'hover:bg-slate-50'
                        }`}
                        style={active ? { boxShadow: `inset 3px 0 0 ${primaryColor}` } : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            ER-{row.Event_Request_ID}
                          </span>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            {row.Status || 'Approved'}
                          </span>
                        </div>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.Event_Name || 'Untitled Event'}
                        </p>
                        <p className="truncate text-xs text-slate-600">
                          {row.Venue_Name || buildAddress(row) || 'No venue yet'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {formatDateShort(row.Start_Date)}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {!selectedEvent ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center shadow-sm">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Inbox size={26} />
              </div>
              <h2 className="mt-4 text-base font-bold text-slate-800">Select an assigned event</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Pick an event from the list to view its attendees and print waybills.
              </p>
            </div>
          ) : (
            <>
              {/* Hero */}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}99)` }} />
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        ER-{selectedEvent.Event_Request_ID}
                      </p>
                      <h2 className="mt-0.5 text-xl font-bold text-slate-900">
                        {selectedEvent.Event_Name || 'Untitled Event'}
                      </h2>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {selectedEvent.Status || 'Approved'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <Calendar size={13} />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
                        <p className="text-sm text-slate-800">
                          {formatDateTime(selectedEvent.Start_Date)} — {formatDateTime(selectedEvent.End_Date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-100 text-slate-500">
                        <MapPin size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Venue</p>
                        <p className="text-sm text-slate-800">
                          {selectedEvent.Venue_Name || 'N/A'}
                        </p>
                        {buildAddress(selectedEvent) && (
                          <p className="text-xs text-slate-500">{buildAddress(selectedEvent)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attendees */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Users size={15} className="text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-800">Attendee List</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                      {filteredAttendees.length}{attendeeSearch ? ` / ${attendees.length}` : ''}
                    </span>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={attendeeSearch}
                      onChange={(event) => setAttendeeSearch(event.target.value)}
                      placeholder="Search name, email, waybill..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm placeholder:text-slate-400 transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                    {attendeeSearch && (
                      <button
                        type="button"
                        onClick={() => setAttendeeSearch('')}
                        className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {isLoadingAttendees && attendees.length === 0 ? (
                  <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-600">
                    <Loader2 size={15} className="animate-spin" />Loading attendees...
                  </div>
                ) : attendees.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Users size={20} />
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-slate-700">No attendees yet</p>
                    <p className="text-xs text-slate-500">Attendees register through the public event flow.</p>
                  </div>
                ) : filteredAttendees.length === 0 ? (
                  <div className="flex flex-col items-center px-5 py-10 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Search size={18} />
                    </div>
                    <p className="mt-2.5 text-sm font-semibold text-slate-700">No matches</p>
                    <p className="text-xs text-slate-500">Try a different search term.</p>
                    <button
                      type="button"
                      onClick={() => setAttendeeSearch('')}
                      className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 font-semibold text-slate-700">Attendee</th>
                          <th className="px-5 py-3 font-semibold text-slate-700">Waybill</th>
                          <th className="px-5 py-3 font-semibold text-slate-700">Attendance</th>
                          <th className="px-5 py-3 font-semibold text-slate-700">Printed At</th>
                          <th className="px-5 py-3 font-semibold text-slate-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAttendees.map((attendee) => (
                          <tr key={attendee.Event_Attendee_ID} className="border-t border-slate-200 transition hover:bg-slate-50/50">
                            <td className="px-5 py-3 align-top">
                              <p className="font-semibold text-slate-900">{attendee.Full_Name || 'N/A'}</p>
                              <p className="text-xs text-slate-600">{attendee.Email || 'No email'}</p>
                              <p className="text-xs text-slate-600">{attendee.Contact_Number || 'No contact'}</p>
                            </td>
                            <td className="px-5 py-3 align-top font-mono text-xs text-slate-700">{attendee.Waybill_Code || 'Pending code'}</td>
                            <td className="px-5 py-3 align-top">
                              <select
                                value={attendee.Attendance_Status || 'Not Marked'}
                                onChange={(event) => handleAttendanceStatusChange(attendee, event.target.value)}
                                className="rounded border border-slate-300 px-2 py-1 text-xs transition focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                                disabled={isSaving}
                              >
                                <option value="Not Marked">Not Marked</option>
                                <option value="Present">Present</option>
                                <option value="No Show">No Show</option>
                              </select>
                            </td>
                            <td className="px-5 py-3 align-top text-xs text-slate-600">
                              {attendee.Waybill_Printed_At ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <CheckCircle2 size={11} />
                                  {formatDateTime(attendee.Waybill_Printed_At)}
                                </span>
                              ) : (
                                <span className="text-slate-400">Not printed</span>
                              )}
                            </td>
                            <td className="px-5 py-3 align-top">
                              <button
                                type="button"
                                onClick={() => printWaybill(attendee)}
                                disabled={isSaving}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                              >
                                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
                                Print Waybill
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
