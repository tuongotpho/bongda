import { useMemo, useState } from 'react'
import { setPaid } from '../actions'
import { debtors, fmtDate, fundSummary, matchOutcome, money, personalMessage, reminderMessage } from '../logic'
import { FUND_NAMES } from '../types'
import { Btn, Card, Empty, Modal, copyText, inputCls, useApp } from '../ui'

export default function Overview({ go }: { go: (tab: string) => void }) {
  const ctx = useApp()
  const { data, obligations, canEdit, toast } = ctx
  const list = useMemo(() => debtors(data, obligations), [data, obligations])
  const fund = fundSummary(data)
  const owed = list.reduce((s, d) => s + d.total, 0)
  const [showMsg, setShowMsg] = useState(false)
  const lastMatch = [...data.matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]

  const copy = async (text: string) => toast((await copyText(text)) ? 'Đã sao chép — dán vào Zalo nhé' : 'Không sao chép được, hãy bôi đen và copy tay')

  if (!data.members.length)
    return (
      <Card title="Bắt đầu">
        <p className="text-sm text-slate-600">Chưa có thành viên nào. Thêm danh sách đội trước, sau đó chia đội và mở quỹ tháng.</p>
        <Btn className="mt-3" onClick={() => go('members')}>
          👥 Đến tab Thành viên để thêm người
        </Btn>
      </Card>
    )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {(['main', 'extra'] as const).map((f) => (
          <Stat
            key={f}
            icon={f === 'main' ? '💰' : '💧'}
            label={FUND_NAMES[f]}
            value={money(fund[f].balance)}
            tone={fund[f].balance < 0 ? 'red' : 'green'}
            sub={`Thu ${money(fund[f].income)} · Chi ${money(fund[f].spent)}`}
          />
        ))}
        <Stat icon="🧾" label="Thành viên còn thiếu" value={money(owed)} tone={owed ? 'red' : 'green'} sub={`${list.length} người`} />
        <Stat icon="⚽" label="Trận đã ghi" value={String(data.matches.length)} sub={`${data.members.filter((m) => m.active).length} thành viên`} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-3">
      <Card
        className="xl:col-span-2"
        title={`Chưa hoàn thành nghĩa vụ (${list.length})`}
        right={
          <Btn kind="soft" onClick={() => setShowMsg(true)}>
            📣 Soạn tin nhắc
          </Btn>
        }
      >
        {!list.length ? (
          <Empty>🎉 Tất cả đã đóng đủ.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {list.map((d) => (
              <li key={d.member.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 transition hover:border-red-100 hover:bg-white hover:shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-100 text-sm font-bold text-red-700">{d.member.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}</span>
                    <span className="truncate">{d.member.name}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-red-600">{money(d.total)}</span>
                    <Btn kind="ghost" className="px-2 py-1 text-xs" onClick={() => copy(personalMessage(data, d))} title="Sao chép tin nhắn riêng">
                      ✉️ Nhắn riêng
                    </Btn>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.unpaid.map((o) => (
                    <button
                      key={o.id}
                      disabled={!canEdit}
                      onClick={() => setPaid(o, true).then(() => toast(`Đã gạch: ${d.member.name} — ${o.label}`))}
                      className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700 ring-1 ring-red-200 enabled:hover:bg-green-50 enabled:hover:text-green-800 enabled:hover:ring-green-300"
                      title={canEdit ? 'Bấm để đánh dấu đã đóng' : undefined}
                    >
                      {o.label}: {money(o.amount)}
                      {canEdit && ' ✓'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canEdit && list.length > 0 && <p className="mt-2 text-xs text-slate-500">Bấm vào từng khoản để đánh dấu đã đóng.</p>}
      </Card>

      {lastMatch && (
        <Card title="Trận gần nhất" right={<Btn kind="ghost" onClick={() => go('matches')}>Xem tất cả →</Btn>}>
          <LastMatch id={lastMatch.id} />
        </Card>
      )}
      </div>

      {showMsg && (
        <Modal title="Tin nhắc cả nhóm" onClose={() => setShowMsg(false)}>
          <MessageBox text={reminderMessage(data, list)} onCopy={copy} />
        </Modal>
      )}
    </div>
  )
}

function LastMatch({ id }: { id: string }) {
  const ctx = useApp()
  const m = ctx.data.matches.find((x) => x.id === id)!
  const o = matchOutcome(m)
  if (m.charges)
    return (
      <div className="text-sm">
        <div className="text-slate-500">{fmtDate(m.date)}</div>
        <div className="mt-1 text-slate-600">Nhập từ sổ cũ — {m.charges.length} người bị phạt</div>
      </div>
    )
  return (
    <div className="text-sm">
      <div className="text-slate-500">{fmtDate(m.date)}</div>
      <div className="mt-1 text-lg font-semibold">
        Đội A {m.scoreA ?? '?'} – {m.scoreB ?? '?'} Đội B
      </div>
      <div className="text-slate-600">
        {o === 'pending' ? 'Chưa nhập tỉ số' : o === 'draw' ? 'Hoà' : `Đội ${o} thắng — đội ${o === 'A' ? 'B' : 'A'} đóng tiền phạt`}
      </div>
    </div>
  )
}

export function MessageBox({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="space-y-3">
      <textarea readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} className={`${inputCls} font-mono text-xs`} />
      <Btn className="w-full" onClick={() => onCopy(text)}>
        📋 Sao chép để dán vào Zalo
      </Btn>
    </div>
  )
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: 'red' | 'green'; icon?: string }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : 'text-slate-800'
  const bg = tone === 'red' ? 'bg-red-50' : tone === 'green' ? 'bg-green-50' : 'bg-slate-100'
  return (
    <div className="group rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_8px_24px_-12px_rgb(15_23_42/0.12)] transition hover:-translate-y-0.5 hover:shadow-lg lg:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-slate-500 lg:text-sm">{label}</div>
        {icon && <span className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${bg}`}>{icon}</span>}
      </div>
      <div className={`mt-1 text-xl font-extrabold tracking-tight lg:text-3xl ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}
