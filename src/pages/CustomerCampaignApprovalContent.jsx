import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar } from 'primereact/calendar'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { Tooltip } from 'primereact/tooltip'
import { toast } from 'react-toastify'
import {
  Search, Eye, Clock, FileClock, CheckCircle2, XCircle, ClipboardCheck, ListChecks,
  CalendarClock, Send, Ban, History, Check, X, Loader2, Pencil,
} from 'lucide-react'
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_SMS_TYPE_LABELS,
  CAMPAIGN_SOURCE_LABELS,
  CAMPAIGN_SEND_TYPE_LABELS,
  EDITABLE_CAMPAIGN_STATUSES,
} from '../constants/customerPortal'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import {
  listCampaigns,
  listCampaignHistory,
  getCampaignDetail,
  approveCampaign,
  rejectCampaign,
  toApiDateTime,
} from '../utils/campaignApi'
import Pagination from '../components/common/Pagination'

const ALL_STATUS = { value: '', label: 'Tất cả trạng thái' }
const ALL_BRANDNAME = { value: 0, label: 'Tất cả Brandname' }
const CAMPAIGN_COLUMN_COUNT = 9
const DEFAULT_PAGE_SIZE = 5
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]
const REASON_MAX = 255
const HISTORY_COLUMN_COUNT = 5

const STATUS_ICONS = {
  DRAFT: FileClock,
  PENDING_APPROVAL: Clock,
  REJECTED: XCircle,
  APPROVED: CheckCircle2,
  QUEUED: CalendarClock,
  SENDING: Send,
  SUCCESS: CheckCircle2,
  FAILED: XCircle,
  CANCELLED: Ban,
}

const STATUS_META = CAMPAIGN_STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: s }), {})

function getCurrentMonthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
}

function getCurrentMonthEnd() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
}

function numberFormat(v) {
  return new Intl.NumberFormat('vi-VN').format(v ?? 0)
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function StatusBadge({ status }) {
  if (!status) return '-'
  const meta = STATUS_META[status]
  if (!meta) return <span className="cca-status-badge cca-status-gray">{status}</span>
  const Icon = STATUS_ICONS[status]
  return (
    <span className={`cca-status-badge cca-status-${meta.tone}`}>
      {Icon && <Icon size={13} />} {meta.label}
    </span>
  )
}

function DetailItem({ label, children, wide = false }) {
  return (
    <div className={`lk-detail-item${wide ? ' cca-detail-wide' : ''}`}>
      <span className="lk-detail-label">{label}</span>
      <span className="lk-detail-value">{children}</span>
    </div>
  )
}

function DateRangeFields({ idPrefix, from, to, onFrom, onTo }) {
  return (
    <>
      <div className="gw-form-field">
        <label htmlFor={`${idPrefix}-from`}>Từ ngày - giờ</label>
        <Calendar
          inputId={`${idPrefix}-from`}
          value={from}
          onChange={(e) => onFrom(e.value)}
          dateFormat="dd/mm/yy"
          showTime
          hourFormat="24"
          showIcon
          className="db-calendar cca-calendar"
          panelClassName="db-datepicker-panel"
        />
      </div>
      <div className="gw-form-field">
        <label htmlFor={`${idPrefix}-to`}>Đến ngày - giờ</label>
        <Calendar
          inputId={`${idPrefix}-to`}
          value={to}
          onChange={(e) => onTo(e.value)}
          dateFormat="dd/mm/yy"
          showTime
          hourFormat="24"
          showIcon
          className="db-calendar cca-calendar"
          panelClassName="db-datepicker-panel"
        />
      </div>
    </>
  )
}

function validateRange(from, to) {
  if (from && to && from.getTime() > to.getTime()) return 'Từ ngày không được sau đến ngày.'
  return ''
}

function CustomerCampaignApprovalContent() {
  const { authToken } = useAuth()
  const navigate = useNavigate()

  const [brandnameOptions, setBrandnameOptions] = useState([ALL_BRANDNAME])

  // ---------- Campaign list ----------
  const [status, setStatus] = useState('')
  const [brandnameId, setBrandnameId] = useState(0)
  const [fromDate, setFromDate] = useState(getCurrentMonthStart)
  const [toDate, setToDate] = useState(getCurrentMonthEnd)
  const [search, setSearch] = useState('')

  // ---------- Approve / reject ----------
  const [actionId, setActionId] = useState(null)
  const [rejectRow, setRejectRow] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // ---------- Detail dialog ----------
  const [detailRow, setDetailRow] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  // ---------- History ----------
  const [historyStatus, setHistoryStatus] = useState('')
  const [historyFrom, setHistoryFrom] = useState(getCurrentMonthStart)
  const [historyTo, setHistoryTo] = useState(getCurrentMonthEnd)
  const [historySearch, setHistorySearch] = useState('')

  const [historyRows, setHistoryRows] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_PAGE_SIZE)

  useEffect(() => {
    if (!authToken) return
    let cancelled = false
    getRoutingInfo(authToken)
      .then(({ brandNames }) => {
        if (cancelled) return
        setBrandnameOptions([ALL_BRANDNAME, ...brandNames.map((b) => ({ label: b.brandName, value: b.id }))])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [authToken])

  // Each request gets an id; responses from superseded requests are ignored.
  const campaignReqRef = useRef(0)
  const historyReqRef = useRef(0)
  const detailReqRef = useRef(0)
  // Paging reuses the filters of the last Tra cứu, not unsubmitted form values.
  const appliedCampaignFilters = useRef(null)
  const appliedHistoryFilters = useRef(null)

  const fetchCampaigns = (targetPage, targetPageSize, filters = appliedCampaignFilters.current) => {
    if (!authToken || !filters) return
    const reqId = ++campaignReqRef.current
    setLoading(true)
    setError('')
    listCampaigns({ token: authToken, ...filters, page: targetPage, limit: targetPageSize })
      .then((result) => {
        if (reqId !== campaignReqRef.current) return
        // The last page can become empty after approve/reject; fall back to the new last page.
        if (result.rows.length === 0 && targetPage > 1 && targetPage > result.totalPages) {
          fetchCampaigns(result.totalPages, targetPageSize, filters)
          return
        }
        setRows(result.rows)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        setPage(targetPage)
        setPageSize(targetPageSize)
      })
      .catch((err) => {
        if (reqId !== campaignReqRef.current) return
        setError(err.message || 'Không tải được danh sách chiến dịch.')
        setRows([])
        setTotal(0)
        setTotalPages(1)
      })
      .finally(() => {
        if (reqId === campaignReqRef.current) setLoading(false)
      })
  }

  const searchCampaigns = () => {
    const rangeError = validateRange(fromDate, toDate)
    if (rangeError) {
      toast.warn(rangeError)
      return
    }
    const filters = {
      status,
      brandnameId,
      fromDate: fromDate ? toApiDateTime(fromDate) : undefined,
      toDate: toDate ? toApiDateTime(toDate, 59) : undefined,
      name: search.trim(),
    }
    appliedCampaignFilters.current = filters
    fetchCampaigns(1, pageSize, filters)
  }

  const fetchHistory = (targetPage, targetPageSize, filters = appliedHistoryFilters.current) => {
    if (!authToken || !filters) return
    const reqId = ++historyReqRef.current
    setHistoryLoading(true)
    setHistoryError('')
    listCampaignHistory({ token: authToken, ...filters, page: targetPage, limit: targetPageSize })
      .then((result) => {
        if (reqId !== historyReqRef.current) return
        setHistoryRows(result.rows)
        setHistoryTotal(result.total)
        setHistoryTotalPages(result.totalPages)
        setHistoryPage(targetPage)
        setHistoryPageSize(targetPageSize)
      })
      .catch((err) => {
        if (reqId !== historyReqRef.current) return
        setHistoryError(err.message || 'Không tải được lịch sử chiến dịch.')
        setHistoryRows([])
        setHistoryTotal(0)
        setHistoryTotalPages(1)
      })
      .finally(() => {
        if (reqId === historyReqRef.current) setHistoryLoading(false)
      })
  }

  const searchHistory = () => {
    const rangeError = validateRange(historyFrom, historyTo)
    if (rangeError) {
      toast.warn(rangeError)
      return
    }
    const filters = {
      status: historyStatus,
      fromDate: historyFrom ? toApiDateTime(historyFrom) : undefined,
      toDate: historyTo ? toApiDateTime(historyTo, 59) : undefined,
      name: historySearch.trim(),
    }
    appliedHistoryFilters.current = filters
    fetchHistory(1, historyPageSize, filters)
  }

  useEffect(() => {
    if (!authToken) return
    searchCampaigns()
    searchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const openDetail = (row) => {
    const reqId = ++detailReqRef.current
    setDetailRow(row)
    setDetail(null)
    setDetailError('')
    setDetailLoading(true)
    getCampaignDetail({ token: authToken, id: row.id })
      .then((data) => {
        if (reqId === detailReqRef.current) setDetail(data)
      })
      .catch((err) => {
        if (reqId === detailReqRef.current) setDetailError(err.message || 'Không tải được chi tiết chiến dịch.')
      })
      .finally(() => {
        if (reqId === detailReqRef.current) setDetailLoading(false)
      })
  }

  const closeDetail = () => {
    detailReqRef.current += 1
    setDetailRow(null)
    setDetail(null)
    setDetailLoading(false)
  }

  const isOverdue = (row) => row.sendTime && new Date(row.sendTime).getTime() <= Date.now()

  const afterAction = () => {
    fetchCampaigns(page, pageSize)
    fetchHistory(1, historyPageSize)
  }

  const handleApprove = (row) => {
    confirmDialog({
      message: `Duyệt chiến dịch "${row.name}"? Chiến dịch sẽ được gửi lúc ${formatDateTime(row.sendTime)}.`,
      header: 'Xác nhận duyệt',
      icon: 'pi pi-check-circle',
      acceptLabel: 'Duyệt',
      rejectLabel: 'Không',
      rejectClassName: 'p-button-text',
      defaultFocus: 'reject',
      accept: () => {
        setActionId(row.id)
        approveCampaign({ token: authToken, id: row.id })
          .then(() => {
            toast.success(`Đã duyệt chiến dịch "${row.name}".`)
            afterAction()
          })
          .catch((err) => toast.error(err.message || 'Không duyệt được chiến dịch.'))
          .finally(() => setActionId(null))
      },
    })
  }

  const openReject = (row) => {
    setRejectRow(row)
    setRejectReason('')
  }

  const closeReject = () => {
    if (actionId != null) return
    setRejectRow(null)
  }

  const handleReject = () => {
    const reason = rejectReason.trim()
    if (!reason) {
      toast.warn('Vui lòng nhập lý do từ chối.')
      return
    }
    const row = rejectRow
    setActionId(row.id)
    rejectCampaign({ token: authToken, id: row.id, reason })
      .then(() => {
        toast.success(`Đã từ chối chiến dịch "${row.name}".`)
        setRejectRow(null)
        afterAction()
      })
      .catch((err) => toast.error(err.message || 'Không từ chối được chiến dịch.'))
      .finally(() => setActionId(null))
  }

  // PrimeReact's Tooltip only binds selector targets when it re-renders, so
  // rebind whenever the rows (and therefore the icon buttons) change.
  const actionTooltipRef = useRef(null)
  useEffect(() => {
    actionTooltipRef.current?.updateTargetEvents()
  }, [rows, actionId])

  const shown = detail || detailRow

  return (
    <div className="cca-page">
      <div className="gw-card gw-header-elevated cca-filter-card">
        <div className="gw-card-head">
          <span className="gw-card-icon"><ClipboardCheck size={18} /></span>
          <div>
            <h2 className="gw-card-title">Quản lý phê duyệt chiến dịch</h2>
            <p className="gw-card-subtitle">Duyệt nội dung, theo dõi trạng thái và lịch gửi các chiến dịch SMS của khách hàng</p>
          </div>
        </div>

        <div className="cca-filter-grid">
          <div className="gw-form-field">
            <label htmlFor="cca-status">Trạng thái</label>
            <select id="cca-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={ALL_STATUS.value}>{ALL_STATUS.label}</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="gw-form-field">
            <label htmlFor="cca-brandname">Brandname</label>
            <select id="cca-brandname" value={brandnameId} onChange={(e) => setBrandnameId(Number(e.target.value))}>
              {brandnameOptions.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          <DateRangeFields idPrefix="cca" from={fromDate} to={toDate} onFrom={setFromDate} onTo={setToDate} />

          <div className="gw-form-field cca-search-field">
            <label className="cca-search-label-hidden" htmlFor="cca-search">Tìm kiếm</label>
            <div className="pm-search-field">
              <input
                id="cca-search"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCampaigns()}
                placeholder="Tên chiến dịch"
              />
              <Search size={16} className="pm-search-icon" />
            </div>
          </div>

          <button className="db-search-btn cca-search-btn" onClick={searchCampaigns} disabled={loading}>
            Tra cứu <Search size={16} />
          </button>
        </div>
      </div>

      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <span className="table-icon"><ListChecks size={18} /></span>
            <h3 className="table-title">
              Danh sách chiến dịch <span className="am-count-badge">{numberFormat(total)} chiến dịch</span>
            </h3>
          </div>
        </div>

        <Tooltip ref={actionTooltipRef} target=".cca-icon-tip" position="top" />
        <div className="overflow-x-auto">
          <table className="routing-table cca-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên chiến dịch</th>
                <th>Nguồn danh sách</th>
                <th>Hình thức gửi</th>
                <th>Thời gian gửi</th>
                <th>Sản lượng</th>
                <th>Ngày tạo</th>
                <th>Trạng thái hiện tại</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={CAMPAIGN_COLUMN_COUNT} className="gw-table-status">Đang tải...</td></tr>
              )}
              {!loading && error && (
                <tr><td colSpan={CAMPAIGN_COLUMN_COUNT} className="gw-table-status gw-table-error">{error}</td></tr>
              )}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={CAMPAIGN_COLUMN_COUNT} className="gw-table-status">Không có chiến dịch phù hợp bộ lọc.</td></tr>
              )}
              {!loading && !error && rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td className="cca-name-cell">{row.name || '-'}</td>
                  <td>{CAMPAIGN_SOURCE_LABELS[row.sourceType] || row.sourceType || '-'}</td>
                  <td>{CAMPAIGN_SEND_TYPE_LABELS[row.type] || row.type || '-'}</td>
                  <td>{formatDateTime(row.sendTime)}</td>
                  <td>{numberFormat(row.quantity)} SMS</td>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td><StatusBadge status={row.status} /></td>
                  <td>
                    <div className="cca-row-actions">
                      <span className="cca-icon-tip" data-pr-tooltip="Xem chi tiết">
                        <button
                          type="button"
                          className="cca-icon-btn cca-icon-btn--view"
                          onClick={() => openDetail(row)}
                          aria-label={`Xem chi tiết chiến dịch ${row.name}`}
                        >
                          <Eye size={14} />
                        </button>
                      </span>
                      {EDITABLE_CAMPAIGN_STATUSES.includes(row.status) && (
                        <span className="cca-icon-tip" data-pr-tooltip="Sửa">
                          <button
                            type="button"
                            className="cca-icon-btn cca-icon-btn--edit"
                            onClick={() => navigate(`/customer/campaigns/new?id=${row.id}`)}
                            disabled={actionId != null}
                            aria-label={`Sửa chiến dịch ${row.name}`}
                          >
                            <Pencil size={13} />
                          </button>
                        </span>
                      )}
                      {row.status === 'PENDING_APPROVAL' && (
                        <>
                          <span
                            className="cca-icon-tip"
                            data-pr-tooltip={isOverdue(row) ? 'Quá giờ gửi, chỉ có thể từ chối' : 'Duyệt'}
                          >
                            <button
                              type="button"
                              className="cca-icon-btn cca-icon-btn--approve"
                              onClick={() => handleApprove(row)}
                              disabled={actionId != null || isOverdue(row)}
                              aria-label={`Duyệt chiến dịch ${row.name}`}
                              aria-describedby={isOverdue(row) ? `cca-overdue-${row.id}` : undefined}
                            >
                              {actionId === row.id && !rejectRow ? <Loader2 size={14} className="cca-icon-spin" /> : <Check size={14} />}
                            </button>
                          </span>
                          <span className="cca-icon-tip" data-pr-tooltip="Từ chối">
                            <button
                              type="button"
                              className="cca-icon-btn cca-icon-btn--reject"
                              onClick={() => openReject(row)}
                              disabled={actionId != null}
                              aria-label={`Từ chối chiến dịch ${row.name}`}
                            >
                              <X size={14} />
                            </button>
                          </span>
                          {isOverdue(row) && (
                            <span id={`cca-overdue-${row.id}`} className="cca-overdue-hint">Quá giờ gửi, chỉ có thể từ chối</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={(p) => fetchCampaigns(p, pageSize)}
          onPageSizeChange={(size) => fetchCampaigns(1, size)}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          disabled={loading || actionId != null}
        />
      </div>

      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <span className="table-icon"><History size={18} /></span>
            <h3 className="table-title">
              Lịch sử chiến dịch <span className="am-count-badge">{numberFormat(historyTotal)} thao tác</span>
            </h3>
          </div>
        </div>

        <div className="cca-filter-grid cca-history-filter">
          <div className="gw-form-field">
            <label htmlFor="cca-history-status">Trạng thái sau thao tác</label>
            <select id="cca-history-status" value={historyStatus} onChange={(e) => setHistoryStatus(e.target.value)}>
              <option value={ALL_STATUS.value}>{ALL_STATUS.label}</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <DateRangeFields idPrefix="cca-history" from={historyFrom} to={historyTo} onFrom={setHistoryFrom} onTo={setHistoryTo} />

          <div className="gw-form-field cca-search-field">
            <label className="cca-search-label-hidden" htmlFor="cca-history-search">Tìm kiếm</label>
            <div className="pm-search-field">
              <input
                id="cca-history-search"
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchHistory()}
                placeholder="Tên chiến dịch"
              />
              <Search size={16} className="pm-search-icon" />
            </div>
          </div>

          <button className="db-search-btn cca-search-btn" onClick={searchHistory} disabled={historyLoading}>
            Tra cứu <Search size={16} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="routing-table cca-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>User</th>
                <th>Thao tác</th>
                <th>Chi tiết</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && (
                <tr><td colSpan={HISTORY_COLUMN_COUNT} className="gw-table-status">Đang tải...</td></tr>
              )}
              {!historyLoading && historyError && (
                <tr><td colSpan={HISTORY_COLUMN_COUNT} className="gw-table-status gw-table-error">{historyError}</td></tr>
              )}
              {!historyLoading && !historyError && historyRows.length === 0 && (
                <tr><td colSpan={HISTORY_COLUMN_COUNT} className="gw-table-status">Chưa có lịch sử thao tác.</td></tr>
              )}
              {!historyLoading && !historyError && historyRows.map((h) => (
                <tr key={h.id}>
                  <td>{formatDateTime(h.createdAt)}</td>
                  <td>{h.username || (h.createdBy == null ? 'Hệ thống' : '-')}</td>
                  <td>{h.actionName || h.action || '-'}</td>
                  <td className="cca-history-detail">
                    <span className="cca-history-campaign">{h.campaignName || '-'}</span>
                    {h.reason && <span className="cca-history-reason">Lý do: {h.reason}</span>}
                  </td>
                  <td><StatusBadge status={h.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={historyPage}
          totalPages={historyTotalPages}
          pageSize={historyPageSize}
          onPageChange={(p) => fetchHistory(p, historyPageSize)}
          onPageSizeChange={(size) => fetchHistory(1, size)}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          disabled={historyLoading}
        />
      </div>

      <ConfirmDialog />

      <Dialog
        header="Từ chối chiến dịch"
        visible={!!rejectRow}
        onHide={closeReject}
        className="cca-reject-dialog"
        footer={
          <div className="bn-form-actions">
            <Button label="Hủy" className="bn-btn-draft" outlined onClick={closeReject} disabled={actionId != null} />
            <Button
              label={actionId != null ? 'Đang gửi...' : 'Từ chối'}
              className="p-button-danger"
              onClick={handleReject}
              disabled={actionId != null || !rejectReason.trim()}
            />
          </div>
        }
      >
        {rejectRow && (
          <div className="gw-form-field">
            <p className="cca-detail-note">Chiến dịch: <b>{rejectRow.name}</b></p>
            <label htmlFor="cca-reject-reason">Lý do từ chối <span className="gw-required">*</span></label>
            <textarea
              id="cca-reject-reason"
              className="cca-reject-input"
              rows={4}
              maxLength={REASON_MAX}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Nhập lý do từ chối"
              autoFocus
            />
            <span className="cc-char-count cc-char-count-right">{rejectReason.length}/{REASON_MAX}</span>
          </div>
        )}
      </Dialog>

      <Dialog
        header="Chi tiết chiến dịch"
        visible={!!detailRow}
        onHide={closeDetail}
        className="lk-detail-dialog"
        dismissableMask
      >
        {shown && (
          <>
            {detailLoading && <p className="cca-detail-note">Đang tải chi tiết...</p>}
            {detailError && <p className="cca-detail-note cca-detail-error">{detailError}</p>}
            <div className="lk-detail-grid">
              <DetailItem label="ID">{shown.id}</DetailItem>
              <DetailItem label="Tên chiến dịch">{shown.name || '-'}</DetailItem>
              <DetailItem label="Brandname">{shown.brandname || '-'}</DetailItem>
              <DetailItem label="Loại tin">{CAMPAIGN_SMS_TYPE_LABELS[shown.smsType] || shown.smsType || '-'}</DetailItem>
              <DetailItem label="Nguồn danh sách">
                {CAMPAIGN_SOURCE_LABELS[shown.sourceType] || shown.sourceType || '-'}
                {shown.sourceType === 'FILE' && detail?.file ? ` (${detail.file})` : ''}
              </DetailItem>
              <DetailItem label="Sản lượng">{numberFormat(detail?.progress?.total ?? shown.quantity)} SMS</DetailItem>
              <DetailItem label="Hình thức gửi">{CAMPAIGN_SEND_TYPE_LABELS[shown.type] || shown.type || '-'}</DetailItem>
              <DetailItem label="Thời gian gửi">{formatDateTime(shown.sendTime)}</DetailItem>
              <DetailItem label="Ngày tạo">{formatDateTime(shown.createdAt)}</DetailItem>
              <DetailItem label="Trạng thái hiện tại"><StatusBadge status={shown.status} /></DetailItem>
              {detail && (
                <>
                  <DetailItem label="Bắt đầu gửi">{formatDateTime(detail.startedAt)}</DetailItem>
                  <DetailItem label="Kết thúc">{formatDateTime(detail.finishedAt)}</DetailItem>
                  {detail.progress && (
                    <DetailItem label="Tiến độ" wide>
                      Đã tạo {numberFormat(detail.progress.created)}/{numberFormat(detail.progress.total)} ·
                      Thành công {numberFormat(detail.progress.success)} ·
                      Thất bại {numberFormat(detail.progress.failed)} ·
                      Chờ kết quả {numberFormat(detail.progress.pending)}
                    </DetailItem>
                  )}
                  {detail.statusReason && <DetailItem label="Lý do" wide>{detail.statusReason}</DetailItem>}
                  {detail.description && <DetailItem label="Mô tả" wide>{detail.description}</DetailItem>}
                  <DetailItem label="Nội dung" wide><span className="cca-detail-content">{detail.content || '-'}</span></DetailItem>
                </>
              )}
            </div>
          </>
        )}
      </Dialog>
    </div>
  )
}

export default CustomerCampaignApprovalContent
