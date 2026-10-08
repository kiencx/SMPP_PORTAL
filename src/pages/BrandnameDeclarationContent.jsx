import { useEffect, useMemo, useRef, useState } from 'react'
import { InputText } from 'primereact/inputtext'
import { Dropdown } from 'primereact/dropdown'
import { FileUpload } from 'primereact/fileupload'
import { Dialog } from 'primereact/dialog'
import { Button } from 'primereact/button'
import { toast } from 'react-toastify'
import { Tags, Search, Plus, CloudUpload, FileArchive, Info, Send } from 'lucide-react'
import { BRANDNAME_TYPES } from '../constants/brandnameDeclaration'
import { useAuth } from '../context/AuthContext'
import { getRoutingInfo } from '../utils/routingApi'
import { createBrandname, getBrandnameList } from '../utils/brandnameApi'

const BRANDNAME_TYPE_LABELS = BRANDNAME_TYPES.reduce((acc, t) => ({ ...acc, [t.value]: t.label }), {})
const TABLE_COLUMN_COUNT = 8

const DEFAULT_FORM = {
  name: '',
  type: null,
  business: null,
  taxCode: '',
  phone: null,
  email: '',
  providerId: null,
}

function BrandnameDeclarationContent() {
  const { authToken } = useAuth()

  const [brandnameList, setBrandnameList] = useState([])
  const [providerOptions, setProviderOptions] = useState([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')

  const [showAddDialog, setShowAddDialog] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }))
  const fileUploadRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const loadBrandnames = () => {
    if (!authToken) return

    setListLoading(true)
    setListError('')

    return getBrandnameList(authToken)
      .then((list) => setBrandnameList(list))
      .catch((err) => setListError(err.message || 'Không tải được danh sách brandname.'))
      .finally(() => setListLoading(false))
  }

  useEffect(() => {
    if (!authToken) return

    getRoutingInfo(authToken)
      .then(({ providers }) => {
        setProviderOptions(providers.map((p) => ({ label: p.providerName, value: p.id })))
      })
      .catch(() => {})
  }, [authToken])

  useEffect(() => {
    loadBrandnames()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken])

  const filteredBrandnameList = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return brandnameList
    return brandnameList.filter((b) => (b.brandName || '').toLowerCase().includes(keyword))
  }, [brandnameList, search])

  const openAddDialog = () => {
    setForm(DEFAULT_FORM)
    fileUploadRef.current?.clear()
    setShowAddDialog(true)
  }

  const closeAddDialog = () => {
    if (submitting) return
    setShowAddDialog(false)
  }

  const handleSubmit = () => {
    if (!authToken) return
    if (!form.name || !form.providerId) {
      toast.warn('Vui lòng nhập tên Brandname và chọn đối tác.')
      return
    }

    setSubmitting(true)

    createBrandname({
      token: authToken,
      brandName: form.name,
      providerId: form.providerId,
      type: form.type,
      business: form.business,
      taxCode: form.taxCode,
      phone: form.phone,
      email: form.email,
    })
      .then((message) => {
        toast.success(message || 'Tạo cấu hình brandname thành công.')
        setForm(DEFAULT_FORM)
        fileUploadRef.current?.clear()
        setShowAddDialog(false)
        loadBrandnames()
      })
      .catch((err) => {
        toast.error(err.message || 'Không tạo được cấu hình brandname.')
      })
      .finally(() => setSubmitting(false))
  }

  const headerTemplate = (options) => (
    <div className="bn-upload-static">
      <span className="bn-upload-cloud-icon">
        <CloudUpload size={22} />
      </span>
      <p className="bn-upload-title">Kéo thả hoặc chọn tệp để upload</p>
      <p className="bn-upload-hint">Hồ sơ: PDF,DOCX,PNG,JPG,ZIP,RAR</p>
      <p className="bn-upload-hint">Tối đa: 20MB</p>
      <div className="bn-upload-header">{options.chooseButton}</div>
    </div>
  )

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const input = fileUploadRef.current?.getInput()
    if (!input || !e.dataTransfer?.files?.length) return

    const dataTransfer = new DataTransfer()
    Array.from(e.dataTransfer.files).forEach((file) => dataTransfer.items.add(file))
    input.files = dataTransfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const itemTemplate = (file, options) => (
    <div className="bn-file-item">
      <span className="bn-file-icon">
        <FileArchive size={20} />
      </span>
      <div className="bn-file-info">
        <span className="bn-file-name">{file.name}</span>
        <span className="bn-file-size">{options.formatSize}</span>
      </div>
      <button className="bn-file-remove" onClick={options.onRemove} aria-label="Xóa tệp">
        ×
      </button>
    </div>
  )

  return (
    <div className="bn-declaration-content">
      <div className="routing-table-section gw-table-section gw-header-elevated">
        <div className="routing-table-header gw-table-header">
          <div className="gw-table-header-text">
            <span className="table-icon">
              <Tags size={18} />
            </span>
            <div>
              <h3 className="table-title">Danh sách Brandname</h3>
              <p className="gw-card-subtitle">Các brandname đã đăng ký và đối tác phụ trách</p>
            </div>
          </div>
          <div className="gw-table-filters">
            <div className="pm-search-field">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm kiếm brandname"
              />
              <Search size={16} className="pm-search-icon" />
            </div>
            <button className="db-export-btn" onClick={openAddDialog}>
              Thêm brandname <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="routing-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Tên Brandname</th>
                <th>Đối tác</th>
                <th>Loại Brandname</th>
                <th>Doanh nghiệp</th>
                <th>Mã số thuế</th>
                <th>Số điện thoại</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="gw-table-status">Đang tải danh sách brandname...</td>
                </tr>
              )}
              {!listLoading && listError && (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="gw-table-status gw-table-error">{listError}</td>
                </tr>
              )}
              {!listLoading && !listError && filteredBrandnameList.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLUMN_COUNT} className="gw-table-status">Chưa có brandname nào được khai báo.</td>
                </tr>
              )}
              {!listLoading && !listError && filteredBrandnameList.map((b, index) => (
                <tr key={b.id}>
                  <td>{index + 1}</td>
                  <td><span className="table-network">{b.brandName}</span></td>
                  <td>{b.provider || '-'}</td>
                  <td>{BRANDNAME_TYPE_LABELS[b.type] || b.type || '-'}</td>
                  <td>{b.business || '-'}</td>
                  <td>{b.taxCode || '-'}</td>
                  <td>{b.phone || '-'}</td>
                  <td>{b.email || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        header="Khai báo Brandname"
        visible={showAddDialog}
        onHide={closeAddDialog}
        className="bn-add-dialog"
        dismissableMask
        footer={
          <div className="bn-form-actions">
            <Button
              label="Hủy"
              className="bn-btn-draft"
              outlined
              onClick={closeAddDialog}
              disabled={submitting}
            />
            <Button
              label={submitting ? 'Đang gửi...' : 'Đăng ký Brandname'}
              icon={() => <Send size={16} />}
              className="bn-btn-submit"
              onClick={handleSubmit}
              disabled={submitting}
            />
          </div>
        }
      >
        <div className="bn-dialog-body">
          <div className="bn-form-grid">
            <div className="gw-form-field">
              <label>Tên Brandname <span className="gw-required">*</span></label>
              <InputText
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Nhập tên brandname"
              />
            </div>
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
              <label>Loại Brandname <span className="gw-required">*</span></label>
              <Dropdown
                value={form.type}
                onChange={(e) => updateForm('type', e.value)}
                options={BRANDNAME_TYPES}
                placeholder="Chọn loại Brandname"
                className="bn-dropdown"
              />
            </div>

            <div className="gw-form-field">
              <label>Doanh nghiệp</label>
              <InputText
                value={form.business || ''}
                onChange={(e) => updateForm('business', e.target.value)}
                placeholder="Nhập tên doanh nghiệp"
              />
            </div>
            <div className="gw-form-field">
              <label>Mã số thuế</label>
              <InputText
                value={form.taxCode}
                onChange={(e) => updateForm('taxCode', e.target.value)}
                placeholder="Nhập mã số thuế"
              />
            </div>

            <div className="gw-form-field">
              <label>Số điện thoại</label>
              <InputText
                value={form.phone || ''}
                onChange={(e) => updateForm('phone', e.target.value)}
                placeholder="Nhập số điện thoại"
              />
            </div>
            <div className="gw-form-field">
              <label>Email</label>
              <InputText
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                placeholder="Nhập email"
              />
            </div>
          </div>

          <div
            className={`bn-upload-card${isDragging ? ' bn-upload-card-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <FileUpload
              ref={fileUploadRef}
              name="brandnameFiles[]"
              multiple
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.zip,.rar"
              maxFileSize={20 * 1024 * 1024}
              customUpload
              uploadHandler={() => {}}
              chooseLabel="Chọn tệp"
              className="bn-fileupload"
              headerTemplate={headerTemplate}
              itemTemplate={itemTemplate}
            />

            <div className="bn-upload-note">
              <Info size={14} /> Bạn có thể chọn nhiều file cùng lúc
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default BrandnameDeclarationContent
