import { useMemo, useState } from 'react'
import { deleteMonth, setPaid } from '../actions'
import { fmtDate, fmtMonth, fundSummary, money, newId, obligationId, todayISO } from '../logic'
import { store } from '../store'
import { FUND_NAMES, type Expense, type FundId, type FundMonth, type Income } from '../types'
import { Btn, Card, Empty, Field, Modal, PaidBadge, inputCls, name, useApp } from '../ui'
import { PayToggle } from './Matches'

export default function Fund() {
  const { data, canEdit } = useApp()
  const fund = fundSummary(data)
  const months = useMemo(() => [...data.months].sort((a, b) => b.id.localeCompare(a.id)), [data.months])
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [entry, setEntry] = useState<{ type: 'in' | 'out'; fund: FundId } | null>(null)
  const paidSet = useMemo(() => new Set(data.payments.map((p) => p.id)), [data.payments])
  const month = data.months.find((m) => m.id === openMonth)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:gap-6">
        {(['main', 'extra'] as const).map((f) => (
          <Card key={f} title={FUND_NAMES[f]} right={<span className="grid h-10 w-10 place-items-center rounded-2xl bg-green-50 text-xl">{f === 'main' ? '💰' : '💧'}</span>}>
            <div className={`text-3xl font-extrabold tracking-tight ${fund[f].balance < 0 ? 'text-red-600' : 'text-green-700'}`}>{money(fund[f].balance)}</div>
            <div className="mt-1 space-y-0.5 text-xs text-slate-600">
              <div>
                {f === 'main' ? 'Đóng quỹ tháng' : 'Tiền phạt thua'}: {money(fund[f].dues)}
              </div>
              <div>Ủng hộ / thu khác: {money(fund[f].other)}</div>
              <div>Đã chi: −{money(fund[f].spent)}</div>
            </div>
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
      <Card title="Quỹ tháng" right={canEdit && <Btn kind="soft" onClick={() => setCreating(true)}>+ Mở quỹ tháng</Btn>}>
        {!months.length ? (
          <Empty>Chưa mở quỹ tháng nào.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {months.map((mo) => {
              const ids = Object.keys(mo.amounts)
              const paid = ids.filter((id) => paidSet.has(obligationId('monthly', mo.id, id))).length
              const pct = ids.length ? Math.round((paid / ids.length) * 100) : 100
              return (
                <li key={mo.id}>
                  <button onClick={() => setOpenMonth(mo.id)} className="-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 py-3 text-left transition hover:bg-slate-50">
                    <div className="flex justify-between text-sm">
                      <span className="font-semibold">{fmtMonth(mo.id)}</span>
                      <span className={paid === ids.length ? 'text-green-700' : 'text-red-600'}>
                        {paid}/{ids.length} đã đóng
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card title="Sổ thu – chi">
        <Ledger />
      </Card>
      </div>

      {creating && <CreateMonth onClose={() => setCreating(false)} />}
      {month && <MonthModal mo={month} onClose={() => setOpenMonth(null)} />}
      {entry && <AddEntry {...entry} onClose={() => setEntry(null)} />}
    </div>
  )
}

function CreateMonth({ onClose }: { onClose: () => void }) {
  const { data, toast } = useApp()
  const [ym, setYm] = useState(todayISO().slice(0, 7))
  const active = data.members.filter((m) => m.active && m.monthlyFee > 0)
  const total = active.reduce((s, m) => s + m.monthlyFee, 0)
  const create = async () => {
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
    if (ob?.paid && !confirm('Người này đã đóng. Miễn sẽ xoá khoản đã thu khỏi sổ. Tiếp tục?')) return
    const amounts = { ...mo.amounts }
    delete amounts[memberId]
    await store.put('months', mo.id, { ...mo, amounts })
    if (ob?.paid) await store.remove('payments', ob.id)
  }
  const add = (memberId: string) =>
    store.put('months', mo.id, { ...mo, amounts: { ...mo.amounts, [memberId]: ctx.memberById.get(memberId)?.monthlyFee ?? data.settings.monthlyFee } })
  const del = async () => {
    if (!confirm(`Xoá quỹ ${fmtMonth(mo.id)}? Mọi khoản đã thu của tháng này sẽ bị xoá khỏi sổ.`)) return
    await deleteMonth(mo.id, Object.keys(mo.amounts))
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

function Ledger() {
  const { data, canEdit } = useApp()
  const [filter, setFilter] = useState<FundId | 'all'>('all')
  const rows: Row[] = [...data.incomes.map((x) => ({ kind: 'in' as const, x })), ...data.expenses.map((x) => ({ kind: 'out' as const, x }))]
    .filter((r) => filter === 'all' || r.x.fund === filter)
    .sort((a, b) => b.x.date.localeCompare(a.x.date) || b.x.createdAt - a.x.createdAt)

  return (
    <>
      <div className="mb-2 flex gap-1 text-xs">
        {(['all', 'main', 'extra'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 ${filter === f ? 'bg-green-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
            {f === 'all' ? 'Tất cả' : FUND_NAMES[f]}
          </button>
        ))}
      </div>
      {!rows.length ? (
        <Empty>Chưa có khoản ủng hộ hay khoản chi nào.</Empty>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <li key={r.x.id} className="flex items-center justify-between gap-2 py-2">
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
                    onClick={() => confirm(`Xoá "${r.x.note}"?`) && store.remove(r.kind === 'in' ? 'incomes' : 'expenses', r.x.id)}
                  >
                    Xoá
                  </Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
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
