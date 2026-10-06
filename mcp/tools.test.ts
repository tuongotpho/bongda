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

  it('đội thua có tiền ứng → tự trừ tiền ứng', () => {
    const d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data // B thua, Dũng có ứng
    expect(d.payments.find((p) => p.memberId === 'd')?.note).toBe(ADVANCE_NOTE)
  })

  it('đã chốt kết quả → KHÔNG sửa được kết quả lẫn đội hình, phải xoá trận tạo lại', () => {
    let d = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 1 }).data
    d = call(d, 'gach_no', { ten: 'tuan', khoan: '05/10' }).data
    expect(() => tools.ghi_ket_qua.run({ ti_so_a: 0, ti_so_b: 2 }, d)).toThrow(/KHÔNG sửa được/)
    expect(() => tools.sua_doi_hinh.run({ chuyen: ['dung'] }, d)).toThrow(/KHÔNG sửa được/)
    expect(fundSummary(d).extra.dues).toBe(40000) // sổ không đổi: Tuấn tiền mặt + Dũng trừ ứng
  })

  it('trận chưa đá thì vẫn sửa đội hình được', () => {
    const d = call(withMatch(), 'sua_doi_hinh', { chuyen: ['dung'] }).data
    expect(d.matches[0].teamA).toContain('d')
  })

  it('trận nhập từ sổ cũ luôn khoá', () => {
    const d = withMatch()
    d.matches[0] = { ...d.matches[0], teamA: [], teamB: [], charges: [{ memberId: 't', amount: 20000 }] }
    expect(() => tools.ghi_ket_qua.run({ doi_thang: 'A' }, d)).toThrow(/sổ cũ/)
  })

  it('một ngày có 2 trận: gõ "5/10" cũng phải hỏi lại, không xoá bừa', () => {
    let d = withMatch()
    d = call(d, 'tao_tran', { ngay: '05/10/2026', doi_a: ['hung'], doi_b: ['tuan'] }).data
    expect(() => tools.xoa_tran.run({ tran: '5/10' }, d)).toThrow(/có 2 trận/)
    expect(() => tools.xoa_tran.run({ tran: '05/10/2026' }, d)).toThrow(/có 2 trận/)
    expect(call(d, 'xoa_tran', { tran: d.matches[1].id }).data.matches).toHaveLength(1)
  })

  it('ngày không có thật → từ chối', () => {
    expect(() => tools.tao_tran.run({ ngay: '31/02/2026', doi_a: ['hung'], doi_b: ['tuan'] }, base())).toThrow(/không có thật/)
    expect(() => tools.tao_tran.run({ ngay: '2026-13-01', doi_a: ['hung'], doi_b: ['tuan'] }, base())).toThrow(/không có thật/)
    expect(call(base(), 'tao_tran', { ngay: '29/2/2028', doi_a: ['hung'], doi_b: ['tuan'] }).data.matches[0].date).toBe('2028-02-29')
  })

  it('hoà rồi thắng luân lưu: báo "Hoà · Đội B thắng luân lưu", không nhắc 2 lần', () => {
    const r = call(withMatch(), 'ghi_ket_qua', { ti_so_a: 3, ti_so_b: 3, luan_luu: 'B' })
    expect(r.text).toContain('3–3 · Hoà · Đội B thắng luân lưu')
    expect(r.text).toContain('Anh Hùng 20.000đ')
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

  it('xem cài đặt là nút chỉ đọc; sửa mà không đổi gì → báo, không ghi', () => {
    expect(tools.xem_cai_dat.write).toBe(false)
    expect(tools.xem_cai_dat.run({}, base()).ops).toBeUndefined()
    expect(() => tools.cai_dat.run({}, base())).toThrow(/Không có gì thay đổi/)
    expect(call(base(), 'cai_dat', { tien_phat: 30000 }).data.settings.waterFee).toBe(30000)
  })

  it('xoá hẳn người còn nợ phải có xác nhận; tạm nghỉ thì không cần', () => {
    const d = call(base(), 'mo_quy_thang', { thang: '10/2026' }).data
    expect(() => tools.xoa_thanh_vien.run({ ten: 'hung', xoa_han: true }, d)).toThrow(/CHƯA XOÁ.*còn nợ 100.000đ/)
    expect(call(d, 'xoa_thanh_vien', { ten: 'hung' }).data.members.find((m) => m.id === 'h')?.active).toBe(false)
    expect(call(d, 'xoa_thanh_vien', { ten: 'hung', xoa_han: true, xac_nhan_bo_no: true }).data.members.some((m) => m.id === 'h')).toBe(false)
  })
})
