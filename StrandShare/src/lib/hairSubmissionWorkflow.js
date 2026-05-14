import { isSupabaseConfigured, supabase } from './supabaseClient';

const HAIR_SUBMISSIONS_TABLE = 'Hair_Submissions';
const HAIR_SUBMISSION_BUNDLES_TABLE = 'Hair_Submission_Bundles';
const NOTIFICATIONS_TABLE = 'Notifications';
const HAIR_BUNDLE_TRACKING_TABLE = 'Hair_Bundle_Tracking_History';
const WIGS_TABLE = 'Wigs';
const WIG_SPECIFICATIONS_TABLE = 'Wig_Specifications';

export const HAIR_BUNDLE_STATUS = {
  DRAFT: 'Draft',
  IN_PRODUCTION: 'In Production',
  WIG_COMPLETED: 'Wig Completed',
  CANCELLED: 'Cancelled',
};

export const BUNDLE_HAIR_COUNT_TARGET_MIN = 8;
export const BUNDLE_HAIR_COUNT_TARGET_MAX = 10;

export const HAIR_SUBMISSION_STATUS = {
  PENDING: 'Pending',
  CUT_SHIPPED: 'Cut & Shipped',
  RECEIVED: 'Received',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  BUNDLED: 'Bundled',
  WIG_CREATED: 'Wig Created',
};

export const HAIR_SUBMISSION_STATUS_ORDER = [
  HAIR_SUBMISSION_STATUS.PENDING,
  HAIR_SUBMISSION_STATUS.CUT_SHIPPED,
  HAIR_SUBMISSION_STATUS.RECEIVED,
  HAIR_SUBMISSION_STATUS.APPROVED,
  HAIR_SUBMISSION_STATUS.BUNDLED,
  HAIR_SUBMISSION_STATUS.WIG_CREATED,
];

function isBundleCompletedStatus(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[_\s-]+/g, ' ');
  return normalized === 'wig completed';
}

export function buildSubmissionCode({ submissionId, createdAt = new Date() }) {
  const id = Number(submissionId || 0);
  if (!id) return '';
  const year = new Date(createdAt || Date.now()).getFullYear();
  return `HS-${year}-${String(id).padStart(6, '0')}`;
}

export function buildWaybillQrPayload({ submissionId, submissionCode, donationDriveId }) {
  return JSON.stringify({
    type: 'hair_submission',
    submission_id: Number(submissionId) || null,
    submission_code: String(submissionCode || ''),
    donation_drive_id: Number(donationDriveId) || null,
  });
}

export function parseWaybillQrPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.type === 'hair_submission') {
      return {
        submissionId: Number(parsed.submission_id) || null,
        submissionCode: String(parsed.submission_code || ''),
        donationDriveId: Number(parsed.donation_drive_id) || null,
      };
    }
  } catch {
    // Fall through to plain-text matching.
  }

  const codeMatch = text.match(/^HS-\d{4}-\d{4,8}$/i);
  if (codeMatch) {
    return { submissionId: null, submissionCode: text.toUpperCase(), donationDriveId: null };
  }

  const numericId = Number(text);
  if (Number.isInteger(numericId) && numericId > 0) {
    return { submissionId: numericId, submissionCode: '', donationDriveId: null };
  }

  return null;
}

export function buildBundleSubmissionCode({ bundleId, createdAt = new Date() }) {
  const id = Number(bundleId || 0);
  if (!id) return '';
  const year = new Date(createdAt || Date.now()).getFullYear();
  return `WB-${year}-${String(id).padStart(6, '0')}`;
}

export function buildWigCode({ wigId, createdAt = new Date() }) {
  const id = Number(wigId || 0);
  if (!id) return '';
  const year = new Date(createdAt || Date.now()).getFullYear();
  return `WIG-${year}-${String(id).padStart(6, '0')}`;
}

export function buildBundleWaybillQrPayload({ bundleId, submissionCode }) {
  return JSON.stringify({
    type: 'hair_submission_bundle',
    bundle_id: Number(bundleId) || null,
    submission_code: String(submissionCode || ''),
  });
}

export function parseBundleWaybillQrPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.type === 'hair_submission_bundle') {
      return {
        bundleId: Number(parsed.bundle_id) || null,
        submissionCode: String(parsed.submission_code || ''),
      };
    }
  } catch {
    // Fall through.
  }

  const codeMatch = text.match(/^WB-\d{4}-\d{4,8}$/i);
  if (codeMatch) {
    return { bundleId: null, submissionCode: text.toUpperCase() };
  }

  return null;
}

const STATUS_NOTIFICATION_TEMPLATES = {
  [HAIR_SUBMISSION_STATUS.PENDING]: {
    title: 'Waybill issued',
    message: ({ submissionCode, eventTitle }) =>
      `Your waybill ${submissionCode} has been issued${eventTitle ? ` for ${eventTitle}` : ''}. Please bring it to the event for hair collection.`,
  },
  [HAIR_SUBMISSION_STATUS.CUT_SHIPPED]: {
    title: 'Hair collected',
    message: ({ submissionCode }) =>
      `Your donated hair (waybill ${submissionCode}) has been collected and is on its way to StrandShare.`,
  },
  [HAIR_SUBMISSION_STATUS.RECEIVED]: {
    title: 'Hair received at StrandShare',
    message: ({ submissionCode }) =>
      `We have received your donated hair (waybill ${submissionCode}). It will undergo quality assurance soon.`,
  },
  [HAIR_SUBMISSION_STATUS.APPROVED]: {
    title: 'Hair approved',
    message: ({ submissionCode }) =>
      `Great news - your donated hair (waybill ${submissionCode}) passed QA and is queued to be bundled into a wig.`,
  },
  [HAIR_SUBMISSION_STATUS.REJECTED]: {
    title: 'Hair did not meet QA criteria',
    message: ({ submissionCode, reason }) =>
      `Your donation (waybill ${submissionCode}) did not pass QA${reason ? `: ${reason}` : '.'} Thank you for your contribution.`,
  },
  [HAIR_SUBMISSION_STATUS.BUNDLED]: {
    title: 'Hair bundled',
    message: ({ submissionCode, bundleId }) =>
      `Your donated hair (waybill ${submissionCode}) was added to wig bundle #${bundleId}. Stay tuned for the wig completion update.`,
  },
  [HAIR_SUBMISSION_STATUS.WIG_CREATED]: {
    title: 'A wig was made from your donation',
    message: ({ submissionCode, bundleId }) =>
      `A wig has been completed using donated hair from bundle #${bundleId}, including yours (waybill ${submissionCode}). Thank you for changing a life.`,
  },
};

function buildStatusNotification({ status, submissionCode, eventTitle, reason, bundleId }) {
  const template = STATUS_NOTIFICATION_TEMPLATES[status];
  if (!template) {
    return {
      title: `Waybill ${submissionCode || ''}`.trim(),
      message: `Status updated to ${status}.`,
    };
  }
  return {
    title: template.title,
    message: template.message({ submissionCode, eventTitle, reason, bundleId }),
  };
}

export async function insertNotification({ userId, title, message, submissionId = null, bundleId = null }) {
  if (!isSupabaseConfigured || !supabase) return { error: null };
  const targetUserId = Number(userId || 0) || null;
  if (!targetUserId) return { error: null };

  const { error } = await supabase.from(NOTIFICATIONS_TABLE).insert({
    User_ID: targetUserId,
    Title: String(title || '').slice(0, 255),
    Message: String(message || ''),
    Submission_ID: submissionId ? Number(submissionId) : null,
    Bundle_ID: bundleId ? Number(bundleId) : null,
  });

  return { error };
}

export async function logBundleTracking({
  submissionId,
  submissionDetailId = null,
  status,
  title,
  description = '',
  changedBy = null,
}) {
  if (!isSupabaseConfigured || !supabase) return { error: null };
  if (!submissionId) return { error: null };

  const { error } = await supabase.from(HAIR_BUNDLE_TRACKING_TABLE).insert({
    Submission_ID: Number(submissionId),
    Submission_Detail_ID: submissionDetailId ? Number(submissionDetailId) : null,
    Status: String(status || '').slice(0, 100),
    Title: String(title || '').slice(0, 255),
    Description: String(description || ''),
    Changed_By: changedBy ? Number(changedBy) : null,
  });

  return { error };
}

export async function updateSubmissionStatus({
  submissionId,
  nextStatus,
  donorUserId,
  submissionCode,
  eventTitle = '',
  reason = '',
  bundleId = null,
  changedBy = null,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error('Supabase is not configured.') };
  }
  if (!submissionId) {
    return { error: new Error('submissionId is required.') };
  }

  const { error: updateError } = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .update({ Status: nextStatus, Updated_At: new Date().toISOString() })
    .eq('Submission_ID', submissionId);

  if (updateError) {
    return { error: updateError };
  }

  const notification = buildStatusNotification({
    status: nextStatus,
    submissionCode,
    eventTitle,
    reason,
    bundleId,
  });

  await insertNotification({
    userId: donorUserId,
    title: notification.title,
    message: notification.message,
    submissionId,
    bundleId,
  });

  await logBundleTracking({
    submissionId,
    status: nextStatus,
    title: notification.title,
    description: reason || notification.message,
    changedBy,
  });

  return { error: null };
}

export async function ensureSubmissionForRegistration({
  donationDriveId,
  organizationId = null,
  userId,
  createdBy = null,
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  if (!donationDriveId || !userId) {
    return { data: null, error: new Error('donationDriveId and userId are required.') };
  }

  const existing = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code, Created_At')
    .eq('Donation_Drive_ID', donationDriveId)
    .eq('User_ID', userId)
    .maybeSingle();

  if (existing.error && existing.error.code !== 'PGRST116') {
    return { data: null, error: existing.error };
  }

  if (existing.data?.Submission_ID) {
    return { data: existing.data, error: null };
  }

  const insertResult = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .insert({
      User_ID: Number(userId),
      Donation_Drive_ID: Number(donationDriveId),
      Status: HAIR_SUBMISSION_STATUS.PENDING,
    })
    .select('Submission_ID, User_ID, Donation_Drive_ID, Status, Submission_Code, Created_At')
    .single();

  if (insertResult.error) {
    return { data: null, error: insertResult.error };
  }

  const created = insertResult.data;
  if (!created?.Submission_Code) {
    const code = buildSubmissionCode({
      submissionId: created.Submission_ID,
      createdAt: created.Created_At,
    });
    const { error: codeError } = await supabase
      .from(HAIR_SUBMISSIONS_TABLE)
      .update({ Submission_Code: code })
      .eq('Submission_ID', created.Submission_ID);
    if (!codeError) {
      created.Submission_Code = code;
    }
  }

  return { data: created, error: null };
}

export async function createWigBundle({ submissionIds, createdBy, notes = '' }) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  const ids = Array.from(new Set((Array.isArray(submissionIds) ? submissionIds : []).map((id) => Number(id) || 0).filter(Boolean)));
  if (!ids.length) {
    return { data: null, error: new Error('Pick at least one approved hair submission.') };
  }

  const submissionsResult = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .select('Submission_ID, User_ID, Status, Submission_Code, Bundle_ID')
    .in('Submission_ID', ids);

  if (submissionsResult.error) {
    return { data: null, error: submissionsResult.error };
  }

  const eligible = (submissionsResult.data || []).filter((row) =>
    String(row.Status || '').toLowerCase() === HAIR_SUBMISSION_STATUS.APPROVED.toLowerCase()
    && !row.Bundle_ID,
  );

  if (eligible.length !== ids.length) {
    return {
      data: null,
      error: new Error('Some selected submissions are not Approved or already belong to a bundle. Refresh and retry.'),
    };
  }

  const bundleInsertResult = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .insert({
      Status: HAIR_BUNDLE_STATUS.IN_PRODUCTION,
      Created_By: createdBy ? Number(createdBy) : null,
      Notes: String(notes || '').trim() || null,
    })
    .select('Bundle_ID, Status, Created_At, Submission_Code')
    .single();

  if (bundleInsertResult.error) {
    return { data: null, error: bundleInsertResult.error };
  }

  const bundle = bundleInsertResult.data;

  if (!bundle?.Submission_Code) {
    const code = buildBundleSubmissionCode({ bundleId: bundle.Bundle_ID, createdAt: bundle.Created_At });
    const { error: codeError } = await supabase
      .from(HAIR_SUBMISSION_BUNDLES_TABLE)
      .update({ Submission_Code: code })
      .eq('Bundle_ID', bundle.Bundle_ID);
    if (!codeError) {
      bundle.Submission_Code = code;
    }
  }

  const { error: linkError } = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .update({
      Bundle_ID: bundle.Bundle_ID,
      Status: HAIR_SUBMISSION_STATUS.BUNDLED,
      Updated_At: new Date().toISOString(),
    })
    .in('Submission_ID', ids);

  if (linkError) {
    return { data: null, error: linkError };
  }

  await Promise.all(eligible.map(async (row) => {
    const notification = buildStatusNotification({
      status: HAIR_SUBMISSION_STATUS.BUNDLED,
      submissionCode: row.Submission_Code,
      bundleId: bundle.Bundle_ID,
    });
    await insertNotification({
      userId: row.User_ID,
      title: notification.title,
      message: notification.message,
      submissionId: row.Submission_ID,
      bundleId: bundle.Bundle_ID,
    });
    await logBundleTracking({
      submissionId: row.Submission_ID,
      status: HAIR_SUBMISSION_STATUS.BUNDLED,
      title: notification.title,
      description: notification.message,
      changedBy: createdBy ? Number(createdBy) : null,
    });
  }));

  return { data: { ...bundle, members: eligible }, error: null };
}

export async function completeWigBundle({
  bundleId,
  completedBy,
  frontImagePath,
  sideImagePath,
  topImagePath,
  wigName,
  hairLength = null,
  hairColor = '',
  hairTexture = '',
  hairDensity = '',
  hairStyle = '',
  capSize = '',
  notes = '',
}) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  if (!bundleId) {
    return { data: null, error: new Error('bundleId is required.') };
  }
  if (!frontImagePath || !sideImagePath || !topImagePath) {
    return { data: null, error: new Error('Front, side, and top photos are all required.') };
  }
  const trimmedWigName = String(wigName || '').trim();
  if (!trimmedWigName) {
    return { data: null, error: new Error('Wig name is required.') };
  }

  const bundleResult = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .select('Bundle_ID, Status, Submission_Code, Wig_Completed_At')
    .eq('Bundle_ID', bundleId)
    .maybeSingle();

  if (bundleResult.error) {
    return { data: null, error: bundleResult.error };
  }

  const bundle = bundleResult.data;
  if (!bundle?.Bundle_ID) {
    return { data: null, error: new Error('Bundle not found.') };
  }

  const statusKey = String(bundle.Status || '').toLowerCase();
  if (statusKey === HAIR_BUNDLE_STATUS.DRAFT.toLowerCase()) {
    return { data: null, error: new Error('Bundle is still a Draft. Finalize it on the Bundling page first.') };
  }

  const existingWigResult = await supabase
    .from(WIGS_TABLE)
    .select('Wig_ID, Bundle_ID, Wig_Name, Wig_Status, Completed_At')
    .eq('Bundle_ID', bundleId)
    .maybeSingle();

  if (existingWigResult.error) {
    return { data: null, error: existingWigResult.error };
  }

  const existingWig = existingWigResult.data || null;
  if ((isBundleCompletedStatus(statusKey) || bundle.Wig_Completed_At) && existingWig?.Wig_ID) {
    const membersSnapshot = await supabase
      .from(HAIR_SUBMISSIONS_TABLE)
      .select('Submission_ID, User_ID, Submission_Code')
      .eq('Bundle_ID', bundleId);

    return {
      data: {
        bundle,
        wig: existingWig,
        members: membersSnapshot.error ? [] : (membersSnapshot.data || []),
        alreadyComplete: true,
      },
      error: null,
    };
  }

  const membersResult = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .select('Submission_ID, User_ID, Submission_Code, Status')
    .eq('Bundle_ID', bundleId);

  if (membersResult.error) {
    return { data: null, error: membersResult.error };
  }
  const members = membersResult.data || [];

  const nowIso = new Date().toISOString();

  const completedByNumeric = completedBy ? Number(completedBy) : null;

  const wigUpsertResult = await supabase
    .from(WIGS_TABLE)
    .upsert({
      Bundle_ID: bundleId,
      Wig_Code: String(bundle.Submission_Code || '').trim() || null,
      Wig_Name: trimmedWigName,
      Total_Donated_Hairs: members.length,
      Total_Bundles_Used: 1,
      Added_By: completedByNumeric,
      Created_By: completedByNumeric,
      Completed_At: nowIso,
      Production_Notes: String(notes || '').trim() || null,
      Wig_Status: 'Ready for Release',
      Wig_Front_Image_Path: frontImagePath,
      Wig_Side_Image_Path: sideImagePath,
      Wig_Top_Image_Path: topImagePath,
    }, {
      onConflict: 'Bundle_ID',
    })
    .select('Wig_ID, Wig_Name, Bundle_ID, Total_Donated_Hairs, Completed_At, Wig_Status, Created_At')
    .single();

  if (wigUpsertResult.error) {
    return { data: null, error: wigUpsertResult.error };
  }

  const wig = wigUpsertResult.data;

  if (wig?.Wig_ID) {
    const specUpsertResult = await supabase
      .from(WIG_SPECIFICATIONS_TABLE)
      .upsert({
        Wig_ID: wig.Wig_ID,
        Hair_Length: hairLength === '' || hairLength === null || hairLength === undefined ? null : Number(hairLength),
        Hair_Color: String(hairColor || '').trim() || null,
        Hair_Texture: String(hairTexture || '').trim() || null,
        Hair_Density: String(hairDensity || '').trim() || null,
        Style: String(hairStyle || '').trim() || null,
        Cap_Size: String(capSize || '').trim() || null,
      }, {
        onConflict: 'Wig_ID',
      });

    if (specUpsertResult.error) {
      return { data: null, error: specUpsertResult.error };
    }
  }

  const { error: bundleUpdateError } = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .update({
      Status: HAIR_BUNDLE_STATUS.WIG_COMPLETED,
      Wig_Completed_At: nowIso,
    })
    .eq('Bundle_ID', bundleId);

  if (bundleUpdateError) {
    return { data: null, error: bundleUpdateError };
  }

  if (members.length) {
    const membersToNotify = members.filter(
      (row) => String(row.Status || '').toLowerCase() !== HAIR_SUBMISSION_STATUS.WIG_CREATED.toLowerCase(),
    );

    await supabase
      .from(HAIR_SUBMISSIONS_TABLE)
      .update({ Status: HAIR_SUBMISSION_STATUS.WIG_CREATED, Updated_At: nowIso })
      .eq('Bundle_ID', bundleId);

    await Promise.all(membersToNotify.map(async (row) => {
      const notification = buildStatusNotification({
        status: HAIR_SUBMISSION_STATUS.WIG_CREATED,
        submissionCode: row.Submission_Code,
        bundleId,
      });
      await insertNotification({
        userId: row.User_ID,
        title: notification.title,
        message: notification.message,
        submissionId: row.Submission_ID,
        bundleId,
      });
      await logBundleTracking({
        submissionId: row.Submission_ID,
        status: HAIR_SUBMISSION_STATUS.WIG_CREATED,
        title: notification.title,
        description: notification.message,
        changedBy: completedBy ? Number(completedBy) : null,
      });
    }));
  }

  return {
    data: {
      bundle: { ...bundle, Status: HAIR_BUNDLE_STATUS.WIG_COMPLETED, Wig_Completed_At: nowIso },
      wig,
      members,
      alreadyComplete: false,
    },
    error: null,
  };
}

export async function saveBundleDraft({ submissionIds, createdBy, notes = '' }) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  const ids = Array.from(new Set((Array.isArray(submissionIds) ? submissionIds : []).map((id) => Number(id) || 0).filter(Boolean)));

  const { data, error } = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .insert({
      Status: HAIR_BUNDLE_STATUS.DRAFT,
      Created_By: createdBy ? Number(createdBy) : null,
      Notes: String(notes || '').trim() || null,
      Draft_Submission_IDs: ids,
    })
    .select('Bundle_ID, Status, Notes, Draft_Submission_IDs, Created_At, Updated_At')
    .single();

  return { data, error };
}

export async function updateBundleDraft({ bundleId, submissionIds, notes = '' }) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  if (!bundleId) {
    return { data: null, error: new Error('bundleId is required.') };
  }
  const ids = Array.from(new Set((Array.isArray(submissionIds) ? submissionIds : []).map((id) => Number(id) || 0).filter(Boolean)));

  const { data, error } = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .update({
      Notes: String(notes || '').trim() || null,
      Draft_Submission_IDs: ids,
    })
    .eq('Bundle_ID', bundleId)
    .eq('Status', HAIR_BUNDLE_STATUS.DRAFT)
    .select('Bundle_ID, Status, Notes, Draft_Submission_IDs, Created_At, Updated_At')
    .single();

  return { data, error };
}

export async function deleteBundleDraft({ bundleId }) {
  if (!isSupabaseConfigured || !supabase) {
    return { error: new Error('Supabase is not configured.') };
  }
  if (!bundleId) {
    return { error: new Error('bundleId is required.') };
  }

  const { error } = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .delete()
    .eq('Bundle_ID', bundleId)
    .eq('Status', HAIR_BUNDLE_STATUS.DRAFT);

  return { error };
}

export async function finalizeBundleDraft({ bundleId, finalizedBy }) {
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: new Error('Supabase is not configured.') };
  }
  if (!bundleId) {
    return { data: null, error: new Error('bundleId is required.') };
  }

  const draftResult = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .select('Bundle_ID, Status, Notes, Draft_Submission_IDs, Created_At')
    .eq('Bundle_ID', bundleId)
    .maybeSingle();

  if (draftResult.error) {
    return { data: null, error: draftResult.error };
  }

  const draft = draftResult.data;
  if (!draft?.Bundle_ID) {
    return { data: null, error: new Error('Draft bundle not found.') };
  }
  if (String(draft.Status || '').toLowerCase() !== HAIR_BUNDLE_STATUS.DRAFT.toLowerCase()) {
    return { data: null, error: new Error('Bundle is no longer a Draft.') };
  }

  const draftIds = Array.isArray(draft.Draft_Submission_IDs)
    ? draft.Draft_Submission_IDs.map((id) => Number(id) || 0).filter(Boolean)
    : [];

  if (!draftIds.length) {
    return { data: null, error: new Error('Draft has no selected hair submissions.') };
  }

  const submissionsResult = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .select('Submission_ID, User_ID, Status, Submission_Code, Bundle_ID')
    .in('Submission_ID', draftIds);

  if (submissionsResult.error) {
    return { data: null, error: submissionsResult.error };
  }

  const eligible = (submissionsResult.data || []).filter((row) =>
    String(row.Status || '').toLowerCase() === HAIR_SUBMISSION_STATUS.APPROVED.toLowerCase()
    && !row.Bundle_ID,
  );

  if (eligible.length !== draftIds.length) {
    return {
      data: null,
      error: new Error('Some hairs in this draft are no longer Approved or were bundled elsewhere. Edit the draft and remove them.'),
    };
  }

  const code = buildBundleSubmissionCode({ bundleId: draft.Bundle_ID, createdAt: draft.Created_At });
  const nowIso = new Date().toISOString();

  const { error: bundleUpdateError } = await supabase
    .from(HAIR_SUBMISSION_BUNDLES_TABLE)
    .update({
      Status: HAIR_BUNDLE_STATUS.IN_PRODUCTION,
      Submission_Code: code,
      Draft_Submission_IDs: [],
    })
    .eq('Bundle_ID', draft.Bundle_ID);

  if (bundleUpdateError) {
    return { data: null, error: bundleUpdateError };
  }

  const { error: linkError } = await supabase
    .from(HAIR_SUBMISSIONS_TABLE)
    .update({
      Bundle_ID: draft.Bundle_ID,
      Status: HAIR_SUBMISSION_STATUS.BUNDLED,
      Updated_At: nowIso,
    })
    .in('Submission_ID', draftIds);

  if (linkError) {
    return { data: null, error: linkError };
  }

  await Promise.all(eligible.map(async (row) => {
    const notification = buildStatusNotification({
      status: HAIR_SUBMISSION_STATUS.BUNDLED,
      submissionCode: row.Submission_Code,
      bundleId: draft.Bundle_ID,
    });
    await insertNotification({
      userId: row.User_ID,
      title: notification.title,
      message: notification.message,
      submissionId: row.Submission_ID,
      bundleId: draft.Bundle_ID,
    });
    await logBundleTracking({
      submissionId: row.Submission_ID,
      status: HAIR_SUBMISSION_STATUS.BUNDLED,
      title: notification.title,
      description: notification.message,
      changedBy: finalizedBy ? Number(finalizedBy) : null,
    });
  }));

  return {
    data: {
      Bundle_ID: draft.Bundle_ID,
      Status: HAIR_BUNDLE_STATUS.IN_PRODUCTION,
      Submission_Code: code,
      Notes: draft.Notes,
      Created_At: draft.Created_At,
      members: eligible,
    },
    error: null,
  };
}
