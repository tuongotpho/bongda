import { useMemo } from 'react'
import { bankName, hasBank } from './bank'
import { Icon } from './icons'
import { money } from './logic'
import { Btn, Modal, copyText, useApp } from './ui'
import { drawQr, qrSvgPath, transferNote, vietQrPayload } from './vietqr'

/** Mã QR dạng vector (SVG) — nét căng ở mọi cỡ màn hình */
export function QrSvg({ text, className = '' }: { text: string; className?: string }) {
  const { size, d } = useMemo(() => qrSvgPath(text), [text])
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className={className} shapeRendering="crispEdges" role="img" aria-label="Mã QR chuyển khoản">
      <rect x={-2} y={-2} width={size + 4} height={size + 4} fill="#fff" />
      <path d={d} fill="#0f172a" />
    </svg>
  )
}

/**
 * QR chuyển khoản VietQR. Có `amount` → app ngân hàng điền sẵn số tiền + nội dung,
 * không có → QR tĩnh, người chuyển tự nhập.
 */
export function PayQRModal({
  amount,
  note,
  subtitle,
  zIndex = 'z-70',
  onClose,
}: {
  amount?: number
  /** Nội dung CK — sẽ được bỏ dấu, cắt 25 ký tự */
  note?: string
  subtitle?: string
  zIndex?: string
  onClose: () => void
}) {
  const { data, toast } = useApp()
  const s = data.settings
  const memo = note ? transferNote(note) : ''
  const payload = hasBank(s) ? vietQrPayload(s.bankBin, s.bankAccount, amount, memo || undefined) : ''

  const copy = async (text: string, what: string) => toast((await copyText(text)) ? `Đã chép ${what}` : 'Không sao chép được')

  const saveImage = () => {
    const W = 720
    const H = 1000
    const scale = 2
    const c = document.createElement('canvas')
    c.width = W * scale
    c.height = H * scale
    const ctx = c.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#047857'
    ctx.fillRect(0, 0, W, 140)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const f = (w: number, px: number) => (ctx.font = `${w} ${px}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`)
    f(800, 34)
    ctx.fillStyle = '#fff'
    ctx.fillText(s.teamName, W / 2, 56, W - 60)
    f(500, 24)
    ctx.fillStyle = '#d1fae5'
    ctx.fillText(subtitle || 'Chuyển khoản đóng quỹ', W / 2, 102, W - 60)
    drawQr(ctx, payload, (W - 480) / 2, 170, 480)
    f(700, 30)
    ctx.fillStyle = '#0f172a'
    ctx.fillText(s.bankHolder || '', W / 2, 700)
    f(500, 26)
    ctx.fillStyle = '#334155'
    ctx.fillText(`${bankName(s.bankBin)} · STK ${s.bankAccount}`, W / 2, 748)
    if (amount) {
      f(800, 44)
      ctx.fillStyle = '#dc2626'
      ctx.fillText(money(amount), W / 2, 820)
    }
    if (memo) {
      f(500, 24)
      ctx.fillStyle = '#64748b'
      ctx.fillText(`Nội dung: ${memo}`, W / 2, amount ? 880 : 810)
    }
    f(400, 20)
    ctx.fillStyle = '#94a3b8'
    ctx.fillText('Mở app ngân hàng → Quét QR → chọn ảnh này', W / 2, H - 40)
    c.toBlob((b) => {
      if (!b) return toast('Không tạo được ảnh')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `qr-chuyen-khoan${amount ? `-${amount}` : ''}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    }, 'image/png')
  }

  return (
    <Modal title="Quét mã để chuyển khoản" zIndex={zIndex} onClose={onClose}>
      {!payload ? (
        <p className="text-sm text-slate-600">Chưa có số tài khoản. Thủ quỹ vào ⚙️ Cài đặt đội để nhập ngân hàng và số tài khoản.</p>
      ) : (
        <div className="space-y-4">
          {subtitle && <p className="text-center text-sm text-slate-600">{subtitle}</p>}
          <div className="mx-auto w-full max-w-[18rem] rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200">
            <QrSvg text={payload} className="block h-auto w-full" />
          </div>
          <div className="divide-y divide-slate-100 rounded-2xl bg-slate-50 px-4 text-sm">
            <Row label="Ngân hàng" value={bankName(s.bankBin)} />
            <Row label="Số tài khoản" value={s.bankAccount} strong onCopy={() => copy(s.bankAccount, 'số tài khoản')} />
            {s.bankHolder && <Row label="Chủ tài khoản" value={s.bankHolder} />}
            {!!amount && <Row label="Số tiền" value={money(amount)} strong tone="text-red-600" onCopy={() => copy(String(amount), 'số tiền')} />}
            {memo && <Row label="Nội dung" value={memo} onCopy={() => copy(memo, 'nội dung')} />}
          </div>
          <p className="text-center text-xs text-slate-500">
            Mở app ngân hàng → Quét QR{amount ? ' — số tiền và nội dung đã điền sẵn' : ''}. Đang xem trên điện thoại thì bấm “Lưu ảnh QR” rồi chọn ảnh từ thư viện.
          </p>
          <div className="flex gap-2">
            <Btn kind="soft" className="flex-1" onClick={saveImage}>
              <Icon name="image" className="h-4 w-4" /> Lưu ảnh QR
            </Btn>
            {!amount && (
              <Btn kind="ghost" className="flex-1 ring-1 ring-slate-200" onClick={() => copy(`${location.origin}${location.pathname}#qr`, 'link mở mã QR — gửi vào nhóm Zalo')}>
                <Icon name="copy" className="h-4 w-4" /> Chép link QR
              </Btn>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Row({ label, value, strong, tone = 'text-slate-900', onCopy }: { label: string; value: string; strong?: boolean; tone?: string; onCopy?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={`truncate ${strong ? 'font-bold' : 'font-medium'} ${tone}`}>{value}</span>
        {onCopy && (
          <button type="button" onClick={onCopy} className="cursor-pointer rounded-md p-1 text-slate-400 hover:bg-white hover:text-green-700" title="Sao chép">
            <Icon name="copy" className="h-3.5 w-3.5" />
          </button>
        )}
      </span>
    </div>
  )
}
