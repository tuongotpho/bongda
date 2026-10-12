import { fmtDate, money, todayISO } from './logic'

// Ảnh báo cáo vẽ bằng canvas, nền sáng để gửi Zalo / in.
// Vẽ gấp 3 lần kích thước logic cho nét khi phóng to; giảm dần nếu ảnh quá lớn,
// vì Safari iOS không vẽ được canvas trên ~16,7 triệu điểm ảnh.

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const PAD = 48
const MAX_SCALE = 3
const MAX_PIXELS = 16_000_000
const HEADER_H = 210
const BOX_H = 130
const HEAD_H = 52

const C = {
  bg: '#f8fafc',
  card: '#ffffff',
  line: '#e2e8f0',
  text: '#0f172a',
  sub: '#64748b',
  faint: '#cbd5e1',
  green: '#047857',
  greenFill: '#059669',
  greenBg: '#ecfdf5',
  red: '#dc2626',
  redBg: '#fef2f2',
  redLine: '#fecaca',
  amber: '#b45309',
  amberBg: '#fffbeb',
  amberLine: '#fde68a',
  head: '#f1f5f9',
  zebra: '#f8fafc',
}

// ---------- Hàm vẽ dùng chung ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

const font = (ctx: CanvasRenderingContext2D, weight: number | string, size: number) => {
  ctx.font = `${weight} ${size}px ${FONT}`
}

/** Cắt chuỗi kèm "…" cho vừa `max` */
function fit(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s
  let t = s
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1)
  return t + '…'
}

/** Ngắt dòng theo từ, tối đa `maxLines` dòng */
function wrap(ctx: CanvasRenderingContext2D, s: string, max: number, maxLines: number) {
  const out: string[] = []
  for (const para of s.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/)) {
      const next = line ? `${line} ${w}` : w
      if (ctx.measureText(next).width > max && line) {
        out.push(line)
        line = w
      } else line = next
    }
    if (line) out.push(line)
  }
  return out.length > maxLines ? [...out.slice(0, maxLines - 1), fit(ctx, out.slice(maxLines - 1).join(' '), max)] : out
}

function makeCanvas(W: number, H: number) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(MAX_SCALE, Math.sqrt(MAX_PIXELS / (W * H)))
  canvas.width = Math.floor(W * scale)
  canvas.height = Math.floor(H * scale)
  const ctx = canvas.getContext('2d')!
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  return { canvas, ctx }
}

/** Dải xanh đầu ảnh: tên đội, tiêu đề, giờ cập nhật */
function drawHeader(ctx: CanvasRenderingContext2D, W: number, teamName: string, title: string) {
  const g = ctx.createLinearGradient(0, 0, W, HEADER_H)
  g.addColorStop(0, '#065f46')
  g.addColorStop(1, '#047857')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, HEADER_H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  let size = 40
  font(ctx, 800, size)
  while (ctx.measureText(teamName).width > W - PAD * 2 && size > 24) font(ctx, 800, (size -= 2))
  ctx.fillText(teamName, W / 2, 68)
  font(ctx, 700, 28)
  ctx.fillStyle = '#d1fae5'
  ctx.fillText(title, W / 2, 122)
  font(ctx, 400, 18)
  ctx.fillStyle = '#a7f3d0'
  const now = new Date()
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  ctx.fillText(`Cập nhật lúc ${hm} ngày ${fmtDate(todayISO())}`, W / 2, 166)
}

/** Hàng ô số liệu: [nhãn, giá trị, màu] */
function drawBoxes(ctx: CanvasRenderingContext2D, W: number, y: number, boxes: [string, string, string][]) {
  const gap = 16
  const bw = (W - PAD * 2 - gap * (boxes.length - 1)) / boxes.length
  boxes.forEach(([label, value, color], i) => {
    const x = PAD + i * (bw + gap)
    ctx.fillStyle = C.card
    roundRect(ctx, x, y, bw, BOX_H, 18)
    ctx.fill()
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.textAlign = 'center'
    font(ctx, 500, 18)
    ctx.fillStyle = C.sub
    ctx.fillText(label, x + bw / 2, y + 42)
    let s = 30
    font(ctx, 800, s)
    while (ctx.measureText(value).width > bw - 24 && s > 18) font(ctx, 800, (s -= 2))
    ctx.fillStyle = color
    ctx.fillText(value, x + bw / 2, y + 88)
  })
}

interface Col {
  label: string
  x: number
  align: CanvasTextAlign
  color?: string
}

/** Bảng bo góc: tiêu đề + hàng tiêu đề cột + `count` dòng; trả về y cuối bảng */
function drawTable(
  ctx: CanvasRenderingContext2D,
  W: number,
  y: number,
  o: { title: string; cols: Col[]; count: number; rowH: number; empty?: string; foot?: (cy: number) => void },
  drawRow: (i: number, cy: number) => void,
) {
  font(ctx, 700, 24)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.text
  ctx.fillText(o.title, PAD, y + 22)
  y += 60
  const tw = W - PAD * 2
  const footH = o.foot ? o.rowH : 0
  const th = HEAD_H + Math.max(o.count, 1) * o.rowH + footH
  ctx.save()
  roundRect(ctx, PAD, y, tw, th, 18)
  ctx.fillStyle = C.card
  ctx.fill()
  ctx.clip()
  ctx.fillStyle = C.head
  ctx.fillRect(PAD, y, tw, HEAD_H)
  font(ctx, 700, 17)
  for (const c of o.cols) {
    ctx.fillStyle = c.color ?? C.sub
    ctx.textAlign = c.align
    ctx.fillText(c.label, c.x, y + HEAD_H / 2)
  }
  for (let i = 0; i < o.count; i++) {
    const ry = y + HEAD_H + i * o.rowH
    if (i % 2 === 1) {
      ctx.fillStyle = C.zebra
      ctx.fillRect(PAD, ry, tw, o.rowH)
    }
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD, ry)
    ctx.lineTo(PAD + tw, ry)
    ctx.stroke()
    drawRow(i, ry + o.rowH / 2)
  }
  if (!o.count) {
    font(ctx, 400, 18)
    ctx.textAlign = 'center'
    ctx.fillStyle = C.sub
    ctx.fillText(o.empty ?? 'Chưa có dữ liệu', W / 2, y + HEAD_H + o.rowH / 2)
  }
  if (o.foot) {
    const fy = y + th - footH
    ctx.fillStyle = C.head
    ctx.fillRect(PAD, fy, tw, footH)
    ctx.strokeStyle = C.line
    ctx.beginPath()
    ctx.moveTo(PAD, fy)
    ctx.lineTo(PAD + tw, fy)
    ctx.stroke()
    o.foot(fy + footH / 2)
  }
  ctx.restore()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.5
  roundRect(ctx, PAD, y, tw, th, 18)
  ctx.stroke()
  return y + th
}

function bankLinesOf(W: number, bankInfo?: string) {
  if (!bankInfo?.trim()) return []
  const m = document.createElement('canvas').getContext('2d')!
  font(m, 400, 20)
  return wrap(m, bankInfo.trim(), W - PAD * 2 - 48, 4)
}
const bankHeight = (lines: string[]) => (lines.length ? 64 + lines.length * 30 : 0)

function drawBank(ctx: CanvasRenderingContext2D, W: number, y: number, lines: string[]) {
  ctx.fillStyle = C.card
  roundRect(ctx, PAD, y, W - PAD * 2, bankHeight(lines), 18)
  ctx.fill()
  ctx.strokeStyle = C.line
  ctx.lineWidth = 1.5
  ctx.stroke()
  font(ctx, 700, 18)
  ctx.textAlign = 'left'
  ctx.fillStyle = C.sub
  ctx.fillText('Chuyển khoản đóng quỹ', PAD + 24, y + 34)
  font(ctx, 400, 20)
  ctx.fillStyle = C.text
  lines.forEach((l, i) => ctx.fillText(l, PAD + 24, y + 70 + i * 30))
}

const FOOTER_H = 70
function drawFooter(ctx: CanvasRenderingContext2D, W: number, H: number, teamName: string) {
  font(ctx, 400, 16)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`${teamName} · Báo cáo tự động từ app quản lý đội bóng`, W / 2, H - FOOTER_H / 2)
}

// ---------- Bảng tổng hợp quỹ tháng (thành viên × 12 tháng) ----------

/** paid đã đóng · unpaid chưa đóng · future mở sớm chưa tới tháng · exempt miễn · closed chưa mở quỹ */
export type MatrixCell = 'paid' | 'unpaid' | 'future' | 'exempt' | 'closed'

export interface PaidMatrixParams {
  teamName: string
  year: number
  /** 12 tháng YYYY-MM của năm */
  months: string[]
  thisMonth: string
  rows: { name: string; cells: MatrixCell[]; owe: number }[]
  /** tổng tiền quỹ tháng đã thu trong năm (của các dòng đang hiện) */
  collected: number
  /** đang lọc "chỉ người còn nợ" */
  onlyOwe?: boolean
  bankInfo?: string
}

export function generatePaidMatrixImage(p: PaidMatrixParams): HTMLCanvasElement {
  const W = 1400
  const ROW_H = 52
  const X = { stt: PAD + 36, name: PAD + 80, month0: PAD + 392, monthW: 64, owe: W - PAD - 24 }
  const nameMax = X.month0 - X.name - 16
  const monthX = (i: number) => X.month0 + i * X.monthW + X.monthW / 2

  const owe = p.rows.reduce((s, r) => s + r.owe, 0)
  const opened = p.months.filter((_, i) => p.rows.some((r) => r.cells[i] !== 'closed')).length
  const bankLines = bankLinesOf(W, p.bankInfo)
  const tableH = 60 + HEAD_H + Math.max(p.rows.length, 1) * ROW_H + ROW_H
  const legendH = 56
  const bankH = bankHeight(bankLines)
  const H = HEADER_H + 32 + BOX_H + 40 + tableH + legendH + (bankH ? 16 + bankH : 0) + FOOTER_H

  const { canvas, ctx } = makeCanvas(W, H)
  drawHeader(ctx, W, p.teamName, `BẢNG TỔNG HỢP QUỸ THÁNG NĂM ${p.year}`)

  let y = HEADER_H + 32
  drawBoxes(ctx, W, y, [
    ['Đã thu cả năm', money(p.collected), C.green],
    ['Còn nợ', money(owe), owe ? C.red : C.green],
    [p.onlyOwe ? 'Người còn nợ' : 'Thành viên', `${p.rows.length} người`, C.text],
    ['Tháng đã mở quỹ', `${opened}/12`, C.text],
  ])
  y += BOX_H + 40

  y = drawTable(
    ctx,
    W,
    y,
    {
      title: p.onlyOwe ? 'Danh sách người còn nợ quỹ' : 'Tình hình đóng quỹ từng tháng',
      cols: [
        { label: 'STT', x: X.stt, align: 'center' },
        { label: 'Thành viên', x: X.name, align: 'left' },
        ...p.months.map((m, i) => ({
          label: `T${Number(m.slice(5))}`,
          x: monthX(i),
          align: 'center' as const,
          color: m === p.thisMonth ? C.green : p.rows.some((r) => r.cells[i] !== 'closed') ? C.sub : C.faint,
        })),
        { label: 'Còn nợ', x: X.owe, align: 'right' },
      ],
      count: p.rows.length,
      rowH: ROW_H,
      empty: p.onlyOwe ? 'Không ai còn nợ quỹ năm này' : 'Chưa có thành viên đóng quỹ',
      foot: (cy) => {
        font(ctx, 700, 17)
        ctx.textAlign = 'left'
        ctx.fillStyle = C.sub
        ctx.fillText('Đã đóng', X.name, cy)
        font(ctx, 600, 16)
        ctx.textAlign = 'center'
        p.months.forEach((_, i) => {
          const due = p.rows.filter((r) => ['paid', 'unpaid', 'future'].includes(r.cells[i]))
          if (!due.length) return
          const paid = due.filter((r) => r.cells[i] === 'paid').length
          ctx.fillStyle = paid === due.length ? C.green : C.sub
          ctx.fillText(`${paid}/${due.length}`, monthX(i), cy)
        })
        font(ctx, 800, 18)
        ctx.textAlign = 'right'
        ctx.fillStyle = owe ? C.red : C.green
        ctx.fillText(owe ? money(owe) : 'Đủ', X.owe, cy)
      },
    },
    (i, cy) => {
      const r = p.rows[i]
      font(ctx, 600, 17)
      ctx.textAlign = 'center'
      ctx.fillStyle = C.sub
      ctx.fillText(String(i + 1), X.stt, cy)
      font(ctx, 600, 19)
      ctx.textAlign = 'left'
      ctx.fillStyle = C.text
      ctx.fillText(fit(ctx, r.name, nameMax), X.name, cy)
      r.cells.forEach((c, j) => {
        const cx = monthX(j)
        if (c === 'closed') return
        if (c === 'exempt') {
          font(ctx, 500, 18)
          ctx.textAlign = 'center'
          ctx.fillStyle = C.faint
          ctx.fillText('–', cx, cy)
          return
        }
        const s = 34
        const [fill, stroke, fg, mark] =
          c === 'paid' ? [C.greenFill, C.greenFill, '#ffffff', '✓'] : c === 'future' ? [C.amberBg, C.amberLine, C.amber, '·'] : [C.redBg, C.redLine, C.red, '✕']
        roundRect(ctx, cx - s / 2, cy - s / 2, s, s, 9)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = stroke
        ctx.lineWidth = 1.5
        ctx.stroke()
        font(ctx, 800, c === 'future' ? 26 : 18)
        ctx.textAlign = 'center'
        ctx.fillStyle = fg
        ctx.fillText(mark, cx, cy + 1)
      })
      font(ctx, 700, 18)
      ctx.textAlign = 'right'
      ctx.fillStyle = r.owe ? C.red : C.green
      ctx.fillText(r.owe ? money(r.owe) : 'Đủ', X.owe, cy)
    },
  )

  // Chú thích
  y += 16
  const legend: [string, string, string, string][] = [
    ['✓', C.greenFill, '#ffffff', 'Đã đóng'],
    ['✕', C.redBg, C.red, 'Chưa đóng'],
    ['·', C.amberBg, C.amber, 'Mở sớm, chưa tới tháng (không tính nợ)'],
    ['–', C.bg, C.faint, 'Miễn / không phải đóng'],
  ]
  let lx = PAD
  for (const [mark, bg, fg, label] of legend) {
    roundRect(ctx, lx, y + 6, 24, 24, 6)
    ctx.fillStyle = bg
    ctx.fill()
    font(ctx, 800, 15)
    ctx.textAlign = 'center'
    ctx.fillStyle = fg
    ctx.fillText(mark, lx + 12, y + 19)
    font(ctx, 400, 16)
    ctx.textAlign = 'left'
    ctx.fillStyle = C.sub
    ctx.fillText(label, lx + 32, y + 18)
    lx += 32 + ctx.measureText(label).width + 32
  }
  y += legendH

  if (bankLines.length) drawBank(ctx, W, y + 16, bankLines)
  drawFooter(ctx, W, H, p.teamName)
  return canvas
}
