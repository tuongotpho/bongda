import type { AppData, Charge, FundId, Match, Member, Obligation, Payment } from './types'

export const money = (n: number) => n.toLocaleString('vi-VN') + 'đ'

export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-')
  return `T${Number(m)}/${y}`
}

export const todayISO = (now = new Date()) => {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

export const obligationId = (kind: string, refId: string, memberId: string) => `${kind}_${refId}_${memberId}`

// ---------- Chia đội ----------

export interface SplitResult {
  teamA: string[]
  teamB: string[]
  skillA: number
  skillB: number
}

const sumSkill = (ids: string[], byId: Map<string, Member>) =>
  ids.reduce((s, id) => s + (byId.get(id)?.skill ?? 3), 0)

const countGK = (ids: string[], byId: Map<string, Member>) => ids.filter((id) => byId.get(id)?.isGK).length

/**
 * Chia ngẫu nhiên nhưng cân bằng: thử nhiều cách xáo, giữ cách có chênh lệch trình độ nhỏ nhất,
 * thủ môn rải đều hai bên. Mỗi tuần bấm ra kết quả khác nhau vì có yếu tố ngẫu nhiên.
 */
export function splitTeams(players: Member[], rng: () => number = Math.random, tries = 600): SplitResult {
  const byId = new Map(players.map((p) => [p.id, p]))
  const ids = players.map((p) => p.id)
  let best: SplitResult | null = null
  let bestCost = Infinity
  for (let t = 0; t < tries; t++) {
    const arr = [...ids]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    const half = Math.ceil(arr.length / 2)
    const teamA = arr.slice(0, half)
    const teamB = arr.slice(half)
    const skillA = sumSkill(teamA, byId)
    const skillB = sumSkill(teamB, byId)
    const gkDiff = Math.abs(countGK(teamA, byId) - countGK(teamB, byId))
    const cost = Math.abs(skillA - skillB) * 10 + Math.max(0, gkDiff - 1) * 100 + gkDiff
    if (cost < bestCost) {
      bestCost = cost
      best = { teamA, teamB, skillA, skillB }
    }
  }
  return best ?? { teamA: [], teamB: [], skillA: 0, skillB: 0 }
}

// ---------- Kết quả trận & tiền nước ----------

export type MatchOutcome = 'A' | 'B' | 'draw' | 'pending'

const hasScore = (m: Match) => m.scoreA != null && m.scoreB != null

/** Hoà (tính trước luân lưu): theo tỉ số nếu có, không thì theo kết quả chọn nhanh */
const isTied = (m: Match) => (hasScore(m) ? m.scoreA === m.scoreB : m.winner === 'draw')

export function matchOutcome(m: Match): MatchOutcome {
  if (hasScore(m)) {
    if (m.scoreA! > m.scoreB!) return 'A'
    if (m.scoreB! > m.scoreA!) return 'B'
  } else if (m.winner === 'A' || m.winner === 'B') {
    // Chọn nhanh đội thắng mà không ghi tỉ số — không bịa tỉ số
    return m.winner
  } else if (m.winner !== 'draw') {
    return 'pending'
  }
  // Khi hòa: xét kết quả đá luân lưu penalty nếu có
  if (m.penaltyWinner === 'A') return 'A'
  if (m.penaltyWinner === 'B') return 'B'
  if (m.penaltyScoreA != null && m.penaltyScoreB != null) {
    if (m.penaltyScoreA > m.penaltyScoreB) return 'A'
    if (m.penaltyScoreB > m.penaltyScoreA) return 'B'
  }
  return 'draw'
}

/** Trận đã chốt kết quả (hoặc nhập từ sổ cũ) thì không sửa nữa — ghi nhầm thì xoá trận, tạo lại. Web và MCP dùng chung. */
export const isLocked = (m: Match) => !!m.charges || matchOutcome(m) !== 'pending'

/** Kết quả bằng chữ — dùng khi trận chọn nhanh đội thắng mà không ghi tỉ số */
export function outcomeLabel(m: Match): string {
  const o = matchOutcome(m)
  return o === 'pending' ? 'Chưa có kết quả' : o === 'draw' ? 'Hoà' : `Đội ${o} thắng`
}

/** Kiểm tra trận đấu có phân định bằng đá luân lưu penalty khi hòa tỉ số không */
export function isPenaltyDecided(m: Match): boolean {
  if (!isTied(m)) return false
  if (m.penaltyWinner === 'A' || m.penaltyWinner === 'B') return true
  if (m.penaltyScoreA != null && m.penaltyScoreB != null && m.penaltyScoreA !== m.penaltyScoreB) return true
  return false
}

/** Lấy đội thắng luân lưu penalty: 'A' | 'B' | null */
export function getPenaltyWinner(m: Match): 'A' | 'B' | null {
  if (!isTied(m)) return null
  if (m.penaltyWinner === 'A' || m.penaltyWinner === 'B') return m.penaltyWinner
  if (m.penaltyScoreA != null && m.penaltyScoreB != null) {
    if (m.penaltyScoreA > m.penaltyScoreB) return 'A'
    if (m.penaltyScoreB > m.penaltyScoreA) return 'B'
  }
  return null
}

/** Làm tròn lên bội số 1.000đ cho dễ thu */
const roundK = (n: number) => Math.ceil(n / 1000) * 1000

export function waterCharges(m: Match): Charge[] {
  if (m.charges) return m.charges
  const o = matchOutcome(m)
  if (o === 'pending') return []
  if (o === 'A') return (m.teamB || []).map((id) => ({ memberId: id, amount: m.waterFee }))
  if (o === 'B') return (m.teamA || []).map((id) => ({ memberId: id, amount: m.waterFee }))
  if (m.drawRule === 'none') return []
  const amount = m.drawRule === 'half' ? roundK(m.waterFee / 2) : m.waterFee
  return [...(m.teamA || []), ...(m.teamB || [])].map((id) => ({ memberId: id, amount }))
}

// ---------- Nghĩa vụ đóng tiền ----------

export function buildObligations(data: AppData): Obligation[] {
  const paid = new Set(data.payments.map((p) => p.id))
  const out: Obligation[] = []
  for (const m of data.matches) {
    for (const c of waterCharges(m)) {
      const id = obligationId('water', m.id, c.memberId)
      out.push({
        id,
        memberId: c.memberId,
        kind: 'water',
        refId: m.id,
        label: `Phạt ${fmtDate(m.date)}`,
        amount: c.amount,
        date: m.date,
        paid: paid.has(id),
      })
    }
  }
  for (const mo of data.months) {
    for (const [memberId, amount] of Object.entries(mo.amounts)) {
      const id = obligationId('monthly', mo.id, memberId)
      out.push({
        id,
        memberId,
        kind: 'monthly',
        refId: mo.id,
        label: `Quỹ ${fmtMonth(mo.id)}`,
        amount,
        date: `${mo.id}-01`,
        paid: paid.has(id),
      })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Khoản tiền phạt đã ghi "đã đóng" của trận nhưng không còn khớp với kết quả/đội hình hiện tại
 * (đổi kết quả, chuyển người sang đội kia, xoá người khỏi trận, mức phạt đổi khi chuyển thắng ↔ hoà).
 * Không gỡ thì tiền vẫn bị cộng vào quỹ và tiền ứng vẫn bị trừ dù người đó không còn nợ.
 */
export function stalePayments(m: Match, payments: Payment[]): Payment[] {
  const owed = new Map(waterCharges(m).map((c) => [c.memberId, c.amount]))
  return payments.filter(
    (p) => p.kind === 'water' && p.refId === m.id && owed.get(p.memberId) !== p.amount,
  )
}

export interface MatchSavePlan {
  /** khoản đã đóng phải gỡ vì không còn khớp */
  stale: Payment[]
  /** trong đó là tiền mặt (cần người dùng đồng ý trước khi gỡ) */
  staleCash: Payment[]
  /** khoản trừ tiền ứng tự động cần thêm */
  toAdd: Payment[]
  deducted: string[]
}

/**
 * Kế hoạch lưu trận — DÙNG CHUNG cho web (actions.saveMatch) và MCP để hai nơi tính sổ y hệt nhau:
 * gỡ khoản lệch, rồi (nếu bật) tự trừ tiền ứng cho người đội thua.
 */
export function planMatchSave(next: Match, data: AppData, deductAdvance: boolean): MatchSavePlan {
  const stale = stalePayments(next, data.payments)
  const staleIds = new Set(stale.map((p) => p.id))
  const { paymentsToAdd, deductedMemberIds } = deductAdvance
    ? autoDeductMatchAdvance(next, { ...data, payments: data.payments.filter((p) => !staleIds.has(p.id)) })
    : { paymentsToAdd: [], deductedMemberIds: [] }
  return { stale, staleCash: stale.filter((p) => !isAdvancePayment(p)), toAdd: paymentsToAdd, deducted: deductedMemberIds }
}

// ---------- Tiền ứng trước phạt nước ----------

export const ADVANCE_NOTE = 'Trừ từ tiền ứng trước'

export const isAdvancePayment = (p: { note?: string }) =>
  Boolean(p.note && (p.note.includes('tiền ứng') || p.note.includes('ứng trước')))

export interface MemberAdvanceInfo {
  total: number
  used: number
  remaining: number
  usedCount: number
}

export function getMemberAdvanceInfo(member: Member, payments: Payment[]): MemberAdvanceInfo {
  const total = Math.max(0, member.advanceAmount || 0)
  const usedPayments = payments.filter(
    (p) => p.memberId === member.id && p.kind === 'water' && isAdvancePayment(p),
  )
  const used = usedPayments.reduce((s, p) => s + p.amount, 0)
  const remaining = Math.max(0, total - used)
  return {
    total,
    used,
    remaining,
    usedCount: usedPayments.length,
  }
}

/**
 * Tự động trừ tiền ứng cho các cầu thủ bị phạt trong trận nếu họ còn số dư tiền ứng.
 */
export function autoDeductMatchAdvance(
  m: Match,
  data: AppData,
): { paymentsToAdd: Payment[]; deductedMemberIds: string[] } {
  const charges = waterCharges(m)
  if (!charges.length) return { paymentsToAdd: [], deductedMemberIds: [] }

  const paidSet = new Set(data.payments.map((p) => p.id))
  const remainingByMember = new Map<string, number>()
  for (const mem of data.members) {
    if (mem.advanceAmount && mem.advanceAmount > 0) {
      const info = getMemberAdvanceInfo(mem, data.payments)
      remainingByMember.set(mem.id, info.remaining)
    }
  }

  const paymentsToAdd: Payment[] = []
  const deductedMemberIds: string[] = []

  for (const c of charges) {
    const obId = obligationId('water', m.id, c.memberId)
    if (!paidSet.has(obId)) {
      const curRemaining = remainingByMember.get(c.memberId) ?? 0
      if (curRemaining >= c.amount) {
        paymentsToAdd.push({
          id: obId,
          memberId: c.memberId,
          kind: 'water',
          refId: m.id,
          amount: c.amount,
          paidAt: Date.now(),
          note: ADVANCE_NOTE,
        })
        deductedMemberIds.push(c.memberId)
        remainingByMember.set(c.memberId, curRemaining - c.amount)
        paidSet.add(obId)
      }
    }
  }

  return { paymentsToAdd, deductedMemberIds }
}

/**
 * Tiền ứng anh em đã đưa trước nhưng CHƯA bị trừ vào trận nào — thủ quỹ đang cầm hộ.
 * Không cộng vào số dư quỹ (chưa phải tiền của quỹ); hiện riêng để đối chiếu tiền mặt.
 */
export function advanceHeld(data: AppData): { total: number; people: number } {
  let total = 0
  let people = 0
  for (const m of data.members) {
    const left = getMemberAdvanceInfo(m, data.payments).remaining
    if (left > 0) {
      total += left
      people++
    }
  }
  return { total, people }
}

export interface MemberDebt {
  member: Member
  unpaid: Obligation[]
  total: number
}

/** Danh sách người còn nợ, nợ nhiều nhất lên đầu */
export function debtors(data: AppData, obligations = buildObligations(data)): MemberDebt[] {
  const byMember = new Map<string, Obligation[]>()
  for (const o of obligations) {
    if (o.paid) continue
    const list = byMember.get(o.memberId) ?? []
    list.push(o)
    byMember.set(o.memberId, list)
  }
  const out: MemberDebt[] = []
  for (const member of data.members) {
    const unpaid = byMember.get(member.id)
    if (!unpaid?.length) continue
    out.push({ member, unpaid, total: unpaid.reduce((s, o) => s + o.amount, 0) })
  }
  return out.sort((a, b) => b.total - a.total || a.member.name.localeCompare(b.member.name, 'vi'))
}

export interface FundTotals {
  /** đóng quỹ tháng (main) hoặc tiền phạt (extra) */
  dues: number
  /** ủng hộ / thu khác */
  other: number
  income: number
  spent: number
  balance: number
}

export function fundSummary(data: AppData): Record<FundId, FundTotals> {
  const calc = (fund: FundId): FundTotals => {
    const kind = fund === 'main' ? 'monthly' : 'water'
    const dues = data.payments.filter((p) => p.kind === kind).reduce((s, p) => s + p.amount, 0)
    const other = data.incomes.filter((i) => i.fund === fund).reduce((s, i) => s + i.amount, 0)
    const spent = data.expenses.filter((e) => e.fund === fund).reduce((s, e) => s + e.amount, 0)
    return { dues, other, income: dues + other, spent, balance: dues + other - spent }
  }
  return { main: calc('main'), extra: calc('extra') }
}

// ---------- Tin nhắn nhắc nhở (dán vào Zalo) ----------

export function reminderMessage(data: AppData, list: MemberDebt[], today = todayISO()): string {
  const { teamName, bankInfo } = data.settings
  if (!list.length) return `⚽ ${teamName}: Tất cả thành viên đã hoàn thành nghĩa vụ. Cảm ơn anh em! 👏`
  const lines = [
    `⚽ ${teamName.toUpperCase()} — NHẮC ĐÓNG TIỀN (${fmtDate(today)})`,
    `Còn ${list.length} bạn chưa hoàn thành:`,
    ...list.map(
      (d, i) => `${i + 1}. ${d.member.name}: ${money(d.total)} (${d.unpaid.map((o) => `${o.label} ${money(o.amount)}`).join('; ')})`,
    ),
    `Tổng còn thiếu: ${money(list.reduce((s, d) => s + d.total, 0))}`,
  ]
  if (bankInfo.trim()) lines.push(`💳 Chuyển khoản: ${bankInfo.trim()}`)
  lines.push('Đóng xong báo thủ quỹ để gạch tên nhé anh em! 🙏')
  return lines.join('\n')
}

export function personalMessage(data: AppData, d: MemberDebt): string {
  const { teamName, bankInfo } = data.settings
  const lines = [
    `Chào ${d.member.name}, ${teamName} nhắc bạn còn ${money(d.total)} chưa đóng:`,
    ...d.unpaid.map((o) => `• ${o.label}: ${money(o.amount)}`),
  ]
  if (bankInfo.trim()) lines.push(`💳 ${bankInfo.trim()}`)
  lines.push('Cảm ơn bạn! ⚽')
  return lines.join('\n')
}
