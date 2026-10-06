/**
 * Các "nút" MCP cho AI quản lý sổ đội bóng.
 * Thuần logic: nhận dữ liệu (AppData) → trả lời bằng chữ + danh sách thao tác ghi (ops).
 * Không đụng Firebase ở đây → test được trên sổ giả (tools.test.ts).
 * Mọi luật tính tiền dùng chung ../src/logic.ts với web — AI ghi hay người ghi, sổ y hệt nhau.
 */
import {
  ADVANCE_NOTE,
  advanceHeld,
  buildObligations,
  debtors,
  fmtDate,
  fmtMonth,
  fundSummary,
  getMemberAdvanceInfo,
  getPenaltyWinner,
  isPenaltyDecided,
  matchOutcome,
  money,
  newId,
  obligationId,
  outcomeLabel,
  personalMessage,
  planMatchSave,
  reminderMessage,
  splitTeams,
  todayISO,
  waterCharges,
} from '../src/logic'
import { FUND_NAMES, type AppData, type DrawRule, type FundId, type Match, type Member, type Obligation, type Payment, type Settings } from '../src/types'

export type Coll = 'members' | 'matches' | 'months' | 'payments' | 'expenses' | 'incomes'
export type Op = { kind: 'set'; coll: Coll; id: string; data: object } | { kind: 'delete'; coll: Coll; id: string } | { kind: 'settings'; data: Settings }
export interface Result {
  text: string
  ops?: Op[]
}
/** Lỗi do người dùng/AI đưa thông tin chưa đủ hoặc mơ hồ — báo lại để AI hỏi người dùng */
export class ToolError extends Error {}

// ---------- Tìm người / trận ----------

/** Bỏ dấu, chữ thường — "Anh Hùng" ~ "anh hung" */
export const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ')

export function findMember(data: AppData, q: string): Member {
  const nq = norm(q)
  const exact = data.members.filter((m) => norm(m.name) === nq)
  if (exact.length === 1) return exact[0]
  const words = nq.split(' ')
  const partial = exact.length ? exact : data.members.filter((m) => words.every((w) => norm(m.name).split(' ').includes(w)))
  if (partial.length === 1) return partial[0]
  if (partial.length > 1) throw new ToolError(`"${q}" trùng nhiều người: ${partial.map((m) => m.name).join(', ')}. Ghi rõ tên đầy đủ.`)
  const near = data.members.filter((m) => norm(m.name).includes(nq)).map((m) => m.name)
  throw new ToolError(`Không tìm thấy thành viên "${q}".${near.length ? ` Gần giống: ${near.join(', ')}.` : ''}`)
}

const sortMatches = (data: AppData) => [...data.matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)

/** "gần nhất" · id · "2026-10-05" · "5/10" · "05/10/2026" */
export function findMatch(data: AppData, q?: string): Match {
  const all = sortMatches(data)
  if (!all.length) throw new ToolError('Chưa có trận nào trong sổ.')
  const s = (q ?? '').trim()
  if (!s || /^(gan nhat|moi nhat|latest|last)$/.test(norm(s))) return all[0]
  const byId = all.find((m) => m.id === s)
  if (byId) return byId
  let iso: string | null = null
  let dm: string | null = null
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (m1) iso = s
  else if (m2) {
    const d = m2[1].padStart(2, '0')
    const mo = m2[2].padStart(2, '0')
    if (m2[3]) iso = `${m2[3]}-${mo}-${d}`
    else dm = `-${mo}-${d}`
  } else throw new ToolError(`Không hiểu trận "${q}". Ghi ngày dạng 05/10/2026, hoặc "gần nhất".`)
  const found = all.filter((m) => (iso ? m.date === iso : m.date.endsWith(dm!)))
  if (!found.length) throw new ToolError(`Không có trận ngày ${q}.`)
  if (iso || found.length === 1) {
    if (found.length > 1) throw new ToolError(`Ngày ${q} có ${found.length} trận: ${found.map((m) => m.id).join(', ')}. Dùng mã trận.`)
    return found[0]
  }
  return found[0] // nhiều năm cùng ngày/tháng → lấy năm gần nhất
}

export function parseDate(q?: string): string {
  if (!q) return todayISO()
  if (/^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  const m = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (!m) throw new ToolError(`Ngày "${q}" không hợp lệ. Ghi dạng 05/10/2026.`)
  return `${m[3] ?? todayISO().slice(0, 4)}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function parseMonth(q: string): string {
  const s = norm(q).replace(/^(t|thang)\s*/, '')
  const m1 = s.match(/^(\d{4})-(\d{1,2})$/)
  const m2 = s.match(/^(\d{1,2})(?:\/(\d{4}))?$/)
  if (m1) return `${m1[1]}-${m1[2].padStart(2, '0')}`
  if (m2) return `${m2[2] ?? todayISO().slice(0, 4)}-${m2[1].padStart(2, '0')}`
  throw new ToolError(`Tháng "${q}" không hợp lệ. Ghi dạng 10/2026.`)
}

// ---------- Mô tả ----------

const nameOf = (data: AppData, id: string) => data.members.find((m) => m.id === id)?.name ?? '(đã xoá)'
const names = (data: AppData, ids: string[]) => ids.map((id) => nameOf(data, id)).join(', ') || '(trống)'

function matchLine(data: AppData, m: Match, obs: Obligation[]) {
  const mine = obs.filter((o) => o.kind === 'water' && o.refId === m.id)
  const unpaid = mine.filter((o) => !o.paid)
  const score = m.scoreA != null ? `${m.scoreA}–${m.scoreB}` : ''
  const penDone = isPenaltyDecided(m)
  // Hoà rồi thắng luân lưu → ghi "Hoà · Đội B thắng luân lưu", không ghi "Đội B thắng" hai lần
  const res = m.charges ? `sổ cũ, ${m.charges.length} người bị phạt` : [score, penDone ? 'Hoà' : outcomeLabel(m)].filter(Boolean).join(' · ')
  const pen = penDone ? ` · Đội ${getPenaltyWinner(m)} thắng luân lưu` : ''
  const money_ = mine.length ? ` · ${unpaid.length ? `còn ${unpaid.length}/${mine.length} chưa nộp (${money(unpaid.reduce((s, o) => s + o.amount, 0))})` : `đã thu đủ ${mine.length} người`}` : ''
  return `${fmtDate(m.date)} [${m.id}] — ${res}${pen}${money_}`
}

function matchDetail(data: AppData, m: Match) {
  const obs = buildObligations(data).filter((o) => o.kind === 'water' && o.refId === m.id)
  const lines = [matchLine(data, m, obs)]
  if (!m.charges) {
    lines.push(`Đội A (${m.teamA.length}): ${names(data, m.teamA)}`)
    lines.push(`Đội B (${m.teamB.length}): ${names(data, m.teamB)}`)
  }
  lines.push(`Mức phạt: ${money(m.waterFee)}/người đội thua · luật hoà: ${DRAW[m.drawRule]}`)
  if (obs.length) {
    lines.push('Tiền phạt:')
    for (const o of obs) {
      const p = data.payments.find((x) => x.id === o.id)
      lines.push(`  - ${nameOf(data, o.memberId)}: ${money(o.amount)} — ${o.paid ? (p?.note ? `đã trừ (${p.note})` : 'đã đóng tiền mặt') : 'CHƯA ĐÓNG'}`)
    }
  }
  if (m.note) lines.push(`Ghi chú: ${m.note}`)
  return lines.join('\n')
}

const DRAW: Record<DrawRule, string> = { none: 'hoà không phạt', half: 'hoà phạt nửa', full: 'hoà phạt đủ' }

function memberStats(data: AppData) {
  const s = new Map<string, { played: number; won: number; drawn: number; lost: number }>()
  for (const m of data.matches) {
    const o = matchOutcome(m)
    if (o === 'pending') continue
    for (const [ids, side] of [[m.teamA ?? [], 'A'], [m.teamB ?? [], 'B']] as const)
      for (const id of ids) {
        const st = s.get(id) ?? { played: 0, won: 0, drawn: 0, lost: 0 }
        st.played++
        if (o === 'draw') st.drawn++
        else if (o === side) st.won++
        else st.lost++
        s.set(id, st)
      }
  }
  return s
}

// ---------- Thao tác ghi ----------

const setOp = (coll: Coll, id: string, value: object): Op => ({ kind: 'set', coll, id, data: value })
const delOp = (coll: Coll, id: string): Op => ({ kind: 'delete', coll, id })

/** Lưu trận theo đúng luật web (planMatchSave): gỡ khoản lệch, tự trừ tiền ứng nếu trận đã có kết quả */
function saveMatchOps(next: Match, data: AppData, confirmCash: boolean | undefined) {
  const decided = matchOutcome(next) !== 'pending'
  const plan = planMatchSave(next, data, decided)
  if (plan.staleCash.length && !confirmCash) {
    const list = plan.staleCash.map((p) => `${nameOf(data, p.memberId)} ${money(p.amount)}`).join(', ')
    throw new ToolError(
      `CHƯA LƯU. Thay đổi này làm ${plan.staleCash.length} khoản tiền phạt ĐÃ THU TIỀN MẶT không còn khớp: ${list}. ` +
        `Các khoản đó sẽ bị gỡ khỏi sổ quỹ. Hỏi người dùng; nếu đồng ý thì gọi lại với xac_nhan_go_khoan_da_thu = true.`,
    )
  }
  const ops: Op[] = [setOp('matches', next.id, next), ...plan.stale.map((p) => delOp('payments', p.id)), ...plan.toAdd.map((p) => setOp('payments', p.id, p))]
  const notes: string[] = []
  if (plan.stale.length) notes.push(`gỡ ${plan.stale.length} khoản không còn khớp (${plan.stale.map((p) => nameOf(data, p.memberId)).join(', ')})`)
  if (plan.deducted.length) notes.push(`tự trừ tiền ứng cho: ${names(data, plan.deducted)}`)
  return { ops, notes }
}

function unpaidOf(data: AppData, member: Member) {
  return buildObligations(data).filter((o) => o.memberId === member.id && !o.paid)
}

function pickObligations(list: Obligation[], khoan: string | undefined, all: boolean | undefined, who: string, verb: string) {
  if (!list.length) throw new ToolError(`${who} không có khoản nào để ${verb}.`)
  if (all) return list
  if (!khoan) {
    if (list.length === 1) return list
    throw new ToolError(`${who} có ${list.length} khoản: ${list.map((o) => `${o.label} ${money(o.amount)}`).join('; ')}. Chọn khoản (vd. "28/09" hoặc "T9/2026") hoặc tat_ca = true.`)
  }
  const k = norm(khoan)
  const hit = list.filter((o) => norm(o.label).includes(k) || o.refId === khoan)
  if (!hit.length) throw new ToolError(`Không thấy khoản "${khoan}" của ${who}. Các khoản: ${list.map((o) => o.label).join('; ')}.`)
  return hit
}

// ---------- Định nghĩa các nút ----------

export interface ToolDef<A = any> {
  title: string
  description: string
  /** true = có ghi sổ */
  write: boolean
  run: (args: A, data: AppData) => Result
}

export const tools: Record<string, ToolDef> = {
  tong_quan: {
    title: 'Tổng quan đội bóng',
    description: 'Số dư 2 quỹ, tổng tiền còn thiếu, số người nợ, tiền ứng đang giữ hộ, trận gần nhất. Gọi đầu tiên khi cần nắm tình hình.',
    write: false,
    run: (_: object, data) => {
      const f = fundSummary(data)
      const obs = buildObligations(data)
      const list = debtors(data, obs)
      const held = advanceHeld(data)
      const last = sortMatches(data)[0]
      const lines = [
        `${data.settings.teamName}`,
        `${FUND_NAMES.main}: ${money(f.main.balance)} (thu ${money(f.main.income)}, chi ${money(f.main.spent)})`,
        `${FUND_NAMES.extra}: ${money(f.extra.balance)} (thu ${money(f.extra.income)}, chi ${money(f.extra.spent)})`,
        `Tiền ứng đang giữ hộ: ${money(held.total)} (${held.people} người) — chưa tính vào quỹ`,
        `Còn thiếu: ${money(list.reduce((s, d) => s + d.total, 0))} · ${list.length} người chưa đóng đủ`,
        `Thành viên: ${data.members.filter((m) => m.active).length} đang đá / ${data.members.length} · ${data.matches.length} trận đã ghi`,
      ]
      if (last) lines.push(`Trận gần nhất: ${matchLine(data, last, obs)}`)
      return { text: lines.join('\n') }
    },
  },

  danh_sach_no: {
    title: 'Danh sách người còn nợ',
    description: 'Ai còn nợ, nợ khoản nào (quỹ tháng, tiền phạt trận). Truyền ten để xem một người.',
    write: false,
    run: (a: { ten?: string }, data) => {
      if (a.ten) {
        const m = findMember(data, a.ten)
        const un = unpaidOf(data, m)
        const adv = getMemberAdvanceInfo(m, data.payments)
        if (!un.length) return { text: `${m.name} đã đóng đủ.${adv.remaining ? ` Tiền ứng còn ${money(adv.remaining)}.` : ''}` }
        return {
          text: [`${m.name} còn nợ ${money(un.reduce((s, o) => s + o.amount, 0))}:`, ...un.map((o) => `  - ${o.label}: ${money(o.amount)}`), adv.remaining ? `Tiền ứng còn ${money(adv.remaining)} (trừ được tiền phạt).` : '']
            .filter(Boolean)
            .join('\n'),
        }
      }
      const list = debtors(data)
      if (!list.length) return { text: 'Tất cả đã đóng đủ.' }
      return {
        text: [
          `${list.length} người còn nợ, tổng ${money(list.reduce((s, d) => s + d.total, 0))}:`,
          ...list.map((d) => `  - ${d.member.name}: ${money(d.total)} (${d.unpaid.map((o) => `${o.label} ${money(o.amount)}`).join('; ')})`),
        ].join('\n'),
      }
    },
  },

  soan_tin_nhac: {
    title: 'Soạn tin nhắc đóng tiền',
    description: 'Soạn sẵn tin nhắc nợ để dán vào Zalo: cả nhóm (bỏ trống ten) hoặc nhắn riêng một người.',
    write: false,
    run: (a: { ten?: string }, data) => {
      if (!a.ten) return { text: reminderMessage(data, debtors(data)) }
      const m = findMember(data, a.ten)
      const d = debtors(data).find((x) => x.member.id === m.id)
      if (!d) return { text: `${m.name} đã đóng đủ, không cần nhắc.` }
      return { text: personalMessage(data, d) }
    },
  },

  thanh_vien: {
    title: 'Danh sách thành viên',
    description: 'Thành viên kèm trình độ (sao), thủ môn, mức quỹ tháng, nợ, tiền ứng, thành tích. loc: dang_da (mặc định) | tam_nghi | con_no | tat_ca.',
    write: false,
    run: (a: { loc?: 'dang_da' | 'tam_nghi' | 'con_no' | 'tat_ca' }, data) => {
      const debt = new Map(debtors(data).map((d) => [d.member.id, d.total]))
      const st = memberStats(data)
      const loc = a.loc ?? 'dang_da'
      const list = data.members
        .filter((m) => (loc === 'tat_ca' ? true : loc === 'tam_nghi' ? !m.active : loc === 'con_no' ? debt.has(m.id) : m.active))
        .sort((x, y) => x.name.localeCompare(y.name, 'vi'))
      if (!list.length) return { text: 'Không có thành viên nào khớp bộ lọc.' }
      return {
        text: list
          .map((m) => {
            const s = st.get(m.id)
            const adv = getMemberAdvanceInfo(m, data.payments)
            return [
              `${m.name}${m.isGK ? ' (thủ môn)' : ''}${m.active ? '' : ' [tạm nghỉ]'}`,
              `${m.skill}★`,
              `quỹ ${money(m.monthlyFee)}/tháng`,
              debt.get(m.id) ? `nợ ${money(debt.get(m.id)!)}` : 'đủ',
              adv.total ? `ứng còn ${money(adv.remaining)}/${money(adv.total)}` : '',
              s ? `${s.played} trận ${s.won}T-${s.drawn}H-${s.lost}B` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          })
          .join('\n'),
      }
    },
  },

  lich_su_tran: {
    title: 'Lịch sử trận đấu',
    description: 'Các trận gần đây: kết quả, ai còn chưa nộp phạt. so_tran mặc định 10.',
    write: false,
    run: (a: { so_tran?: number }, data) => {
      const obs = buildObligations(data)
      const list = sortMatches(data).slice(0, a.so_tran ?? 10)
      if (!list.length) return { text: 'Chưa có trận nào.' }
      return { text: list.map((m) => matchLine(data, m, obs)).join('\n') }
    },
  },

  chi_tiet_tran: {
    title: 'Chi tiết một trận',
    description: 'Đội hình 2 đội, kết quả, từng người đã/chưa nộp phạt. tran: ngày (05/10/2026), mã trận, hoặc "gần nhất".',
    write: false,
    run: (a: { tran?: string }, data) => ({ text: matchDetail(data, findMatch(data, a.tran)) }),
  },

  so_quy: {
    title: 'Sổ quỹ: thu chi và quỹ tháng',
    description: 'Các khoản thu (ủng hộ) / chi, và tình hình quỹ từng tháng. Truyền thang (vd. 9/2026) để xem ai đã/chưa đóng tháng đó.',
    write: false,
    run: (a: { thang?: string }, data) => {
      if (a.thang) {
        const ym = parseMonth(a.thang)
        const mo = data.months.find((x) => x.id === ym)
        if (!mo) return { text: `Chưa mở quỹ ${fmtMonth(ym)}.` }
        const paid = new Set(data.payments.filter((p) => p.kind === 'monthly' && p.refId === ym).map((p) => p.memberId))
        const rows = Object.entries(mo.amounts).map(([id, amt]) => `  - ${nameOf(data, id)}: ${money(amt)} — ${paid.has(id) ? 'đã đóng' : 'CHƯA'}`)
        return { text: [`Quỹ ${fmtMonth(ym)}: ${paid.size}/${rows.length} người đã đóng`, ...rows].join('\n') }
      }
      const rows = [
        ...data.incomes.map((x) => ({ d: x.date, t: `+${money(x.amount)} ${FUND_NAMES[x.fund]} — ${x.note}${x.by ? ` (${x.by})` : ''} [thu:${x.id}]` })),
        ...data.expenses.map((x) => ({ d: x.date, t: `−${money(x.amount)} ${FUND_NAMES[x.fund]} — ${x.note}${x.by ? ` (${x.by})` : ''} [chi:${x.id}]` })),
      ].sort((x, y) => y.d.localeCompare(x.d))
      const months = [...data.months]
        .sort((x, y) => y.id.localeCompare(x.id))
        .map((mo) => {
          const n = Object.keys(mo.amounts).length
          const p = data.payments.filter((x) => x.kind === 'monthly' && x.refId === mo.id).length
          return `  - ${fmtMonth(mo.id)}: ${p}/${n} đã đóng`
        })
      return {
        text: [
          'Thu / chi:',
          ...(rows.length ? rows.map((r) => `  ${fmtDate(r.d)} ${r.t}`) : ['  (chưa có)']),
          'Quỹ tháng:',
          ...(months.length ? months : ['  (chưa mở tháng nào)']),
        ].join('\n'),
      }
    },
  },

  chia_doi: {
    title: 'Chia đội thử (chưa lưu)',
    description: 'Chia 2 đội cân bằng trình độ, rải đều thủ môn, từ danh sách tên. CHỈ XEM, không lưu. Muốn lưu dùng tao_tran (truyền đúng doi_a/doi_b vừa chia, hoặc nguoi để chia lại).',
    write: false,
    run: (a: { nguoi: string[] }, data) => {
      const ms = [...new Map(a.nguoi.map((n) => findMember(data, n)).map((m) => [m.id, m])).values()]
      if (ms.length < 2) throw new ToolError('Cần ít nhất 2 người.')
      const r = splitTeams(ms)
      return { text: `Đội A (${r.teamA.length} người, ${r.skillA}★): ${names(data, r.teamA)}\nĐội B (${r.teamB.length} người, ${r.skillB}★): ${names(data, r.teamB)}` }
    },
  },

  tao_tran: {
    title: 'Tạo trận mới',
    description: 'Lưu trận mới vào sổ. Hoặc truyền doi_a + doi_b (đội đã chia), hoặc truyền nguoi để máy tự chia cân bằng. ngay mặc định hôm nay.',
    write: true,
    run: (a: { ngay?: string; nguoi?: string[]; doi_a?: string[]; doi_b?: string[]; ghi_chu?: string }, data) => {
      let teamA: string[]
      let teamB: string[]
      if (a.doi_a?.length || a.doi_b?.length) {
        teamA = (a.doi_a ?? []).map((n) => findMember(data, n).id)
        teamB = (a.doi_b ?? []).map((n) => findMember(data, n).id)
        const dup = teamA.filter((id) => teamB.includes(id))
        if (dup.length) throw new ToolError(`${names(data, dup)} có mặt ở cả 2 đội.`)
      } else if (a.nguoi?.length) {
        const ms = [...new Map(a.nguoi.map((n) => findMember(data, n)).map((m) => [m.id, m])).values()]
        ;({ teamA, teamB } = splitTeams(ms))
      } else throw new ToolError('Truyền doi_a và doi_b, hoặc nguoi.')
      if (teamA.length + teamB.length < 2) throw new ToolError('Cần ít nhất 2 người.')
      const m: Match = {
        id: newId(),
        date: parseDate(a.ngay),
        teamA,
        teamB,
        scoreA: null,
        scoreB: null,
        waterFee: data.settings.waterFee,
        drawRule: data.settings.drawRule,
        createdAt: Date.now(),
        ...(a.ghi_chu ? { note: a.ghi_chu } : {}),
      }
      return {
        text: `Đã tạo trận ${fmtDate(m.date)} [${m.id}].\nĐội A: ${names(data, teamA)}\nĐội B: ${names(data, teamB)}`,
        ops: [setOp('matches', m.id, m)],
      }
    },
  },

  sua_doi_hinh: {
    title: 'Sửa đội hình / ngày của trận',
    description: 'Chuyển người sang đội kia (chuyen), thêm vào đội A/B (them_a, them_b), bớt người (bot), đổi ngày (ngay_moi). Tự gỡ khoản phạt không còn khớp.',
    write: true,
    run: (
      a: { tran?: string; chuyen?: string[]; them_a?: string[]; them_b?: string[]; bot?: string[]; ngay_moi?: string; xac_nhan_go_khoan_da_thu?: boolean },
      data,
    ) => {
      const m = findMatch(data, a.tran)
      if (m.charges) throw new ToolError('Trận nhập từ sổ cũ không có đội hình — sửa trên web.')
      let A = [...m.teamA]
      let B = [...m.teamB]
      for (const n of a.chuyen ?? []) {
        const id = findMember(data, n).id
        if (A.includes(id)) (A = A.filter((x) => x !== id)), B.push(id)
        else if (B.includes(id)) (B = B.filter((x) => x !== id)), A.push(id)
        else throw new ToolError(`${n} không có trong trận này.`)
      }
      for (const n of a.bot ?? []) {
        const id = findMember(data, n).id
        A = A.filter((x) => x !== id)
        B = B.filter((x) => x !== id)
      }
      for (const [list, side] of [[a.them_a, 'A'], [a.them_b, 'B']] as const)
        for (const n of list ?? []) {
          const id = findMember(data, n).id
          if (A.includes(id) || B.includes(id)) throw new ToolError(`${n} đã có trong trận.`)
          ;(side === 'A' ? A : B).push(id)
        }
      const next: Match = { ...m, teamA: A, teamB: B, date: a.ngay_moi ? parseDate(a.ngay_moi) : m.date }
      const { ops, notes } = saveMatchOps(next, data, a.xac_nhan_go_khoan_da_thu)
      return { text: [`Đã sửa trận ${fmtDate(next.date)}.`, `Đội A: ${names(data, A)}`, `Đội B: ${names(data, B)}`, ...notes].join('\n'), ops }
    },
  },

  ghi_ket_qua: {
    title: 'Ghi kết quả trận',
    description:
      'Ghi tỉ số (ti_so_a, ti_so_b) và/hoặc đội thắng (doi_thang: A | B | hoa) khi không có tỉ số. Hoà có thể ghi luân lưu (luan_luu: A | B | khong, pen_a, pen_b). xoa = true để xoá kết quả. KHÔNG tự nghĩ ra tỉ số. Tự tính tiền phạt, tự trừ tiền ứng.',
    write: true,
    run: (
      a: {
        tran?: string
        ti_so_a?: number
        ti_so_b?: number
        doi_thang?: 'A' | 'B' | 'hoa'
        luan_luu?: 'A' | 'B' | 'khong'
        pen_a?: number
        pen_b?: number
        ghi_chu?: string
        xoa?: boolean
        xac_nhan_go_khoan_da_thu?: boolean
      },
      data,
    ) => {
      const m = findMatch(data, a.tran)
      if (m.charges) throw new ToolError('Trận nhập từ sổ cũ đã có sẵn danh sách phạt, không ghi kết quả.')
      if ((a.ti_so_a == null) !== (a.ti_so_b == null)) throw new ToolError('Cần đủ tỉ số cả hai đội (ti_so_a và ti_so_b).')
      const scored = a.ti_so_a != null
      if (!a.xoa && !scored && !a.doi_thang) throw new ToolError('Truyền tỉ số hoặc doi_thang.')
      if (scored && a.doi_thang) {
        const real = a.ti_so_a! > a.ti_so_b! ? 'A' : a.ti_so_b! > a.ti_so_a! ? 'B' : 'hoa'
        if (real !== a.doi_thang) throw new ToolError(`Tỉ số ${a.ti_so_a}–${a.ti_so_b} mâu thuẫn với doi_thang = ${a.doi_thang}. Hỏi lại người dùng.`)
      }
      const winner = a.xoa || scored ? null : a.doi_thang === 'hoa' ? 'draw' : a.doi_thang!
      const tied = !a.xoa && (scored ? a.ti_so_a === a.ti_so_b : winner === 'draw')
      let pw: 'A' | 'B' | null = tied && (a.luan_luu === 'A' || a.luan_luu === 'B') ? a.luan_luu : null
      if (tied && a.pen_a != null && a.pen_b != null && !pw) pw = a.pen_a > a.pen_b ? 'A' : a.pen_b > a.pen_a ? 'B' : null
      const next: Match = {
        ...m,
        scoreA: a.xoa ? null : (a.ti_so_a ?? null),
        scoreB: a.xoa ? null : (a.ti_so_b ?? null),
        winner,
        penaltyWinner: pw,
        penaltyScoreA: tied ? (a.pen_a ?? null) : null,
        penaltyScoreB: tied ? (a.pen_b ?? null) : null,
        ...(a.ghi_chu != null ? { note: a.ghi_chu || undefined } : {}),
      }
      const { ops, notes } = saveMatchOps(next, data, a.xac_nhan_go_khoan_da_thu)
      const after = applyOps(data, ops) // tính câu báo SAU khi đã trừ tiền ứng / gỡ khoản lệch
      const losers = waterCharges(next)
      const head = a.xoa ? `Đã xoá kết quả trận ${fmtDate(m.date)}.` : `Đã ghi trận ${fmtDate(m.date)}: ${matchLine(after, next, buildObligations(after)).split(' — ')[1]}`
      return {
        text: [head, losers.length ? `Phải nộp phạt: ${losers.map((c) => `${nameOf(data, c.memberId)} ${money(c.amount)}`).join(', ')}` : 'Không ai bị phạt.', ...notes].join('\n'),
        ops,
      }
    },
  },

  gach_no: {
    title: 'Gạch nợ (đánh dấu đã đóng)',
    description: 'Đánh dấu một người đã đóng tiền. khoan: "28/09" (phạt trận) hoặc "T9/2026" (quỹ tháng); tat_ca = true để gạch hết. hinh_thuc: tien_mat (mặc định) | tru_ung (trừ vào tiền ứng, chỉ cho tiền phạt).',
    write: true,
    run: (a: { ten: string; khoan?: string; tat_ca?: boolean; hinh_thuc?: 'tien_mat' | 'tru_ung' }, data) => {
      const m = findMember(data, a.ten)
      const picked = pickObligations(unpaidOf(data, m), a.khoan, a.tat_ca, m.name, 'gạch')
      const useAdv = a.hinh_thuc === 'tru_ung'
      if (useAdv) {
        if (picked.some((o) => o.kind !== 'water')) throw new ToolError('Tiền ứng chỉ trừ được tiền phạt trận, không trừ quỹ tháng.')
        const left = getMemberAdvanceInfo(m, data.payments).remaining
        const need = picked.reduce((s, o) => s + o.amount, 0)
        if (left < need) throw new ToolError(`${m.name} chỉ còn ${money(left)} tiền ứng, không đủ trừ ${money(need)}.`)
      }
      const ops = picked.map((o) => {
        const p: Payment = { id: o.id, memberId: o.memberId, kind: o.kind, refId: o.refId, amount: o.amount, paidAt: Date.now(), ...(useAdv ? { note: ADVANCE_NOTE } : {}) }
        return setOp('payments', p.id, p)
      })
      return { text: `Đã gạch cho ${m.name} (${useAdv ? 'trừ tiền ứng' : 'tiền mặt'}): ${picked.map((o) => `${o.label} ${money(o.amount)}`).join('; ')}.`, ops }
    },
  },

  bo_gach_no: {
    title: 'Bỏ gạch nợ (ghi nhầm đã đóng)',
    description: 'Huỷ đánh dấu đã đóng của một người cho khoản đã chọn (khoan như gach_no).',
    write: true,
    run: (a: { ten: string; khoan?: string; tat_ca?: boolean }, data) => {
      const m = findMember(data, a.ten)
      const paid = buildObligations(data).filter((o) => o.memberId === m.id && o.paid)
      const picked = pickObligations(paid, a.khoan, a.tat_ca, m.name, 'bỏ gạch')
      return { text: `Đã bỏ gạch cho ${m.name}: ${picked.map((o) => o.label).join('; ')}.`, ops: picked.map((o) => delOp('payments', o.id)) }
    },
  },

  them_thanh_vien: {
    title: 'Thêm thành viên',
    description: 'Thêm một người (ten) hoặc nhiều người (danh_sach). sao 1–5 (mặc định 3), thu_mon, muc_quy_thang (mặc định theo cài đặt).',
    write: true,
    run: (a: { ten?: string; danh_sach?: string[]; sao?: number; thu_mon?: boolean; muc_quy_thang?: number }, data) => {
      const list = [...(a.danh_sach ?? []), ...(a.ten ? [a.ten] : [])].map((s) => s.trim()).filter(Boolean)
      if (!list.length) throw new ToolError('Chưa có tên.')
      const skill = Math.min(5, Math.max(1, Math.round(a.sao ?? 3)))
      const have = new Set(data.members.map((m) => norm(m.name)))
      const added: Member[] = []
      const skipped: string[] = []
      for (const n of list) {
        if (have.has(norm(n))) {
          skipped.push(n)
          continue
        }
        have.add(norm(n))
        added.push({ id: newId() + added.length, name: n, skill, isGK: !!a.thu_mon, active: true, monthlyFee: a.muc_quy_thang ?? data.settings.monthlyFee, createdAt: Date.now() })
      }
      return {
        text: [added.length ? `Đã thêm ${added.length} người: ${added.map((m) => m.name).join(', ')}.` : 'Không thêm ai.', skipped.length ? `Bỏ qua vì đã có: ${skipped.join(', ')}.` : '']
          .filter(Boolean)
          .join('\n'),
        ops: added.map((m) => setOp('members', m.id, m)),
      }
    },
  },

  sua_thanh_vien: {
    title: 'Sửa thông tin thành viên',
    description:
      'Đổi tên (ten_moi), sao, thu_mon, muc_quy_thang, dang_da (false = cho tạm nghỉ). Tiền ứng: nap_them_ung (cộng thêm) hoặc tien_ung (đặt lại tổng đã ứng), ngay_ung, ghi_chu_ung.',
    write: true,
    run: (
      a: { ten: string; ten_moi?: string; sao?: number; thu_mon?: boolean; muc_quy_thang?: number; dang_da?: boolean; tien_ung?: number; nap_them_ung?: number; ngay_ung?: string; ghi_chu_ung?: string },
      data,
    ) => {
      const m = findMember(data, a.ten)
      const next: Member = { ...m }
      const changes: string[] = []
      if (a.ten_moi) {
        const clash = data.members.find((x) => x.id !== m.id && norm(x.name) === norm(a.ten_moi!))
        if (clash) throw new ToolError(`Đã có người tên ${clash.name}.`)
        next.name = a.ten_moi.trim()
        changes.push(`tên → ${next.name}`)
      }
      if (a.sao != null) (next.skill = Math.min(5, Math.max(1, Math.round(a.sao)))), changes.push(`${next.skill}★`)
      if (a.thu_mon != null) (next.isGK = a.thu_mon), changes.push(a.thu_mon ? 'thủ môn' : 'không bắt gôn')
      if (a.muc_quy_thang != null) (next.monthlyFee = Math.max(0, a.muc_quy_thang)), changes.push(`quỹ ${money(next.monthlyFee)}/tháng`)
      if (a.dang_da != null) (next.active = a.dang_da), changes.push(a.dang_da ? 'đang đá' : 'tạm nghỉ')
      if (a.tien_ung != null || a.nap_them_ung != null) {
        const total = a.tien_ung != null ? Math.max(0, a.tien_ung) : (m.advanceAmount ?? 0) + Math.max(0, a.nap_them_ung!)
        next.advanceAmount = total || undefined
        next.advanceDate = total ? parseDate(a.ngay_ung) : undefined
        changes.push(`tổng tiền ứng ${money(total)}`)
      }
      if (a.ghi_chu_ung != null) (next.advanceNote = a.ghi_chu_ung || undefined), changes.push('ghi chú ứng')
      if (!changes.length) throw new ToolError('Chưa có gì để sửa.')
      const adv = getMemberAdvanceInfo(next, data.payments)
      return { text: `Đã sửa ${m.name}: ${changes.join(', ')}.${next.advanceAmount ? ` Tiền ứng còn ${money(adv.remaining)}.` : ''}`, ops: [setOp('members', m.id, next)] }
    },
  },

  xoa_thanh_vien: {
    title: 'Cho nghỉ / xoá thành viên',
    description: 'Mặc định chỉ cho TẠM NGHỈ (giữ lịch sử). xoa_han = true để xoá hẳn (tên trong trận cũ hiện "(đã xoá)"; khoản đã đóng vẫn giữ trong quỹ).',
    write: true,
    run: (a: { ten: string; xoa_han?: boolean }, data) => {
      const m = findMember(data, a.ten)
      if (!a.xoa_han) return { text: `Đã cho ${m.name} tạm nghỉ (không hiện khi chia đội, không tính quỹ tháng mới).`, ops: [setOp('members', m.id, { ...m, active: false })] }
      return { text: `Đã xoá hẳn ${m.name}.`, ops: [delOp('members', m.id)] }
    },
  },

  mo_quy_thang: {
    title: 'Mở quỹ tháng',
    description: 'Mở quỹ tháng (thang: 10/2026) cho mọi thành viên đang đá, mỗi người theo mức quỹ riêng.',
    write: true,
    run: (a: { thang: string }, data) => {
      const ym = parseMonth(a.thang)
      if (data.months.some((x) => x.id === ym)) throw new ToolError(`${fmtMonth(ym)} đã mở rồi.`)
      const act = data.members.filter((m) => m.active && m.monthlyFee > 0)
      const mo = { id: ym, amounts: Object.fromEntries(act.map((m) => [m.id, m.monthlyFee])), createdAt: Date.now() }
      return { text: `Đã mở quỹ ${fmtMonth(ym)} cho ${act.length} người, dự kiến thu ${money(act.reduce((s, m) => s + m.monthlyFee, 0))}.`, ops: [setOp('months', ym, mo)] }
    },
  },

  ghi_thu_chi: {
    title: 'Ghi khoản thu / chi',
    description: 'loai: thu (ủng hộ, thu khác) | chi. quy: bong_da (quỹ tháng → trả sân) | ung_ho_phat (bóng, áo, nước…). so_tien, ghi_chu, nguoi (người ủng hộ / người chi), ngay.',
    write: true,
    run: (a: { loai: 'thu' | 'chi'; quy: 'bong_da' | 'ung_ho_phat'; so_tien: number; ghi_chu: string; nguoi?: string; ngay?: string }, data) => {
      if (!(a.so_tien > 0)) throw new ToolError('Số tiền phải lớn hơn 0.')
      const fund: FundId = a.quy === 'bong_da' ? 'main' : 'extra'
      const base = { id: newId(), date: parseDate(a.ngay), amount: Math.round(a.so_tien), note: a.ghi_chu.trim(), fund, createdAt: Date.now() }
      const coll: Coll = a.loai === 'thu' ? 'incomes' : 'expenses'
      const rec = a.loai === 'thu' ? { ...base, by: a.nguoi?.trim() ?? '' } : { ...base, ...(a.nguoi ? { by: a.nguoi.trim() } : {}) }
      const f = fundSummary(data)[fund].balance + (a.loai === 'thu' ? base.amount : -base.amount)
      return { text: `Đã ghi ${a.loai === 'thu' ? 'thu' : 'chi'} ${money(base.amount)} — ${base.note} (${FUND_NAMES[fund]}). Số dư mới: ${money(f)}. [mã ${base.id}]`, ops: [setOp(coll, base.id, rec)] }
    },
  },

  xoa_thu_chi: {
    title: 'Xoá khoản thu / chi',
    description: 'Xoá một khoản thu/chi ghi nhầm theo mã (lấy từ so_quy, dạng thu:xxx hoặc chi:xxx).',
    write: true,
    run: (a: { ma: string }, data) => {
      const [kind, id] = a.ma.includes(':') ? a.ma.split(':') : ['', a.ma]
      const inc = data.incomes.find((x) => x.id === id)
      const exp = data.expenses.find((x) => x.id === id)
      const rec = kind === 'chi' ? exp : kind === 'thu' ? inc : (inc ?? exp)
      if (!rec) throw new ToolError(`Không có khoản mã ${a.ma}.`)
      const coll: Coll = rec === inc ? 'incomes' : 'expenses'
      return { text: `Đã xoá ${coll === 'incomes' ? 'khoản thu' : 'khoản chi'} ${money(rec.amount)} — ${rec.note}.`, ops: [delOp(coll, rec.id)] }
    },
  },

  xoa_tran: {
    title: 'Xoá trận',
    description: 'Xoá hẳn một trận và mọi khoản phạt đã thu của trận đó. Chỉ dùng khi người dùng nói rõ muốn xoá.',
    write: true,
    run: (a: { tran: string }, data) => {
      const m = findMatch(data, a.tran)
      const pays = data.payments.filter((p) => p.kind === 'water' && p.refId === m.id)
      return {
        text: `Đã xoá trận ${fmtDate(m.date)}${pays.length ? ` và ${pays.length} khoản phạt đã thu (${money(pays.reduce((s, p) => s + p.amount, 0))})` : ''}.`,
        ops: [delOp('matches', m.id), ...pays.map((p) => delOp('payments', p.id))],
      }
    },
  },

  cai_dat: {
    title: 'Xem / sửa cài đặt đội',
    description: 'Không truyền gì = xem. Sửa: ten_doi, tien_phat (mỗi người đội thua, áp cho trận mới), quy_thang (mức mặc định người mới), luat_hoa (khong_phat | phat_nua | phat_du), tai_khoan (thông tin chuyển khoản).',
    write: true,
    run: (a: { ten_doi?: string; tien_phat?: number; quy_thang?: number; luat_hoa?: 'khong_phat' | 'phat_nua' | 'phat_du'; tai_khoan?: string }, data) => {
      const s = { ...data.settings }
      const map = { khong_phat: 'none', phat_nua: 'half', phat_du: 'full' } as const
      if (a.ten_doi) s.teamName = a.ten_doi.trim()
      if (a.tien_phat != null) s.waterFee = Math.max(0, a.tien_phat)
      if (a.quy_thang != null) s.monthlyFee = Math.max(0, a.quy_thang)
      if (a.luat_hoa) s.drawRule = map[a.luat_hoa]
      if (a.tai_khoan != null) s.bankInfo = a.tai_khoan
      const text = `Tên đội: ${s.teamName}\nPhạt thua: ${money(s.waterFee)}/người · ${DRAW[s.drawRule]}\nQuỹ tháng mặc định: ${money(s.monthlyFee)}\nChuyển khoản: ${s.bankInfo || '(chưa ghi)'}`
      const changed = JSON.stringify(s) !== JSON.stringify(data.settings)
      return changed ? { text: `Đã lưu cài đặt.\n${text}`, ops: [{ kind: 'settings', data: s }] } : { text }
    },
  },
}

/** Áp thao tác lên dữ liệu trong bộ nhớ — dùng cho test và để in kết quả sau khi ghi */
export function applyOps(data: AppData, ops: Op[]): AppData {
  const d: AppData = { ...data, members: [...data.members], matches: [...data.matches], months: [...data.months], payments: [...data.payments], expenses: [...data.expenses], incomes: [...data.incomes] }
  for (const op of ops) {
    if (op.kind === 'settings') {
      d.settings = op.data
      continue
    }
    const list = d[op.coll] as { id: string }[]
    const i = list.findIndex((x) => x.id === op.id)
    if (op.kind === 'delete') {
      if (i >= 0) list.splice(i, 1)
    } else {
      const v = { ...(op.data as object), id: op.id } as { id: string }
      if (i >= 0) list[i] = v
      else list.push(v)
    }
  }
  return d
}
