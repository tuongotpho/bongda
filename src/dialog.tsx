import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './icons'

/**
 * Hộp xác nhận / thông báo thay cho confirm() / alert() của trình duyệt:
 * gọi được từ bất kỳ đâu (kể cả ngoài component) và trả Promise như bản gốc.
 *   if (!(await confirmDialog({ title: 'Xoá trận?', danger: true }))) return
 * <DialogHost /> phải được gắn một lần ở gốc app.
 */
type Tone = 'danger' | 'warning' | 'primary' | 'info'

export interface DialogOpts {
  title: string
  message?: ReactNode
  /** Danh sách gạch đầu dòng nổi bật (vd. hậu quả của thao tác) */
  details?: ReactNode[]
  confirmText?: string
  cancelText?: string
  tone?: Tone
  /** Viết tắt của tone: 'danger' */
  danger?: boolean
}

interface Req extends DialogOpts {
  id: number
  alertOnly: boolean
  resolve: (ok: boolean) => void
}

let seq = 0
let push: ((r: Req) => void) | null = null

function open(opts: DialogOpts, alertOnly: boolean) {
  return new Promise<boolean>((resolve) => {
    const req = { ...opts, id: ++seq, alertOnly, resolve }
    // Host chưa gắn (không nên xảy ra) → quay về hộp thoại gốc để không mất bước xác nhận
    if (!push) {
      const text = [opts.title, typeof opts.message === 'string' ? opts.message : ''].filter(Boolean).join('\n\n')
      if (alertOnly) {
        alert(text)
        return resolve(true)
      }
      return resolve(confirm(text))
    }
    push(req)
  })
}

export const confirmDialog = (opts: DialogOpts) => open(opts, false)
export const alertDialog = (opts: DialogOpts) => open(opts, true).then(() => undefined)

const TONES: Record<Tone, { icon: IconName; badge: string; btn: string }> = {
  danger: { icon: 'trash', badge: 'bg-red-100 text-red-600 ring-red-50', btn: 'bg-red-600 text-white shadow-sm shadow-red-900/20 hover:bg-red-700' },
  warning: { icon: 'alert', badge: 'bg-amber-100 text-amber-600 ring-amber-50', btn: 'bg-amber-600 text-white shadow-sm shadow-amber-900/20 hover:bg-amber-700' },
  primary: { icon: 'check', badge: 'bg-green-100 text-green-700 ring-green-50', btn: 'bg-green-700 text-white shadow-sm shadow-green-900/20 hover:bg-green-800' },
  info: { icon: 'info', badge: 'bg-sky-100 text-sky-600 ring-sky-50', btn: 'bg-green-700 text-white shadow-sm shadow-green-900/20 hover:bg-green-800' },
}

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([])
  useEffect(() => {
    push = (r) => setQueue((q) => [...q, r])
    return () => {
      push = null
    }
  }, [])
  const cur = queue[0]
  if (!cur) return null
  const close = (ok: boolean) => {
    cur.resolve(ok)
    setQueue((q) => q.slice(1))
  }
  return createPortal(<Dialog key={cur.id} req={cur} onClose={close} />, document.body)
}

function Dialog({ req, onClose }: { req: Req; onClose: (ok: boolean) => void }) {
  const tone = TONES[req.tone ?? (req.danger ? 'danger' : req.alertOnly ? 'info' : 'primary')]
  const okRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Thao tác nguy hiểm: con trỏ nằm ở "Huỷ" để lỡ Enter cũng không mất dữ liệu
    ;(req.danger || req.tone === 'danger' ? cancelRef : okRef).current?.focus()
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation() // không đóng luôn Modal nằm bên dưới
        onClose(req.alertOnly)
      }
    }
    // capture: chạy trước listener Escape của Modal
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [req, onClose])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in"
      onClick={() => onClose(req.alertOnly)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`dlg-t-${req.id}`}
        className="animate-dialog-pop w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ring-8 ${tone.badge}`}>
          <Icon name={tone.icon} className="h-6 w-6" strokeWidth={2} />
        </span>
        <h3 id={`dlg-t-${req.id}`} className="mt-4 text-base font-bold tracking-tight text-slate-900">
          {req.title}
        </h3>
        {req.message && <div className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-slate-600">{req.message}</div>}
        {req.details && req.details.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-2xl bg-slate-50 p-3 text-left text-[13px] leading-snug text-slate-700">
            {req.details.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
        <div className={`mt-5 grid gap-2 ${req.alertOnly ? '' : 'grid-cols-2'}`}>
          {!req.alertOnly && (
            <button
              ref={cancelRef}
              onClick={() => onClose(false)}
              className="cursor-pointer rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.98]"
            >
              {req.cancelText ?? 'Huỷ'}
            </button>
          )}
          <button
            ref={okRef}
            onClick={() => onClose(true)}
            className={`cursor-pointer rounded-xl px-3 py-2.5 text-sm font-semibold transition active:scale-[0.98] ${tone.btn}`}
          >
            {req.confirmText ?? (req.alertOnly ? 'Đã hiểu' : 'Đồng ý')}
          </button>
        </div>
      </div>
    </div>
  )
}
