export const BRANDNAME_OPTIONS = [
  { label: 'MINIME_STORE', value: 'MINIME_STORE' },
  { label: 'THANH_STORE', value: 'THANH_STORE' },
  { label: 'QUANG_STORE', value: 'QUANG_STORE' },
  { label: 'FASHION_X', value: 'FASHION_X' },
]

export const CAMPAIGN_MESSAGE_TYPES = [
  { value: 'cskh', label: 'CSKH (Chăm sóc khách hàng)' },
  { value: 'quangcao', label: 'Quảng cáo' },
]

export const MESSAGE_VARIABLES = [
  { value: '{ho_ten}', label: 'Họ tên khách hàng' },
  { value: '{so_dien_thoai}', label: 'Số điện thoại' },
  { value: '{ma_don_hang}', label: 'Mã đơn hàng' },
  { value: '{diem_thuong}', label: 'Điểm thưởng' },
]

export const SMS_SEGMENTS = [
  { id: 1, label: '1 SMS', limit: 160 },
  { id: 2, label: '2 SMS', limit: 302 },
  { id: 3, label: '3 SMS', limit: 444 },
]

export const CAMPAIGN_APPROVAL_STATUSES = [
  { value: 'pending_campaign', label: 'Chờ duyệt chiến dịch', tone: 'amber' },
  { value: 'pending_content', label: 'Chờ duyệt nội dung', tone: 'blue' },
  { value: 'approved', label: 'Đã duyệt', tone: 'green' },
  { value: 'rejected', label: 'Từ chối', tone: 'red' },
]

export const CAMPAIGN_TYPE_LABELS = {
  QC: 'Quảng cáo',
  TT: 'Thông báo',
  CSKH: 'CSKH',
}

export const CONTACT_GROUPS = [
  { id: 'sim-0112', name: 'Khách mua SIM 0112', updatedAt: '12/11/2026', count: 2500, phonePrefix: '070789150' },
  { id: 'vip', name: 'Khách hàng VIP', updatedAt: '12/11/2026', count: 150, phonePrefix: '090123400' },
  { id: 'tiktok-follower', name: 'Minime Store Fllower Tiktok', updatedAt: '12/11/2026', count: 1500, phonePrefix: '098765400' },
  { id: 'black-friday-2026', name: 'Black Friday 2026', updatedAt: '12/11/2026', count: 4500, phonePrefix: '091234500' },
]

export const LOOKUP_STATUS_OPTIONS = [
  { value: 'success', label: 'Thành công', tone: 'green' },
  { value: 'failed', label: 'Thất bại', tone: 'red' },
  { value: 'pending', label: 'Đang chờ', tone: 'amber' },
]

export const CAMPAIGN_APPROVAL_ROWS = [
  {
    code: 'CD-2026-0548',
    name: 'Khuyến mãi hè bùng nổ 2026',
    brandname: 'MINIME_STORE',
    type: 'QC',
    volume: 50000,
    scheduledAt: '25/05/2026 09:00',
    status: 'pending_campaign',
  },
  {
    code: 'CD-2026-0547',
    name: 'Thông báo bảo trì hệ thống định kỳ',
    brandname: 'BRAND_ABC',
    type: 'TT',
    volume: 1200,
    scheduledAt: '26/05/2026 09:00',
    status: 'pending_content',
  },
  {
    code: 'CD-2026-0546',
    name: 'Tri ân khách hàng thân thiết VIP',
    brandname: 'MINIME_STORE',
    type: 'CSKH',
    volume: 8500,
    scheduledAt: '30/05/2026 09:00',
    status: 'approved',
  },
]

// Campaign statuses returned by /campaigns/list and /campaigns/history/list.
export const CAMPAIGN_STATUSES = [
  { value: 'DRAFT', label: 'Nháp', tone: 'gray' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt', tone: 'amber' },
  { value: 'REJECTED', label: 'Từ chối', tone: 'red' },
  { value: 'APPROVED', label: 'Đã duyệt', tone: 'green' },
  { value: 'QUEUED', label: 'Đã xếp lịch', tone: 'blue' },
  { value: 'SENDING', label: 'Đang gửi', tone: 'blue' },
  { value: 'SUCCESS', label: 'Gửi xong', tone: 'green' },
  { value: 'FAILED', label: 'Thất bại', tone: 'red' },
  { value: 'CANCELLED', label: 'Đã hủy', tone: 'gray' },
]

export const CAMPAIGN_SMS_TYPE_LABELS = { CSKH: 'CSKH', QC: 'Quảng cáo', OTP: 'OTP' }

export const CAMPAIGN_SOURCE_LABELS = { FILE: 'Upload file', PHONE: 'Nhập số' }

export const CAMPAIGN_SEND_TYPE_LABELS = { NOW: 'Gửi ngay', SCHEDULED: 'Hẹn lịch' }
