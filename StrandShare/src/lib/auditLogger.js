import { isSupabaseConfigured, supabase } from './supabaseClient';

function buildFullName(firstName = '', lastName = '') {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

async function resolveActor(userProfile = null) {
  if (userProfile?.user_id) {
    return {
      user_id: userProfile.user_id,
      user_email: userProfile.email || '',
      full_name: buildFullName(userProfile.first_name, userProfile.last_name),
    };
  }

  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    return null;
  }

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('user_id, email')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();

  if (userError || !userRow?.user_id) {
    return null;
  }

  const { data: detailsRow } = await supabase
    .from('user_details')
    .select('first_name, last_name')
    .eq('user_id', userRow.user_id)
    .maybeSingle();

  return {
    user_id: userRow.user_id,
    user_email: userRow.email || session.user.email || '',
    full_name: buildFullName(detailsRow?.first_name, detailsRow?.last_name),
  };
}

export async function logAuditAction({
  action,
  description = '',
  resource = 'app',
  status = 'success',
  userProfile = null,
}) {
  if (!action || !isSupabaseConfigured || !supabase) {
    return { logged: false };
  }

  try {
    const actor = await resolveActor(userProfile);
    if (!actor?.user_id) {
      return { logged: false };
    }

    const finalDescription = actor.full_name
      ? `${description} [actor:${actor.full_name}]`
      : description;

    const { error } = await supabase.from('audit_logs').insert({
      user_id: actor.user_id,
      action,
      description: finalDescription,
      user_email: actor.user_email,
      resource,
      status,
    });

    if (error) {
      return { logged: false, error };
    }

    return { logged: true };
  } catch (error) {
    return { logged: false, error };
  }
}
