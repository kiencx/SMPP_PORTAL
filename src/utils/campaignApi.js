import httpClient, { authHeader, safeRequest } from './httpClient'

const CAMPAIGNS_URL = '/campaigns'

function unwrap({ ok, status, statusText, data }) {
  if (!ok || data?.status !== 1) {
    throw new Error(data?.message || `HTTP ${status}: ${statusText}`)
  }
  return data.data
}

/**
 * Save (create or overwrite) a campaign draft. Editing overwrites every field,
 * so callers must send the fields of all steps, not just the current one.
 * Returns `{ id, status }`.
 */
export async function saveCampaignDraft({ token, payload, signal }) {
  return unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/draft`, payload, { headers: authHeader(token), signal }),
  ))
}

/**
 * Fetch one campaign's detail (fields, file name, progress, createdAt...).
 */
export async function getCampaignDetail({ token, id, signal }) {
  return unwrap(await safeRequest(
    httpClient.get(`${CAMPAIGNS_URL}/${id}`, { headers: authHeader(token), signal }),
  ))
}

/**
 * Import a .csv/.xlsx recipient list into a draft campaign. The browser sets the
 * multipart boundary automatically. Returns the import summary
 * `{ total, success, failed, failedRows, duplicated, duplicatedRows, file, rows }`.
 */
export async function importCampaignFile({ token, id, file, signal }) {
  const formData = new FormData()
  formData.append('file', file)
  return unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/${id}/import-file`, formData, {
      headers: { ...authHeader(token), 'Content-Type': undefined },
      signal,
    }),
  ))
}

/**
 * Preview the phone + rendered message pairs the campaign will send.
 * Returns `{ total, invalidTotal, data, page, limit, totalPage }`.
 */
export async function getCampaignPreview({ token, id, page = 1, limit = 10, signal }) {
  return unwrap(await safeRequest(
    httpClient.get(`${CAMPAIGNS_URL}/${id}/preview`, {
      params: { page, limit },
      headers: authHeader(token),
      signal,
    }),
  ))
}

/**
 * Confirm a draft campaign. Returns `{ id, status, sendTime }` where status is
 * `APPROVED` (send now) or `PENDING_APPROVAL` (scheduled).
 */
export async function confirmCampaign({ token, id, signal }) {
  return unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/${id}/confirm`, null, { headers: authHeader(token), signal }),
  ))
}

/**
 * Format a Date as `YYYY-MM-DDTHH:mm:ss±HH:mm` (browser offset included), the
 * datetime shape the campaign APIs accept.
 */
export function toApiDateTime(d, seconds = 0) {
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(seconds)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// Backend rejects page numbers above 500.
const MAX_PAGE = 500

function normalizePage(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : []
  return {
    rows,
    total: typeof payload?.total === 'number' ? payload.total : rows.length,
    totalPages: Math.min(payload?.totalPage || 1, MAX_PAGE),
  }
}

/**
 * List campaigns of the account's brandnames, newest first. Every filter is
 * optional; `page` is 1-based. Returns `{ rows, total, totalPages }`.
 */
export async function listCampaigns({ token, status, brandnameId, fromDate, toDate, name, page = 1, limit = 10, signal }) {
  const body = { page, limit }
  if (status) body.status = status
  if (brandnameId) body.brandnameId = brandnameId
  if (fromDate) body.fromDate = fromDate
  if (toDate) body.toDate = toDate
  if (name) body.name = name
  return normalizePage(unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/list`, body, { headers: authHeader(token), signal }),
  )))
}

/**
 * List status-change history of the account's campaigns, newest first.
 * Returns `{ rows, total, totalPages }`.
 */
export async function listCampaignHistory({ token, status, fromDate, toDate, name, page = 1, limit = 10, signal }) {
  const body = { page, limit }
  if (status) body.status = status
  if (fromDate) body.fromDate = fromDate
  if (toDate) body.toDate = toDate
  if (name) body.name = name
  return normalizePage(unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/history/list`, body, { headers: authHeader(token), signal }),
  )))
}

/**
 * Approve a scheduled campaign that is PENDING_APPROVAL. Returns `{ id, status, sendTime }`.
 */
export async function approveCampaign({ token, id, signal }) {
  return unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/${id}/approve`, null, { headers: authHeader(token), signal }),
  ))
}

/**
 * Reject a scheduled campaign that is PENDING_APPROVAL. `reason` is required (max 255).
 * Returns `{ id, status, reason }`.
 */
export async function rejectCampaign({ token, id, reason, signal }) {
  return unwrap(await safeRequest(
    httpClient.post(`${CAMPAIGNS_URL}/${id}/reject`, { reason }, { headers: authHeader(token), signal }),
  ))
}
