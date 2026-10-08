import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Calendar } from 'primereact/calendar'
import { toast } from 'react-toastify'
import { Search, FileSpreadsheet, Info, CheckCircle2, XCircle, Clock, RefreshCw, FileSearch2 } from 'lucide-react'
import { LOOKUP_STATUS_OPTIONS } from '../constants/customerPortal'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import { lookupMessagesClient } from '../utils/customerMessageLookupApi'
import Pagination from '../components/common/Pagination'

const ALL_TELCO = { label: 'Tất cả nhà mạng', value: 0 }
const ALL_STATUS = { value: 'all', label: 'Tất cả' }

const STATUS_ICONS = { success: CheckCircle2, failed: XCircle, pending: Clock }
const STATUS_META = LOOKUP_STATUS_OPTIONS.reduce((acc, s) => ({ ...acc, [s.value]: s }), {})

function getTodayStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
}

function getTodayEnd() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
}

function mapStatusKey(rawStatus) {
  const value = (rawStatus || '').toUpperCase()
  if (value === 'SUCCESS') return 'success'
  if (value === 'FAILED') return 'failed'
  return 'pending'
}

function formatDate(date) {
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status]
  if (!meta) return null
  const Icon = STATUS_ICONS[status]
  return (
    <span className={`cca-status-badge cca-status-${meta.tone}`}>
      <Icon size={13} /> {meta.label}
    </span>
  )
}

function CustomerMessageLookupContent() {
  const { authToken } = useAuth()

  const [keyword, setKeyword] = useState('')
  const [telcoId, setTelcoId] = useState(0)
  const [status, setStatus] = useState('all')
  const [fromDate, setFromDate] = useState(getTodayStart)
  const [toDate, setToDate] = useState(getTodayEnd)
  const [dateFilterApplied, setDateFilterApplied] = useState(true)

  const [telcoOptions, setTelcoOptions] = useState([ALL_TELCO])

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (!authToken) return
    let cancelled = false

    getRoutingInfo(authToken)
      .then(({ telcos }) => {
        if (cancelled) return
        setTelcoOptions([ALL_TELCO, ...telcos.map((t) => ({ label: t.telco, value: t.id }))])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [authToken])

  const handleSearch = (targetPage = 0, targetPageSize = pageSize, overrides = {}) => {
    if (!authToken) return

    const {
      content = keyword,
      telcoId: overrideTelcoId = telcoId,
      applyDateFilter = dateFilterApplied,
      from = fromDate,
      to = toDate,
    } = overrides

    setPage(targetPage)
    setLoading(true)
    setError('')

    lookupMessagesClient({
      token: authToken,
      content: content.trim(),
      telcoId: overrideTelcoId,
      timeType: applyDateFilter ? 1 : 0,
      startTime: formatDate(from),
      endTime: formatDate(to),
      page: targetPage,
      size: targetPageSize,
    })
      .then(({ rows: newRows, total: newTotal }) => {
        setRows(newRows)
        setTotal(newTotal)
      })
      .catch((err) => {
        setError(err.message || 'Không tra cứu được tin nhắn.')
        toast.error(err.message || 'Không tra cứu được tin nhắn.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    handleSearch(0, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const handleRefresh = () => {
    const defaultFrom = getTodayStart()
    const defaultTo = getTodayEnd()
    setKeyword('')
    setTelcoId(0)
    setStatus('all')
    setFromDate(defaultFrom)
    setToDate(defaultTo)
    setDateFilterApplied(true)
    handleSearch(0, pageSize, { content: '', telcoId: 0, applyDateFilter: true, from: defaultFrom, to: defaultTo })
  }

  const mappedRows = useMemo(
    () => rows.map((r) => ({
      id: r.id,
      sentAt: formatDateTime(r.createdAt),
      deliveryTime: formatDateTime(r.deliveryTime),
      brandname: r.brandName,
      phone: r.phone,
      telco: r.telco,
      content: r.content,
      statusKey: mapStatusKey(r.status),
    })),
    [rows],
  )

  const displayedRows = useMemo(
    () => (status === 'all' ? mappedRows : mappedRows.filter((r) => r.statusKey === status)),
    [mappedRows, status],
  )

  const handleExportExcel = () => {
    if (displayedRows.length === 0) {
      toast.warn('Không có dữ liệu để xuất.')
      return
    }
    const exportRows = displayedRows.map((r) => ({
      'Thời gian gửi': r.sentAt,
      'Thời gian trả về': r.deliveryTime,
      'Brandname': r.brandname,
      'SDT': r.phone,
      'Telco': r.telco,
      'Nội dung': r.content,
      'Trạng thái xử lý': STATUS_META[r.statusKey]?.label || r.statusKey,
    }))
    const worksheet = XLSX.utils.json_to_sheet(exportRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tra cuu tin nhan')
    XLSX.writeFile(workbook, 'tra-cuu-tin-nhan.xlsx')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="cml-page">
      <div className="cml-header gw-page-header flex items-start gap-3">
        <span className="gw-card-icon"><FileSearch2 size={18} /></span>
        <div>
          <h2 className="gw-card-title">Tra cứu tin nhắn</h2>
          <p className="gw-card-subtitle">Tra cứu lịch sử gửi tin theo số điện thoại, nội dung, loại mạng và thời gian.</p>
        </div>
      </div>

      <div className="gw-card cml-filter-card">
        <div className="cca-filter-grid cml-filter-grid">
          <div className="gw-form-field cml-search-field">
            <label>SDT hoặc nội dung</label>
            <div className="pm-search-field">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch(0, pageSize)}
                placeholder="Nhập số điện thoại hoặc nội dung"
              />
              <Search size={16} className="pm-search-icon" />
            </div>
          </div>

          <div className="gw-form-field">
            <label>Telco</label>
            <select value={telcoId} onChange={(e) => setTelcoId(Number(e.target.value))}>
              {telcoOptions.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="gw-form-field">
            <label>Trạng thái</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value={ALL_STATUS.value}>{ALL_STATUS.label}</option>
              {LOOKUP_STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="gw-form-field">
            <label>Từ ngày</label>
            <Calendar
              value={fromDate}
              onChange={(e) => { setFromDate(e.value); setDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              placeholder="dd/mm/yyyy"
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>

          <div className="gw-form-field">
            <label>Đến ngày</label>
            <Calendar
              value={toDate}
              onChange={(e) => { setToDate(e.value); setDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              placeholder="dd/mm/yyyy"
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>

          <button
            type="button"
            className="db-refresh-icon-btn"
            onClick={handleRefresh}
            disabled={loading}
            title="Làm mới bộ lọc và tải lại dữ liệu"
          >
            <RefreshCw size={16} />
          </button>

          <button className="db-search-btn cca-search-btn" onClick={() => handleSearch(0, pageSize)} disabled={loading}>
            <Search size={16} /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
          </button>
        </div>

        <p className="cml-hint">
          <Info size={13} /> Mặc định hiển thị 10 bản ghi mới nhất.
        </p>
      </div>

      <div className="gw-card cml-result-card">
        <div className="cml-result-head">
          <h3 className="cc-section-title">Kết quả tra cứu</h3>
          <button className="db-export-btn cd-excel-btn" onClick={handleExportExcel}>
            <FileSpreadsheet size={15} /> Xuất Excel
          </button>
        </div>

        {error && <p className="gw-table-error">{error}</p>}

        <div className="db-table-wrap">
          <table className={`routing-table cml-table${loading ? ' db-report-table-loading' : ''}`}>
            <thead>
              <tr>
                <th>Thời gian gửi</th>
                <th>Thời gian trả về</th>
                <th>Brandname</th>
                <th>SDT</th>
                <th>Telco</th>
                <th>Nội dung</th>
                <th>Trạng thái xử lý</th>
              </tr>
            </thead>
            <tbody>
              {loading && displayedRows.length === 0 ? (
                <tr><td colSpan={7} className="gw-table-status">Đang tra cứu...</td></tr>
              ) : !loading && !error && displayedRows.length === 0 ? (
                <tr><td colSpan={7} className="gw-table-status">Không có bản ghi phù hợp bộ lọc.</td></tr>
              ) : (
                displayedRows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.sentAt}</td>
                    <td>{r.deliveryTime}</td>
                    <td>{r.brandname}</td>
                    <td>{r.phone}</td>
                    <td>{r.telco}</td>
                    <td className="lk-cell-truncate" title={r.content}>{r.content}</td>
                    <td><StatusBadge status={r.statusKey} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {loading && displayedRows.length > 0 && (
            <div className="db-table-loading-overlay">
              <span className="db-table-spinner" />
            </div>
          )}
        </div>

        <Pagination
          page={page + 1}
          totalPages={totalPages}
          pageSize={pageSize}
          disabled={loading}
          onPageChange={(p) => handleSearch(p - 1, pageSize)}
          onPageSizeChange={(size) => { setPageSize(size); handleSearch(0, size) }}
        />
      </div>
    </div>
  )
}

export default CustomerMessageLookupContent
