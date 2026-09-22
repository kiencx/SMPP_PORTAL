import { Fragment, useEffect, useMemo, useState } from 'react'
import { Calendar } from 'primereact/calendar'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ListSortDescending, Upload, BarChart3, PieChart, RefreshCw, LayoutDashboard } from 'lucide-react'
import { toast } from 'react-toastify'
import iconSearch from '../assets/icons/flowbite_search-outline.svg'
import { STATS } from '../constants/home'
import { useAuth } from '../context/AuthContext'
import { getSmsTraffic, getDeliveryStatus, getTotalSmsOutput, exportTotalSmsOutput } from '../utils/homeApi'
import { getRoutingInfo } from '../utils/routingApi'
import Pagination from '../components/common/Pagination'

const ALL_OPTION = { label: 'Tất cả', value: 0 }
const numberFormat = (v) => new Intl.NumberFormat('vi-VN').format(v ?? 0)

const PROVIDER_COLORS = ['#16A34A', '#2563EB', '#F59E0B', '#E31E24', '#8B5CF6', '#0EA5E9']

const DELIVERY_STATUS_META = [
  { key: 'successRate', label: 'Thành công', color: '#16A34A' },
  { key: 'failedRate', label: 'Thất bại', color: '#E31E24' },
  { key: 'processRate', label: 'Đang xử lý', color: '#FDBA74' },
  { key: 'queuedRate', label: 'Chờ gửi', color: '#FACC15' },
]

function buildDeliverySegments(rates) {
  return DELIVERY_STATUS_META.map(({ key, label, color }) => ({
    label,
    color,
    pct: rates[key] ?? 0,
  }))
}

function formatDate(date) {
  if (!date) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function buildTrafficChart(rows) {
  const telcoMap = new Map()
  const providers = []

  if (!Array.isArray(rows)) return { chartData: [], providers: [] }

  rows.forEach(({ provider, providerCode, smsTrafficList }) => {
    const providerKey = providerCode || provider
    if (!providerKey) return

    if (!providers.includes(providerKey)) providers.push(providerKey)
    ;(smsTrafficList || []).forEach(({ telco, success, failed }) => {
      const entry = telcoMap.get(telco) || { label: telco }
      entry[`${providerKey}__success`] = (entry[`${providerKey}__success`] || 0) + (success || 0)
      entry[`${providerKey}__failed`] = (entry[`${providerKey}__failed`] || 0) + (failed || 0)
      telcoMap.set(telco, entry)
    })
  })

  return { chartData: Array.from(telcoMap.values()), providers }
}

const DONUT_SIZE = 220
const DONUT_RADIUS = 89
const DONUT_STROKE = 38
const DONUT_CIRC = 2 * Math.PI * DONUT_RADIUS

function DonutDelivery({ segments }) {
  const [tooltip, setTooltip] = useState(null)
  const total = segments.reduce((sum, s) => sum + s.pct, 0)

  let cumulative = 0
  const arcs = segments.map((s) => {
    const length = (s.pct / 100) * DONUT_CIRC
    const offset = -(cumulative / 100) * DONUT_CIRC
    cumulative += s.pct
    return { ...s, length, offset }
  })

  const handleMove = (arc) => (e) => {
    const rect = e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect()
    setTooltip({ arc, x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <div className="db-donut-row flex-wrap">
      <div className="db-donut">
        <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <g transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}>
            <circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              r={DONUT_RADIUS}
              fill="none"
              stroke="#F1F2F4"
              strokeWidth={DONUT_STROKE}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={DONUT_SIZE / 2}
                cy={DONUT_SIZE / 2}
                r={DONUT_RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={DONUT_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${arc.length} ${DONUT_CIRC - arc.length}`}
                strokeDashoffset={arc.offset}
                style={{ cursor: 'pointer' }}
                onMouseMove={handleMove(arc)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </g>
        </svg>
        <div className="db-donut-hole">
          <span className="db-donut-value">{Math.round(total)}%</span>
          <span className="db-donut-label">Giao dịch</span>
        </div>
        {tooltip && (
          <div className="db-donut-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            <span className="db-legend-square" style={{ background: tooltip.arc.color }} />
            {tooltip.arc.label}: <strong>{tooltip.arc.pct}%</strong>
          </div>
        )}
      </div>
      <div className="db-delivery-legend">
        {segments.map((s) => (
          <div key={s.label} className="db-delivery-row">
            <span className="db-legend-square" style={{ background: s.color }} />
            <span className="db-delivery-name">{s.label}</span>
            <div className="db-delivery-figures">
              <span className="db-delivery-pct">{s.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const DEFAULT_REPORT_FROM_DATE = new Date(2025, 5, 14)
const DEFAULT_REPORT_TO_DATE = new Date(2025, 5, 14)

function HomeContent() {
  const { authToken } = useAuth()
  const [fromDate, setFromDate] = useState(null)
  const [toDate, setToDate] = useState(null)
  const [reportFromDate, setReportFromDate] = useState(DEFAULT_REPORT_FROM_DATE)
  const [reportToDate, setReportToDate] = useState(DEFAULT_REPORT_TO_DATE)

  const [dashboardBrandNameId, setDashboardBrandNameId] = useState(0)
  const [brandNameOptions, setBrandNameOptions] = useState([ALL_OPTION])

  const [trafficRows, setTrafficRows] = useState([])
  const [trafficLoading, setTrafficLoading] = useState(false)
  const [trafficError, setTrafficError] = useState('')

  const fetchTraffic = ({ from = fromDate, to = toDate, brandNameId = dashboardBrandNameId } = {}) => {
    if (!authToken) return

    setTrafficLoading(true)
    setTrafficError('')

    getSmsTraffic({
      token: authToken,
      brandNameId,
      timeType: from && to ? 1 : 0,
      startTime: from && to ? formatDate(from) : undefined,
      endTime: from && to ? formatDate(to) : undefined,
    })
      .then((rows) => setTrafficRows(rows))
      .catch((err) => setTrafficError(err.message || 'Không tải được dữ liệu lưu lượng SMS.'))
      .finally(() => setTrafficLoading(false))
  }

  const [deliveryRates, setDeliveryRates] = useState({ successRate: 0, failedRate: 0, queuedRate: 0, processRate: 0 })
  const [deliveryLoading, setDeliveryLoading] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')

  const fetchDelivery = ({ from = fromDate, to = toDate, brandNameId = dashboardBrandNameId } = {}) => {
    if (!authToken) return

    setDeliveryLoading(true)
    setDeliveryError('')

    getDeliveryStatus({
      token: authToken,
      brandNameId,
      timeType: from && to ? 1 : 0,
      startTime: from && to ? formatDate(from) : undefined,
      endTime: from && to ? formatDate(to) : undefined,
    })
      .then((rates) => setDeliveryRates(rates))
      .catch((err) => setDeliveryError(err.message || 'Không tải được dữ liệu delivery status.'))
      .finally(() => setDeliveryLoading(false))
  }

  const fetchDashboard = (overrides = {}) => {
    fetchTraffic(overrides)
    fetchDelivery(overrides)
  }

  const resetDashboardFilters = () => {
    setFromDate(null)
    setToDate(null)
    setDashboardBrandNameId(0)
    fetchDashboard({ from: null, to: null, brandNameId: 0 })
  }

  useEffect(() => {
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const [reportUsername, setReportUsername] = useState('')
  const [reportBrandName, setReportBrandName] = useState('')
  const [reportProviderId, setReportProviderId] = useState(0)
  const [reportTelcoId, setReportTelcoId] = useState(0)
  const [providerOptions, setProviderOptions] = useState([ALL_OPTION])
  const [telcoOptions, setTelcoOptions] = useState([ALL_OPTION])

  const [reportRows, setReportRows] = useState([])
  const [reportTotal, setReportTotal] = useState(0)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [reportPage, setReportPage] = useState(0)
  const [reportSize, setReportSize] = useState(10)
  const [reportDateFilterApplied, setReportDateFilterApplied] = useState(false)

  useEffect(() => {
    if (!authToken) return

    let cancelled = false

    getRoutingInfo(authToken)
      .then(({ telcos, providers, brandNames }) => {
        if (cancelled) return
        setProviderOptions([ALL_OPTION, ...providers.map((p) => ({ label: p.providerName, value: p.id }))])
        setTelcoOptions([ALL_OPTION, ...telcos.map((t) => ({ label: t.telco, value: t.id }))])
        setBrandNameOptions([ALL_OPTION, ...brandNames.map((b) => ({ label: b.brandName, value: b.id }))])
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [authToken])

  const fetchReport = ({
    page = 0,
    username = reportUsername,
    brandName = reportBrandName,
    providerId = reportProviderId,
    telcoId = reportTelcoId,
    from = reportFromDate,
    to = reportToDate,
    applyDateFilter = reportDateFilterApplied,
  } = {}) => {
    if (!authToken) return

    setReportLoading(true)
    setReportError('')
    setReportPage(page)

    getTotalSmsOutput({
      token: authToken,
      username: username || null,
      brandName: brandName || null,
      providerId,
      telcoId,
      timeType: applyDateFilter ? 1 : 0,
      startTime: applyDateFilter ? formatDate(from) : undefined,
      endTime: applyDateFilter ? formatDate(to) : undefined,
      page,
      size: reportSize,
    })
      .then(({ rows, total }) => {
        setReportRows(rows)
        setReportTotal(total)
      })
      .catch((err) => setReportError(err.message || 'Không tải được báo cáo tổng sản lượng.'))
      .finally(() => setReportLoading(false))
  }

  const resetReportFilters = () => {
    setReportUsername('')
    setReportBrandName('')
    setReportProviderId(0)
    setReportTelcoId(0)
    setReportFromDate(DEFAULT_REPORT_FROM_DATE)
    setReportToDate(DEFAULT_REPORT_TO_DATE)
    setReportDateFilterApplied(false)

    fetchReport({
      page: 0,
      username: '',
      brandName: '',
      providerId: 0,
      telcoId: 0,
      from: DEFAULT_REPORT_FROM_DATE,
      to: DEFAULT_REPORT_TO_DATE,
      applyDateFilter: false,
    })
  }

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, reportSize])

  const [exporting, setExporting] = useState(false)

  const handleExport = () => {
    if (!authToken) return

    setExporting(true)

    exportTotalSmsOutput(authToken)
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        URL.revokeObjectURL(url)
        toast.success('Xuất báo cáo tổng sản lượng thành công.')
      })
      .catch((err) => toast.error(err.message || 'Không xuất được báo cáo tổng sản lượng.'))
      .finally(() => setExporting(false))
  }

  const { chartData, providers } = useMemo(() => buildTrafficChart(trafficRows), [trafficRows])

  const deliverySegments = useMemo(() => buildDeliverySegments(deliveryRates), [deliveryRates])

  const providerColors = useMemo(
    () => Object.fromEntries(providers.map((p, i) => [p, PROVIDER_COLORS[i % PROVIDER_COLORS.length]])),
    [providers],
  )

  const visibleValue = (row, p) => (row[`${p}__success`] || 0) + (row[`${p}__failed`] || 0)

  const trafficMax = Math.max(1, ...chartData.flatMap((row) => providers.map((p) => visibleValue(row, p))))

  const reportTotalPages = Math.max(1, Math.ceil(reportTotal / reportSize))

  return (
    <div className="db-dashboard !px-4 sm:!px-6 lg:!px-8">
      {/* Title — same card pattern as customer dashboard */}
      <div className="gw-card cd-filter-card">
        <div className="gw-card-head !mb-0">
          <span className="gw-card-icon"><LayoutDashboard size={18} /></span>
          <div>
            <h2 className="gw-card-title">Tổng quan gửi SMS Brandname</h2>
            <p className="gw-card-subtitle">Theo dõi số lượng và xu hướng gửi SMS theo thời gian T-1</p>
          </div>
        </div>
      </div>

      {/* Filters — separate full-width row so zoom/narrow viewports wrap without clipping */}
      <div className="gw-card cd-filter-card">
        <div className="cd-filter-row flex-wrap">
          <div className="db-date-field">
            <label>Brandname</label>
            <select value={dashboardBrandNameId} onChange={(e) => setDashboardBrandNameId(Number(e.target.value))}>
              {brandNameOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="db-date-field">
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
          <div className="db-date-field">
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
          <div className="cd-filter-actions">
            <button
              className="db-refresh-icon-btn"
              onClick={resetDashboardFilters}
              disabled={trafficLoading || deliveryLoading}
              title="Làm mới bộ lọc và tải lại dữ liệu"
            >
              <RefreshCw size={16} />
            </button>
            <button className="db-search-btn cd-stat-btn" onClick={() => fetchDashboard()} disabled={trafficLoading || deliveryLoading}>
              Tra cứu <img src={iconSearch} alt="Tra cứu" className="db-search-icon" />
            </button>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {/* <div className="db-stats-grid">
        {STATS.map((stat) => (
          <div key={stat.id} className={`db-stat-card${stat.highlighted ? ' highlighted' : ''}`}>
            <img src={stat.icon} alt={stat.label} className="db-stat-icon" />
            <div className="db-stat-body">
              <div className="db-stat-label">{stat.label}</div>
              <div className="db-stat-value">{stat.value}</div>
              <div className={`db-stat-trend db-stat-trend-${stat.trendType}`}>
                {stat.trendType === 'up' && <span className="db-trend-arrow">▲</span>}
                {stat.trend}
              </div>
            </div>
          </div>
        ))}
      </div> */}

      {/* Charts row */}
      <div className="db-charts-row">
        {/* Traffic bar chart */}
        <div className="db-chart-card db-traffic-card h-[380px] sm:h-[420px] md:h-[450px]">
          <div className="db-chart-head">
            <h3><span className="db-chart-icon"><BarChart3 size={15} /></span> Lưu lượng SMS</h3>
            <div className="db-chart-toggles">
              <span className="db-t1-badge">T-1</span>
            </div>
          </div>

          {trafficError && <p className="gw-table-error">{trafficError}</p>}

          <div className="db-bar-chart-area">
            {trafficLoading ? (
              <p className="db-chart-empty">Đang tải dữ liệu...</p>
            ) : chartData.length === 0 ? (
              <p className="db-chart-empty">Không có dữ liệu lưu lượng SMS.</p>
            ) : (
              <div
                className="db-bar-scroll"
                style={{ minWidth: `${Math.max(chartData.length * Math.max(providers.length, 1) * 48, 100)}px` }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 24 }} barGap={4} barCategoryGap="8%">
                    <CartesianGrid vertical={false} stroke="#E5E7EB" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="label"
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#4B5563' }}
                      interval={0}
                      angle={chartData.length > 6 ? -30 : 0}
                      textAnchor={chartData.length > 6 ? 'end' : 'middle'}
                      height={chartData.length > 6 ? 48 : 30}
                    />
                    <YAxis
                      domain={[0, trafficMax]}
                      allowDecimals={false}
                      tickFormatter={(v) => new Intl.NumberFormat('vi-VN').format(Math.round(v))}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      width={36}
                    />
                    <Tooltip
                      formatter={(v) => new Intl.NumberFormat('vi-VN').format(Math.round(v))}
                      contentStyle={{ fontSize: 11 }}
                      itemStyle={{ fontSize: 11 }}
                      labelStyle={{ fontSize: 11 }}
                    />
                    {providers.map((p) => (
                      <Fragment key={p}>
                        <Bar
                          dataKey={`${p}__success`}
                          name={`${p} - Thành công`}
                          stackId={p}
                          fill={providerColors[p]}
                          radius={[0, 0, 0, 0]}
                          barSize={20}
                        />
                        <Bar
                          dataKey={`${p}__failed`}
                          name={`${p} - Thất bại`}
                          stackId={p}
                          fill={providerColors[p]}
                          fillOpacity={0.35}
                          radius={[4, 4, 0, 0]}
                          barSize={20}
                        />
                      </Fragment>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="db-bar-mini-legend">
            {providers.map((p) => (
              <div key={p}>
                <span className="db-legend-square" style={{ background: providerColors[p] }} /> {p}
              </div>
            ))}
          </div>
        </div>

        {/* Delivery status donut */}
        <div className="db-chart-card db-delivery-card">
          <div className="db-chart-head">
            <h3><span className="db-chart-icon"><PieChart size={15} /></span> Trạng thái gửi SMS</h3>
            <span className="db-t1-badge">T-1</span>
          </div>
          {deliveryError && <p className="gw-table-error">{deliveryError}</p>}
          <DonutDelivery segments={deliverySegments} />
        </div>
      </div>

      {/* Report table */}
      <div className="db-report-card">
        <h3 className="db-report-title">
          Báo cáo tổng sản lượng toàn hệ thống <span className="db-report-subtitle">(Màn hình root admin)</span>
        </h3>

        {reportError && <p className="gw-table-error">{reportError}</p>}

        <div className="db-report-filters flex-wrap lg:flex-nowrap">
          <input
            type="text"
            placeholder="Tên khách hàng/User"
            value={reportUsername}
            onChange={(e) => setReportUsername(e.target.value)}
          />
          <input
            type="text"
            placeholder="Tên kênh Brandname"
            value={reportBrandName}
            onChange={(e) => setReportBrandName(e.target.value)}
          />
          <select value={reportProviderId} onChange={(e) => setReportProviderId(Number(e.target.value))}>
            {providerOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.value === 0 ? '-Tất cả nhà Cung cấp-' : o.label}</option>
            ))}
          </select>
          <select value={reportTelcoId} onChange={(e) => setReportTelcoId(Number(e.target.value))}>
            {telcoOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.value === 0 ? '-Tất cả nhà mạng-' : o.label}</option>
            ))}
          </select>
          <div className="db-date-field db-date-field-inline">
            <label>Từ:</label>
            <Calendar
              value={reportFromDate}
              onChange={(e) => { setReportFromDate(e.value); setReportDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              showIcon
              className="db-calendar db-calendar-inline"
              panelClassName="db-datepicker-panel"
            />
          </div>
          <div className="db-date-field db-date-field-inline">
            <label>Đến:</label>
            <Calendar
              value={reportToDate}
              onChange={(e) => { setReportToDate(e.value); setReportDateFilterApplied(true) }}
              dateFormat="dd/mm/yy"
              showIcon
              className="db-calendar db-calendar-inline"
              panelClassName="db-datepicker-panel"
            />
          </div>
        </div>

        <div className="db-report-actions">
          <button className="db-filter-btn" onClick={() => fetchReport({ page: 0 })} disabled={reportLoading}>
            Lọc dữ liệu <ListSortDescending size={16} />
          </button>
          <button className="db-export-btn" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Đang xuất...' : 'Kết xuất báo cáo'} <Upload size={16} />
          </button>
          <button
            className="db-refresh-icon-btn"
            onClick={resetReportFilters}
            disabled={reportLoading}
            title="Xoá bộ lọc và tải lại dữ liệu"
            aria-label="Xoá bộ lọc và tải lại dữ liệu"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        <div className="db-table-wrap">
          <table className={`db-report-table${reportLoading ? ' db-report-table-loading' : ''}`}>
            <thead>
              <tr>
                <th>Khách hàng</th>
                <th>Brandname</th>
                <th>Route partner</th>
                <th>Loại mạng</th>
                <th>Tổng tin gửi</th>
                <th>Tin thành công</th>
                <th>Tin thất bại</th>
                <th>Giá mua đ</th>
                <th>Giá bán đ</th>
                <th>Lợi nhuận tạm tính</th>
              </tr>
            </thead>
            <tbody>
              {reportLoading && reportRows.length === 0 ? (
                <tr><td colSpan={10} className="db-chart-empty">Đang tải dữ liệu...</td></tr>
              ) : !reportLoading && reportRows.length === 0 ? (
                <tr><td colSpan={10} className="db-chart-empty">Không có dữ liệu.</td></tr>
              ) : (
                reportRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.customerName}</td>
                    <td><span className="db-brandname-badge">{row.brandName}</span></td>
                    <td>{row.provider}</td>
                    <td>{row.telco}</td>
                    <td>{numberFormat(row.totalSms)}</td>
                    <td className="db-cell-success">{numberFormat(row.successSms)}</td>
                    <td className="db-cell-fail">{numberFormat(row.failedSms)}</td>
                    <td>{numberFormat(row.buyPrice)} đ</td>
                    <td>{numberFormat(row.sellPrice)} đ</td>
                    <td className="db-cell-profit">{numberFormat(row.estimatedProfit)} đ</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {reportLoading && reportRows.length > 0 && (
            <div className="db-table-loading-overlay">
              <span className="db-table-spinner" />
            </div>
          )}
        </div>

        <Pagination
          page={reportPage + 1}
          totalPages={reportTotalPages}
          pageSize={reportSize}
          disabled={reportLoading}
          onPageChange={(p) => fetchReport({ page: p - 1 })}
          onPageSizeChange={(size) => setReportSize(size)}
        />
      </div>
    </div>
  )
}

export default HomeContent
