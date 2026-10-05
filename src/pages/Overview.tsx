import { useMemo, useState } from 'react'
import { setPaid } from '../actions'
import { debtors, fmtDate, fundSummary, getMemberAdvanceInfo, getPenaltyWinner, isPenaltyDecided, matchOutcome, money, personalMessage, reminderMessage } from '../logic'
import { Icon, type IconName } from '../icons'
import { FUND_NAMES } from '../types'
import { Avatar, Btn, Card, Empty, Modal, copyText, inputCls, useApp } from '../ui'

/** Số người nợ hiện sẵn — còn lại bấm "Xem thêm" */
const PREVIEW = 6

export default function Overview({ go }: { go: (tab: string) => void }) {
  const ctx = useApp()
  const { data, obligations, canEdit, toast } = ctx
  const list = useMemo(() => debtors(data, obligations), [data, obligations])
  const fund = fundSummary(data)
  const owed = list.reduce((s, d) => s + d.total, 0)
  const [showMsg, setShowMsg] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const lastMatch = [...data.matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)[0]

  const advanceStats = useMemo(() => {
    let total = 0
    let remaining = 0
    let count = 0
    for (const m of data.members) {
      if (m.advanceAmount && m.advanceAmount > 0) {
        const info = getMemberAdvanceInfo(m, data.payments)
        total += info.total
        remaining += info.remaining
        count++
      }
    }
    return { total, remaining, count }
  }, [data.members, data.payments])

  const copy = async (text: string) => toast((await copyText(text)) ? 'Đã sao chép — dán vào Zalo nhé' : 'Không sao chép được, hãy bôi đen và copy tay')

  if (!data.members.length)
    return (
      <Card title="Bắt đầu">
        <p className="text-sm text-slate-600">Chưa có thành viên nào. Thêm danh sách đội trước, sau đó chia đội và mở quỹ tháng.</p>
        <Btn className="mt-3" onClick={() => go('members')}>
          Đến tab Thành viên để thêm người
        </Btn>
      </Card>
    )

  const shown = showAll ? list : list.slice(0, PREVIEW)

  return (
    <div className="space-y-5 lg:space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {(['main', 'extra'] as const).map((f) => (
          <Stat
            key={f}
            icon={f === 'main' ? 'wallet' : 'drop'}
            label={FUND_NAMES[f]}
            value={money(fund[f].balance)}
            tone={fund[f].balance < 0 ? 'red' : 'green'}
            sub={`Thu ${money(fund[f].income)} · Chi ${money(fund[f].spent)}`}
          />
        ))}
        <Stat icon="receipt" label="Còn thiếu" value={money(owed)} tone={owed ? 'red' : 'green'} sub={`${list.length} người chưa đóng đủ`} />
        <Stat icon="ball" label="Trận đã ghi" value={String(data.matches.length)} sub={`${data.members.filter((m) => m.active).length} thành viên đang đá`} />
      </div>

      {advanceStats.count > 0 && (
        <button
          type="button"
          onClick={() => go('members')}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3 text-left transition hover:bg-sky-100/70"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sky-600 ring-1 ring-sky-200">
            <Icon name="coins" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium text-sky-800">Tiền ứng trước của anh em</span>
            <span className="block text-sm text-sky-950">
              <b className="text-base">{money(advanceStats.remaining)}</b> còn dư
              <span className="text-sky-700"> · đã ứng {money(advanceStats.total)} · {advanceStats.count} người</span>
            </span>
          </span>
          <Icon name="chevron" className="h-4 w-4 shrink-0 text-sky-500" />
        </button>
      )}

      <div className="grid items-start gap-5 lg:gap-6 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Chưa đóng đủ"
          subtitle={list.length ? `${list.length} người · tổng ${money(owed)}` : undefined}
          right={
            list.length > 0 && (
              <Btn kind="soft" className="px-2.5 py-1.5 text-xs" onClick={() => setShowMsg(true)}>
                <Icon name="send" className="h-3.5 w-3.5" /> Soạn tin nhắc nhóm
              </Btn>
            )
          }
        >
          {!list.length ? (
            <Empty>🎉 Tất cả đã đóng đủ.</Empty>
          ) : (
            <>
              <ul className="-mx-1 divide-y divide-slate-100">
                {shown.map((d) => (
                  <li key={d.member.id} className="flex items-start gap-3 rounded-xl px-1 py-3">
                    <Avatar name={d.member.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-slate-900">{d.member.name}</span>
                        <span className="shrink-0 font-bold text-red-600">{money(d.total)}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {d.unpaid.map((o) => (
                          <button
                            key={o.id}
                            disabled={!canEdit}
                            onClick={() => setPaid(o, true).then(() => toast(`Đã gạch: ${d.member.name} — ${o.label}`))}
                            className="group inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs text-slate-700 enabled:cursor-pointer enabled:hover:bg-green-100 enabled:hover:text-green-800"
                            title={canEdit ? 'Bấm để đánh dấu đã đóng' : undefined}
                          >
                            {o.label} · {money(o.amount)}
                            {canEdit && <Icon name="check" className="h-3 w-3 text-slate-400 group-hover:text-green-700" strokeWidth={2.5} />}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => copy(personalMessage(data, d))}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-medium text-green-700 hover:bg-green-50"
                          title="Sao chép tin nhắn riêng để gửi Zalo"
                        >
                          <Icon name="message" className="h-3.5 w-3.5" /> Nhắn riêng
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {list.length > PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="mt-2 w-full cursor-pointer rounded-xl bg-slate-50 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {showAll ? 'Thu gọn' : `Xem thêm ${list.length - PREVIEW} người`}
                </button>
              )}
              {canEdit && <p className="mt-3 text-xs text-slate-500">Bấm vào từng khoản để đánh dấu đã đóng.</p>}
            </>
          )}
        </Card>

        {lastMatch && (
          <Card
            title="Trận gần nhất"
            right={
              <Btn kind="ghost" className="px-2 py-1 text-xs" onClick={() => go('matches')}>
                Xem tất cả <Icon name="chevron" className="h-3.5 w-3.5" />
              </Btn>
            }
          >
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
  const side = (k: 'A' | 'B', score: number | null) => (
    <div className={`flex flex-1 flex-col items-center gap-1 ${o !== 'pending' && o !== k && o !== 'draw' ? 'opacity-50' : ''}`}>
      <span className={`h-2 w-8 rounded-full ${k === 'A' ? 'bg-sky-500' : 'bg-orange-500'}`} />
      <span className="text-xs font-semibold text-slate-600">Đội {k}</span>
      <span className="text-4xl font-black text-slate-900">{score ?? '–'}</span>
    </div>
  )
  return (
    <div className="text-sm">
      <div className="text-center text-xs font-medium text-slate-500">{fmtDate(m.date)}</div>
      <div className="mt-2 flex items-center rounded-2xl bg-slate-50 px-2 py-3">
        {side('A', m.scoreA)}
        <span className="text-xl font-bold text-slate-300">:</span>
        {side('B', m.scoreB)}
      </div>
      {isPenaltyDecided(m) && (
        <div className="mt-2 text-center">
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
            {m.penaltyScoreA != null && m.penaltyScoreB != null
              ? `Pen ${m.penaltyScoreA}–${m.penaltyScoreB} · Đội ${getPenaltyWinner(m)} thắng`
              : `Pen: Đội ${getPenaltyWinner(m)} thắng`}
          </span>
        </div>
      )}
      <div className="mt-2 text-center text-slate-600">
        {o === 'pending'
          ? 'Chưa nhập tỉ số'
          : isPenaltyDecided(m)
            ? `Hoà tỉ số (${m.scoreA}-${m.scoreB}) — Đội ${o} thắng luân lưu (Đội ${o === 'A' ? 'B' : 'A'} nộp tiền phạt)`
            : o === 'draw'
              ? 'Hoà'
              : `Đội ${o} thắng — đội ${o === 'A' ? 'B' : 'A'} đóng tiền phạt`}
      </div>
    </div>
  )
}

export function MessageBox({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="space-y-3">
      <textarea readOnly value={text} rows={Math.min(14, text.split('\n').length + 1)} className={`${inputCls} font-mono text-xs`} />
      <Btn className="w-full" onClick={() => onCopy(text)}>
        <Icon name="copy" className="h-4 w-4" /> Sao chép để dán vào Zalo
      </Btn>
    </div>
  )
}

function Stat({ label, value, sub, tone, icon }: { label: string; value: string; sub?: string; tone?: 'red' | 'green'; icon: IconName }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : 'text-slate-900'
  const chip = tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'green' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] lg:p-5">
      <div className="flex items-center gap-2">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg lg:h-8 lg:w-8 ${chip}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="line-clamp-2 text-xs leading-tight font-medium text-slate-500 lg:text-sm">{label}</div>
      </div>
      <div className={`mt-2 truncate text-xl font-extrabold tracking-tight lg:text-[28px] ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-slate-500 lg:text-xs">{sub}</div>}
    </div>
  )
}
