import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar } from 'primereact/calendar'
import { Dropdown } from 'primereact/dropdown'
import { Dialog } from 'primereact/dialog'
import { toast } from 'react-toastify'
import {
  GitCompare, RefreshCw, Search, Info, ShieldCheck, History, ListChecks, Eye, FileDown, Upload,
} from 'lucide-react'
import {
  STATUS_OPTIONS,
  STATS_CONFIG,
} from '../constants/reconciliation'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import {
  getSummarySms,
  verifySummarySms,
  getSummarySmsAuditLogs,
  exportReconciliationReport,
} from '../utils/reconciliationApi'
import Pagination from '../components/common/Pagination'

const ALL_OPTION = { label: 'Tất cả', value: 0 }

function formatDate(date) {
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatMonthYear(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value ?? 0)
}

function formatMoney(value) {
  return `${formatNumber(value)} đ`
}

function isCompletedStatus(status) {
  return String(status || '').toUpperCase() === 'COMPLETED'
}

const RECON_DETAIL_FIELDS = [
  { key: 'summaryMonth', label: 'Tháng cước', format: 'month' },
  { key: 'fullName', label: 'Khách hàng' },
  { key: 'brandName', label: 'Brandname' },
  { key: 'telco', label: 'Nhà mạng' },
  { key: 'provider', label: 'Đối tác' },
  { key: 'reconciliationStatus', label: 'Kết quả đối soát' },
  { key: 'processStatus', label: 'Trạng thái' },
  { key: 'totalMessages', label: 'Sản lượng', format: 'number' },
  { key: 'avgCostPrice', label: 'Giá nhập', format: 'money' },
  { key: 'avgSellPrice', label: 'Giá bán', format: 'money' },
  { key: 'totalRevenue', label: 'Doanh thu', format: 'money' },
  { key: 'totalCost', label: 'Chi phí', format: 'money' },
  { key: 'totalProfit', label: 'Lợi nhuận', format: 'money' },
  { key: 'note', label: 'Ghi chú' },
]

function formatReconDetailValue(row, field) {
  const value = row?.[field.key]
  if (field.format === 'month') return formatMonthYear(value)
  if (field.format === 'number') return formatNumber(value)
  if (field.format === 'money') return formatMoney(value)
  return value || '-'
}

function ReconciliationContent() {
  const { authToken } = useAuth()
  const [network, setNetwork] = useState(0)
  const [partner, setPartner] = useState(0)
  const [status, setStatus] = useState(0)
  const [fromDate, setFromDate] = useState(null)
  const [toDate, setToDate] = useState(null)
  const [selectedRows, setSelectedRows] = useState([])
  const [detailRow, setDetailRow] = useState(null)

  const [networkOptions, setNetworkOptions] = useState([ALL_OPTION])
  const [partnerOptions, setPartnerOptions] = useState([ALL_OPTION])
  const [infoError, setInfoError] = useState('')

  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyDialogVisible, setVerifyDialogVisible] = useState(false)
  const [verifyNote, setVerifyNote] = useState('')
  const [reconPage, setReconPage] = useState(1)
  const [reconPageSize, setReconPageSize] = useState(10)

  const [historyRows, setHistoryRows] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyTotalPages, setHistoryTotalPages] = useState(1)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [exporting, setExporting] = useState(false)
  const uploadInputRef = useRef(null)

  const selectableRowIds = useMemo(
    () => rows.filter((row) => isCompletedStatus(row.status)).map((row) => row.id),
    [rows],
  )
  const allSelected = selectableRowIds.length > 0 && selectedRows.length === selectableRowIds.length
  const toggleSelectAll = () => setSelectedRows(allSelected ? [] : selectableRowIds)
  const toggleSelectRow = (id) =>
    setSelectedRows((prev) => (prev.includes(id) ? prev.filter((rowId) => rowId !== id) : [...prev, id]))

  const stats = useMemo(() => ({
    totalSms: rows.reduce((sum, row) => sum + (Number(row.totalMessages) || 0), 0),
    totalPrice: rows.reduce((sum, row) => sum + (Number(row.totalRevenue) || 0), 0),
    totalCost: rows.reduce((sum, row) => sum + (Number(row.totalCost) || 0), 0),
    profit: rows.reduce((sum, row) => sum + (Number(row.totalProfit) || 0), 0),
  }), [rows])

  useEffect(() => {
    if (!authToken) return

    let cancelled = false
    setInfoError('')

    getRoutingInfo(authToken)
      .then(({ telcos, providers }) => {
        if (cancelled) return
        setNetworkOptions([ALL_OPTION, ...telcos.map((t) => ({ label: t.telco, value: t.id }))])
        setPartnerOptions([ALL_OPTION, ...providers.map((p) => ({ label: p.providerName, value: p.id }))])
      })
      .catch((err) => {
        if (!cancelled) setInfoError(err.message || 'Không tải được dữ liệu bộ lọc.')
      })

    return () => {
      cancelled = true
    }
  }, [authToken])

  const fetchList = ({
    page = reconPage,
    limit = reconPageSize,
    telcoId = network,
    providerId = partner,
    statusFilter = status,
    from = fromDate,
    to = toDate,
  } = {}) => {
    if (!authToken) return

    setListLoading(true)
    setListError('')

    const applyDateFilter = Boolean(from && to)

    getSummarySms({
      token: authToken,
      page,
      limit,
      telcoId,
      providerId,
      timeType: applyDateFilter ? 1 : 0,
      startTime: applyDateFilter ? formatDate(from) : undefined,
      endTime: applyDateFilter ? formatDate(to) : undefined,
      status: statusFilter,
    })
      .then(({ rows: nextRows, total: nextTotal, totalPage }) => {
        setRows(nextRows)
        setTotal(nextTotal)
        setTotalPages(totalPage)
        setReconPage(page)
        setSelectedRows([])
      })
      .catch((err) => {
        setListError(err.message || 'Không tải được dữ liệu đối soát.')
        toast.error(err.message || 'Không tải được dữ liệu đối soát.')
      })
      .finally(() => setListLoading(false))
  }

  const fetchHistory = ({ page = historyPage, limit = historyPageSize } = {}) => {
    if (!authToken) return

    setHistoryLoading(true)
    setHistoryError('')

    getSummarySmsAuditLogs({ token: authToken, page, limit })
      .then(({ rows: nextRows, total: nextTotal, totalPage }) => {
        setHistoryRows(nextRows)
        setHistoryTotal(nextTotal)
        setHistoryTotalPages(totalPage)
        setHistoryPage(page)
      })
      .catch((err) => {
        setHistoryError(err.message || 'Không tải được lịch sử đối soát.')
      })
      .finally(() => setHistoryLoading(false))
  }

  useEffect(() => {
    if (!authToken) return
    fetchList({ page: 1, limit: reconPageSize })
    fetchHistory({ page: 1, limit: historyPageSize })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const handleResetFilters = () => {
    setNetwork(0)
    setPartner(0)
    setStatus(0)
    setFromDate(null)
    setToDate(null)

    fetchList({
      page: 1,
      limit: reconPageSize,
      telcoId: 0,
      providerId: 0,
      statusFilter: 0,
      from: null,
      to: null,
    })
  }

  const handleSearch = () => {
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      toast.warn('Vui lòng chọn đủ Từ ngày và Đến ngày.')
      return
    }
    fetchList({ page: 1, limit: reconPageSize })
  }

  const openVerifyDialog = () => {
    if (selectedRows.length === 0) return
    setVerifyNote('')
    setVerifyDialogVisible(true)
  }

  const closeVerifyDialog = () => {
    if (verifying) return
    setVerifyDialogVisible(false)
    setVerifyNote('')
  }

  const handleVerifySelected = () => {
    if (!authToken || selectedRows.length === 0) return

    setVerifying(true)
    verifySummarySms({ token: authToken, ids: selectedRows, note: verifyNote.trim() })
      .then((message) => {
        toast.success(message || `Đã xác thực ${selectedRows.length} bản ghi đối soát.`)
        setVerifyDialogVisible(false)
        setVerifyNote('')
        fetchList({ page: reconPage, limit: reconPageSize })
        fetchHistory({ page: 1, limit: historyPageSize })
      })
      .catch((err) => {
        toast.error(err.message || 'Không xác thực được các bản ghi đối soát.')
      })
      .finally(() => setVerifying(false))
  }

  const verifyDialogFooter = (
    <div className="rc-verify-dialog-actions">
      <button type="button" className="bn-btn-draft p-button" onClick={closeVerifyDialog} disabled={verifying}>
        Hủy
      </button>
      <button type="button" className="db-export-btn gw-save-btn" onClick={handleVerifySelected} disabled={verifying}>
        <ShieldCheck size={16} /> {verifying ? 'Đang xác thực...' : 'Xác thực đối soát'}
      </button>
    </div>
  )

  const handleExport = () => {
    if (!authToken) return

    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      toast.warn('Vui lòng chọn đủ Từ ngày và Đến ngày trước khi xuất báo cáo.')
      return
    }

    const applyDateFilter = Boolean(fromDate && toDate)

    setExporting(true)
    exportReconciliationReport({
      token: authToken,
      timeType: applyDateFilter ? 1 : 0,
      startTime: applyDateFilter ? formatDate(fromDate) : undefined,
      endTime: applyDateFilter ? formatDate(toDate) : undefined,
    })
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        toast.success('Xuất báo cáo đối soát thành công.')
      })
      .catch((err) => {
        toast.error(err.message || 'Không xuất được báo cáo đối soát.')
      })
      .finally(() => setExporting(false))
  }

  const handleUploadClick = () => {
    uploadInputRef.current?.click()
  }

  const handleUploadFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    // Upload API chưa được ghép trong frontend hiện tại — giữ UI và thông báo rõ.
    toast.info(`Đã chọn file "${file.name}". API upload đối soát chưa được cấu hình.`)
  }

  return (
    <div className="reconciliation-content">
      {/* Header */}
      <div className="gw-card rc-header-card gw-header-elevated">
        <div className="gw-card-head am-create-head-text" style={{ marginBottom: 0 }}>
          <span className="gw-card-icon">
            <GitCompare size={18} />
          </span>
          <div>
            <h2 className="gw-card-title">SMS Reconciliation Management</h2>
            <p className="gw-card-subtitle">Quản lý đối soát sản lượng SMS Brandname với nhà cung cấp và khách hàng</p>
          </div>
        </div>
        <div className="rc-header-actions">
          <button
            type="button"
            className="bn-btn-draft p-button"
            onClick={handleExport}
            disabled={exporting || !authToken}
          >
            <FileDown size={16} /> {exporting ? 'Đang xuất...' : 'Export báo cáo'}
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            hidden
            onChange={handleUploadFile}
          />
          <button
            type="button"
            className="db-export-btn"
            onClick={handleUploadClick}
            disabled={!authToken}
          >
            <Upload size={16} /> Upload file
          </button>
        </div>
      </div>

      <div className="rc-stats-grid">
        {STATS_CONFIG.map((s) => (
          <div key={s.id} className="rc-stat-card">
            <span className="rc-stat-icon" style={{ background: s.color }}>
              <s.icon size={18} />
            </span>
            <div className="rc-stat-body">
              <p className="rc-stat-label">{s.label} (trang hiện tại)</p>
              <p className="rc-stat-value">
                {listLoading ? '...' : formatNumber(stats[s.key])} <span className="rc-stat-unit">{s.unit}</span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Compact filters */}
      <div className="gw-card gw-header-elevated rc-filter-card">
        <div className="rc-filter-heading">
          <span className="gw-card-icon"><Search size={18} /></span>
          <div>
            <h3 className="gw-card-title" style={{ margin: 0 }}>Bộ lọc đối soát</h3>
            <p className="gw-card-subtitle" style={{ margin: '0.2rem 0 0' }}>Lọc theo nhà mạng, đối tác, trạng thái và khoảng thời gian</p>
          </div>
        </div>

        {infoError && <p className="gw-table-error">{infoError}</p>}

        <div className="rc-compact-filter-row">
          <div className="gw-form-field">
            <label>Nhà mạng</label>
            <Dropdown value={network} onChange={(e) => setNetwork(e.value)} options={networkOptions} className="bn-dropdown" />
          </div>
          <div className="gw-form-field">
            <label>Đối tác</label>
            <Dropdown value={partner} onChange={(e) => setPartner(e.value)} options={partnerOptions} className="bn-dropdown" />
          </div>
          <div className="gw-form-field">
            <label>Trạng thái</label>
            <Dropdown value={status} onChange={(e) => setStatus(e.value)} options={STATUS_OPTIONS} className="bn-dropdown" />
          </div>
          <div className="gw-form-field">
            <label>Từ ngày</label>
            <Calendar
              value={fromDate}
              onChange={(e) => setFromDate(e.value)}
              dateFormat="dd/mm/yy"
              placeholder="DD/MM/YYYY"
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
          <div className="gw-form-field">
            <label>Đến ngày</label>
            <Calendar
              value={toDate}
              onChange={(e) => setToDate(e.value)}
              dateFormat="dd/mm/yy"
              placeholder="DD/MM/YYYY"
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
          <div className="rc-filter-actions">
            <button
              className="db-refresh-icon-btn"
              onClick={handleResetFilters}
              disabled={listLoading}
              title="Làm mới bộ lọc"
            >
              <RefreshCw size={16} />
            </button>
            <button className="db-export-btn" onClick={handleSearch} disabled={listLoading}>
              <Search size={16} /> {listLoading ? 'Đang tìm...' : 'Tìm kiếm'}
            </button>
          </div>
        </div>
      </div>

      {/* Reconciliation table */}
      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <span className="table-icon"><ListChecks size={18} /></span>
            <div>
              <h3 className="table-title">
                Bảng đối soát sản lượng <span className="am-count-badge">{total} bản ghi</span>
              </h3>
              <p className="gw-card-subtitle">Đối soát SMS theo nhà mạng/ brandname/ partner</p>
            </div>
          </div>
        </div>

        {listError && <p className="gw-table-error">{listError}</p>}

        <div className="rc-bulk-bar">
          <label className="rc-bulk-checkbox">
            <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={selectableRowIds.length === 0 || listLoading} />
            Đã chọn {selectedRows.length} bản ghi
          </label>
          <button
            className="db-export-btn gw-save-btn"
            disabled={selectedRows.length === 0 || verifying}
            onClick={openVerifyDialog}
          >
            <ShieldCheck size={16} /> {verifying ? 'Đang xác thực...' : 'Xác thực đối soát'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="routing-table rc-recon-table">
            <thead>
              <tr>
                <th className="rc-col-select">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} disabled={selectableRowIds.length === 0 || listLoading} />
                </th>
                <th>Tháng cước</th>
                <th>Khách hàng</th>
                <th>Brandname</th>
                <th>Nhà mạng</th>
                <th>Đối tác</th>
                <th>Trạng thái</th>
                <th>Sản lượng</th>
                <th>Doanh thu</th>
                <th>Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr><td colSpan={10} className="gw-table-status">Đang tải dữ liệu đối soát...</td></tr>
              )}
              {!listLoading && !listError && rows.length === 0 && (
                <tr><td colSpan={10} className="gw-table-status">Không có dữ liệu đối soát.</td></tr>
              )}
              {!listLoading && rows.map((row) => {
                const canVerify = isCompletedStatus(row.status)
                return (
                  <tr key={row.id}>
                    <td className="rc-col-select">
                      {canVerify && (
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(row.id)}
                          onChange={() => toggleSelectRow(row.id)}
                        />
                      )}
                    </td>
                    <td>{formatMonthYear(row.summaryMonth)}</td>
                    <td>{row.fullName || '-'}</td>
                    <td><span className="table-network">{row.brandName || '-'}</span></td>
                    <td>{row.telco || '-'}</td>
                    <td>{row.provider || '-'}</td>
                    <td>
                      <span className={`status-badge ${canVerify ? 'active' : 'pending'}`}>
                        <span className="status-dot" />
                        {row.processStatus || '-'}
                      </span>
                    </td>
                    <td>{formatNumber(row.totalMessages)}</td>
                    <td>{formatMoney(row.totalRevenue)}</td>
                    <td>
                      <button
                        type="button"
                        className="lk-detail-link lk-detail-icon-btn"
                        onClick={() => setDetailRow(row)}
                        title="Xem chi tiết"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="rc-note">
          <Info size={14} /> Hệ thống tự động đối soát theo nhà mạng, brandname và đối tác. Chọn bản ghi rồi bấm &quot;Xác thực đối soát&quot; để gọi API verify.
        </div>

        <Pagination
          page={reconPage}
          totalPages={totalPages}
          pageSize={reconPageSize}
          disabled={listLoading}
          onPageChange={(next) => fetchList({ page: next, limit: reconPageSize })}
          onPageSizeChange={(size) => {
            setReconPageSize(size)
            fetchList({ page: 1, limit: size })
          }}
        />
      </div>

      <Dialog
        header="Xác thực đối soát"
        visible={verifyDialogVisible}
        onHide={closeVerifyDialog}
        footer={verifyDialogFooter}
        className="rc-verify-dialog"
        closable={!verifying}
        dismissableMask={!verifying}
      >
        <div className="rc-verify-dialog-body">
          <p>Bạn đang xác thực <strong>{selectedRows.length}</strong> bản ghi đối soát.</p>
          <div className="gw-form-field">
            <label htmlFor="reconciliation-verify-note">Ghi chú <span className="cc-optional">(không bắt buộc)</span></label>
            <textarea
              id="reconciliation-verify-note"
              value={verifyNote}
              onChange={(e) => setVerifyNote(e.target.value)}
              placeholder="Nhập ghi chú cho các bản ghi đã chọn"
              rows={4}
              disabled={verifying}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Chi tiết đối soát"
        visible={!!detailRow}
        onHide={() => setDetailRow(null)}
        className="rc-detail-dialog"
        dismissableMask
      >
        {detailRow && (
          <div className="rc-detail-list">
            {RECON_DETAIL_FIELDS.map((field) => {
              const profit = Number(detailRow.totalProfit) || 0
              const isProfit = field.key === 'totalProfit'
              return (
                <div key={field.key} className="rc-detail-row">
                  <span className="rc-detail-label">{field.label}</span>
                  <span
                    className={`rc-detail-value${isProfit ? (profit >= 0 ? ' pm-diff-up' : ' pm-diff-down') : ''}`}
                  >
                    {formatReconDetailValue(detailRow, field)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Dialog>

      {/* History */}
      <div className="gw-card gw-header-elevated">
        <div className="gw-history-head">
          <span className="gw-card-icon"><History size={18} /></span>
          <div className="gw-history-head-text">
            <h2 className="gw-card-title">
              Lịch sử đối soát <span className="am-count-badge">{historyTotal} bản ghi</span>
            </h2>
            <p className="gw-card-subtitle">Theo dõi lịch sử xác thực và xử lý đối soát</p>
          </div>
        </div>

        {historyError && <p className="gw-table-error">{historyError}</p>}

        <div className="overflow-x-auto">
          <table className="routing-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Summary ID</th>
                <th>Giá trị trước</th>
                <th>Giá trị mới</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && (
                <tr><td colSpan={6} className="gw-table-status">Đang tải lịch sử đối soát...</td></tr>
              )}
              {!historyLoading && !historyError && historyRows.length === 0 && (
                <tr><td colSpan={6} className="gw-table-status">Chưa có lịch sử đối soát.</td></tr>
              )}
              {!historyLoading && historyRows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.fullName || '-'}</td>
                  <td>{row.actionChange || '-'}</td>
                  <td>{row.summaryId ?? '-'}</td>
                  <td>{row.oldValue || '-'}</td>
                  <td>{row.newValue || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={historyPage}
          totalPages={historyTotalPages}
          pageSize={historyPageSize}
          disabled={historyLoading}
          onPageChange={(next) => fetchHistory({ page: next, limit: historyPageSize })}
          onPageSizeChange={(size) => {
            setHistoryPageSize(size)
            fetchHistory({ page: 1, limit: size })
          }}
        />
      </div>
    </div>
  )
}

export default ReconciliationContent
