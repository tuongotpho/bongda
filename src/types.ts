export type DrawRule = 'none' | 'half' | 'full'

/** main = Quỹ bóng đá (đóng tháng → trả sân) · extra = Quỹ ủng hộ & phạt (→ bóng, áo, hoa quả, nước) */
export type FundId = 'main' | 'extra'

export const FUND_NAMES: Record<FundId, string> = {
  main: 'Quỹ bóng đá',
  extra: 'Quỹ ủng hộ & phạt',
}

export interface Member {
  id: string
  name: string
  /** Trình độ 1–5, dùng để chia đội cân bằng */
  skill: number
  isGK: boolean
  active: boolean
  /** Mức đóng quỹ tháng riêng của người này (sếp 500k–1tr, anh em 100k…) */
  monthlyFee: number
  createdAt: number
  /** Tiền ứng trước (tiền nộp trước để trừ dần khi thua trận) */
  advanceAmount?: number
  /** Ngày ứng tiền (YYYY-MM-DD) */
  advanceDate?: string
  /** Ghi chú nộp tiền ứng (ví dụ: chuyển khoản, gửi tiền mặt...) */
  advanceNote?: string
}

export interface Charge {
  memberId: string
  amount: number
}

export interface Match {
  id: string
  /** YYYY-MM-DD */
  date: string
  teamA: string[]
  teamB: string[]
  scoreA: number | null
  scoreB: number | null
  /** Đá luân lưu penalty khi hòa tỉ số */
  penaltyWinner?: 'A' | 'B' | null
  penaltyScoreA?: number | null
  penaltyScoreB?: number | null
  /** Tiền phạt mỗi người đội thua — chụp lại lúc tạo trận để đổi cài đặt không làm sai sổ cũ */
  waterFee: number
  drawRule: DrawRule
  /** Trận nhập từ sổ cũ: không có đội hình/tỉ số, chỉ có danh sách ai bị phạt bao nhiêu */
  charges?: Charge[]
  note?: string
  createdAt: number
}

export interface FundMonth {
  /** YYYY-MM */
  id: string
  /** memberId → số tiền phải đóng tháng này (theo mức riêng từng người lúc mở quỹ) */
  amounts: Record<string, number>
  createdAt: number
}

export type PaymentKind = 'water' | 'monthly'

export interface Payment {
  /** Trùng với id nghĩa vụ: `${kind}_${refId}_${memberId}` */
  id: string
  memberId: string
  kind: PaymentKind
  refId: string
  /** Số tiền thực nộp — có thể khác mức phải đóng (nộp trước nhiều tháng thì tháng sau ghi 0) */
  amount: number
  paidAt: number
  note?: string
}

export interface Expense {
  id: string
  date: string
  amount: number
  note: string
  fund: FundId
  /** Người đi mua / người chi */
  by?: string
  createdAt: number
}

/** Khoản thu ngoài (ủng hộ…) */
export interface Income {
  id: string
  date: string
  amount: number
  note: string
  /** Người ủng hộ */
  by: string
  fund: FundId
  createdAt: number
}

export interface Settings {
  teamName: string
  waterFee: number
  monthlyFee: number
  drawRule: DrawRule
  bankInfo: string
}

export interface AppData {
  members: Member[]
  matches: Match[]
  months: FundMonth[]
  payments: Payment[]
  expenses: Expense[]
  incomes: Income[]
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  teamName: 'FC Kỹ thuật - An toàn & friends',
  waterFee: 20000,
  monthlyFee: 100000,
  drawRule: 'half',
  bankInfo: '',
}

export interface Obligation {
  id: string
  memberId: string
  kind: PaymentKind
  refId: string
  label: string
  amount: number
  /** để sắp xếp: ngày trận hoặc ngày đầu tháng */
  date: string
  paid: boolean
}
