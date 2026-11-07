// src/utils/roles.js

/*
 * Supported roles (stored at users/<uid>.role in Firestore):
 *   - "employee"    : orders meals
 *   - "admin"       : manages the canteen (menus, reports, settings)
 *   - "super_admin" : manages user accounts (adds/removes admins & employees)
 *
 * Normalizes casing/spacing variants ("Super Admin", "super-admin") and the
 * legacy "student" role. Unknown roles return null so they get no access.
 */
export const ROLES = Object.freeze({
  EMPLOYEE: 'employee',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
});

export const normalizeRole = (role) => {
  if (typeof role !== 'string') {
    return null;
  }

  const normalized = role
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (normalized === 'student') {
    return ROLES.EMPLOYEE;
  }

  return Object.values(ROLES).includes(normalized)
    ? normalized
    : null;
};
