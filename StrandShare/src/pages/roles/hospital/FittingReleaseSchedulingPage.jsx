import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Info, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { logAuditAction } from '../../../lib/auditLogger';
import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient';

const HOSPITAL_STAFF_TABLE = 'Hospital_Staff';
const HOSPITALS_TABLE = 'H-Representatives';
const WIG_REQUESTS_TABLE = 'Wig_Requests';
const WIG_REQUEST_SPECS_TABLE = 'Wig_Request_Specifications';
const PATIENTS_TABLE = 'Patients';
const RELEASE_SCHEDULES_TABLE = 'Release_Schedules';
const WIG_REQUEST_PREVIEWS_BUCKET = 'wig_request_previews';

const REQUEST_STATUS = {
  pending: 'Pending',
  acceptedAllocated: 'Accepted - Wig Allocated',
  acceptedNoWig: 'Accepted - No Wig Available',
  inProduction: 'In Production',
  toBeRelease: 'To Be Release',
  releasing: 'Releasing',
  completed: 'Completed',
};

const tabs = [
  { id: 'approvals', label: 'Release Date Approvals' },
  { id: 'releasing', label: 'Approved / Releasing' },
  { id: 'completed', label: 'Completed' },
];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatusKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function normalizeReleaseWorkflowKey(value) {
  const key = normalizeStatusKey(value);

  if (['pending', 'pendinghospitalapproval', 'pendingapproval'].includes(key)) {
    return 'pending_hospital_approval';
  }

  if (['approved', 'hospitalapproved', 'hospitalapproval'].includes(key)) {
    return 'hospital_approved';
  }

  if (['reschedulerequested', 'hospitalreschedulerequested', 'reschedule'].includes(key)) {
    return 'hospital_reschedule_requested';
  }

  return '';
}

function getReleaseWorkflowLabel(value) {
  const key = normalizeReleaseWorkflowKey(value);

  if (key === 'pending_hospital_approval') return 'Pending H-Representative Approval';
  if (key === 'hospital_approved') return 'H-Representative Approved';
  if (key === 'hospital_reschedule_requested') return 'H-Representative Reschedule Requested';
  return 'N/A';
}

function releaseWorkflowClass(value) {
  const key = normalizeReleaseWorkflowKey(value);

  if (key === 'pending_hospital_approval') return 'bg-amber-100 text-amber-700';
  if (key === 'hospital_approved') return 'bg-emerald-100 text-emerald-700';
  if (key === 'hospital_reschedule_requested') return 'bg-rose-100 text-rose-700';
  return 'bg-slate-100 text-slate-700';
}

function getCanonicalStatusKey(statusValue) {
  const key = normalizeStatusKey(statusValue);

  if (['pendingreview', 'pending', 'pendingvalidation', 'pendingconfirmation'].includes(key)) {
    return 'pending';
  }

  if (['acceptedwithallocatedwig', 'acceptedallocatedwig', 'acceptedwigallocated', 'allocated', 'allocatedwig'].includes(key)) {
    return 'accepted_allocated';
  }

  if (['acceptedbutnowigavailable', 'acceptednowigavailable', 'nowigavailable', 'findingmatchingwig', 'formatching', 'matching', 'findingallocatingwig', 'findingandallocatingwig'].includes(key)) {
    return 'accepted_no_wig';
  }

  if (['inproduction', 'production', 'inprocess'].includes(key)) {
    return 'in_production';
  }

  if (['readyforevent', 'readyforrelease', 'readyforfitting', 'readyforhandingover', 'toberelease'].includes(key)) {
    return 'to_be_release';
  }

  if (['releasing', 'forrelease', 'releaseongoing'].includes(key)) {
    return 'releasing';
  }

  if (['completed', 'complete', 'released', 'releasecompleted', 'done'].includes(key)) {
    return 'completed';
  }

  return 'pending';
}

function getStatusLabel(statusValue) {
  const key = getCanonicalStatusKey(statusValue);

  if (key === 'accepted_allocated') return REQUEST_STATUS.acceptedAllocated;
  if (key === 'accepted_no_wig') return REQUEST_STATUS.acceptedNoWig;
  if (key === 'in_production') return REQUEST_STATUS.inProduction;
  if (key === 'to_be_release') return REQUEST_STATUS.toBeRelease;
  if (key === 'releasing') return REQUEST_STATUS.releasing;
  if (key === 'completed') return REQUEST_STATUS.completed;
  return REQUEST_STATUS.pending;
}

function statusClass(statusValue) {
  const key = getCanonicalStatusKey(statusValue);

  if (key === 'accepted_allocated') return 'bg-emerald-100 text-emerald-700';
  if (key === 'accepted_no_wig') return 'bg-rose-100 text-rose-700';
  if (key === 'in_production') return 'bg-sky-100 text-sky-700';
  if (key === 'to_be_release') return 'bg-indigo-100 text-indigo-700';
  if (key === 'releasing') return 'bg-teal-100 text-teal-700';
  if (key === 'completed') return 'bg-green-100 text-green-700';
  return 'bg-amber-100 text-amber-700';
}

function formatRequestCode(reqIdValue) {
  const reqId = Number(reqIdValue || 0);
  if (!reqId) {
    return 'WR-0000';
  }
  return `WR-${String(reqId).padStart(4, '0')}`;
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
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPatientFullName(patientRow) {
  if (!patientRow) {
    return 'Unknown Patient';
  }

  const fullName = [patientRow.First_Name, patientRow.Middle_Name, patientRow.Last_Name, patientRow.Suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return fullName || patientRow.Patient_Code || `Patient #${patientRow.Patient_ID}`;
}

function parseSpecialNotes(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (!raw.startsWith('SSMETA:')) {
    return raw;
  }

  try {
    const parsed = JSON.parse(raw.slice(7));
    return String(parsed?.specialNoteTemplate || '').trim();
  } catch {
    return raw;
  }
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function resolveStoragePublicUrl(bucket, value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (isAbsoluteUrl(raw)) {
    return raw;
  }

  if (!supabase) {
    return '';
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(raw);
  return data?.publicUrl || '';
}

function isMissingRelationError(rawMessage) {
  const message = String(rawMessage || '').toLowerCase();
  return message.includes('relation') && message.includes('does not exist');
}

function mapLoadError(rawMessage) {
  const message = String(rawMessage || 'Unable to load release approval records.');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('row-level security')) {
    return 'Data access is blocked by database policy. Verify your hospital role permissions.';
  }

  if (lowerMessage.includes('release_schedules') && (lowerMessage.includes('relation') || lowerMessage.includes('does not exist'))) {
    return 'Release schedule table is missing. Run supabase/017_release_scheduling_workflow.sql first.';
  }

  return message;
}

function mapActionError(rawMessage) {
  const message = String(rawMessage || 'Unable to apply decision.');
  const lowerMessage = message.toLowerCase();

  if (
    (lowerMessage.includes('release_date') || lowerMessage.includes('release_requested'))
    && lowerMessage.includes('column')
  ) {
    return 'Release columns are missing in Wig_Requests. Run supabase/017_release_scheduling_workflow.sql first.';
  }

  if (lowerMessage.includes('release_schedules') && (lowerMessage.includes('relation') || lowerMessage.includes('does not exist'))) {
    return 'Release schedule table is missing. Run supabase/017_release_scheduling_workflow.sql first.';
  }

  if (lowerMessage.includes('row-level security')) {
    return 'Action is blocked by database policy. Verify your hospital role permissions.';
  }

  return message;
}

function matchesSearch(row, query) {
  const blob = [
    row.requestId,
    row.patientName,
    row.patientCode,
    row.medicalCondition,
    row.statusLabel,
    row.releaseWorkflowLabel,
    row.specStyle,
    row.specColor,
    row.specLength,
    row.specTexture,
    row.specCapSize,
    row.specSpecialNote,
    formatDateTime(row.releaseDate),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(' ');

  return blob.includes(query);
}

export default function FittingReleaseSchedulingPage({ userProfile }) {
  const [activeTab, setActiveTab] = useState('approvals');
  const [hospitalId, setHospitalId] = useState(null);
  const [hospitalName, setHospitalName] = useState('');

  const [rows, setRows] = useState([]);
  const [scheduleHistory, setScheduleHistory] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');

  const [notice, setNotice] = useState({ kind: '', text: '' });
  const [isReleaseWorkflowAvailable, setIsReleaseWorkflowAvailable] = useState(true);
  const [isResolvingHospital, setIsResolvingHospital] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingDecision, setIsApplyingDecision] = useState(false);

  const resolveAssignedHospital = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setNotice({
        kind: 'error',
        text: 'Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.',
      });
      return;
    }

    const activeUserId = Number(userProfile?.user_id || 0);
    if (!activeUserId) {
      setHospitalId(null);
      setHospitalName('');
      setNotice({ kind: 'error', text: 'Unable to resolve your account ID. Please sign in again.' });
      return;
    }

    try {
      setIsResolvingHospital(true);
      const { data: staffRow, error: staffError } = await supabase
        .from(HOSPITAL_STAFF_TABLE)
        .select('Hospital_ID')
        .eq('User_ID', activeUserId)
        .maybeSingle();

      if (staffError) throw staffError;

      const assignedHospitalId = Number(staffRow?.Hospital_ID || 0) || null;
      setHospitalId(assignedHospitalId);

      if (!assignedHospitalId) {
        setHospitalName('');
        setNotice({
          kind: 'error',
          text: 'No hospital assignment found for your account. Ask Super Admin to assign you first.',
        });
        return;
      }

      const { data: hospitalRow } = await supabase
        .from(HOSPITALS_TABLE)
        .select('Hospital_Name')
        .eq('Hospital_ID', assignedHospitalId)
        .maybeSingle();

      setHospitalName(String(hospitalRow?.Hospital_Name || '').trim());
    } catch (error) {
      setHospitalId(null);
      setHospitalName('');
      setNotice({ kind: 'error', text: mapLoadError(error.message) });
    } finally {
      setIsResolvingHospital(false);
    }
  }, [userProfile?.user_id]);

  const loadReleaseRows = useCallback(async (keepSelectedReqId = null) => {
    if (!isSupabaseConfigured || !supabase || !hospitalId) {
      setRows([]);
      setScheduleHistory([]);
      return;
    }

    try {
      setIsLoading(true);

      const [requestsRes, specsRes, patientsRes] = await Promise.all([
        supabase
          .from(WIG_REQUESTS_TABLE)
          .select('*')
          .eq('Hospital_ID', hospitalId)
          .order('Request_Date', { ascending: false }),
        supabase.from(WIG_REQUEST_SPECS_TABLE).select('*'),
        supabase
          .from(PATIENTS_TABLE)
          .select('Patient_ID,Patient_Code,First_Name,Middle_Name,Last_Name,Suffix,Medical_Condition')
          .eq('Hospital_ID', hospitalId),
      ]);

      if (requestsRes.error) throw requestsRes.error;
      if (specsRes.error) throw specsRes.error;
      if (patientsRes.error) throw patientsRes.error;

      let currentSchedules = [];
      let allSchedules = [];
      let releaseWorkflowAvailable = true;

      const currentScheduleRes = await supabase
        .from(RELEASE_SCHEDULES_TABLE)
        .select('*')
        .eq('Hospital_ID', hospitalId)
        .eq('Is_Current', true);

      if (currentScheduleRes.error) {
        if (isMissingRelationError(currentScheduleRes.error.message)) {
          releaseWorkflowAvailable = false;
        } else {
          throw currentScheduleRes.error;
        }
      } else {
        currentSchedules = currentScheduleRes.data || [];
      }

      if (releaseWorkflowAvailable) {
        const historyRes = await supabase
          .from(RELEASE_SCHEDULES_TABLE)
          .select('*')
          .eq('Hospital_ID', hospitalId)
          .order('Created_At', { ascending: false });

        if (historyRes.error) {
          throw historyRes.error;
        }

        allSchedules = historyRes.data || [];
      }

      setIsReleaseWorkflowAvailable(releaseWorkflowAvailable);

      const patientById = new Map((patientsRes.data || []).map((row) => [Number(row.Patient_ID), row]));
      const specByReqId = new Map((specsRes.data || []).map((row) => [Number(row.Req_ID), row]));
      const currentScheduleByReqId = new Map(
        currentSchedules
          .filter((row) => Number(row.Req_ID || 0) > 0)
          .map((row) => [Number(row.Req_ID), row]),
      );

      const mappedRows = (requestsRes.data || []).map((requestRow) => {
        const reqId = Number(requestRow.Req_ID || 0);
        const patient = patientById.get(Number(requestRow.Patient_ID || 0)) || null;
        const spec = specByReqId.get(reqId) || {};
        const currentSchedule = currentScheduleByReqId.get(reqId) || null;

        const statusRaw = requestRow.Status || REQUEST_STATUS.pending;
        const releaseWorkflowRaw = currentSchedule?.Hospital_Decision
          ? String(currentSchedule.Hospital_Decision).trim()
          : '';

        return {
          reqId,
          requestId: formatRequestCode(reqId),
          patientId: Number(requestRow.Patient_ID || 0),
          patientName: getPatientFullName(patient),
          patientCode: String(patient?.Patient_Code || '').trim(),
          medicalCondition: String(patient?.Medical_Condition || '').trim() || 'N/A',
          requestDate: requestRow.Request_Date,
          updatedAt: requestRow.Updated_At || requestRow.Request_Date,
          status: statusRaw,
          statusKey: getCanonicalStatusKey(statusRaw),
          statusLabel: getStatusLabel(statusRaw),
          statusReason: String(requestRow.Status_Reason || '').trim(),
          releaseDate: requestRow.Release_Date || currentSchedule?.Proposed_Release_Date || null,
          releaseWorkflowStatus: releaseWorkflowRaw,
          releaseWorkflowKey: normalizeReleaseWorkflowKey(releaseWorkflowRaw),
          releaseWorkflowLabel: getReleaseWorkflowLabel(releaseWorkflowRaw),
          releaseScheduleId: Number(currentSchedule?.Release_Schedule_ID || 0) || null,
          releaseDecisionReason: String(currentSchedule?.Hospital_Decision_Reason || '').trim(),
          releaseProposalNote: String(currentSchedule?.Proposal_Note || '').trim(),
          specStyle: String(spec.Style_Preference || '').trim() || 'N/A',
          specColor: String(spec.Preferred_Color || '').trim() || 'N/A',
          specLength: String(spec.Preferred_Length || '').trim() || 'N/A',
          specTexture: String(spec.Hair_Texture || '').trim() || 'N/A',
          specCapSize: String(spec.Cap_Size || '').trim() || 'N/A',
          specSpecialNote: parseSpecialNotes(spec.Special_Notes) || 'N/A',
          previewPdfUrl: String(requestRow.Pdf_Url || requestRow.Preview_Pdf_Url || '').trim(),
        };
      });

      const historyRows = allSchedules.map((row) => {
        const reqId = Number(row.Req_ID || 0);
        const requestRow = mappedRows.find((item) => item.reqId === reqId) || null;

        return {
          scheduleId: Number(row.Release_Schedule_ID || 0),
          reqId,
          requestId: requestRow?.requestId || formatRequestCode(reqId),
          patientName: requestRow?.patientName || 'Unknown Patient',
          proposedReleaseDate: row.Proposed_Release_Date,
          hospitalDecision: row.Hospital_Decision,
          hospitalDecisionKey: normalizeReleaseWorkflowKey(row.Hospital_Decision),
          hospitalDecisionLabel: getReleaseWorkflowLabel(row.Hospital_Decision),
          hospitalDecisionReason: String(row.Hospital_Decision_Reason || '').trim(),
          proposalNote: String(row.Proposal_Note || '').trim(),
          createdAt: row.Created_At,
          updatedAt: row.Updated_At,
          isCurrent: Boolean(row.Is_Current),
        };
      });

      setRows(mappedRows);
      setScheduleHistory(historyRows);

      setSelectedRow((previous) => {
        const targetReqId = Number(keepSelectedReqId || previous?.reqId || 0);
        if (!targetReqId) {
          return previous ? null : null;
        }

        return mappedRows.find((row) => row.reqId === targetReqId) || null;
      });

      if (!releaseWorkflowAvailable) {
        setNotice((previous) => {
          if (previous.kind === 'error') {
            return previous;
          }

          return {
            kind: 'warning',
            text: 'Release scheduling is partially disabled. Run supabase/017_release_scheduling_workflow.sql to enable approvals and reschedules.',
          };
        });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: mapLoadError(error.message) });
    } finally {
      setIsLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    resolveAssignedHospital();
  }, [resolveAssignedHospital]);

  useEffect(() => {
    if (!hospitalId) {
      setRows([]);
      setScheduleHistory([]);
      return;
    }

    loadReleaseRows();
  }, [hospitalId, loadReleaseRows]);

  useEffect(() => {
    setRescheduleReason('');
  }, [selectedRow?.reqId]);

  const queueRows = useMemo(() => {
    return rows.filter((row) => row.statusKey === 'to_be_release');
  }, [rows]);

  const releaseRows = useMemo(() => {
    return rows.filter(
      (row) => row.statusKey === 'releasing' || (row.statusKey !== 'completed' && row.releaseWorkflowKey === 'hospital_approved'),
    );
  }, [rows]);

  const completedRows = useMemo(() => {
    return rows.filter((row) => row.statusKey === 'completed');
  }, [rows]);

  const rescheduleHistoryRows = useMemo(() => {
    return scheduleHistory.filter((row) => row.hospitalDecisionKey === 'hospital_reschedule_requested');
  }, [scheduleHistory]);

  const filteredQueueRows = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) {
      return queueRows;
    }

    return queueRows.filter((row) => matchesSearch(row, query));
  }, [queueRows, searchTerm]);

  const filteredReleaseRows = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) {
      return releaseRows;
    }

    return releaseRows.filter((row) => matchesSearch(row, query));
  }, [releaseRows, searchTerm]);

  const filteredCompletedRows = useMemo(() => {
    const query = normalizeText(searchTerm);
    if (!query) {
      return completedRows;
    }

    return completedRows.filter((row) => matchesSearch(row, query));
  }, [completedRows, searchTerm]);

  const summaryCards = useMemo(() => {
    const pendingApprovalCount = queueRows.filter((row) => row.releaseWorkflowKey === 'pending_hospital_approval').length;
    const releasingCount = releaseRows.length;
    const completedCount = completedRows.length;
    const rescheduleCount = rescheduleHistoryRows.length;

    return [
      { label: 'Pending Approval', value: String(pendingApprovalCount) },
      { label: 'Active Releasing', value: String(releasingCount) },
      { label: 'Completed', value: String(completedCount) },
      { label: 'Reschedule Requests', value: String(rescheduleCount) },
    ];
  }, [queueRows, releaseRows, completedRows, rescheduleHistoryRows]);

  const selectedPreviewUrl = useMemo(() => {
    if (!selectedRow) {
      return '';
    }

    return resolveStoragePublicUrl(WIG_REQUEST_PREVIEWS_BUCKET, selectedRow.previewPdfUrl);
  }, [selectedRow]);

  const selectedCanApprove = useMemo(() => {
    if (!selectedRow) {
      return false;
    }

    return selectedRow.releaseWorkflowKey === 'pending_hospital_approval' && Boolean(selectedRow.releaseScheduleId);
  }, [selectedRow]);

  const selectedCanComplete = useMemo(() => {
    if (!selectedRow) {
      return false;
    }

    return selectedRow.statusKey === 'releasing';
  }, [selectedRow]);

  const updateRequestWithStatusReasonFallback = useCallback(async (reqId, payload) => {
    const { error } = await supabase
      .from(WIG_REQUESTS_TABLE)
      .update(payload)
      .eq('Req_ID', reqId);

    if (!error) {
      return;
    }

    const lowerError = String(error.message || '').toLowerCase();
    if (lowerError.includes('status_reason') && lowerError.includes('column')) {
      const { Status_Reason: _ignored, ...fallbackPayload } = payload;
      const { error: fallbackError } = await supabase
        .from(WIG_REQUESTS_TABLE)
        .update(fallbackPayload)
        .eq('Req_ID', reqId);

      if (fallbackError) {
        throw fallbackError;
      }

      return;
    }

    throw error;
  }, []);

  const handleApproveRelease = async () => {
    if (!selectedRow || !selectedCanApprove) {
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    const nowIso = new Date().toISOString();

    try {
      setIsApplyingDecision(true);
      setNotice({ kind: '', text: '' });

      const { error: updateScheduleError } = await supabase
        .from(RELEASE_SCHEDULES_TABLE)
        .update({
          Hospital_Decision: 'Approved',
          Hospital_Decision_By: actorUserId,
          Hospital_Decision_At: nowIso,
          Hospital_Decision_Reason: null,
          Updated_At: nowIso,
        })
        .eq('Release_Schedule_ID', selectedRow.releaseScheduleId);

      if (updateScheduleError) {
        throw updateScheduleError;
      }

      await updateRequestWithStatusReasonFallback(selectedRow.reqId, {
        Status: REQUEST_STATUS.releasing,
        Updated_At: nowIso,
        Status_Reason: null,
      });

      await logAuditAction({
        action: 'hospital_release_schedule_decision',
        description: `${selectedRow.requestId} approved release schedule`,
        resource: 'Release_Schedules',
        status: 'success',
        userProfile,
      });

      await loadReleaseRows(selectedRow.reqId);
      setNotice({ kind: 'success', text: `${selectedRow.requestId} release schedule approved.` });
    } catch (error) {
      await logAuditAction({
        action: 'hospital_release_schedule_decision',
        description: `${selectedRow.requestId} failed release approval`,
        resource: 'Release_Schedules',
        status: 'failed',
        userProfile,
      });

      setNotice({ kind: 'error', text: mapActionError(error.message) });
    } finally {
      setIsApplyingDecision(false);
    }
  };

  const handleRequestReschedule = async () => {
    if (!selectedRow || !selectedCanApprove) {
      return;
    }

    const reason = String(rescheduleReason || '').trim();
    if (!reason) {
      setNotice({ kind: 'error', text: 'Reschedule reason is required.' });
      return;
    }

    const actorUserId = Number(userProfile?.user_id || 0) || null;
    const nowIso = new Date().toISOString();

    try {
      setIsApplyingDecision(true);
      setNotice({ kind: '', text: '' });

      const { error: updateScheduleError } = await supabase
        .from(RELEASE_SCHEDULES_TABLE)
        .update({
          Hospital_Decision: 'Reschedule Requested',
          Hospital_Decision_By: actorUserId,
          Hospital_Decision_At: nowIso,
          Hospital_Decision_Reason: reason,
          Updated_At: nowIso,
        })
        .eq('Release_Schedule_ID', selectedRow.releaseScheduleId);

      if (updateScheduleError) {
        throw updateScheduleError;
      }

      await updateRequestWithStatusReasonFallback(selectedRow.reqId, {
        Status: REQUEST_STATUS.toBeRelease,
        Updated_At: nowIso,
        Status_Reason: reason,
      });

      await logAuditAction({
        action: 'hospital_release_schedule_decision',
        description: `${selectedRow.requestId} requested reschedule | reason: ${reason}`,
        resource: 'Release_Schedules',
        status: 'success',
        userProfile,
      });

      await loadReleaseRows(selectedRow.reqId);
      setRescheduleReason('');
      setNotice({ kind: 'success', text: `${selectedRow.requestId} marked for reschedule and returned to staff queue.` });
    } catch (error) {
      await logAuditAction({
        action: 'hospital_release_schedule_decision',
        description: `${selectedRow.requestId} failed reschedule request`,
        resource: 'Release_Schedules',
        status: 'failed',
        userProfile,
      });

      setNotice({ kind: 'error', text: mapActionError(error.message) });
    } finally {
      setIsApplyingDecision(false);
    }
  };

  const handleMarkReleaseCompleted = async () => {
    if (!selectedRow || !selectedCanComplete) {
      return;
    }

    const nowIso = new Date().toISOString();

    try {
      setIsApplyingDecision(true);
      setNotice({ kind: '', text: '' });

      await updateRequestWithStatusReasonFallback(selectedRow.reqId, {
        Status: REQUEST_STATUS.completed,
        Updated_At: nowIso,
        Status_Reason: null,
      });

      await logAuditAction({
        action: 'hospital_release_completed',
        description: `${selectedRow.requestId} marked release as completed`,
        resource: 'Wig_Requests',
        status: 'success',
        userProfile,
      });

      await loadReleaseRows(selectedRow.reqId);
      setNotice({ kind: 'success', text: `${selectedRow.requestId} marked as completed.` });
    } catch (error) {
      await logAuditAction({
        action: 'hospital_release_completed',
        description: `${selectedRow.requestId} failed to mark release as completed`,
        resource: 'Wig_Requests',
        status: 'failed',
        userProfile,
      });

      setNotice({ kind: 'error', text: mapActionError(error.message) });
    } finally {
      setIsApplyingDecision(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Release Date Approval</h1>
        <p className="text-gray-600">
          Review proposed release dates from staff, approve or request reschedule, and complete releases.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          H-Representative scope: {hospitalName || (hospitalId ? `H-Representative #${hospitalId}` : 'Not assigned')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryCards.map((item) => (
          <article key={item.label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{item.value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
              placeholder="Search request, patient, status, or notes"
            />
          </div>

          <button
            type="button"
            onClick={() => loadReleaseRows(selectedRow?.reqId || null)}
            disabled={isResolvingHospital || isLoading || isApplyingDecision}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {(isResolvingHospital || isLoading) ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? 'rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white'
                : 'rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50'
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {notice.text && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            notice.kind === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : notice.kind === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {notice.text}
        </div>
      )}

      {activeTab === 'approvals' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Release Approval Queue</h2>
            <p className="mt-1 text-xs text-gray-500">Approve pending release dates or request reschedule with reason.</p>
          </div>

          {isLoading ? (
            <div className="px-4 py-8 text-sm text-gray-600 inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading queue...
            </div>
          ) : filteredQueueRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-600">No records in release approval queue.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Medical Condition</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Proposed Release Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Release Flow</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueueRows.map((row) => (
                    <tr
                      key={row.reqId}
                      onClick={() => setSelectedRow(row)}
                      className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <p className="font-semibold text-gray-800">{row.patientName}</p>
                        <p className="text-xs text-gray-500">{row.patientCode || 'No patient code'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{row.medicalCondition}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(row.releaseDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${releaseWorkflowClass(row.releaseWorkflowStatus)}`}>
                          {row.releaseWorkflowLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRow(row);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Info size={13} /> Info
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'releasing' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Active Releasing</h2>
          </div>

          {isLoading ? (
            <div className="px-4 py-8 text-sm text-gray-600 inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading release records...
            </div>
          ) : filteredReleaseRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-600">No active releasing records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Release Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Release Flow</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReleaseRows.map((row) => (
                    <tr
                      key={row.reqId}
                      onClick={() => setSelectedRow(row)}
                      className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                      <td className="px-4 py-3 text-gray-700">{row.patientName}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(row.releaseDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${releaseWorkflowClass(row.releaseWorkflowStatus)}`}>
                          {row.releaseWorkflowLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRow(row);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Info size={13} /> Info
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'completed' && (
        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">Completed Releases</h2>
          </div>

          {isLoading ? (
            <div className="px-4 py-8 text-sm text-gray-600 inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading completed records...
            </div>
          ) : filteredCompletedRows.length === 0 ? (
            <div className="px-4 py-8 text-sm text-gray-600">No completed release records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Request ID</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Patient</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Release Date</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Completed At</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompletedRows.map((row) => (
                    <tr
                      key={row.reqId}
                      onClick={() => setSelectedRow(row)}
                      className="cursor-pointer border-t border-gray-200 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.requestId}</td>
                      <td className="px-4 py-3 text-gray-700">{row.patientName}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(row.releaseDate)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                          {row.statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDateTime(row.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedRow(row);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Info size={13} /> Info
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {selectedRow && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[90] m-0 p-0">
          <button
            type="button"
            aria-label="Close release details panel"
            className="absolute inset-0 m-0 p-0 border-0 appearance-none bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={() => setSelectedRow(null)}
          />

          <aside
            className="absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
            style={{ animation: 'hospitalReleasePanelSlideIn 0.25s ease-out' }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Release Review Details</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {selectedRow.requestId} | {selectedRow.patientName}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedRow(null)} className="text-slate-400 hover:text-red-500">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p><span className="font-semibold text-slate-900">H-Representative:</span> {hospitalName || `H-Representative #${hospitalId}`}</p>
                <p className="mt-1"><span className="font-semibold text-slate-900">Patient:</span> {selectedRow.patientName}</p>
                <p className="mt-1"><span className="font-semibold text-slate-900">Medical Condition:</span> {selectedRow.medicalCondition}</p>
                <p className="mt-1"><span className="font-semibold text-slate-900">Current Status:</span> {selectedRow.statusLabel}</p>
                <p className="mt-1 inline-flex items-center gap-1.5"><CalendarDays size={14} className="text-slate-500" />
                  <span><span className="font-semibold text-slate-900">Proposed Release Date:</span> {formatDateTime(selectedRow.releaseDate)}</span>
                </p>
                <p className="mt-1"><span className="font-semibold text-slate-900">Release Workflow:</span> {selectedRow.releaseWorkflowLabel}</p>
                {selectedRow.releaseDecisionReason && (
                  <p className="mt-1 whitespace-pre-line"><span className="font-semibold text-slate-900">Decision Reason:</span> {selectedRow.releaseDecisionReason}</p>
                )}
                {selectedRow.releaseProposalNote && (
                  <p className="mt-1 whitespace-pre-line"><span className="font-semibold text-slate-900">Staff Proposal Note:</span> {selectedRow.releaseProposalNote}</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Request Specifications</p>
                <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <p><span className="font-semibold text-slate-900">Style:</span> {selectedRow.specStyle}</p>
                  <p><span className="font-semibold text-slate-900">Color:</span> {selectedRow.specColor}</p>
                  <p><span className="font-semibold text-slate-900">Length:</span> {selectedRow.specLength}</p>
                  <p><span className="font-semibold text-slate-900">Texture:</span> {selectedRow.specTexture}</p>
                  <p><span className="font-semibold text-slate-900">Cap Size:</span> {selectedRow.specCapSize}</p>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Special Note:</span> {selectedRow.specSpecialNote}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">H-Representative Decision</p>
                {selectedCanApprove ? (
                  <div className="mt-3 space-y-3">
                    <button
                      type="button"
                      onClick={handleApproveRelease}
                      disabled={isApplyingDecision || !isReleaseWorkflowAvailable}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {isApplyingDecision ? 'Applying...' : 'Approve Release Schedule'}
                    </button>

                    <div>
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Reschedule Reason (required)</label>
                      <textarea
                        value={rescheduleReason}
                        onChange={(event) => setRescheduleReason(event.target.value)}
                        disabled={isApplyingDecision || !isReleaseWorkflowAvailable}
                        rows={3}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-200"
                        placeholder="Explain why this release date should be changed."
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleRequestReschedule}
                      disabled={isApplyingDecision || !isReleaseWorkflowAvailable || !String(rescheduleReason || '').trim()}
                      className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {isApplyingDecision ? 'Applying...' : 'Request Reschedule'}
                    </button>

                    {!isReleaseWorkflowAvailable && (
                      <p className="text-xs text-red-700">
                        Release workflow database objects are missing. Apply supabase/017_release_scheduling_workflow.sql.
                      </p>
                    )}
                  </div>
                ) : selectedCanComplete ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      This request is in releasing stage. Mark it completed once handover is finished.
                    </div>

                    <button
                      type="button"
                      onClick={handleMarkReleaseCompleted}
                      disabled={isApplyingDecision}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {isApplyingDecision ? 'Applying...' : 'Mark Release as Completed'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    This record has no pending hospital action right now.
                  </div>
                )}
              </div>

              {selectedPreviewUrl ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <iframe
                    title="Request PDF preview"
                    src={selectedPreviewUrl}
                    className="h-[62vh] w-full rounded-lg border border-slate-200"
                  />
                  <a
                    href={selectedPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:underline"
                  >
                    Open PDF in new tab
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No preview PDF URL is saved for this request yet.
                </div>
              )}
            </div>
          </aside>
        </div>,
        document.body,
      )}

      <style>{`
        @keyframes hospitalReleasePanelSlideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
