import { describe, expect, it } from 'vitest'
import { ADVANCE_NOTE, buildObligations, fundSummary } from '../src/logic'
import { DEFAULT_SETTINGS, type AppData, type Member } from '../src/types'
import { ToolError, applyOps, findMember, tools } from './tools'

const mem = (id: string, name: string, over: Partial<Member> = {}): Member => ({ id, name, skill: 3, isGK: false, active: true, monthlyFee: 100000, createdAt: 0, ...over })

const base = (): AppData => ({
  members: [mem('h', 'Anh Hùng'), mem('n', 'Anh Nam'), mem('t', 'Tuấn'), mem('d', 'Dũng', { advanceAmount: 40000 }), mem('m1', 'Minh'), mem('m2', 'S Minh CĐ')],
  matches: [],
  months: [],
  payments: [],
  expenses: [],
  incomes: [],
  settings: { ...DEFAULT_SETTINGS },
})

/** Bấm một nút: chạy + áp thay đổi vào sổ giả */
const call = (data: AppData, name: string, args: object) => {
  const r = tools[name].run(args, data)
  return { text: r.text, ops: r.ops ?? [], data: applyOps(data, r.ops ?? []) }
}

describe('MCP: tìm người theo tên', () => {
  it('không dấu, thiếu chữ "Anh" vẫn tìm ra', () => {
    expect(findMember(base(), 'hung').id).toBe('h')
    expect(findMember(base(), 'ANH NAM').id).toBe('n')
  })
  it('trùng tên thì báo để hỏi lại, không đoán bừa', () => {
    expect(findMember(base(), 'minh').id).toBe('m1') // khớp đúng cả tên
    const d = base()
    d.members.push(mem('m3', 'Minh'))
    expect(() => findMember(d, 'minh')).toThrow(/trùng nhiều người/)
    expect(() => findMember(d, 'Long')).toThrow(ToolError)
  })
})

describe('MCP: trận đấu và tiền phạt', () => {
  const withMatch = () => call(base(), 'tao_tran', { ngay: '05/10/2026', doi_a: ['hung', 'nam'], doi_b: ['tuan', 'dung'] }).data

  it('tạo trận rồi ghi "B thắng" không có tỉ số → không bịa tỉ số, đội A nộp phạt', () => {
    const r = call(withMatch(), 'ghi_ket_qua', { tran: '05/10/2026', doi_thang: 'B' })
    const m = r.data.matches[0]
    expect([m.scoreA, m.scoreB, m.winner]).toEqual([null, null, 'B'])
    expect(r.text).toContain('Anh Hùng 20.000đ')
    expect(buildObligations(r.data).filter((o) => o.kind === 'water').map((o) => o.memberId)).toEqual(['h', 'n'])
  })

  it('tỉ số mâu thuẫn với đội thắng → từ chối, hỏi lại', () => {
    expect(() => tools.ghi_ket_qua.run({ ti_so_a: 1, ti_so_b: 3, doi_thang: 'A' }, withMatch())).toThrow(/mâu thuẫn/)
  })

  it('đội thua có tiền ứng → tự trừ; đổi kết quả → hoàn lại tiền ứng', () => {
    let d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data // B thua, Dũng có ứng
    const pd = d.payments.find((p) => p.memberId === 'd')
    expect(pd?.note).toBe(ADVANCE_NOTE)
    d = call(d, 'ghi_ket_qua', { ti_so_a: 0, ti_so_b: 2 }).data // giờ A thua
    expect(d.payments.find((p) => p.memberId === 'd')).toBeUndefined()
  })

  it('đổi kết quả làm mất khoản TIỀN MẶT đã thu → phải có xác nhận mới gỡ', () => {
    let d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data
    d = call(d, 'gach_no', { ten: 'tuan', khoan: '05/10' }).data
    expect(fundSummary(d).extra.dues).toBe(40000) // Tuấn tiền mặt + Dũng trừ ứng
    expect(() => tools.ghi_ket_qua.run({ ti_so_a: 0, ti_so_b: 2 }, d)).toThrow(/CHƯA LƯU/)
    const r = call(d, 'ghi_ket_qua', { ti_so_a: 0, ti_so_b: 2, xac_nhan_go_khoan_da_thu: true })
    expect(r.data.payments.some((p) => p.memberId === 't')).toBe(false)
  })

  it('chuyển người sang đội thắng → gỡ khoản phạt của người đó', () => {
    let d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data
    d = call(d, 'sua_doi_hinh', { chuyen: ['dung'] }).data
    expect(d.payments.find((p) => p.memberId === 'd')).toBeUndefined()
    expect(d.matches[0].teamA).toContain('d')
  })

  it('xoá trận xoá luôn khoản phạt đã thu', () => {
    let d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data
    d = call(d, 'xoa_tran', { tran: '05/10/2026' }).data
    expect(d.matches).toHaveLength(0)
    expect(d.payments.filter((p) => p.kind === 'water')).toHaveLength(0)
  })
})

describe('MCP: gạch nợ, quỹ tháng, thu chi', () => {
  it('nhiều khoản mà không nói rõ → liệt kê để hỏi; tat_ca gạch hết', () => {
    let d = call(base(), 'mo_quy_thang', { thang: '9/2026' }).data
    d = call(d, 'tao_tran', { ngay: '28/09/2026', doi_a: ['tuan'], doi_b: ['hung'] }).data
    d = call(d, 'ghi_ket_qua', { ti_so_a: 2, ti_so_b: 0 }).data
    expect(() => tools.gach_no.run({ ten: 'hung' }, d)).toThrow(/có 2 khoản/)
    d = call(d, 'gach_no', { ten: 'hung', tat_ca: true }).data
    expect(buildObligations(d).filter((o) => o.memberId === 'h' && !o.paid)).toHaveLength(0)
  })

  it('trừ ứng không đủ tiền → từ chối; quỹ tháng không trừ ứng được', () => {
    let d = call(base(), 'mo_quy_thang', { thang: '10/2026' }).data
    expect(() => tools.gach_no.run({ ten: 'dung', hinh_thuc: 'tru_ung' }, d)).toThrow(/chỉ trừ được tiền phạt/)
    d = call(d, 'sua_thanh_vien', { ten: 'dung', tien_ung: 0 }).data
    d = call(d, 'tao_tran', { ngay: '1/10/2026', doi_a: ['tuan'], doi_b: ['dung'] }).data
    d = call(d, 'ghi_ket_qua', { ti_so_a: 1, ti_so_b: 0 }).data
    expect(() => tools.gach_no.run({ ten: 'dung', khoan: '01/10', hinh_thuc: 'tru_ung' }, d)).toThrow(/không đủ/)
  })

  it('mở trùng tháng → báo; ghi chi trừ đúng quỹ', () => {
    const d = call(base(), 'mo_quy_thang', { thang: 'T10/2026' }).data
    expect(() => tools.mo_quy_thang.run({ thang: '10/2026' }, d)).toThrow(/đã mở/)
    const r = call(d, 'ghi_thu_chi', { loai: 'chi', quy: 'bong_da', so_tien: 600000, ghi_chu: 'Thuê sân' })
    expect(fundSummary(r.data).main.spent).toBe(600000)
  })

  it('cài đặt không truyền gì = chỉ xem, không ghi', () => {
    expect(tools.cai_dat.run({}, base()).ops).toBeUndefined()
  })
})
