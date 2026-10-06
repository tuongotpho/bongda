import { useMemo, useState } from 'react'
import { deleteMonth, setPaid } from '../actions'
import { advanceHeld, fmtDate, fmtMonth, fundSummary, money, newId, obligationId, todayISO } from '../logic'
import { store } from '../store'
import { FUND_NAMES, type Expense, type FundId, type FundMonth, type Income } from '../types'
import { Icon } from '../icons'
import { confirmDialog } from '../dialog'
import { Btn, Card, Empty, Field, Modal, PaidBadge, inputCls, name, useApp } from '../ui'
import { PayToggle } from './Matches'

export default function Fund() {
  const { data, canEdit } = useApp()
  const fund = fundSummary(data)
  const held = advanceHeld(data)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)
  const [entry, setEntry] = useState<{ type: 'in' | 'out'; fund: FundId } | null>(null)
  const paidSet = useMemo(() => new Set(data.payments.map((p) => p.id)), [data.payments])
  const month = data.months.find((m) => m.id === openMonth)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {(['main', 'extra'] as const).map((f) => (
          <Card key={f} title={FUND_NAMES[f]} right={<span className="grid h-9 w-9 place-items-center rounded-xl bg-green-50 text-green-700"><Icon name={f === 'main' ? 'wallet' : 'drop'} className="h-5 w-5" /></span>}>
            <div className={`text-3xl font-extrabold tracking-tight ${fund[f].balance < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(fund[f].balance)}</div>
            <div className="mt-1 space-y-0.5 text-xs text-slate-600">
              <div>
                {f === 'main' ? 'Đóng quỹ tháng' : 'Tiền phạt thua'}: {money(fund[f].dues)}
              </div>
              <div>Ủng hộ / thu khác: {money(fund[f].other)}</div>
              <div>Đã chi: −{money(fund[f].spent)}</div>
            </div>
            {/* Tiền ứng chỉ liên quan quỹ phạt: hiện riêng để số tiền thủ quỹ cầm khớp với sổ */}
            {f === 'extra' && held.total > 0 && (
              <div className="mt-3 space-y-1 rounded-xl bg-sky-50 p-2.5 text-xs text-sky-900">
                <div className="flex justify-between gap-2">
                  <span>Tiền ứng đang giữ hộ ({held.people} người)</span>
                  <b>+{money(held.total)}</b>
                </div>
                <div className="flex justify-between gap-2 border-t border-sky-200 pt-1">
                  <span>Thủ quỹ cầm thực tế</span>
                  <b>{money(fund.extra.balance + held.total)}</b>
                </div>
                <p className="text-[11px] text-sky-800">Tiền ứng chưa phải tiền quỹ — vào quỹ khi bị trừ vào trận thua.</p>
              </div>
            )}
            {canEdit && (
              <div className="mt-3 flex gap-2">
                <Btn kind="soft" className="flex-1 px-2 text-xs" onClick={() => setEntry({ type: 'in', fund: f })}>
                  + Ủng hộ
                </Btn>
                <Btn kind="soft" className="flex-1 px-2 text-xs" onClick={() => setEntry({ type: 'out', fund: f })}>
                  − Ghi chi
                </Btn>
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
      <MonthsCard paidSet={paidSet} onOpen={setOpenMonth} onCreate={setCreating} />

      <Ledger />
      </div>

      {creating && <CreateMonth initial={creating} onClose={() => setCreating(null)} />}
      {month && <MonthModal mo={month} onClose={() => setOpenMonth(null)} />}
      {entry && <AddEntry {...entry} onClose={() => setEntry(null)} />}
    </div>
  )
}

/** Năm đang xem ‹ 2026 › — chỉ đi qua các năm có dữ liệu (và năm nay) */
// Hai thẻ "Quỹ tháng" và "Sổ thu – chi" đứng cạnh nhau: dùng chung cỡ dòng và chân thẻ để cao bằng nhau
const ROW = 'h-[52px]'
const FOOT = 'mt-2 flex h-11 items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs'

function YearPicker({ years, year, onChange }: { years: number[]; year: number; onChange: (y: number) => void }) {
  const i = years.indexOf(year)
  const arrow = 'grid h-7 w-7 cursor-pointer place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent'
  return (
    <div className="flex items-center gap-0.5 rounded-xl bg-slate-50 p-0.5 ring-1 ring-slate-200/70">
      <button className={arrow} disabled={i <= 0} onClick={() => onChange(years[i - 1])} aria-label="Năm trước">
        <Icon name="chevron" className="h-4 w-4 rotate-180" strokeWidth={2.2} />
      </button>
      <span className="min-w-[3rem] text-center text-sm font-bold tabular-nums text-slate-800">{year}</span>
      <button className={arrow} disabled={i >= years.length - 1} onClick={() => onChange(years[i + 1])} aria-label="Năm sau">
        <Icon name="chevron" className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  )
}

function MonthsCard({
  paidSet,
  onOpen,
  onCreate,
}: {
  paidSet: Set<string>
  onOpen: (id: string) => void
  onCreate: (ym: string) => void
}) {
  const { data, canEdit } = useApp()
  const thisYear = Number(todayISO().slice(0, 4))
  const thisYm = todayISO().slice(0, 7)
  const years = useMemo(
    () => [...new Set([thisYear, ...data.months.map((m) => Number(m.id.slice(0, 4)))])].sort((a, b) => a - b),
    [data.months, thisYear],
  )
  const [year, setYear] = useState(thisYear)
  const byId = new Map(data.months.map((m) => [m.id, m]))
  const slots = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const opened = slots.filter((id) => byId.has(id)).length
  const expected = slots.reduce((s, id) => s + Object.values(byId.get(id)?.amounts ?? {}).reduce((a, n) => a + n, 0), 0)
  const collected = data.payments
    .filter((p) => p.kind === 'monthly' && p.refId.startsWith(`${year}-`))
    .reduce((s, p) => s + p.amount, 0)

  return (
    <Card
      title="Quỹ tháng"
      subtitle={`Đã mở ${opened}/12 tháng`}
      right={
        <>
          <YearPicker years={years} year={year} onChange={setYear} />
          {canEdit && (
            <Btn kind="soft" className="px-2.5" onClick={() => onCreate(thisYm)} aria-label="Mở quỹ tháng">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
            </Btn>
          )}
        </>
      }
    >
      <ul className="divide-y divide-slate-100">
        {slots.map((id) => {
          const mo = byId.get(id)
          const label = `Tháng ${Number(id.slice(5))}`
          const isNow = id === thisYm
          if (!mo) {
            return (
              <li key={id} className={`${ROW} flex items-center justify-between gap-2 text-sm`}>
                <span className={`font-medium ${id > thisYm ? 'text-slate-300' : 'text-slate-400'}`}>
                  {label}
                  {isNow && <span className="ml-1.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Tháng này</span>}
                </span>
                {canEdit && id <= thisYm ? (
                  <button onClick={() => onCreate(id)} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-green-700 transition hover:bg-green-50">
                    + Mở quỹ
                  </button>
                ) : (
                  <span className="text-xs text-slate-300">Chưa mở</span>
                )}
              </li>
            )
          }
          const ids = Object.keys(mo.amounts)
          const paid = ids.filter((m) => paidSet.has(obligationId('monthly', mo.id, m))).length
          const pct = ids.length ? Math.round((paid / ids.length) * 100) : 100
          const done = paid === ids.length
          return (
            <li key={id} className={ROW}>
              <button onClick={() => onOpen(id)} className="-mx-2 flex h-full w-[calc(100%+1rem)] cursor-pointer flex-col justify-center rounded-xl px-2 text-left transition hover:bg-slate-50">
                <div className="flex w-full justify-between text-sm">
                  <span className="font-semibold text-slate-800">
                    {label}
                    {isNow && <span className="ml-1.5 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">Tháng này</span>}
                  </span>
                  <span className={`text-xs font-medium ${done ? 'text-green-700' : 'text-red-600'}`}>
                    {done ? 'Đủ ' : ''}
                    {paid}/{ids.length} đã đóng
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${done ? 'bg-green-600' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      <div className={FOOT}>
        <span className="text-slate-500">Cả năm {year}</span>
        <span className="text-slate-600">
          Đã thu <b className="text-green-700">{money(collected)}</b> / {money(expected)}
        </span>
      </div>
    </Card>
  )
}

function CreateMonth({ initial, onClose }: { initial: string; onClose: () => void }) {
  const { data, toast } = useApp()
  const [ym, setYm] = useState(initial)
  const active = data.members.filter((m) => m.active && m.monthlyFee > 0)
  const total = active.reduce((s, m) => s + m.monthlyFee, 0)
  const create = async () => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return toast('Chọn tháng cần mở quỹ')
    if (data.months.some((m) => m.id === ym)) return toast(`${fmtMonth(ym)} đã mở rồi`)
    const mo: FundMonth = { id: ym, amounts: Object.fromEntries(active.map((m) => [m.id, m.monthlyFee])), createdAt: Date.now() }
    await store.put('months', ym, mo)
    toast(`Đã mở quỹ ${fmtMonth(ym)} cho ${active.length} người`)
    onClose()
  }
  return (
    <Modal title="Mở quỹ tháng" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tháng">
          <input type="month" value={ym} onChange={(e) => setYm(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-sm text-slate-600">
          Áp dụng cho {active.length} thành viên đang hoạt động, mỗi người theo <b>mức đóng riêng</b> (sửa ở tab Thành viên). Dự kiến thu{' '}
          <b>{money(total)}</b>. Ai được miễn thì bỏ tên trong chi tiết tháng sau khi mở.
        </p>
        <Btn className="w-full" onClick={create} disabled={!active.length}>
          Mở quỹ
        </Btn>
      </div>
    </Modal>
  )
}

function MonthModal({ mo, onClose }: { mo: FundMonth; onClose: () => void }) {
  const ctx = useApp()
  const { data, obligations, canEdit, toast } = ctx
  const obs = obligations.filter((o) => o.kind === 'monthly' && o.refId === mo.id)
  const notIn = data.members.filter((m) => m.active && !(m.id in mo.amounts))
  const paidAmount = new Map(data.payments.filter((p) => p.kind === 'monthly' && p.refId === mo.id).map((p) => [p.memberId, p]))
  const collected = [...paidAmount.values()].reduce((s, p) => s + p.amount, 0)
  const expected = Object.values(mo.amounts).reduce((s, n) => s + n, 0)

  const exempt = async (memberId: string) => {
    const ob = obs.find((o) => o.memberId === memberId)
    if (
      ob?.paid &&
      !(await confirmDialog({
        title: `Miễn quỹ cho ${name(ctx, memberId)}?`,
        message: 'Người này đã đóng tiền tháng này. Miễn sẽ xoá khoản đã thu khỏi sổ.',
        confirmText: 'Miễn',
        tone: 'warning',
      }))
    )
      return
    const amounts = { ...mo.amounts }
    delete amounts[memberId]
    await store.put('months', mo.id, { ...mo, amounts })
    if (ob?.paid) await store.remove('payments', ob.id)
  }
  const add = (memberId: string) =>
    store.put('months', mo.id, { ...mo, amounts: { ...mo.amounts, [memberId]: ctx.memberById.get(memberId)?.monthlyFee ?? data.settings.monthlyFee } })
  const del = async () => {
    if (
      !(await confirmDialog({
        title: `Xoá quỹ ${fmtMonth(mo.id)}?`,
        message: 'Mọi khoản đã thu của tháng này sẽ bị xoá khỏi sổ. Không hoàn tác được.',
        confirmText: 'Xoá quỹ',
        danger: true,
      }))
    )
      return
    await deleteMonth(mo.id, data.payments)
    onClose()
    toast('Đã xoá')
  }

  return (
    <Modal title={`Quỹ ${fmtMonth(mo.id)}`} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-600">
        Đã thu {money(collected)} / dự kiến {money(expected)}
      </p>
      <ul className="divide-y divide-slate-100 text-sm">
        {[...obs]
          .sort((a, b) => Number(a.paid) - Number(b.paid) || name(ctx, a.memberId).localeCompare(name(ctx, b.memberId), 'vi'))
          .map((o) => {
            const p = paidAmount.get(o.memberId)
            return (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div>{name(ctx, o.memberId)}</div>
                  <div className="text-xs text-slate-500">
                    Mức {money(o.amount)}
                    {p && p.amount !== o.amount && ` · nộp ${money(p.amount)}`}
                    {p?.note && ` · ${p.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {canEdit ? (
                    <>
                      <PayToggle paid={o.paid} onChange={(v) => setPaid(o, v)} />
                      <Btn kind="ghost" className="px-2 py-1 text-xs" onClick={() => exempt(o.memberId)} title="Miễn đóng tháng này">
                        Miễn
                      </Btn>
                    </>
                  ) : (
                    <PaidBadge paid={o.paid} />
                  )}
                </div>
              </li>
            )
          })}
      </ul>
      {canEdit && notIn.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs text-slate-500">Chưa có trong tháng này (thành viên mới / đã miễn):</div>
          <div className="flex flex-wrap gap-1.5">
            {notIn.map((m) => (
              <button key={m.id} onClick={() => add(m.id)} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs hover:bg-green-100">
                + {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {canEdit && (
        <Btn kind="danger" className="mt-4 w-full" onClick={del}>
          Xoá quỹ tháng này
        </Btn>
      )}
    </Modal>
  )
}

type Row = { kind: 'in'; x: Income } | { kind: 'out'; x: Expense }

// Thu gọn: cao ngang 12 dòng của "Quỹ tháng"; mở rộng: gấp đôi
const PAGE_COMPACT = 12
const PAGE_EXPANDED = 24

function Ledger() {
  const { data, canEdit } = useApp()
  const [filter, setFilter] = useState<FundId | 'all'>('all')
  const [expanded, setExpanded] = useState(false)
  const [page, setPage] = useState(0)
  const rows: Row[] = [...data.incomes.map((x) => ({ kind: 'in' as const, x })), ...data.expenses.map((x) => ({ kind: 'out' as const, x }))]
    .filter((r) => filter === 'all' || r.x.fund === filter)
    .sort((a, b) => b.x.date.localeCompare(a.x.date) || b.x.createdAt - a.x.createdAt)
  const size = expanded ? PAGE_EXPANDED : PAGE_COMPACT
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages - 1) // xoá dòng cuối của trang cuối thì lùi về trang trước
  const shown = rows.slice(cur * size, (cur + 1) * size)
  const totalIn = rows.reduce((s, r) => s + (r.kind === 'in' ? r.x.amount : 0), 0)
  const totalOut = rows.reduce((s, r) => s + (r.kind === 'out' ? r.x.amount : 0), 0)

  const pick = (f: FundId | 'all') => {
    setFilter(f)
    setPage(0)
  }
  const toggle = () => {
    // giữ dòng đầu trang đang xem khi đổi cỡ trang
    setPage(Math.floor((cur * size) / (expanded ? PAGE_COMPACT : PAGE_EXPANDED)))
    setExpanded(!expanded)
  }
  const arrow = 'grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <Card
      title="Sổ thu – chi"
      subtitle={
        rows.length ? (
          <>
            <span className="font-medium text-green-700">+{money(totalIn)}</span> · <span className="font-medium text-red-600">−{money(totalOut)}</span>
          </>
        ) : (
          'Chưa có khoản nào'
        )
      }
      right={
        <div className="flex gap-1 text-xs">
          {(['all', 'main', 'extra'] as const).map((f) => (
            <button key={f} onClick={() => pick(f)} className={`cursor-pointer rounded-full px-2.5 py-1 ${filter === f ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {f === 'all' ? 'Tất cả' : FUND_NAMES[f]}
            </button>
          ))}
        </div>
      }
    >
      {!rows.length ? (
        <Empty>Chưa có khoản ủng hộ hay khoản chi nào.</Empty>
      ) : (
        <>
        {/* trang cuối ít dòng vẫn giữ nguyên chiều cao để thanh chia trang không nhảy */}
        <ul className="divide-y divide-slate-100 text-sm" style={pages > 1 ? { minHeight: size * 52 } : undefined}>
          {shown.map((r) => (
            <li key={r.x.id} className={`${ROW} flex items-center justify-between gap-2`}>
              <div className="min-w-0">
                <div className="truncate">{r.x.note}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(r.x.date)}
                  {r.x.by && ` · ${r.x.by}`} · {FUND_NAMES[r.x.fund]}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`font-medium ${r.kind === 'in' ? 'text-green-700' : 'text-red-600'}`}>
                  {r.kind === 'in' ? '+' : '−'}
                  {money(r.x.amount)}
                </span>
                {canEdit && (
                  <Btn
                    kind="danger"
                    className="px-2 py-1 text-xs"
                    onClick={async () =>
                      (await confirmDialog({
                        title: `Xoá khoản ${r.kind === 'in' ? 'ủng hộ' : 'chi'}?`,
                        message: `"${r.x.note}" · ${money(r.x.amount)}`,
                        confirmText: 'Xoá',
                        danger: true,
                      })) && store.remove(r.kind === 'in' ? 'incomes' : 'expenses', r.x.id)
                    }
                  >
                    Xoá
                  </Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
        <div className={FOOT}>
          <span className="text-slate-500">
            {cur * size + 1}–{cur * size + shown.length} / {rows.length} khoản
          </span>
          <div className="flex items-center gap-1">
            {pages > 1 && (
              <>
                <button className={arrow} disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Trang trước">
                  <Icon name="chevron" className="h-4 w-4 rotate-180" strokeWidth={2.2} />
                </button>
                <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-slate-700">
                  {cur + 1} / {pages}
                </span>
                <button className={arrow} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Trang sau">
                  <Icon name="chevron" className="h-4 w-4" strokeWidth={2.2} />
                </button>
              </>
            )}
            {rows.length > PAGE_COMPACT && (
              <button onClick={toggle} className="ml-1 cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-green-700 transition hover:bg-green-50">
                {expanded ? 'Thu gọn' : 'Mở rộng'}
                <Icon name="chevron" className={`ml-0.5 inline h-3.5 w-3.5 ${expanded ? '-rotate-90' : 'rotate-90'}`} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
        </>
      )}
    </Card>
  )
}

function AddEntry({ type, fund: initialFund, onClose }: { type: 'in' | 'out'; fund: FundId; onClose: () => void }) {
  const { toast } = useApp()
  const [date, setDate] = useState(todayISO())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [by, setBy] = useState('')
  const [fund, setFund] = useState<FundId>(initialFund)
  const save = async () => {
    const n = Number(amount)
    if (!(n > 0) || !note.trim()) return toast('Nhập số tiền và nội dung')
    if (type === 'in' && !by.trim()) return toast('Nhập tên người ủng hộ')
    const base = { id: newId(), date, amount: n, note: note.trim(), fund, createdAt: Date.now() }
    if (type === 'in') await store.put('incomes', base.id, { ...base, by: by.trim() } satisfies Income)
    else await store.put('expenses', base.id, { ...base, by: by.trim() || undefined } satisfies Expense)
    toast(type === 'in' ? 'Đã ghi khoản ủng hộ' : 'Đã ghi khoản chi')
    onClose()
  }
  return (
    <Modal title={type === 'in' ? 'Ghi khoản ủng hộ' : 'Ghi khoản chi'} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Vào quỹ">
          <select value={fund} onChange={(e) => setFund(e.target.value as FundId)} className={inputCls}>
            <option value="main">{FUND_NAMES.main}</option>
            <option value="extra">{FUND_NAMES.extra}</option>
          </select>
        </Field>
        <Field label="Nội dung">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
            placeholder={type === 'in' ? 'Ủng hộ mua bóng…' : 'Trả tiền sân, mua chuối, mua nước…'}
            autoFocus
          />
        </Field>
        <Field label={type === 'in' ? 'Người ủng hộ' : 'Người chi (không bắt buộc)'}>
          <input value={by} onChange={(e) => setBy(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Số tiền (đồng)">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} className={inputCls} />
          </Field>
          <Field label="Ngày">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {Number(amount) > 0 && <p className="text-sm text-slate-600">= {money(Number(amount))}</p>}
        <Btn className="w-full" onClick={save}>
          Lưu
        </Btn>
      </div>
    </Modal>
  )
}
