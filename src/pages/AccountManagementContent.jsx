import { useEffect, useMemo, useState } from 'react'
import { InputText } from 'primereact/inputtext'
import { Password } from 'primereact/password'
import { Dropdown } from 'primereact/dropdown'
import { MultiSelect } from 'primereact/multiselect'
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog'
import { toast } from 'react-toastify'
import { UserCog, UserPlus, CalendarClock, Search, Pencil, Lock, Trash2, Save, RefreshCw, Loader2, Users } from 'lucide-react'
import {
  ROLE_LABELS,
  ROLE_CLASS,
} from '../constants/accountManagement'
import { useAuth } from '../context/AuthContext'
import {
  getListUser,
  createAccount,
  updateAccount,
  getUser,
  getUserAuditLog,
  deleteUser,
} from '../utils/accountApi'
import { getRoutingInfo } from '../utils/routingApi'
import Pagination from '../components/common/Pagination'

const GENDER_OPTIONS = [
  { label: 'Nam', value: 'nam' },
  { label: 'Nữ', value: 'nu' },
]

const ACCOUNT_ROLE_OPTIONS = [
  { label: 'ADMIN', value: 'ADMIN' },
  { label: 'CLIENT', value: 'CLIENT' },
]

const CREATE_STATUS_OPTIONS = [
  { label: 'Active', value: 1 },
  { label: 'Inactive', value: 0 },
]

const DEFAULT_FORM = {
  username: '',
  email: '',
  password: '',
  fullName: '',
  phone: '',
  gender: 'nam',
  brandnames: [],
  role: 'ADMIN',
  providerId: null,
  status: 1,
}

const AVATAR_PALETTE = ['#F472B6', '#A78BFA', '#FACC15', '#60A5FA', '#34D399', '#FB923C']

function getInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getAvatarColor(name) {
  const str = name || ''
  let hash = 0
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function normalizeBrandNames(brandName) {
  if (Array.isArray(brandName)) return brandName.map((b) => String(b).trim()).filter(Boolean)
  if (!brandName) return []
  return String(brandName).split(',').map((b) => b.trim()).filter(Boolean)
}

function resolveBrandNameIds(detail, brandNameOptions = []) {
  if (Array.isArray(detail?.brandNameId) && detail.brandNameId.length > 0) {
    return detail.brandNameId
  }
  if (Array.isArray(detail?.brandNameList) && detail.brandNameList.length > 0) {
    return detail.brandNameList
  }
  if (detail?.brandNameId != null && detail.brandNameId !== '') {
    return [detail.brandNameId]
  }

  const names = normalizeBrandNames(detail?.brandName)
  if (names.length === 0 || brandNameOptions.length === 0) return []

  const byLabel = new Map(brandNameOptions.map((opt) => [String(opt.label).toLowerCase(), opt.value]))
  return names
    .map((name) => byLabel.get(String(name).toLowerCase()))
    .filter((id) => id != null)
}

function AccountManagementContent() {
  const { authToken } = useAuth()

  const [form, setForm] = useState(DEFAULT_FORM)
  const [editingId, setEditingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [loadingEditId, setLoadingEditId] = useState(null)

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))

  const [brandNameOptions, setBrandNameOptions] = useState([])
  const [providerOptions, setProviderOptions] = useState([])

  const [accountRows, setAccountRows] = useState([])
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [search, setSearch] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [auditRows, setAuditRows] = useState([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditTotalPages, setAuditTotalPages] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const [auditPageSize, setAuditPageSize] = useState(10)
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')

  const [deletingId, setDeletingId] = useState(null)
  const [lockingId, setLockingId] = useState(null)

  const refreshAccountList = () => {
    if (!authToken) return
    setAccountLoading(true)
    setAccountError('')

    return getListUser(authToken)
      .then(({ rows }) => setAccountRows(rows))
      .catch((err) => setAccountError(err.message || 'Không tải được danh sách tài khoản.'))
      .finally(() => setAccountLoading(false))
  }

  const refreshAuditLog = ({ page: nextPage = auditPage, limit = auditPageSize } = {}) => {
    if (!authToken) return
    setAuditLoading(true)
    setAuditError('')

    return getUserAuditLog({ token: authToken, page: nextPage, limit })
      .then(({ rows, total, totalPage }) => {
        setAuditRows(rows)
        setAuditTotal(total)
        setAuditTotalPages(totalPage)
        setAuditPage(nextPage)
      })
      .catch((err) => setAuditError(err.message || 'Không tải được lịch sử thay đổi.'))
      .finally(() => setAuditLoading(false))
  }

  useEffect(() => {
    if (!authToken) return
    let cancelled = false

    refreshAccountList()
    refreshAuditLog({ page: 1, limit: auditPageSize })

    getRoutingInfo(authToken)
      .then(({ brandNames, providers }) => {
        if (cancelled) return
        setBrandNameOptions(brandNames.map((b) => ({ label: b.brandName, value: b.id })))
        setProviderOptions(providers.map((p) => ({ label: p.providerName, value: p.id })))
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const handleCancelCreate = () => {
    setForm(DEFAULT_FORM)
    setEditingId(null)
  }

  const handleSubmitAccount = () => {
    if (!authToken) return

    const requiresPassword = !editingId
    if (!form.username.trim() || !form.email.trim() || !form.fullName.trim()
      || !form.phone.trim() || !form.role || !form.providerId || form.brandnames.length === 0
      || (requiresPassword && !form.password)) {
      toast.error('Vui lòng nhập đầy đủ thông tin bắt buộc.')
      return
    }

    setSubmitting(true)

    const payload = {
      token: authToken,
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      gender: form.gender,
      brandNameList: form.brandnames,
      providerId: form.providerId,
      status: form.status,
    }

    const request = editingId
      ? updateAccount({ ...payload, id: editingId })
      : createAccount(payload)

    request
      .then((message) => {
        toast.success(message || (editingId ? 'Cập nhật tài khoản thành công.' : 'Tạo tài khoản thành công.'))
        handleCancelCreate()
        refreshAccountList()
        refreshAuditLog({ page: 1, limit: auditPageSize })
      })
      .catch((err) => toast.error(err.message || (editingId ? 'Không cập nhật được tài khoản.' : 'Không tạo được tài khoản.')))
      .finally(() => setSubmitting(false))
  }

  const handleEdit = (row) => {
    if (!authToken) return

    setLoadingEditId(row.id)
    getUser(authToken, row.id)
      .then((detail) => {
        if (!detail) throw new Error('Không lấy được chi tiết tài khoản.')
        const brandnames = resolveBrandNameIds(detail, brandNameOptions)
        if (brandnames.length === 0 && normalizeBrandNames(detail.brandName).length > 0) {
          throw new Error('Không map được brandname của tài khoản. Vui lòng chọn lại brandname trước khi lưu.')
        }
        setEditingId(detail.id)
        setForm({
          username: detail.userName || '',
          email: detail.email || '',
          password: '',
          fullName: detail.fullName || '',
          phone: detail.phone || '',
          gender: detail.gender || 'nam',
          brandnames,
          role: detail.role || 'ADMIN',
          providerId: detail.providerId ?? null,
          status: detail.status === '1' || detail.status === 1 ? 1 : 0,
        })
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      .catch((err) => toast.error(err.message || 'Không tải được chi tiết tài khoản.'))
      .finally(() => setLoadingEditId(null))
  }

  const handleToggleLock = (row) => {
    if (!authToken) return

    const nextStatus = row.status === 'active' ? 0 : 1
    setLockingId(row.id)

    getUser(authToken, row.id)
      .then((detail) => {
        if (!detail) throw new Error('Không lấy được chi tiết tài khoản.')
        const brandNameList = resolveBrandNameIds(detail, brandNameOptions)
        if (brandNameList.length === 0) {
          throw new Error('Không đủ thông tin brandname để cập nhật trạng thái tài khoản.')
        }
        return updateAccount({
          token: authToken,
          id: detail.id,
          username: detail.userName,
          email: detail.email,
          role: detail.role,
          fullName: detail.fullName,
          phone: detail.phone,
          gender: detail.gender,
          brandNameList,
          providerId: detail.providerId,
          status: nextStatus,
        })
      })
      .then((message) => {
        toast.success(message || (nextStatus === 1 ? 'Mở khóa tài khoản thành công.' : 'Khóa tài khoản thành công.'))
        setAccountRows((prev) => prev.map((r) => (
          r.id === row.id ? { ...r, status: String(nextStatus) } : r
        )))
        if (editingId === row.id) {
          setForm((prev) => ({ ...prev, status: nextStatus }))
        }
        refreshAuditLog({ page: auditPage, limit: auditPageSize })
      })
      .catch((err) => toast.error(err.message || 'Không cập nhật được trạng thái tài khoản.'))
      .finally(() => setLockingId(null))
  }

  const handleDelete = (id) => {
    if (!authToken) return

    setDeletingId(id)
    deleteUser(authToken, id)
      .then((message) => {
        toast.success(message || 'Xóa tài khoản thành công.')
        if (editingId === id) handleCancelCreate()
        refreshAccountList()
        refreshAuditLog({ page: 1, limit: auditPageSize })
      })
      .catch((err) => toast.error(err.message || 'Không xóa được tài khoản.'))
      .finally(() => setDeletingId(null))
  }

  const confirmDelete = (row) => {
    confirmDialog({
      message: `Có muốn xóa tài khoản "${row.username}" không?`,
      header: 'Xác nhận xóa',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Có',
      rejectLabel: 'Không',
      acceptClassName: 'p-button-danger',
      rejectClassName: 'p-button-text',
      defaultFocus: 'reject',
      accept: () => handleDelete(row.id),
    })
  }

  const mappedAccountRows = useMemo(
    () => accountRows.map((r) => ({
      id: r.id,
      username: r.userName,
      fullName: r.fullName,
      email: r.email,
      role: r.role,
      brandnames: normalizeBrandNames(r.brandName),
      status: r.status === '1' || r.status === 1 ? 'active' : 'inactive',
      created: formatDateTime(r.createdAt),
    })),
    [accountRows],
  )

  const filteredAccountRows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return mappedAccountRows
    return mappedAccountRows.filter((r) => {
      const haystack = [r.username, r.fullName, r.email, r.role, ...(r.brandnames || [])]
        .join(' ')
        .toLowerCase()
      return haystack.includes(keyword)
    })
  }, [mappedAccountRows, search])

  const totalAccountPages = Math.max(1, Math.ceil(filteredAccountRows.length / pageSize))
  const pagedAccountRows = useMemo(
    () => filteredAccountRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredAccountRows, page, pageSize],
  )

  const isEditing = editingId != null

  return (
    <div className="account-management-content">
      <ConfirmDialog />

      {/* Create / edit account */}
      <div className="gw-card gw-header-elevated">
        <div className="gw-card-head am-create-head">
          <div className="am-create-head-text">
            <span className="gw-card-icon">
              <UserCog size={18} />
            </span>
            <div>
              <h2 className="gw-card-title">{isEditing ? 'Chỉnh sửa tài khoản' : 'Tạo / Chỉnh sửa tài khoản'}</h2>
              <p className="gw-card-subtitle">Admin tạo account và phân quyền sử dụng hệ thống</p>
            </div>
          </div>
          <button className="db-export-btn am-create-btn" onClick={handleSubmitAccount} disabled={submitting}>
            <UserPlus size={16} /> {submitting ? 'Đang lưu...' : (isEditing ? 'Cập nhật tài khoản' : 'Tạo tài khoản')}
          </button>
        </div>

        <div className="am-form-grid">
          <div className="gw-form-field">
            <label>Đối tác <span className="gw-required">*</span></label>
            <Dropdown
              value={form.providerId}
              onChange={(e) => updateForm('providerId', e.value)}
              options={providerOptions}
              placeholder="Chọn đối tác"
              className="bn-dropdown"
            />
          </div>
          <div className="gw-form-field">
            <label>Username <span className="gw-required">*</span></label>
            <InputText
              value={form.username}
              onChange={(e) => updateForm('username', e.target.value)}
              placeholder="Nhập username"
            />
          </div>
          <div className="gw-form-field">
            <label>Email <span className="gw-required">*</span></label>
            <InputText
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              placeholder="Nhập email"
            />
          </div>

          <div className="gw-form-field">
            <label>Họ tên <span className="gw-required">*</span></label>
            <InputText
              value={form.fullName}
              onChange={(e) => updateForm('fullName', e.target.value)}
              placeholder="Nhập họ tên"
            />
          </div>
          <div className="gw-form-field">
            <label>Mật khẩu {isEditing ? '' : <span className="gw-required">*</span>}</label>
            <Password
              value={form.password}
              onChange={(e) => updateForm('password', e.target.value)}
              placeholder={isEditing ? 'Để trống nếu không đổi mật khẩu' : 'Ít nhất 1 chữ hoa, 1 chữ thường, 1 số, 1 ký tự đặc biệt'}
              toggleMask
              feedback={false}
              className="am-password"
              inputClassName="p-inputtext"
            />
          </div>
          <div className="gw-form-field">
            <label>Số điện thoại <span className="gw-required">*</span></label>
            <InputText
              value={form.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              placeholder="Nhập số điện thoại"
            />
          </div>
          <div className="gw-form-field">
            <label>Giới tính</label>
            <Dropdown
              value={form.gender}
              onChange={(e) => updateForm('gender', e.value)}
              options={GENDER_OPTIONS}
              className="bn-dropdown"
            />
          </div>
          <div className="gw-form-field">
            <label>Vai trò <span className="gw-required">*</span></label>
            <Dropdown
              value={form.role}
              onChange={(e) => updateForm('role', e.value)}
              options={ACCOUNT_ROLE_OPTIONS}
              placeholder="Chọn vai trò"
              className="bn-dropdown"
            />
          </div>
          <div className="gw-form-field">
            <label>Brandname <span className="gw-required">*</span></label>
            <MultiSelect
              value={form.brandnames}
              onChange={(e) => updateForm('brandnames', e.value)}
              options={brandNameOptions}
              display="chip"
              placeholder="Chọn brandname"
              className="am-multiselect"
              panelClassName="am-multiselect-panel"
            />
          </div>
          <div className="gw-form-field">
            <label>Trạng thái <span className="gw-required">*</span></label>
            <Dropdown
              value={form.status}
              onChange={(e) => updateForm('status', e.value)}
              options={CREATE_STATUS_OPTIONS}
              className="bn-dropdown"
            />
          </div>
        </div>


        <div className="am-form-grid am-form-grid-bottom">
          <div className="am-form-actions">
            <button className="bn-btn-draft p-button" onClick={handleCancelCreate} disabled={submitting}>
              <RefreshCw size={16} /> Làm mới
            </button>
            <button className="bn-btn-submit p-button" onClick={handleSubmitAccount} disabled={submitting}>
              <Save size={16} /> {submitting ? 'Đang lưu...' : (isEditing ? 'Cập nhật tài khoản' : 'Lưu tài khoản')}
            </button>
          </div>
        </div>
      </div>

      {/* Account list */}
      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <span className="table-icon"><Users size={18} /></span>
            <h3 className="table-title">
              Danh sách tài khoản <span className="am-count-badge">{filteredAccountRows.length} tài khoản</span>
            </h3>
          </div>
          <div className="pm-search-field">
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Tìm kiếm tài khoản..."
            />
            <Search size={16} className="pm-search-icon" />
          </div>
        </div>

        {accountError && <p className="gw-table-error">{accountError}</p>}

        <div className="overflow-x-auto">
          <table className="routing-table am-account-table">
            <thead>
              <tr>
                <th>User name</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Phân quyền</th>
                <th>Brandname</th>
                <th>Trạng thái</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {accountLoading && (
                <tr><td colSpan={8} className="gw-table-status">Đang tải danh sách tài khoản...</td></tr>
              )}
              {!accountLoading && !accountError && pagedAccountRows.length === 0 && (
                <tr><td colSpan={8} className="gw-table-status">Không có tài khoản nào.</td></tr>
              )}
              {!accountLoading && pagedAccountRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.username}</td>
                  <td>{row.fullName || '-'}</td>
                  <td>{row.email || '-'}</td>
                  <td>{row.role ? <span className={ROLE_CLASS[row.role] || 'am-role-view'}>{ROLE_LABELS[row.role] || row.role}</span> : '-'}</td>
                  <td>
                    {row.brandnames.length > 0 ? (
                      <div className="am-brandname-chips">
                        {row.brandnames.map((b) => <span key={b} className="am-chip">{b}</span>)}
                      </div>
                    ) : '-'}
                  </td>
                  <td>
                    <span className={`status-badge ${row.status === 'active' ? 'active' : 'draft'}`}>
                      <span className="status-dot" />
                      {row.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{row.created}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="action-btn edit"
                        title="Chỉnh sửa"
                        onClick={() => handleEdit(row)}
                        disabled={loadingEditId === row.id || submitting}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="action-btn"
                        title={lockingId === row.id ? 'Đang xử lý...' : (row.status === 'active' ? 'Khóa' : 'Mở khóa')}
                        onClick={() => handleToggleLock(row)}
                        disabled={lockingId != null}
                      >
                        {lockingId === row.id
                          ? <Loader2 size={16} className="cd-spin" />
                          : <Lock size={16} />}
                      </button>
                      <button
                        className="action-btn delete"
                        title="Xóa"
                        onClick={() => confirmDelete(row)}
                        disabled={deletingId === row.id}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalAccountPages}
          pageSize={pageSize}
          disabled={accountLoading}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1) }}
        />
      </div>

      {/* Change history */}
      <div className="gw-card gw-header-elevated">
        <div className="gw-history-head">
          <span className="gw-card-icon"><CalendarClock size={18} /></span>
          <div className="gw-history-head-text">
            <h2 className="gw-card-title">
              Lịch sử thay đổi tài khoản <span className="am-count-badge">{auditTotal} bản ghi</span>
            </h2>
          </div>
        </div>

        {auditError && <p className="gw-table-error">{auditError}</p>}

        <div className="overflow-x-auto">
          <table className="routing-table am-history-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Người tác động</th>
                <th>Loại tác động</th>
              </tr>
            </thead>
            <tbody>
              {auditLoading && (
                <tr><td colSpan={3} className="gw-table-status">Đang tải lịch sử thay đổi...</td></tr>
              )}
              {!auditLoading && !auditError && auditRows.length === 0 && (
                <tr><td colSpan={3} className="gw-table-status">Chưa có lịch sử thay đổi.</td></tr>
              )}
              {!auditLoading && auditRows.map((row, index) => (
                <tr key={`${row.createdAt}-${row.fullName}-${index}`}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>
                    <div className="am-actor-cell">
                      <span className="am-avatar" style={{ background: getAvatarColor(row.fullName) }}>
                        {getInitials(row.fullName)}
                      </span>
                      <div className="am-actor-info">
                        <span className="am-actor-name">{row.fullName || '-'}</span>
                      </div>
                    </div>
                  </td>
                  <td><span className="am-action-label">{row.actionChange || '-'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination
          page={auditPage}
          totalPages={auditTotalPages}
          pageSize={auditPageSize}
          disabled={auditLoading}
          onPageChange={(next) => refreshAuditLog({ page: next, limit: auditPageSize })}
          onPageSizeChange={(size) => {
            setAuditPageSize(size)
            refreshAuditLog({ page: 1, limit: size })
          }}
        />
      </div>
    </div>
  )
}

export default AccountManagementContent
