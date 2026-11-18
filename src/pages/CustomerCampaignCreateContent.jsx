import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx-js-style'
import { Calendar } from 'primereact/calendar'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { toast } from 'react-toastify'
import { Upload, Download, Save, Info, Send, Check, FileSpreadsheet, ArrowLeft, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import {
  saveCampaignDraft,
  getCampaignDetail,
  importCampaignFile,
  getCampaignPreview,
  confirmCampaign,
  toApiDateTime,
} from '../utils/campaignApi'
import { SMS_SEGMENTS, EDITABLE_CAMPAIGN_STATUSES } from '../constants/customerPortal'
import Pagination from '../components/common/Pagination'

const NAME_MAX = 100
const DESCRIPTION_MAX = 255
const CONTENT_MAX = 255
const PHONE_MAX = 200
const FILE_MAX_BYTES = 5 * 1024 * 1024
const MIN_SCHEDULE_MINUTES = 15
const VARIABLES = ['bien1', 'bien2', 'bien3', 'bien4', 'bien5']
const VARIABLE_REGEX = /\{(bien[1-5])\}/g
const PHONE_REGEX = /^0(3|5|7|8|9)\d{8}$/

const STEPS = [
  { id: 1, title: 'Chiến dịch', hint: 'Thông tin cơ bản' },
  { id: 2, title: 'Người nhận', hint: 'Upload hoặc nhập số' },
  { id: 3, title: 'Nội dung', hint: 'Soạn tin nhắn' },
  { id: 4, title: 'Lịch gửi', hint: 'Gửi ngay hoặc hẹn lịch' },
  { id: 5, title: 'Xác nhận', hint: 'Kiểm tra và gửi' },
]

// Hidden on request: confirm only accepts CSKH, so smsType stays 'CSKH'.
// Flip these flags to show the controls again.
const SHOW_SMS_TYPE_FIELD = false
const SHOW_SMS_SEGMENT_BADGES = false

// Confirm only accepts CSKH today; "Quảng cáo" stays visible but disabled.
const SMS_TYPES = [
  { value: 'CSKH', label: 'CSKH', hint: 'Chăm sóc khách hàng', disabled: false },
  { value: 'QC', label: 'Quảng cáo', hint: 'Hiện chưa hỗ trợ gửi chiến dịch', disabled: true },
]

const SMS_TYPE_LABELS = { CSKH: 'CSKH', QC: 'Quảng cáo', OTP: 'OTP' }

const APPROVAL_PATH = '/customer/campaigns/approval'

const pad = (n) => String(n).padStart(2, '0')

function formatDateTime(value) {
  if (!value) return '—'
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDate(value) {
  return formatDateTime(value).split(' ')[0]
}

function combineDateTime(date, time) {
  if (!date || !time) return null
  const d = new Date(date)
  d.setHours(time.getHours(), time.getMinutes(), 0, 0)
  return d
}

function isScheduleValid(d) {
  return Boolean(d) && d.getTime() >= Date.now() + MIN_SCHEDULE_MINUTES * 60 * 1000
}

function normalizePhone(raw) {
  let p = raw.replace(/[\s.\-()]/g, '')
  if (p.startsWith('+84')) p = `0${p.slice(3)}`
  else if (p.startsWith('84') && p.length === 11) p = `0${p.slice(2)}`
  return p
}

function parsePhones(text) {
  const tokens = text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)
  const valid = []
  const invalid = []
  const duplicated = []
  const seen = new Set()
  tokens.forEach((token) => {
    const phone = normalizePhone(token)
    if (!PHONE_REGEX.test(phone)) invalid.push(token)
    else if (seen.has(phone)) duplicated.push(token)
    else {
      seen.add(phone)
      valid.push(phone)
    }
  })
  return { valid, invalid, duplicated }
}

function usesVariables(content) {
  return new RegExp(VARIABLE_REGEX.source).test(content)
}

/** Split content into text/variable parts, filling variables from `row` when given. */
function renderParts(content, row) {
  const parts = []
  let last = 0
  for (const match of content.matchAll(VARIABLE_REGEX)) {
    if (match.index > last) parts.push({ text: content.slice(last, match.index) })
    const value = row?.[match[1]]
    parts.push(value ? { text: value, variable: true } : { text: match[0], variable: true, missing: Boolean(row) })
    last = match.index + match[0].length
  }
  if (last < content.length) parts.push({ text: content.slice(last) })
  return parts
}

function smsSegment(charCount) {
  if (charCount === 0) return null
  return SMS_SEGMENTS.find((seg) => charCount <= seg.limit) || SMS_SEGMENTS[SMS_SEGMENTS.length - 1]
}

function downloadTemplate() {
  const header = ['phone', ...VARIABLES]
  const sample = ['0901234567', 'Nguyen Van An', '05/11/2026', 'MM-10234', '20%', '']
  const worksheet = XLSX.utils.aoa_to_sheet([header, sample])
  header.forEach((_, c) => {
    const headCell = worksheet[XLSX.utils.encode_cell({ r: 0, c })]
    if (headCell) headCell.s = { font: { bold: true } }
  })
  // Keep the phone column as text so Excel does not drop the leading 0.
  const phoneCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: 0 })]
  if (phoneCell) {
    phoneCell.t = 's'
    phoneCell.z = '@'
  }
  worksheet['!cols'] = header.map((_, c) => ({ wch: c === 0 ? 16 : 18 }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sach so')
  XLSX.writeFile(workbook, 'mau-danh-sach-so-chien-dich.xlsx', { cellStyles: true })
}

function MessageBubble({ parts }) {
  return (
    <div className="cw-bubble">
      {parts.map((p, i) => (p.variable
        ? <b key={i} className={p.missing ? 'cw-var-missing' : undefined}>{p.text}</b>
        : <span key={i}>{p.text}</span>))}
    </div>
  )
}

function KV({ label, children, last = false }) {
  return (
    <div className={`cw-kv${last ? ' cw-kv-last' : ''}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  )
}

const INITIAL_PREVIEW = { rows: [], total: 0, invalidTotal: 0, totalPage: 1 }

function CustomerCampaignCreateContent({ editId = null }) {
  const { authToken } = useAuth()
  const navigate = useNavigate()
  const isEdit = editId != null
  const [editLoading, setEditLoading] = useState(isEdit)
  const [editError, setEditError] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editScheduleExpired, setEditScheduleExpired] = useState(false)

  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [campaignId, setCampaignId] = useState(null)

  const [brandnames, setBrandnames] = useState([])
  const [brandLoading, setBrandLoading] = useState(true)
  const [brandError, setBrandError] = useState('')

  const [campaignName, setCampaignName] = useState('')
  const [brandnameId, setBrandnameId] = useState('')
  const [smsType, setSmsType] = useState('CSKH')
  const [description, setDescription] = useState('')

  const [sourceType, setSourceType] = useState('FILE')
  const [phonesText, setPhonesText] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const [content, setContent] = useState('')
  const contentRef = useRef(null)

  const [sendType, setSendType] = useState('NOW')
  const [scheduleDate, setScheduleDate] = useState(null)
  const [scheduleTime, setScheduleTime] = useState(null)

  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const [detail, setDetail] = useState(null)
  const [preview, setPreview] = useState(INITIAL_PREVIEW)
  const [previewPage, setPreviewPage] = useState(1)
  const [previewLimit, setPreviewLimit] = useState(10)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState('')

  useEffect(() => {
    if (!authToken) return
    let cancelled = false
    getRoutingInfo(authToken)
      .then(({ brandNames }) => {
        if (cancelled) return
        setBrandnames(brandNames)
        // Default to the first allowed brandname.
        if (brandNames.length > 0) setBrandnameId((prev) => prev || String(brandNames[0].id))
      })
      .catch((err) => {
        if (!cancelled) setBrandError(err.message || 'Không tải được danh sách brandname.')
      })
      .finally(() => {
        if (!cancelled) setBrandLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authToken])

  // Edit mode: load the campaign and fill every step from its saved fields.
  useEffect(() => {
    if (!authToken || !isEdit) return undefined
    let cancelled = false
    getCampaignDetail({ token: authToken, id: editId })
      .then((d) => {
        if (cancelled) return
        if (!EDITABLE_CAMPAIGN_STATUSES.includes(d?.status)) {
          setEditError('Chỉ được sửa chiến dịch ở trạng thái nháp hoặc bị từ chối.')
          return
        }
        setCampaignId(d.id)
        setCampaignName(d.name || '')
        if (d.brandnameId != null) setBrandnameId(String(d.brandnameId))
        setSmsType(d.smsType || 'CSKH')
        setDescription(d.description || '')
        if (d.sourceType === 'PHONE') {
          setSourceType('PHONE')
          setPhonesText((d.phones || []).join('\n'))
        } else if (d.sourceType === 'FILE') {
          // The original file is not stored; keep its name and row count so the
          // saved list is reused unless the user imports a new file. `file` can be
          // null (e.g. set by another client); still keep FILE so saves don't wipe it.
          const total = d.progress?.total ?? 0
          setSourceType('FILE')
          if (total > 0) {
            setImportResult({ file: d.file || 'Danh sách số đã nhập', total, success: total, failed: 0, duplicated: 0, rows: [], fromServer: true })
          }
        }
        setContent(d.content || '')
        if (d.type === 'SCHEDULED' && d.sendTime) {
          const at = new Date(d.sendTime)
          setSendType('SCHEDULED')
          if (!Number.isNaN(at.getTime())) {
            setScheduleDate(at)
            setScheduleTime(at)
          }
          // buildPayload drops an expired schedule, so the next save clears it; tell the user up front.
          if (!isScheduleValid(at)) setEditScheduleExpired(true)
        } else {
          setSendType('NOW')
        }
        // Resend the saved send type on every draft save (see buildPayload).
        if (d.type) setMaxStep(4)
        if (d.status === 'REJECTED') setEditReason(d.statusReason || '')
      })
      .catch((err) => {
        if (!cancelled) setEditError(err.message || 'Không tải được chiến dịch.')
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authToken, editId, isEdit])

  const phoneCheck = useMemo(() => parsePhones(phonesText), [phonesText])
  const brandnameLabel = brandnames.find((b) => String(b.id) === String(brandnameId))?.brandName || '—'
  const sampleRow = sourceType === 'FILE' ? importResult?.rows?.[0] : null
  const contentParts = useMemo(() => renderParts(content, sampleRow), [content, sampleRow])
  const renderedLength = contentParts.reduce((sum, p) => sum + p.text.length, 0)
  const activeSegment = smsSegment(renderedLength)
  const recipientCount = sourceType === 'FILE' ? (importResult?.success ?? 0) : phoneCheck.valid.length
  const scheduledAt = combineDateTime(scheduleDate, scheduleTime)

  const buildPayload = () => {
    const payload = {
      name: campaignName.trim(),
      brandnameId: Number(brandnameId),
      smsType,
    }
    if (campaignId) payload.id = campaignId
    if (description.trim()) payload.description = description.trim()
    // Draft save overwrites every field, so always resend what earlier steps collected.
    if (sourceType === 'FILE' && importResult) payload.sourceType = 'FILE'
    if (sourceType === 'PHONE' && phoneCheck.valid.length > 0) {
      payload.sourceType = 'PHONE'
      payload.phones = phoneCheck.valid
    }
    if (content.trim()) payload.content = content
    if (sendType === 'NOW' && Math.max(step, maxStep) >= 4) payload.type = 'NOW'
    // An expired schedule would make every save fail; leave it out so step 4 asks for a new time.
    if (sendType === 'SCHEDULED' && isScheduleValid(scheduledAt)) {
      payload.type = 'SCHEDULED'
      payload.sendTime = toApiDateTime(scheduledAt)
    }
    return payload
  }

  const validateStep = (target) => {
    if (target === 1) {
      if (!campaignName.trim()) return 'Vui lòng nhập tên chiến dịch.'
      if (!brandnameId) return 'Vui lòng chọn brandname.'
    }
    if (target === 2) {
      if (sourceType === 'FILE') {
        if (!importResult?.success) return 'Vui lòng upload file danh sách số điện thoại.'
      } else {
        if (phoneCheck.valid.length === 0 && phoneCheck.invalid.length === 0) return 'Vui lòng nhập số điện thoại nhận tin.'
        if (phoneCheck.invalid.length > 0) return `Số điện thoại không đúng định dạng: ${phoneCheck.invalid[0]}`
        if (phoneCheck.duplicated.length > 0) return `Số điện thoại bị trùng: ${phoneCheck.duplicated[0]}`
        if (phoneCheck.valid.length > PHONE_MAX) return `Danh sách số điện thoại không được vượt quá ${PHONE_MAX} số.`
      }
    }
    if (target === 3) {
      if (!content.trim()) return 'Vui lòng nhập nội dung tin nhắn.'
      if (sourceType === 'PHONE' && usesVariables(content)) {
        return 'Danh sách nhập tay không có giá trị cho biến. Hãy bỏ biến hoặc dùng Upload file.'
      }
    }
    if (target === 4 && sendType === 'SCHEDULED') {
      if (!scheduledAt) return 'Vui lòng chọn ngày và giờ gửi.'
      if (!isScheduleValid(scheduledAt)) {
        return `Thời gian gửi phải sau thời điểm hiện tại ít nhất ${MIN_SCHEDULE_MINUTES} phút.`
      }
    }
    return ''
  }

  const persistDraft = async () => {
    const payload = buildPayload()
    const saved = await saveCampaignDraft({ token: authToken, payload })
    if (saved?.id) setCampaignId(saved.id)
    // Saving a PHONE source drops the file name server-side; require a re-import to go back to FILE.
    if (payload.sourceType === 'PHONE') setImportResult(null)
    // A saved REJECTED campaign is back to DRAFT, so the rejection banner no longer applies.
    setEditReason('')
    return saved?.id ?? campaignId
  }

  const loadReview = async (id, page = previewPage, limit = previewLimit) => {
    setReviewLoading(true)
    setReviewError('')
    try {
      const [nextDetail, nextPreview] = await Promise.all([
        getCampaignDetail({ token: authToken, id }),
        getCampaignPreview({ token: authToken, id, page, limit }),
      ])
      setDetail(nextDetail)
      setPreview({
        rows: Array.isArray(nextPreview?.data) ? nextPreview.data : [],
        total: nextPreview?.total ?? 0,
        invalidTotal: nextPreview?.invalidTotal ?? 0,
        totalPage: nextPreview?.totalPage || 1,
      })
      setPreviewPage(page)
      setPreviewLimit(limit)
    } catch (err) {
      setReviewError(err.message || 'Không tải được dữ liệu xem trước.')
    } finally {
      setReviewLoading(false)
    }
  }

  const handleNext = async () => {
    const error = validateStep(step)
    if (error) {
      toast.warn(error)
      return
    }
    setSaving(true)
    try {
      const id = await persistDraft()
      const nextStep = step + 1
      setStep(nextStep)
      setMaxStep((m) => Math.max(m, nextStep))
      if (nextStep === 5) loadReview(id, 1, previewLimit)
    } catch (err) {
      toast.error(err.message || 'Không lưu được chiến dịch.')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => setStep((s) => Math.max(1, s - 1))

  const handleSaveDraft = async () => {
    let error = validateStep(1)
    if (!error && sourceType === 'PHONE' && (phoneCheck.invalid.length > 0 || phoneCheck.duplicated.length > 0)) {
      error = validateStep(2)
    }
    if (error) {
      toast.warn(error)
      return
    }
    setSaving(true)
    try {
      await persistDraft()
      toast.success('Đã lưu nháp chiến dịch.')
    } catch (err) {
      toast.error(err.message || 'Không lưu được nháp chiến dịch.')
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setMaxStep(1)
    setCampaignId(null)
    setCampaignName('')
    setBrandnameId(brandnames.length > 0 ? String(brandnames[0].id) : '')
    setSmsType('CSKH')
    setDescription('')
    setSourceType('FILE')
    setPhonesText('')
    setImportResult(null)
    setContent('')
    setSendType('NOW')
    setScheduleDate(null)
    setScheduleTime(null)
    setDetail(null)
    setPreview(INITIAL_PREVIEW)
    setPreviewPage(1)
    setReviewError('')
  }

  // In edit mode the user came from the campaign list; return there instead of starting a new form.
  const finish = () => (isEdit ? navigate(APPROVAL_PATH) : resetForm())

  const handleCancel = () => {
    if (!campaignId) {
      finish()
      return
    }
    confirmDialog({
      message: isEdit
        ? 'Hủy sửa chiến dịch? Những thay đổi đã lưu nháp vẫn được giữ trên hệ thống.'
        : 'Hủy tạo chiến dịch? Bản nháp đã lưu vẫn được giữ trên hệ thống.',
      header: 'Xác nhận hủy',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Có',
      rejectLabel: 'Không',
      acceptClassName: 'p-button-danger',
      rejectClassName: 'p-button-text',
      defaultFocus: 'reject',
      accept: finish,
    })
  }

  const handleConfirm = async () => {
    if (!campaignId) return
    setConfirming(true)
    try {
      const result = await confirmCampaign({ token: authToken, id: campaignId })
      if (result?.status === 'PENDING_APPROVAL') {
        toast.success('Đã gửi duyệt chiến dịch. Theo dõi tại Quản lý phê duyệt chiến dịch.')
      } else {
        toast.success('Đã xác nhận chiến dịch. Hệ thống sẽ gửi tin ngay.')
      }
      finish()
    } catch (err) {
      toast.error(err.message || 'Không xác nhận được chiến dịch.')
    } finally {
      setConfirming(false)
    }
  }

  const handleChooseFile = () => fileInputRef.current?.click()

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      toast.warn('File danh sách số phải có định dạng .csv hoặc .xlsx')
      return
    }
    if (file.size > FILE_MAX_BYTES) {
      toast.warn('File danh sách số tối đa 5MB.')
      return
    }
    if (!campaignId) {
      toast.warn('Vui lòng lưu thông tin chiến dịch ở bước 1 trước.')
      return
    }
    setImporting(true)
    try {
      const result = await importCampaignFile({ token: authToken, id: campaignId, file })
      setImportResult(result)
      toast.success(`Đã nhập ${result?.success ?? 0} số hợp lệ từ file.`)
    } catch (err) {
      toast.error(err.message || 'Không nhập được file danh sách số.')
    } finally {
      setImporting(false)
    }
  }

  const handleInsertVariable = (variable) => {
    const token = `{${variable}}`
    const el = contentRef.current
    const start = el?.selectionStart ?? content.length
    const end = el?.selectionEnd ?? content.length
    const next = `${content.slice(0, start)}${token}${content.slice(end)}`
    if (next.length > CONTENT_MAX) {
      toast.warn(`Nội dung tối đa ${CONTENT_MAX} ký tự.`)
      return
    }
    setContent(next)
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      el.setSelectionRange(start + token.length, start + token.length)
    })
  }

  const busy = saving || importing || confirming || editLoading || Boolean(editError)

  const recipientSummary = () => {
    if (step < 2 && recipientCount === 0) return '—'
    if (sourceType === 'FILE') return importResult ? `${recipientCount.toLocaleString('vi-VN')} số (từ file)` : '—'
    return recipientCount ? `${recipientCount.toLocaleString('vi-VN')} số (nhập tay)` : '—'
  }

  const sendSummary = () => {
    if (Math.max(step, maxStep) < 4) return '—'
    if (sendType === 'NOW') return 'Gửi ngay'
    return scheduledAt ? `Hẹn lịch · ${formatDateTime(scheduledAt)}` : 'Hẹn lịch'
  }

  const stepHint = (s) => {
    if (s.id >= step) return s.hint
    if (s.id === 2) return recipientCount ? `${recipientCount.toLocaleString('vi-VN')} số` : s.hint
    if (s.id === 3) return activeSegment ? `${activeSegment.label}/số` : s.hint
    if (s.id === 4) return sendSummary()
    return s.hint
  }

  // ---------- Steps ----------

  const renderStep1 = () => (
    <div className="gw-card cw-card">
      <p className="cw-eyebrow">Bước 1/5</p>
      <h3 className="cw-card-title">Thông tin chiến dịch</h3>
      <p className="cw-sub">Đặt tên, chọn brandname và loại tin nhắn cho chiến dịch.</p>

      <div className="cw-grid2">
        <div className="cw-field">
          <label htmlFor="cw-name">Tên chiến dịch <span className="gw-required">*</span></label>
          <input
            id="cw-name"
            className="cw-input"
            type="text"
            value={campaignName}
            maxLength={NAME_MAX}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="Nhập tên chiến dịch"
          />
          <p className="cw-hint"><span>Tên chiến dịch không nên trùng với chiến dịch đã tạo.</span><span>{campaignName.length}/{NAME_MAX}</span></p>
        </div>
        <div className="cw-field">
          <label htmlFor="cw-brand">Brandname <span className="gw-required">*</span></label>
          <select
            id="cw-brand"
            className="cw-input"
            value={brandnameId}
            onChange={(e) => setBrandnameId(e.target.value)}
            disabled={brandLoading}
          >
            {brandnames.length === 0 && (
              <option value="">{brandLoading ? 'Đang tải...' : 'Không có brandname được phép gửi'}</option>
            )}
            {brandnames.map((b) => (
              <option key={b.id} value={b.id}>{b.brandName}</option>
            ))}
          </select>
          {brandError
            ? <p className="cw-hint cw-hint-error">{brandError}</p>
            : <p className="cw-hint">Chỉ hiển thị brandname tài khoản được phép gửi.</p>}
        </div>
      </div>

      {SHOW_SMS_TYPE_FIELD && (
      <div className="cw-field">
        <span className="cw-label">Loại tin nhắn <span className="gw-required">*</span></span>
        <div className="cw-opts" role="radiogroup" aria-label="Loại tin nhắn">
          {SMS_TYPES.map((t) => (
            <label
              key={t.value}
              className={`cw-optc${smsType === t.value ? ' cw-on' : ''}${t.disabled ? ' cw-disabled' : ''}`}
            >
              <input
                type="radio"
                name="cw-sms-type"
                value={t.value}
                checked={smsType === t.value}
                disabled={t.disabled}
                onChange={() => setSmsType(t.value)}
              />
              <span>{t.label}<small>{t.hint}</small></span>
            </label>
          ))}
        </div>
      </div>
      )}

      <div className="cw-field cw-field-last">
        <label htmlFor="cw-desc">Mục đích / Mô tả <span className="cc-optional">(không bắt buộc)</span></label>
        <textarea
          id="cw-desc"
          className="cw-input"
          rows={3}
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Nhập mô tả chiến dịch..."
        />
        <p className="cw-hint"><span /><span>{description.length}/{DESCRIPTION_MAX}</span></p>
      </div>
    </div>
  )

  const renderImportSummary = () => {
    if (!importResult) return null
    if (importResult.fromServer) {
      return (
        <div className="cw-note">
          <Info size={15} />
          <span>
            Chiến dịch đang dùng {(importResult.success ?? 0).toLocaleString('vi-VN')} số đã nhập từ file trước đó.
            Chọn file khác nếu muốn thay toàn bộ danh sách.
          </span>
        </div>
      )
    }
    const skipped = (importResult.failed ?? 0) + (importResult.duplicated ?? 0)
    const rows = Array.isArray(importResult.rows) ? importResult.rows : []
    return (
      <>
        <div className="cw-stats">
          <div className="cw-stat"><b>{(importResult.total ?? 0).toLocaleString('vi-VN')}</b><span>Tổng số dòng</span></div>
          <div className="cw-stat"><b className="cw-text-ok">{(importResult.success ?? 0).toLocaleString('vi-VN')}</b><span>Số hợp lệ</span></div>
          <div className="cw-stat"><b className="cw-text-err">{(importResult.failed ?? 0).toLocaleString('vi-VN')}</b><span>Sai định dạng / thiếu số</span></div>
          <div className="cw-stat"><b className="cw-text-warn">{(importResult.duplicated ?? 0).toLocaleString('vi-VN')}</b><span>Trùng lặp</span></div>
        </div>
        {skipped > 0 && (
          <div className="cw-note">
            <Info size={15} />
            <span>
              {skipped.toLocaleString('vi-VN')} dòng lỗi hoặc trùng bị loại khỏi danh sách gửi.
              {importResult.failedRows?.length > 0 && <> Dòng lỗi: {importResult.failedRows.slice(0, 20).join(', ')}{importResult.failedRows.length > 20 ? '…' : ''}.</>}
              {importResult.duplicatedRows?.length > 0 && <> Dòng trùng: {importResult.duplicatedRows.slice(0, 20).join(', ')}{importResult.duplicatedRows.length > 20 ? '…' : ''}.</>}
            </span>
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="cw-row cw-mb-8">
              <h4 className="cw-h4">Xem trước dữ liệu</h4>
              <span className="cw-hint">Hiển thị {rows.length}/{(importResult.success ?? 0).toLocaleString('vi-VN')} dòng hợp lệ</span>
            </div>
            <div className="cw-tbl-box">
              <table className="cw-table">
                <thead><tr><th>#</th><th>phone</th>{VARIABLES.map((v) => <th key={v}>{v}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.orderNo}>
                      <td>{r.orderNo}</td>
                      <td>{r.phone}</td>
                      {VARIABLES.map((v) => <td key={v}>{r[v] ?? '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    )
  }

  const renderStep2 = () => (
    <div className="gw-card cw-card">
      <p className="cw-eyebrow">Bước 2/5</p>
      <h3 className="cw-card-title">Người nhận</h3>
      <p className="cw-sub">Chọn một trong hai cách nhập danh sách số điện thoại nhận tin.</p>

      <div className="cw-seg" role="group" aria-label="Cách nhập danh sách số">
        <button type="button" className={sourceType === 'FILE' ? 'cw-on' : ''} aria-pressed={sourceType === 'FILE'} onClick={() => setSourceType('FILE')} disabled={busy}>
          Upload file
        </button>
        <button type="button" className={sourceType === 'PHONE' ? 'cw-on' : ''} aria-pressed={sourceType === 'PHONE'} onClick={() => setSourceType('PHONE')} disabled={busy}>
          Nhập số điện thoại
        </button>
      </div>

      {sourceType === 'FILE' ? (
        <>
          <div className="cw-note cw-note-info">
            <div className="cw-row cw-grow">
              <span>File mẫu gồm các cột: <b>phone, bien1, bien2, bien3, bien4, bien5</b>. Các cột biến dùng để cá nhân hóa nội dung ở bước 3. Tối đa 50.000 dòng, 5MB.</span>
              <button type="button" className="cw-btn cw-btn-sm" onClick={downloadTemplate}>
                <Download size={15} /> Tải file mẫu
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="cc-hidden-input"
            onChange={handleFileChange}
          />
          {importResult ? (
            <div className="cw-file">
              <div className="cw-file-name">
                <FileSpreadsheet size={18} />
                <div>
                  <b>{importResult.file || 'Danh sách số'}</b>
                  <p className="cw-hint">
                    {importResult.fromServer
                      ? `Đã lưu · ${(importResult.success ?? 0).toLocaleString('vi-VN')} số hợp lệ`
                      : `Đã tải lên · ${(importResult.total ?? 0).toLocaleString('vi-VN')} dòng`}
                  </p>
                </div>
              </div>
              <button type="button" className="cw-btn cw-btn-sm" onClick={handleChooseFile} disabled={busy}>
                {importing ? 'Đang tải lên...' : 'Chọn file khác'}
              </button>
            </div>
          ) : (
            <button type="button" className="cw-drop" onClick={handleChooseFile} disabled={busy}>
              <Upload size={20} />
              <b>{importing ? 'Đang tải lên và kiểm tra file...' : 'Upload file Excel/CSV'}</b>
              <span>Chấp nhận .xlsx, .csv theo đúng file mẫu</span>
            </button>
          )}
          {renderImportSummary()}
        </>
      ) : (
        <>
          <div className="cw-field">
            <label htmlFor="cw-phones">Danh sách số điện thoại <span className="gw-required">*</span></label>
            <textarea
              id="cw-phones"
              className="cw-input"
              rows={5}
              value={phonesText}
              onChange={(e) => setPhonesText(e.target.value)}
              placeholder="VD: 0901234567, 0912345678"
            />
            <p className="cw-hint">
              <span>Các số cách nhau bằng dấu phẩy (,). Tối đa {PHONE_MAX} số.</span>
              <span>
                {phoneCheck.valid.length > 0 && <span className="cw-text-ok">{phoneCheck.valid.length} số hợp lệ</span>}
                {phoneCheck.invalid.length > 0 && <span className="cw-text-err"> · {phoneCheck.invalid.length} sai định dạng</span>}
                {phoneCheck.duplicated.length > 0 && <span className="cw-text-warn"> · {phoneCheck.duplicated.length} trùng</span>}
              </span>
            </p>
            {phoneCheck.invalid.length > 0 && (
              <p className="cw-hint cw-hint-error">Sai định dạng: {phoneCheck.invalid.slice(0, 10).join(', ')}{phoneCheck.invalid.length > 10 ? '…' : ''}</p>
            )}
          </div>
          <div className="cw-note cw-note-info">
            <Info size={15} />
            <span>Nhập tay không có cột biến. Ở bước 3, nội dung là tin nhắn thông thường và gửi giống nhau cho mọi số. Muốn cá nhân hóa theo từng số, hãy dùng Upload file.</span>
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div className="gw-card cw-card">
      <p className="cw-eyebrow">Bước 3/5</p>
      <h3 className="cw-card-title">Nội dung tin nhắn</h3>
      <p className="cw-sub">Soạn tin nhắn thông thường, hoặc chèn biến để cá nhân hóa theo từng số trong file.</p>

      <div className="cw-field">
        <label htmlFor="cw-content">Nội dung <span className="gw-required">*</span></label>
        <textarea
          id="cw-content"
          ref={contentRef}
          className="cw-input"
          rows={5}
          value={content}
          maxLength={CONTENT_MAX}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nhập nội dung tin nhắn..."
        />
        <p className="cw-hint">
          <span>{content.length}/{CONTENT_MAX} ký tự{usesVariables(content) ? ' (chưa thay biến)' : ''}</span>
          {sampleRow && usesVariables(content) && <span>Sau khi thay biến theo dòng 1: <b>{renderedLength} ký tự</b></span>}
        </p>
      </div>

      <div className="cw-field">
        <span className="cw-label">Chèn biến từ file</span>
        <div className="cw-chips">
          {VARIABLES.map((v) => (
            <button
              key={v}
              type="button"
              className="cw-chip"
              disabled={sourceType !== 'FILE'}
              onClick={() => handleInsertVariable(v)}
            >
              {`{${v}}`}
            </button>
          ))}
        </div>
        <p className="cw-hint">
          {sourceType === 'FILE'
            ? 'Bấm để chèn biến tại vị trí con trỏ. Khi gửi, biến được thay bằng giá trị cột tương ứng của từng số.'
            : 'Biến chỉ dùng được khi nhập danh sách số bằng file.'}
        </p>
        {sourceType === 'PHONE' && usesVariables(content) && (
          <p className="cw-hint cw-hint-error">Nội dung đang chứa biến nhưng danh sách nhập tay không có giá trị cho biến.</p>
        )}
      </div>

      {SHOW_SMS_SEGMENT_BADGES && (
        <div className="cc-sms-badges cw-segments">
          {SMS_SEGMENTS.map((seg) => (
            <div key={seg.id} className={`cc-sms-badge${activeSegment?.id === seg.id ? ' cc-sms-badge-active' : ''}`}>
              <span className="cc-sms-badge-label">{seg.label}</span>
              <span className="cc-sms-badge-limit">Tối đa {seg.limit} ký tự</span>
            </div>
          ))}
        </div>
      )}

      <div className="cw-note">
        <Info size={15} />
        <span>Nên soạn tiếng Việt không dấu. Ký tự đặc biệt có thể được tính 2 ký tự.</span>
      </div>
    </div>
  )

  const renderStep4 = () => (
    <div className="gw-card cw-card">
      <p className="cw-eyebrow">Bước 4/5</p>
      <h3 className="cw-card-title">Lịch gửi</h3>
      <p className="cw-sub">Chọn thời điểm gửi chiến dịch. Tin chỉ được gửi sau khi bạn xác nhận ở bước 5.</p>

      <div className="cw-field">
        <span className="cw-label">Hình thức gửi <span className="gw-required">*</span></span>
        <div className="cw-opts" role="radiogroup" aria-label="Hình thức gửi">
          <label className={`cw-optc${sendType === 'NOW' ? ' cw-on' : ''}`}>
            <input type="radio" name="cw-send-type" checked={sendType === 'NOW'} onChange={() => setSendType('NOW')} />
            <span>Gửi ngay<small>Gửi ngay sau khi xác nhận ở bước 5</small></span>
          </label>
          <label className={`cw-optc${sendType === 'SCHEDULED' ? ' cw-on' : ''}`}>
            <input type="radio" name="cw-send-type" checked={sendType === 'SCHEDULED'} onChange={() => setSendType('SCHEDULED')} />
            <span>Hẹn lịch<small>Chọn ngày giờ gửi, cần được phê duyệt trước giờ gửi</small></span>
          </label>
        </div>
      </div>

      {sendType === 'SCHEDULED' && (
        <div className="cw-grid2">
          <div className="cw-field">
            <label htmlFor="cw-date">Ngày gửi <span className="gw-required">*</span></label>
            <Calendar
              inputId="cw-date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.value)}
              dateFormat="dd/mm/yy"
              placeholder="DD/MM/YYYY"
              minDate={new Date(new Date().setHours(0, 0, 0, 0))}
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
          <div className="cw-field">
            <label htmlFor="cw-time">Giờ gửi <span className="gw-required">*</span></label>
            <Calendar
              inputId="cw-time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.value)}
              timeOnly
              hourFormat="24"
              placeholder="--:--"
              showIcon
              className="db-calendar"
              panelClassName="db-datepicker-panel"
            />
          </div>
        </div>
      )}

      <div className="cw-note cw-note-info">
        <Info size={15} />
        <span>Thời điểm gửi phải cách hiện tại tối thiểu {MIN_SCHEDULE_MINUTES} phút. Chiến dịch hẹn lịch chuyển sang chờ duyệt sau khi xác nhận; chiến dịch đã duyệt có thể hủy trước khi bắt đầu gửi.</span>
      </div>
    </div>
  )

  const renderStep5 = () => (
    <div className="gw-card cw-card">
      <div className="cw-row">
        <div>
          <p className="cw-eyebrow">Bước 5/5</p>
          <h3 className="cw-card-title">Kiểm tra và xác nhận</h3>
        </div>
        <span className="cw-badge cw-badge-gray">Bản nháp</span>
      </div>
      <p className="cw-sub">Kiểm tra lại toàn bộ thông tin trước khi xác nhận. Cần chỉnh sửa, hãy bấm Quay lại.</p>

      {reviewError && (
        <div className="cw-note cw-note-error cw-mb-16">
          <Info size={15} />
          <div className="cw-row cw-grow">
            <span>{reviewError}</span>
            <button type="button" className="cw-btn cw-btn-sm" onClick={() => loadReview(campaignId)}>Thử lại</button>
          </div>
        </div>
      )}

      <div className="cw-sec">
        <h4 className="cw-h4 cw-mb-8">Thông tin chiến dịch & hình thức gửi</h4>
        <KV label="Tên chiến dịch">{campaignName}</KV>
        <KV label="Ngày tạo">{formatDate(detail?.createdAt)}</KV>
        <KV label="Brandname">{detail?.brandname || brandnameLabel}</KV>
        <KV label="Loại tin nhắn"><span className="cw-badge">{SMS_TYPE_LABELS[smsType] || smsType}</span></KV>
        <KV label="Mô tả"><span className="cw-normal">{description.trim() || '—'}</span></KV>
        <KV label="Hình thức gửi">{sendType === 'NOW' ? 'Gửi ngay' : 'Hẹn lịch'}</KV>
        <KV label="Thời điểm gửi" last>{sendType === 'NOW' ? 'Ngay sau khi xác nhận' : formatDateTime(scheduledAt)}</KV>
      </div>

      <div className="cw-sec">
        <h4 className="cw-h4 cw-mb-8">Danh sách số điện thoại & tin nhắn</h4>
        <p className="cw-sub cw-mb-8">
          {preview.total.toLocaleString('vi-VN')} số
          {sourceType === 'FILE' ? ` từ file ${detail?.file || importResult?.file || ''}` : ' nhập tay'}.
        </p>
        {preview.invalidTotal > 0 && (
          <div className="cw-note cw-note-error cw-mb-8">
            <Info size={15} />
            <span>{preview.invalidTotal.toLocaleString('vi-VN')} dòng thiếu giá trị cho biến, chưa thể xác nhận. Hãy sửa nội dung hoặc nhập lại file.</span>
          </div>
        )}
        <div className={`cw-tbl-box${reviewLoading ? ' cw-loading' : ''}`}>
          <table className="cw-table">
            <thead><tr><th>#</th><th>Số điện thoại</th><th>Tin nhắn sẽ gửi</th></tr></thead>
            <tbody>
              {reviewLoading && preview.rows.length === 0 && (
                <tr><td colSpan={3} className="cw-cell-center">Đang tải...</td></tr>
              )}
              {!reviewLoading && preview.rows.length === 0 && (
                <tr><td colSpan={3} className="cw-cell-center">Chưa có dữ liệu</td></tr>
              )}
              {preview.rows.map((r) => (
                <tr key={r.orderNo}>
                  <td>{r.orderNo}</td>
                  <td>{r.phone}</td>
                  <td className="cw-cell-wrap">
                    {r.error ? <span className="cw-text-err">{r.error}</span> : r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview.total > 0 && (
          <Pagination
            page={previewPage}
            totalPages={preview.totalPage}
            pageSize={previewLimit}
            onPageChange={(p) => loadReview(campaignId, p, previewLimit)}
            onPageSizeChange={(size) => loadReview(campaignId, 1, size)}
            disabled={reviewLoading}
          />
        )}
      </div>

      <div className="cw-sec cw-sec-last">
        <h4 className="cw-h4 cw-mb-8">Nội dung gửi</h4>
        <p className="cw-quote">{content}</p>
      </div>
    </div>
  )

  const renderAside = () => (
    <aside className="cw-side">
      <div className="gw-card cw-card">
        <h3 className="cw-card-title">{step === 5 ? 'Tổng kết' : 'Tóm tắt chiến dịch'}</h3>
        <p className="cw-sub">{step === 5 ? 'Số liệu dự kiến trước khi gửi.' : 'Tự cập nhật theo từng bước.'}</p>
        <KV label="Tên chiến dịch">{campaignName.trim() || '—'}</KV>
        <KV label="Brandname">{brandnameLabel}</KV>
        <KV label="Loại tin nhắn"><span className="cw-badge">{SMS_TYPE_LABELS[smsType]}</span></KV>
        <KV label="Người nhận">{step === 5 ? `${preview.total.toLocaleString('vi-VN')} số` : recipientSummary()}</KV>
        <KV label="Số tin/số">{step >= 3 && activeSegment ? `${activeSegment.label}` : '—'}</KV>
        <KV label="Hình thức gửi" last>{sendSummary()}</KV>
      </div>

      <div className="gw-card cw-card">
        <h3 className="cw-card-title">Xem trước tin nhắn</h3>
        {content.trim() ? (
          <>
            <p className="cw-sub">
              {sampleRow ? `Dữ liệu mẫu lấy từ dòng 1 của file (${sampleRow.phone}).` : 'Nội dung gửi giống nhau cho mọi số.'}
            </p>
            <p className="cw-bubble-brand">{brandnameLabel}</p>
            <MessageBubble parts={contentParts} />
            {usesVariables(content) && <p className="cw-hint cw-mt-8">Phần in đậm là giá trị thay cho biến.</p>}
          </>
        ) : (
          <>
            <p className="cw-sub">Hiển thị sau khi soạn nội dung ở bước 3.</p>
            <div className="cw-empty">Chưa có nội dung tin nhắn</div>
          </>
        )}
      </div>

      {step === 5 && (
        <div className="cw-note">
          <Info size={15} />
          <span>
            {sendType === 'NOW'
              ? 'Sau khi xác nhận, chiến dịch được duyệt và gửi ngay. Không thể sửa chiến dịch sau khi xác nhận.'
              : `Sau khi xác nhận, chiến dịch chuyển sang chờ duyệt và gửi lúc ${formatDateTime(scheduledAt)} nếu được duyệt. Không thể sửa chiến dịch sau khi xác nhận.`}
          </span>
        </div>
      )}
    </aside>
  )

  const STEP_RENDERERS = { 1: renderStep1, 2: renderStep2, 3: renderStep3, 4: renderStep4, 5: renderStep5 }

  return (
    <div className="cc-page cw-page">
      <ConfirmDialog />
      <div className="cc-page-header gw-page-header flex items-start gap-3">
        <span className="gw-card-icon"><Send size={18} /></span>
        <div>
          <h2 className="cc-page-title">{isEdit ? 'Sửa chiến dịch gửi tin SMS' : 'Tạo chiến dịch gửi tin SMS'}</h2>
          <p className="cc-page-subtitle">
            {isEdit
              ? 'Chỉnh sửa chiến dịch nháp hoặc bị từ chối, sau đó xác nhận lại để gửi.'
              : 'Hoàn thành 5 bước để gửi chiến dịch. Bạn có thể quay lại bước trước bất kỳ lúc nào.'}
          </p>
        </div>
      </div>

      {isEdit && (editLoading || editError) ? (
        <div className="gw-card cw-card">
          {editLoading ? (
            <p className="cw-sub" role="status">Đang tải chiến dịch...</p>
          ) : (
            <>
              <div className="cw-note cw-note-error cw-mb-16" role="alert">
                <Info size={15} />
                <span>{editError}</span>
              </div>
              <button type="button" className="cw-btn" onClick={() => navigate(APPROVAL_PATH)}>
                <ArrowLeft size={16} /> Về danh sách chiến dịch
              </button>
            </>
          )}
        </div>
      ) : (
      <>
      {editReason && (
        <div className="cw-note cw-note-error cw-mb-16">
          <Info size={15} />
          <span>Chiến dịch bị từ chối: {editReason}. Sau khi lưu, chiến dịch quay về trạng thái nháp.</span>
        </div>
      )}
      {editScheduleExpired && sendType === 'SCHEDULED' && !isScheduleValid(scheduledAt) && (
        <div className="cw-note cw-mb-16">
          <Info size={15} />
          <span>
            Thời gian hẹn gửi đã lưu ({formatDateTime(scheduledAt)}) đã qua. Hãy chọn lại lịch gửi ở bước 4;
            nếu lưu nháp trước đó, lịch cũ sẽ bị xoá.
          </span>
        </div>
      )}

      <ol className="cw-steps">
        {STEPS.map((s) => {
          const done = s.id < step
          const current = s.id === step
          const inner = (
            <>
              <span className="cw-st-c">{done ? <Check size={14} strokeWidth={3} /> : s.id}</span>
              <span><b>{s.title}</b><small>{stepHint(s)}</small></span>
            </>
          )
          return (
            <li key={s.id}>
              {done ? (
                <button type="button" className="cw-st cw-st-done" onClick={() => setStep(s.id)} disabled={busy}>{inner}</button>
              ) : (
                <div className={`cw-st${current ? ' cw-st-cur' : ''}`} aria-current={current ? 'step' : undefined}>{inner}</div>
              )}
            </li>
          )
        })}
      </ol>

      <div className="cw-cols">
        <div className="cw-main">{STEP_RENDERERS[step]()}</div>
        {renderAside()}
      </div>

      <div className="cw-bar">
        <button type="button" className="cw-btn cw-btn-ghost" onClick={handleCancel} disabled={busy}>Hủy</button>
        <div className="cw-bar-r">
          {step > 1 && (
            <button type="button" className="cw-btn" onClick={handleBack} disabled={busy}>
              <ArrowLeft size={16} /> Quay lại
            </button>
          )}
          <button type="button" className="cw-btn" onClick={handleSaveDraft} disabled={busy}>
            <Save size={16} /> Lưu nháp
          </button>
          {step < 5 ? (
            <button type="button" className="cw-btn cw-btn-pri" onClick={handleNext} disabled={busy}>
              {saving ? 'Đang lưu...' : <>Tiếp tục <ArrowRight size={16} /></>}
            </button>
          ) : (
            <button
              type="button"
              className="cw-btn cw-btn-pri"
              onClick={handleConfirm}
              disabled={busy || reviewLoading || !!reviewError || preview.invalidTotal > 0 || preview.total === 0}
            >
              {confirming ? 'Đang xác nhận...' : sendType === 'NOW' ? 'Xác nhận và gửi ngay' : 'Xác nhận và gửi duyệt'}
            </button>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}

/**
 * `?id=<campaignId>` opens the wizard on an existing DRAFT/REJECTED campaign.
 * Keyed by id so switching between create and edit starts from a clean state.
 */
function CustomerCampaignCreatePage() {
  const [searchParams] = useSearchParams()
  const rawId = searchParams.get('id')
  const editId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : null
  return <CustomerCampaignCreateContent key={editId ?? 'new'} editId={editId} />
}

export default CustomerCampaignCreatePage
