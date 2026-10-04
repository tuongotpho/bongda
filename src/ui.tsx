import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AppData, Member, Obligation } from './types'

export interface Ctx {
  data: AppData
  obligations: Obligation[]
  canEdit: boolean
  memberById: Map<string, Member>
  toast: (msg: string) => void
}

export const AppCtx = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(AppCtx)

export const name = (ctx: Ctx, id: string) => ctx.memberById.get(id)?.name ?? '(đã xoá)'

export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/90 p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(15_23_42/0.12)] backdrop-blur ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold tracking-tight text-slate-800">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

type BtnKind = 'primary' | 'ghost' | 'danger' | 'soft'
const btnCls: Record<BtnKind, string> = {
  primary: 'bg-gradient-to-r from-green-700 to-emerald-600 text-white shadow-sm shadow-green-900/20 hover:from-green-800 hover:to-emerald-700 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none',
  soft: 'bg-green-50 text-green-800 ring-1 ring-green-200 hover:bg-green-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'text-red-600 hover:bg-red-50',
}

export function Btn({ kind = 'primary', className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  return <button {...p} className={`rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${btnCls[kind]} ${className}`} />
}

export const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/20'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="animate-fade-up max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 text-2xl leading-none text-slate-400 hover:text-slate-700" aria-label="Đóng">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
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
    <div className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8 lg:pl-64">
      <div className="animate-fade-up rounded-xl bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{msg}</div>
    </div>
  ) : null
  return [node, setMsg] as const
}
