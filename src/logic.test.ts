import { describe, expect, it } from 'vitest'
import {
  ADVANCE_NOTE,
  autoDeductMatchAdvance,
  buildObligations,
  debtors,
  fundSummary,
  getMemberAdvanceInfo,
  matchOutcome,
  reminderMessage,
  splitTeams,
  stalePayments,
  advanceHeld,
  outcomeLabel,
  isPenaltyDecided,
  waterCharges,
} from './logic'
import { DEFAULT_SETTINGS, type AppData, type Match, type Member } from './types'

const mem = (id: string, skill = 3, isGK = false): Member => ({ id, name: id.toUpperCase(), skill, isGK, active: true, monthlyFee: 100000, createdAt: 0 })

const match = (over: Partial<Match> = {}): Match => ({
  id: 'm1',
  date: '2026-10-04',
  teamA: ['a', 'b'],
  teamB: ['c', 'd'],
  scoreA: 3,
  scoreB: 1,
  waterFee: 20000,
  drawRule: 'half',
  createdAt: 0,
  ...over,
})

const data = (over: Partial<AppData> = {}): AppData => ({
  members: ['a', 'b', 'c', 'd'].map((id) => mem(id)),
  matches: [],
  months: [],
  payments: [],
  expenses: [],
  incomes: [],
  settings: DEFAULT_SETTINGS,
  ...over,
})

// RNG cố định để test lặp lại được
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

describe('splitTeams', () => {
  it('chia đủ người, chênh nhau tối đa 1, không trùng', () => {
    const players = Array.from({ length: 11 }, (_, i) => mem('p' + i, (i % 5) + 1))
    const r = splitTeams(players, seeded(1))
    expect(r.teamA.length + r.teamB.length).toBe(11)
    expect(Math.abs(r.teamA.length - r.teamB.length)).toBeLessThanOrEqual(1)
    expect(new Set([...r.teamA, ...r.teamB]).size).toBe(11)
  })

  it('cân bằng trình độ và rải đều thủ môn', () => {
    const players = [mem('s1', 5), mem('s2', 5), mem('w1', 1), mem('w2', 1), mem('g1', 3, true), mem('g2', 3, true)]
    const r = splitTeams(players, seeded(7))
    expect(r.skillA).toBe(r.skillB)
    const gkA = r.teamA.filter((id) => id.startsWith('g')).length
    expect(gkA).toBe(1)
  })
})

describe('tiền nước', () => {
  it('đội thua mỗi người trả đủ tiền nước', () => {
    expect(waterCharges(match())).toEqual([
      { memberId: 'c', amount: 20000 },
      { memberId: 'd', amount: 20000 },
    ])
    expect(waterCharges(match({ scoreA: 0, scoreB: 2 })).map((c) => c.memberId)).toEqual(['a', 'b'])
  })

  it('hòa theo luật: chia đôi (làm tròn 1.000đ) / cả hai trả / miễn', () => {
    const draw = { scoreA: 1, scoreB: 1 }
    expect(waterCharges(match({ ...draw, waterFee: 15000 }))).toHaveLength(4)
    expect(waterCharges(match({ ...draw, waterFee: 15000 }))[0].amount).toBe(8000)
    expect(waterCharges(match({ ...draw, drawRule: 'full' }))[0].amount).toBe(20000)
    expect(waterCharges(match({ ...draw, drawRule: 'none' }))).toEqual([])
  })

  it('hòa tỉ số nhưng có thắng penalty: đội thua pen nộp phạt tiền nước', () => {
    const draw = { scoreA: 3, scoreB: 3 }
    // Đội A thắng pen -> Đội B nộp phạt
    const mA = match({ ...draw, penaltyWinner: 'A' })
    expect(matchOutcome(mA)).toBe('A')
    expect(waterCharges(mA).map((c) => c.memberId)).toEqual(['c', 'd'])

    // Đội B thắng tỉ số pen 5-4 -> Đội A nộp phạt
    const mB = match({ ...draw, penaltyScoreA: 4, penaltyScoreB: 5 })
    expect(matchOutcome(mB)).toBe('B')
    expect(waterCharges(mB).map((c) => c.memberId)).toEqual(['a', 'b'])
  })

  it('trận nhập từ sổ cũ dùng danh sách phạt có sẵn, không cần tỉ số', () => {
    const charges = [{ memberId: 'a', amount: 10000 }]
    expect(waterCharges(match({ scoreA: null, scoreB: null, teamA: [], teamB: [], charges }))).toEqual(charges)
  })

  it('trận chưa nhập tỉ số thì chưa ai nợ', () => {
    expect(matchOutcome(match({ scoreA: null }))).toBe('pending')
    expect(waterCharges(match({ scoreB: null }))).toEqual([])
  })
})

describe('nghĩa vụ và người nợ', () => {
  const d = data({
    matches: [match()],
    months: [{ id: '2026-10', amounts: { a: 100000, b: 100000, c: 100000, d: 100000 }, createdAt: 0 }],
    payments: [
      { id: 'water_m1_c', memberId: 'c', kind: 'water', refId: 'm1', amount: 20000, paidAt: 1 },
      { id: 'monthly_2026-10_a', memberId: 'a', kind: 'monthly', refId: '2026-10', amount: 100000, paidAt: 1 },
    ],
    expenses: [
      { id: 'e1', date: '2026-10-04', amount: 50000, note: 'Mua bóng', fund: 'extra', createdAt: 0 },
      { id: 'e2', date: '2026-10-04', amount: 30000, note: 'Tiền sân', fund: 'main', createdAt: 0 },
    ],
    incomes: [{ id: 'i1', date: '2026-10-01', amount: 200000, note: 'Ủng hộ', by: 'A Sơn', fund: 'extra', createdAt: 0 }],
  })

  it('gộp tiền nước + quỹ tháng, đánh dấu đã đóng', () => {
    const obs = buildObligations(d)
    expect(obs).toHaveLength(6)
    expect(obs.filter((o) => o.paid).map((o) => o.id).sort()).toEqual(['monthly_2026-10_a', 'water_m1_c'])
  })

  it('xếp người nợ nhiều nhất lên đầu, bỏ người đã đóng đủ', () => {
    const list = debtors(d)
    expect(list.map((x) => [x.member.id, x.total])).toEqual([
      ['d', 120000],
      ['b', 100000],
      ['c', 100000],
    ])
  })

  it('hai quỹ tách riêng: quỹ tháng → quỹ bóng đá; phạt + ủng hộ → quỹ ủng hộ', () => {
    const f = fundSummary(d)
    expect(f.main).toEqual({ dues: 100000, other: 0, income: 100000, spent: 30000, balance: 70000 })
    expect(f.extra).toEqual({ dues: 20000, other: 200000, income: 220000, spent: 50000, balance: 170000 })
  })

  it('mức quỹ tháng riêng từng người', () => {
    const d2 = data({ months: [{ id: '2026-10', amounts: { a: 500000, b: 100000 }, createdAt: 0 }] })
    expect(debtors(d2).map((x) => [x.member.id, x.total])).toEqual([
      ['a', 500000],
      ['b', 100000],
    ])
  })

  it('tin nhắc có tên, số tiền, tổng', () => {
    const msg = reminderMessage(d, debtors(d), '2026-10-04')
    expect(msg).toContain('Còn 3 bạn')
    expect(msg).toContain('D: 120.000đ')
    expect(msg).toContain('Tổng còn thiếu: 320.000đ')
  })
})

describe('tiền ứng trước phạt thua', () => {
  it('tính chính xác số tiền ứng còn lại sau các trận thua', () => {
    const member: Member = {
      ...mem('m1'),
      advanceAmount: 100000,
      advanceDate: '2026-10-01',
    }

    // Chưa trừ trận nào
    const info1 = getMemberAdvanceInfo(member, [])
    expect(info1.total).toBe(100000)
    expect(info1.used).toBe(0)
    expect(info1.remaining).toBe(100000)

    // Đã trừ 2 trận thua (mỗi trận 20k)
    const payments = [
      { id: 'water_match1_m1', memberId: 'm1', kind: 'water' as const, refId: 'match1', amount: 20000, paidAt: 1, note: ADVANCE_NOTE },
      { id: 'water_match2_m1', memberId: 'm1', kind: 'water' as const, refId: 'match2', amount: 20000, paidAt: 2, note: ADVANCE_NOTE },
      // Một khoản nộp tiền mặt không phải tiền ứng
      { id: 'water_match3_m1', memberId: 'm1', kind: 'water' as const, refId: 'match3', amount: 20000, paidAt: 3 },
    ]

    const info2 = getMemberAdvanceInfo(member, payments)
    expect(info2.total).toBe(100000)
    expect(info2.used).toBe(40000)
    expect(info2.remaining).toBe(60000)
    expect(info2.usedCount).toBe(2)
  })

  it('tự động trừ tiền ứng khi lưu kết quả trận đấu', () => {
    const mAdv: Member = { ...mem('pAdv'), advanceAmount: 60000, advanceDate: '2026-10-01' }
    const mNormal: Member = { ...mem('pNormal') }

    const matchObj: Match = {
      id: 'match10',
      date: '2026-10-05',
      teamA: ['pWinner'],
      teamB: ['pAdv', 'pNormal'],
      scoreA: 2,
      scoreB: 0,
      waterFee: 20000,
      drawRule: 'half',
      createdAt: 0,
    }

    const appData = data({
      members: [mAdv, mNormal, mem('pWinner')],
      matches: [matchObj],
      payments: [],
    })

    const res = autoDeductMatchAdvance(matchObj, appData)
    expect(res.deductedMemberIds).toEqual(['pAdv'])
    expect(res.paymentsToAdd).toHaveLength(1)
    expect(res.paymentsToAdd[0].id).toBe('water_match10_pAdv')
    expect(res.paymentsToAdd[0].note).toBe(ADVANCE_NOTE)
    expect(res.paymentsToAdd[0].amount).toBe(20000)
  })
})

describe('khoản đã đóng không còn khớp (giữ sổ quỹ đúng khi sửa trận)', () => {
  const pay = (memberId: string, amount = 20000, refId = 'm1') => ({
    id: `water_${refId}_${memberId}`, memberId, kind: 'water' as const, refId, amount, paidAt: 0,
  })

  it('đổi kết quả A thắng → B thắng: khoản đã đóng của đội B cũ bị gỡ', () => {
    const payments = [pay('c'), pay('d')]
    expect(stalePayments(match(), payments)).toEqual([])
    expect(stalePayments(match({ scoreA: 0, scoreB: 2 }), payments).map((p) => p.memberId)).toEqual(['c', 'd'])
  })

  it('chuyển người sang đội thắng / xoá khỏi trận: khoản của người đó bị gỡ', () => {
    const payments = [pay('c'), pay('d')]
    expect(stalePayments(match({ teamA: ['a', 'b', 'c'], teamB: ['d'] }), payments).map((p) => p.memberId)).toEqual(['c'])
    expect(stalePayments(match({ teamB: ['c'] }), payments).map((p) => p.memberId)).toEqual(['d'])
  })

  it('thắng → hoà (luật chia đôi): mức phạt đổi nên khoản cũ không còn khớp', () => {
    expect(stalePayments(match({ scoreA: 1, scoreB: 1 }), [pay('c')])).toHaveLength(1)
    expect(stalePayments(match({ scoreA: 1, scoreB: 1 }), [pay('c', 10000)])).toEqual([])
  })

  it('không đụng khoản của trận khác hoặc quỹ tháng', () => {
    const other = [pay('a', 20000, 'm2'), { ...pay('a'), kind: 'monthly' as const }]
    expect(stalePayments(match(), other)).toEqual([])
  })
})

describe('chọn nhanh đội thắng không cần tỉ số (không bịa tỉ số)', () => {
  const noScore = (over: Partial<Match>) => match({ scoreA: null, scoreB: null, ...over })

  it('chỉ ghi đội thắng: đội thua vẫn bị phạt đủ', () => {
    expect(matchOutcome(noScore({ winner: 'B' }))).toBe('B')
    expect(waterCharges(noScore({ winner: 'B' })).map((c) => c.memberId)).toEqual(['a', 'b'])
    expect(outcomeLabel(noScore({ winner: 'B' }))).toBe('Đội B thắng')
  })

  it('chọn nhanh hoà: tính theo luật hoà; có luân lưu thì đội thua pen bị phạt', () => {
    expect(waterCharges(noScore({ winner: 'draw' })).every((c) => c.amount === 10000)).toBe(true)
    const pen = noScore({ winner: 'draw', penaltyWinner: 'A' })
    expect(isPenaltyDecided(pen)).toBe(true)
    expect(waterCharges(pen).map((c) => c.memberId)).toEqual(['c', 'd'])
  })

  it('có tỉ số thì tỉ số quyết định, bỏ qua đội thắng chọn nhanh', () => {
    expect(matchOutcome(match({ scoreA: 0, scoreB: 2, winner: 'A' }))).toBe('B')
  })

  it('không tỉ số, không đội thắng → chưa có kết quả, chưa ai nợ', () => {
    expect(matchOutcome(noScore({}))).toBe('pending')
    expect(outcomeLabel(noScore({}))).toBe('Chưa có kết quả')
  })
})

describe('tiền ứng đang giữ hộ (đối chiếu tiền mặt thủ quỹ)', () => {
  it('cộng phần ứng còn lại của từng người, không tính người đã hết ứng', () => {
    const d = data({
      members: [{ ...mem('a'), advanceAmount: 100000 }, { ...mem('b'), advanceAmount: 20000 }, mem('c')],
      payments: [
        { id: 'water_m1_a', memberId: 'a', kind: 'water', refId: 'm1', amount: 20000, paidAt: 0, note: ADVANCE_NOTE },
        { id: 'water_m1_b', memberId: 'b', kind: 'water', refId: 'm1', amount: 20000, paidAt: 0, note: ADVANCE_NOTE },
      ],
    })
    expect(advanceHeld(d)).toEqual({ total: 80000, people: 1 })
  })
})
