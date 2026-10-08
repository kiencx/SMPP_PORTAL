import { useEffect, useState } from 'react'
import { Calendar } from 'primereact/calendar'
import { Dropdown } from 'primereact/dropdown'
import { Dialog } from 'primereact/dialog'
import { toast } from 'react-toastify'
import { FileSearch2, ChevronDown, ChevronUp, RefreshCw, Search, Eye } from 'lucide-react'
import {
  CUSTOMER_OPTIONS,
  DLR_STATUS_OPTIONS,
} from '../constants/messageLookup'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import { lookupMessages } from '../utils/messageLookupApi'
import Pagination from '../components/common/Pagination'

const ALL_OPTION = { label: 'Tất cả', value: 0 }
function getTodayStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
}

function getTodayEnd() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
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
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function MessageLookupContent() {
  const { authToken } = useAuth()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [content, setContent] = useState('')
  const [fromDate, setFromDate] = useState(getTodayStart)
  const [toDate, setToDate] = useState(getTodayEnd)
  const [msgId, setMsgId] = useState('')
  const [brandname, setBrandname] = useState(0)
  const [customer, setCustomer] = useState('all')
  const [network, setNetwork] = useState(0)
  const [partner, setPartner] = useState(0)
  const [dlrStatus, setDlrStatus] = useState('')
  const [selectedRow, setSelectedRow] = useState(null)

  const [brandnameOptions, setBrandnameOptions] = useState([ALL_OPTION])
  const [networkOptions, setNetworkOptions] = useState([ALL_OPTION])
  const [partnerOptions, setPartnerOptions] = useState([ALL_OPTION])
  const [infoError, setInfoError] = useState('')

  const [resultRows, setResultRows] = useState([])
  const [resultTotal, setResultTotal] = useState(0)
  const [resultLoading, setResultLoading] = useState(false)
  const [resultError, setResultError] = useState('')
  const [dateFilterApplied, setDateFilterApplied] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    if (!authToken) return

    let cancelled = false
    setInfoError('')

    getRoutingInfo(authToken)
      .then(({ brandNames, telcos, providers }) => {
        if (cancelled) return
        setBrandnameOptions([ALL_OPTION, ...brandNames.map((b) => ({ label: b.brandName, value: b.id }))])
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

  const handleSearch = (targetPage = 0, targetPageSize = pageSize) => {
    if (!authToken) return

    setPage(targetPage)
    setResultLoading(true)
    setResultError('')

    lookupMessages({
      token: authToken,
      phone,
      content,
      timeType: dateFilterApplied ? 1 : 0,
      startTime: dateFilterApplied ? formatDate(fromDate) : undefined,
      endTime: dateFilterApplied ? formatDate(toDate) : undefined,
      requestId: msgId,
      brandNameId: brandname,
      telcoId: network,
      providerId: partner,
      deliveryStatus: dlrStatus,
      page: targetPage,
      size: targetPageSize,
    })
      .then(({ rows, total }) => {
        setResultRows(rows)
        setResultTotal(total)
      })
      .catch((err) => {
        setResultError(err.message || 'Không tra cứu được tin nhắn.')
        toast.error(err.message || 'Không tra cứu được tin nhắn.')
      })
      .finally(() => setResultLoading(false))
  }

  useEffect(() => {
    handleSearch(0, pageSize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const totalPages = Math.ceil(resultTotal / pageSize)

  const handleReset = () => {
    setPhone('')
    setContent('')
    setFromDate(getTodayStart())
    setToDate(getTodayEnd())
    setMsgId('')
    setBrandname(0)
    setCustomer('all')
    setNetwork(0)
    setPartner(0)
    setDlrStatus('')
    setDateFilterApplied(true)
    setPage(0)
  }

  return (
    <div className="lookup-content">
      <div className="gw-page-header lk-header flex items-start gap-3">
        <span className="gw-card-icon">
          <FileSearch2 size={18} />
        </span>
        <div>
          <h2 className="gw-card-title">Tra cứu chi tiết tin nhắn</h2>
          <p className="gw-card-subtitle">
            Tra cứu lịch sử SMS và kết quả Delivery Report (DLR) theo MsgID, số điện thoại, Brandname, nhà mạng, đối tác và thời gian
          </p>
        </div>
      </div>

      <div className="gw-card gw-header-elevated lk-filter-card">
        <div className="lk-basic-grid">
          <div className="gw-form-field">
            <label>Số điện thoại</label>
            <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Nhập số điện thoại" />
          </div>
          <div className="gw-form-field">
            <label>Nội dung tin nhắn</label>
            <input type="text" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nhập nội dung tin nhắn" />
          </div>
          <div className="gw-form-field">
            <label>Từ ngày</label>
            <Calendar
              value={fromDate}
              onChange={(e) => { setFromDate(e.value); setDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              showIcon
              className="db-calendar db-calendar-inline lk-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
          <div className="gw-form-field">
            <label>Đến ngày</label>
            <Calendar
              value={toDate}
              onChange={(e) => { setToDate(e.value); setDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              showIcon
              className="db-calendar db-calendar-inline lk-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
        </div>

        <div className="lk-toolbar-row">
          <button className="lk-advanced-toggle" onClick={() => setAdvancedOpen((v) => !v)}>
            Tìm kiếm nâng cao {advancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <div className="lk-toolbar-actions">
            <button
              className="db-refresh-icon-btn"
              onClick={handleReset}
              disabled={resultLoading}
              title="Làm mới bộ lọc và tải lại dữ liệu"
            >
              <RefreshCw size={16} />
            </button>
            <button className="db-search-btn" onClick={() => handleSearch(0, pageSize)} disabled={resultLoading}>
              <Search size={16} /> {resultLoading ? 'Đang tra cứu...' : 'Tra cứu'}
            </button>
          </div>
        </div>
        <p className="lk-advanced-hint">Mở rộng tìm kiếm theo điều kiện tra cứu khác</p>

        {infoError && <p className="gw-table-error">{infoError}</p>}

        {advancedOpen && (
          <div className="lk-advanced-panel">
           

            <div className="lk-advanced-grid">
              <div className="gw-form-field">
                <label>MsgID / Mã tin nhắn</label>
                <input type="text" value={msgId} onChange={(e) => setMsgId(e.target.value)} placeholder="Nhập MsgID hoặc mã tin nhắn" />
              </div>
              <div className="gw-form-field">
                <label>Brandname</label>
                <Dropdown value={brandname} onChange={(e) => setBrandname(e.value)} options={brandnameOptions} className="bn-dropdown" />
              </div>
              <div className="gw-form-field">
                <label>Khách hàng</label>
                <Dropdown value={customer} onChange={(e) => setCustomer(e.value)} options={CUSTOMER_OPTIONS} className="bn-dropdown" />
              </div>
              <div className="gw-form-field">
                <label>Nhà mạng</label>
                <Dropdown value={network} onChange={(e) => setNetwork(e.value)} options={networkOptions} className="bn-dropdown" />
              </div>
              <div className="gw-form-field">
                <label>Đối tác/Vendor</label>
                <Dropdown value={partner} onChange={(e) => setPartner(e.value)} options={partnerOptions} className="bn-dropdown" />
              </div>
              <div className="gw-form-field">
                <label>Trạng thái DLR</label>
                <Dropdown value={dlrStatus} onChange={(e) => setDlrStatus(e.value)} options={DLR_STATUS_OPTIONS} className="bn-dropdown" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <h3 className="table-title">
              <FileSearch2 size={16} /> Kết quả tra cứu <span className="am-count-badge lk-result-badge">{resultTotal} tin nhắn</span>
            </h3>
          </div>
        </div>

        {resultError && <p className="gw-table-error">{resultError}</p>}

        <div className="overflow-x-auto">
          <table className="routing-table lk-result-table">
            <thead>
              <tr>
                <th>MsgID</th>
                <th>Thời gian gửi</th>
                <th>Brandname</th>
                <th>SDT người nhận</th>
                <th>Nhà mạng</th>
                <th>Trạng thái DLR</th>
                <th>Responsee/ Lý do lỗi</th>
                <th>Xem chi tiết</th>
              </tr>
            </thead>
            <tbody>
              {resultLoading && (
                <tr>
                  <td colSpan={8} className="gw-table-status">Đang tra cứu...</td>
                </tr>
              )}
              {!resultLoading && !resultError && resultRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="gw-table-status">Không có dữ liệu.</td>
                </tr>
              )}
              {!resultLoading && resultRows.map((row) => (
                <tr key={row.id}>
                  <td className="lk-cell-truncate" title={row.requestId}>{row.requestId}</td>
                  <td>{formatDateTime(row.sentTime)}</td>
                  <td>{row.brandName}</td>
                  <td>{row.phone}</td>
                  <td>{row.telco}</td>
                  <td>
                    <span className={`lk-dlr-badge lk-dlr-${(row.deliveryStatus || '').toLowerCase()}`}>{row.deliveryStatus}</span>
                  </td>
                  <td className="lk-cell-truncate" title={row.errorMessage || '-'}>{row.errorMessage || '-'}</td>
                  <td>
                    <button
                      type="button"
                      className="lk-detail-link lk-detail-icon-btn"
                      onClick={() => setSelectedRow(row)}
                      title="Xem chi tiết"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page + 1}
          totalPages={totalPages}
          pageSize={pageSize}
          disabled={resultLoading}
          onPageChange={(p) => handleSearch(p - 1, pageSize)}
          onPageSizeChange={(size) => { setPageSize(size); handleSearch(0, size) }}
        />
      </div>

      <Dialog
        header="Chi tiết tin nhắn"
        visible={!!selectedRow}
        onHide={() => setSelectedRow(null)}
        className="lk-detail-dialog"
        dismissableMask
      >
        {selectedRow && (
          <div className="lk-detail-grid">
            <div className="lk-detail-item">
              <span className="lk-detail-label">MsgID</span>
              <span className="lk-detail-value">{selectedRow.requestId}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Thời gian nhận (request)</span>
              <span className="lk-detail-value">{formatDateTime(selectedRow.createdAt)}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Thời gian gửi</span>
              <span className="lk-detail-value">{formatDateTime(selectedRow.sentTime)}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Thời gian nhận DLR</span>
              <span className="lk-detail-value">{formatDateTime(selectedRow.deliveryTime)}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Nội dung tin nhắn</span>
              <span className="lk-detail-value">{selectedRow.content}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Khách hàng</span>
              <span className="lk-detail-value">{selectedRow.customerName}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Brandname</span>
              <span className="lk-detail-value">{selectedRow.brandName}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">SDT người nhận</span>
              <span className="lk-detail-value">{selectedRow.phone}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Nhà mạng</span>
              <span className="lk-detail-value">{selectedRow.telco}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Đối tác/ Vendor</span>
              <span className="lk-detail-value">{selectedRow.provider}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Trạng thái DLR</span>
              <span className={`lk-dlr-badge lk-dlr-${(selectedRow.deliveryStatus || '').toLowerCase()}`}>{selectedRow.deliveryStatus}</span>
            </div>
            <div className="lk-detail-item">
              <span className="lk-detail-label">Response/ Lý do lỗi</span>
              <span className="lk-detail-value">{selectedRow.errorMessage || '-'}</span>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

export default MessageLookupContent
