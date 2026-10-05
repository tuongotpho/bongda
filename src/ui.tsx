import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'
import type { AppData, Member, Obligation } from './types'

export interface Ctx {
  data: AppData
  obligations: Obligation[]
  canEdit: boolean
  memberById: Map<string, Member>
  toast: (msg: string) => void
  login?: () => void
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export const name = (ctx: Ctx, id: string) => ctx.memberById.get(id)?.name ?? '(đã xoá)'

export function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  title?: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

type BtnKind = 'primary' | 'ghost' | 'danger' | 'soft'
const btnCls: Record<BtnKind, string> = {
  primary: 'bg-green-700 text-white shadow-sm shadow-green-900/20 hover:bg-green-800 disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none',
  soft: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200 hover:bg-green-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
}

export function Btn({ kind = 'primary', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  return <button {...p} className={`inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed ${btnCls[kind]} ${className}`} />
}

export const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Modal({
  title,
  onClose,
  children,
  zIndex = 'z-50',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  zIndex?: string
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const modalEl = (
    <div className={`fixed inset-0 ${zIndex} flex items-end justify-center bg-slate-900/60 backdrop-blur-sm sm:items-center`} onClick={onClose}>
      <div className="animate-sheet-up max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-3.5 backdrop-blur">
          <h3 className="min-w-0 truncate text-base font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800" aria-label="Đóng">
            <Icon name="x" className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
        <div className="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )

  if (typeof document !== 'undefined') {
    return createPortal(modalEl, document.body)
  }
  return modalEl
}

const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-800',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-violet-100 text-violet-800',
  'bg-rose-100 text-rose-800',
  'bg-teal-100 text-teal-800',
]

/** Ảnh đại diện chữ cái — màu cố định theo tên để dễ nhận ra người quen */
export function Avatar({ name, className = 'h-9 w-9 text-sm' }: { name: string; className?: string }) {
  const last = name.trim().split(/\s+/).pop() ?? '?'
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold ${AVATAR_TONES[h % AVATAR_TONES.length]} ${className}`}>
      {last[0]?.toUpperCase()}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>
}

export function PaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Đã đóng</span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Chưa đóng</span>
  )
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // trình duyệt cũ / không có quyền: dùng cách cũ
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2200)
    return () => clearTimeout(t)
  }, [msg])
  const node = msg ? (
    <div className="keep-colors pointer-events-none fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 lg:bottom-8 lg:pl-64">
      <div className="animate-fade-up flex max-w-md items-center gap-2 rounded-full bg-slate-900/95 py-2 pr-4 pl-2.5 text-sm text-white shadow-xl backdrop-blur">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-500">
          <Icon name="check" className="h-3 w-3" strokeWidth={3} />
        </span>
        {msg}
      </div>
    </div>
  ) : null
  return [node, setMsg] as const
}
