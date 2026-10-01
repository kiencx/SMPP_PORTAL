export const ROLES = {
  ADMIN: 'ADMIN',
  CLIENT: 'CLIENT',
}

export const ROLE_HOME_PATH = {
  [ROLES.ADMIN]: '/dashboard',
  [ROLES.CLIENT]: '/customer/dashboard',
}

export function normalizeRole(role) {
  const value = String(role ?? '').trim().toUpperCase()
  return Object.values(ROLES).includes(value) ? value : ''
}
