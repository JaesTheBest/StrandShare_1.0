export function normalizeRoleKey(roleValue) {
  return String(roleValue || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function toCanonicalRole(roleValue) {
  const key = normalizeRoleKey(roleValue);

  if (key === 'superadmin' || key === 'admin') {
    return 'admin';
  }
  if (key === 'staff') {
    return 'staff';
  }
  if (key === 'qastylist' || key === 'specialist') {
    return 'specialist';
  }
  if (
    key === 'hospital'
    || key === 'hstaff'
    || key === 'hrepresentative'
    || key === 'hospitalrepresentative'
  ) {
    return 'h_representative';
  }
  return key;
}

export function toRoleLabel(roleValue) {
  const role = toCanonicalRole(roleValue);
  if (role === 'admin') return 'Admin';
  if (role === 'staff') return 'Staff';
  if (role === 'specialist') return 'Specialist';
  if (role === 'h_representative') return 'H-Representative';
  return roleValue || 'User';
}

