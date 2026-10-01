import httpClient, { authHeader, safeRequest } from './httpClient'
import { normalizeRole } from '../constants/auth'

const LOGIN_URL = '/login'
const SEND_URL = '/send'

/**
 * Authenticate with the SMS gateway.
 * Returns { token, username, role } on success, throws on failure.
 */
export async function loginSms(username, password) {
  const { ok, status, statusText, data } = await safeRequest(
    httpClient.post(LOGIN_URL, { username, password }),
  )

  if (!ok || data?.status !== 1) {
    const msg = data?.message || `HTTP ${status}: ${statusText}`
    throw new Error(msg)
  }

  const token = data?.data?.token
  if (!token) {
    throw new Error('Không nhận được token từ server.')
  }

  const role = normalizeRole(data?.data?.role)
  if (!role) {
    throw new Error('Tài khoản không có quyền truy cập hệ thống.')
  }

  return {
    token,
    username: data?.data?.username ?? username,
    role,
  }
}

/**
 * Send an SMS. Requires a valid Bearer token.
 */
export async function sendSmsRequest(payload, token) {
  const { ok, status, statusText, data } = await safeRequest(
    httpClient.post(SEND_URL, payload, { headers: authHeader(token) }),
  )

  if (!ok) {
    const msg = data?.message || data?.error || `HTTP ${status}: ${statusText}`
    const error = new Error(msg)
    error.details = data
    throw error
  }

  return { status, data }
}
