import { useMemo, useState } from 'react'
import { deleteMatch, setPaid } from '../actions'
import { fmtDate, matchOutcome, money } from '../logic'
import { store } from '../store'
import type { Match } from '../types'
import { Btn, Card, Field, Modal, PaidBadge, copyText, inputCls, name, useApp } from '../ui'

export default function Matches({ go }: { go: (tab: string, id?: string) => void }) {
  const ctx = useApp()
  const { data, obligations, canEdit } = ctx
  const [openId, setOpenId] = useState<string | null>(null)
  const sorted = useMemo(
    () => [...data.matches].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [data.matches],
  )
  const open = data.matches.find((m) => m.id === openId)

  const record = useMemo(() => {
    let a = 0,
      b = 0,
      d = 0
    for (const m of data.matches) {
      const o = matchOutcome(m)
      if (o === 'A') a++
      else if (o === 'B') b++
      else if (o === 'draw') d++
    }
    return { a, b, d }
  }, [data.matches])

  return (
    <div className="space-y-6">
      <Card
        title={
          <div className="flex flex-wrap items-baseline gap-2">
            <span>Lịch sử các trận đấu</span>
            <span className="text-xs font-normal text-slate-500">
              ({data.matches.length} trận · Đội A thắng {record.a} · Đội B thắng {record.b} · Hoà {record.d})
            </span>
          </div>
        }
        right={
          canEdit && (
            <Btn kind="soft" onClick={() => go('split')} className="px-3 py-1.5 text-xs">
              + Chia đội trận mới
            </Btn>
          )
        }
      >
        {!sorted.length ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-green-50 text-3xl">⚽</div>
            <h3 className="text-base font-bold text-slate-800">Chưa có trận đấu nào</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Vào tab "Chia đội" để xếp 2 đội hình cho trận đấu đầu tiên.
            </p>
            <div className="mt-4">
              <Btn onClick={() => go('split')}>🎲 Chia đội ngay</Btn>
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((m) => {
              const o = matchOutcome(m)
              const obs = obligations.filter((x) => x.kind === 'water' && x.refId === m.id)
              const unpaid = obs.filter((x) => !x.paid).length
              return (
                <li key={m.id}>
                  <button
                    onClick={() => setOpenId(m.id)}
                    className="flex h-full w-full flex-col justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-green-300 hover:bg-white hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">📅 {fmtDate(m.date)}</span>
                        {o === 'pending' && !m.charges ? (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                            Chưa có tỉ số
                          </span>
                        ) : o === 'draw' ? (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-700">
                            Hoà
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 font-bold text-green-800">
                            Đội {o} thắng 🏆
                          </span>
                        )}
                      </div>

                      <div className="mt-2 text-xl font-black tracking-tight text-slate-900">
                        {m.charges ? (
                          <span className="text-sm font-medium text-slate-600">
                            Sổ cũ · {m.charges.length} người bị phạt
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <span className="text-sky-700">🟦 {m.scoreA ?? '?'}</span>
                            <span className="text-slate-400">–</span>
                            <span className="text-orange-700">{m.scoreB ?? '?'} 🟧</span>
                          </span>
                        )}
                      </div>

                      {!m.charges && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl bg-white/80 p-2 text-[11px] text-slate-600 ring-1 ring-slate-100">
                          <div className="truncate font-medium text-sky-800">
                            🟦 A ({m.teamA.length}): {m.teamA.slice(0, 2).map((id) => name(ctx, id)).join(', ')}
                            {m.teamA.length > 2 && '...'}
                          </div>
                          <div className="truncate font-medium text-orange-800">
                            🟧 B ({m.teamB.length}): {m.teamB.slice(0, 2).map((id) => name(ctx, id)).join(', ')}
                            {m.teamB.length > 2 && '...'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-2 text-xs">
                      {!obs.length ? (
                        <span className="text-slate-400">Không phát sinh tiền phạt</span>
                      ) : unpaid > 0 ? (
                        <span className="font-semibold text-red-600">
                          ⚠️ {unpaid}/{obs.length} người chưa nộp phạt ({money(unpaid * m.waterFee)})
                        </span>
                      ) : (
                        <span className="font-semibold text-green-700">
                          ✓ Đã thu đủ tiền nước ({obs.length} người)
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {open && (
        <MatchModal
          m={open}
          allMatches={sorted}
          onSelectMatch={(nextM) => setOpenId(nextM.id)}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null)
            go('split', open.id)
          }}
        />
      )}
    </div>
  )
}

function MatchModal({
  m,
  allMatches,
  onSelectMatch,
  onClose,
  onEdit,
}: {
  m: Match
  allMatches: Match[]
  onSelectMatch: (m: Match) => void
  onClose: () => void
  onEdit: () => void
}) {
  const ctx = useApp()
  const { obligations, canEdit, toast } = ctx
  const [scoreA, setScoreA] = useState(m.scoreA?.toString() ?? '')
  const [scoreB, setScoreB] = useState(m.scoreB?.toString() ?? '')
  const [date] = useState(m.date)
  const [note, setNote] = useState(m.note ?? '')

  const obs = obligations.filter((x) => x.kind === 'water' && x.refId === m.id)
  const o = matchOutcome(m)
  const toNum = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.floor(Number(s))))

  const skill = (ids: string[]) => ids.reduce((s, id) => s + (ctx.memberById.get(id)?.skill ?? 3), 0)

  // Lưu tỉ số và thông tin trận
  const saveWithScores = async (a: number | null, b: number | null) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để ghi nhận kết quả.')
      return
    }
    await store.put('matches', m.id, {
      ...m,
      scoreA: a,
      scoreB: b,
      date,
      note: note.trim() || undefined,
    })
    setScoreA(a?.toString() ?? '')
    setScoreB(b?.toString() ?? '')
    toast(a != null && b != null ? `Đã lưu kết quả: ${a} – ${b}` : 'Đã xóa tỉ số trận đấu')
  }

  // Nút bấm nhanh thắng / hoà / thua
  const setQuickWinner = (winner: 'A' | 'B' | 'draw' | 'clear') => {
    if (winner === 'A') {
      const curA = toNum(scoreA) ?? 0
      const curB = toNum(scoreB) ?? 0
      const nextA = curA > curB ? curA : curB + 1
      saveWithScores(nextA, curB)
    } else if (winner === 'B') {
      const curA = toNum(scoreA) ?? 0
      const curB = toNum(scoreB) ?? 0
      const nextB = curB > curA ? curB : curA + 1
      saveWithScores(curA, nextB)
    } else if (winner === 'draw') {
      saveWithScores(1, 1)
    } else {
      saveWithScores(null, null)
    }
  }

  const handleManualSave = async () => {
    const a = toNum(scoreA)
    const b = toNum(scoreB)
    if ((a == null) !== (b == null)) return toast('Nhập đủ tỉ số cả hai đội (hoặc xóa trắng cả 2)')
    await saveWithScores(a, b)
  }

  // Thu tất cả tiền phạt của trận này trong 1 cú click
  const markAllPaid = async (paid: boolean) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để gạch nợ.')
      return
    }
    const targetObs = obs.filter((x) => x.paid !== paid)
    if (!targetObs.length) return
    for (const x of targetObs) {
      await setPaid(x, paid)
    }
    toast(paid ? `Đã gạch nợ cho toàn bộ ${targetObs.length} thành viên!` : 'Đã hủy đánh dấu đã nộp.')
  }

  const copyWaterDebtMessage = async () => {
    const unpaid = obs.filter((x) => !x.paid)
    if (!unpaid.length) {
      toast('Tất cả đã đóng đủ tiền nước trận này!')
      return
    }
    const lines = [
      `💧 TIỀN NƯỚC / PHẠT TRẬN ${fmtDate(m.date)}`,
      `Mỗi người: ${money(m.waterFee)}`,
      `Danh sách chưa đóng (${unpaid.length} người):`,
      ...unpaid.map((o) => `- ${name(ctx, o.memberId)}: ${money(o.amount)}`),
    ]
    const ok = await copyText(lines.join('\n'))
    toast(ok ? 'Đã sao chép danh sách nợ để gửi Zalo!' : 'Không sao chép được')
  }

  const del = async () => {
    const paidCount = obs.filter((x) => x.paid).length
    if (
      !confirm(
        `Xoá trận ${fmtDate(m.date)}?${
          paidCount ? `\n${paidCount} khoản tiền phạt đã thu của trận này cũng sẽ bị xoá khỏi sổ quỹ.` : ''
        }`,
      )
    )
      return
    await deleteMatch(m.id, [...m.teamA, ...m.teamB])
    onClose()
    toast('Đã xoá trận')
  }

  const unpaidCount = obs.filter((x) => !x.paid).length

  return (
    <Modal title={`Chi tiết trận ngày ${fmtDate(m.date)}`} onClose={onClose}>
      <div className="space-y-5">
        {/* Thanh chọn trận khác */}
        {allMatches.length > 1 && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 text-xs text-slate-600">
            <span className="font-semibold">Xem trận khác:</span>
            <select
              value={m.id}
              onChange={(e) => {
                const found = allMatches.find((x) => x.id === e.target.value)
                if (found) onSelectMatch(found)
              }}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              {allMatches.map((match) => (
                <option key={match.id} value={match.id}>
                  {fmtDate(match.date)} — {match.teamA.length + match.teamB.length} người{' '}
                  {match.scoreA != null ? `(${match.scoreA} - ${match.scoreB})` : '(chưa có tỉ số)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 1. HIỂN THỊ ĐỘI HÌNH 2 ĐỘI TRỰC QUAN */}
        {!m.charges ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>ĐỘI HÌNH 2 ĐỘI ĐÃ CHIA:</span>
              <span className="font-normal text-slate-500">
                {m.teamA.length + m.teamB.length} cầu thủ tham gia
              </span>
            </div>

            {canEdit && (
              <div className="mb-3 text-right">
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-xs font-medium text-slate-500 underline hover:text-green-700"
                >
                  ✏️ Chỉnh sửa đội hình
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm">
              {(['A', 'B'] as const).map((k) => {
                const list = k === 'A' ? m.teamA : m.teamB
                const isWinner = o === k
                return (
                  <div
                    key={k}
                    className={`rounded-2xl p-3.5 shadow-xs transition ${
                      k === 'A'
                        ? isWinner
                          ? 'bg-sky-100/80 ring-2 ring-sky-400'
                          : 'bg-sky-50 ring-1 ring-sky-200'
                        : isWinner
                          ? 'bg-orange-100/80 ring-2 ring-orange-400'
                          : 'bg-orange-50 ring-1 ring-orange-200'
                    }`}
                  >
                    <div className="mb-2 flex items-baseline justify-between border-b border-black/5 pb-2 font-bold">
                      <span className={k === 'A' ? 'text-sky-900' : 'text-orange-900'}>
                        {k === 'A' ? '🟦 Đội A' : '🟧 Đội B'} {isWinner && '🏆'}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {list.length} người · {skill(list)}★
                      </span>
                    </div>

                    <ul className="space-y-1.5 text-xs">
                      {list.map((id) => {
                        const mem = ctx.memberById.get(id)
                        return (
                          <li
                            key={id}
                            className="flex items-center justify-between rounded-xl bg-white/90 px-2.5 py-1.5 font-medium shadow-xs"
                          >
                            <span className="truncate">{name(ctx, id)}</span>
                            <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                              {mem?.isGK && <span title="Thủ môn">🧤</span>}
                              <span>{'★'.repeat(mem?.skill ?? 3)}</span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="mb-3">
              Trận nhập từ sổ Google Sheet cũ — chỉ có danh sách người bị phạt, không có đội hình 2 đội.
            </p>
            {canEdit && (
              <Btn onClick={onEdit} className="text-xs py-2 px-3">
                🔄 Phân chia đội hình cho trận này
              </Btn>
            )}
          </div>
        )}

        {/* 2. CHỌN NHANH KẾT QUẢ THẮNG / THUA ĐỂ TÍNH TIỀN NƯỚC */}
        {!m.charges && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                ⚡ Chọn nhanh kết quả:
              </span>
              {o !== 'pending' && (
                <button
                  type="button"
                  onClick={() => setQuickWinner('clear')}
                  className="text-xs text-slate-500 hover:text-red-600 underline"
                >
                  Xóa kết quả
                </button>
              )}
            </div>

            {canEdit ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQuickWinner('A')}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition shadow-xs ${
                    o === 'A'
                      ? 'bg-sky-600 text-white ring-2 ring-sky-700 scale-102'
                      : 'bg-white text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50'
                  }`}
                >
                  🏆 Đội A thắng
                  <span className="block text-[10px] font-normal opacity-80">Đội B nộp phạt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickWinner('draw')}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition shadow-xs ${
                    o === 'draw'
                      ? 'bg-slate-700 text-white ring-2 ring-slate-900 scale-102'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🤝 Hoà trận
                  <span className="block text-[10px] font-normal opacity-80">Theo luật đã đặt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickWinner('B')}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition shadow-xs ${
                    o === 'B'
                      ? 'bg-orange-600 text-white ring-2 ring-orange-700 scale-102'
                      : 'bg-white text-orange-800 ring-1 ring-orange-200 hover:bg-orange-50'
                  }`}
                >
                  🏆 Đội B thắng
                  <span className="block text-[10px] font-normal opacity-80">Đội A nộp phạt</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-lg font-bold">
                {o === 'pending'
                  ? '⏳ Trận đấu chưa nhập kết quả'
                  : o === 'draw'
                    ? '🤝 Kết quả: Hoà'
                    : `🏆 Đội ${o} thắng (Đội ${o === 'A' ? 'B' : 'A'} đóng tiền phạt)`}
              </div>
            )}

            {/* Chi tiết tỉ số bàn thắng & Ghi chú */}
            {canEdit && (
              <div className="mt-3 border-t border-slate-200/60 pt-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <Field label="🟦 Bàn Đội A">
                    <input
                      inputMode="numeric"
                      value={scoreA}
                      onChange={(e) => setScoreA(e.target.value)}
                      className={`${inputCls} text-center font-bold text-base`}
                      placeholder="?"
                    />
                  </Field>
                  <span className="pb-2 text-lg font-bold text-slate-400">–</span>
                  <Field label="🟧 Bàn Đội B">
                    <input
                      inputMode="numeric"
                      value={scoreB}
                      onChange={(e) => setScoreB(e.target.value)}
                      className={`${inputCls} text-center font-bold text-base`}
                      placeholder="?"
                    />
                  </Field>
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className={inputCls}
                      placeholder="Ghi chú sân, thời tiết... (không bắt buộc)"
                    />
                  </div>
                  <Btn onClick={handleManualSave} className="shrink-0 px-3 py-2 text-xs">
                    💾 Lưu tỉ số
                  </Btn>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. DANH SÁCH THU TIỀN PHẠT / TIỀN NƯỚC (CHIA TIỀN) */}
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-slate-800">
                💰 Tiền phạt thua{' '}
                {!m.charges && (
                  <span className="text-xs font-normal text-slate-500">
                    ({money(m.waterFee)} / người đội thua)
                  </span>
                )}
              </h4>
            </div>

            {canEdit && obs.length > 0 && (
              <div className="flex items-center gap-1.5">
                {unpaidCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => markAllPaid(true)}
                    className="rounded-xl bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-100"
                  >
                    ✓ Đã thu đủ cả đội ({unpaidCount})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => markAllPaid(false)}
                    className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Bỏ đánh dấu
                  </button>
                )}
                <button
                  type="button"
                  onClick={copyWaterDebtMessage}
                  className="rounded-xl bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                  title="Sao chép tin nhắn nhắc đóng"
                >
                  📋 Nhắc nợ
                </button>
              </div>
            )}
          </div>

          {o === 'pending' && !m.charges ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              <span className="text-xl">👉</span> Bấm chọn đội thắng ở trên để hệ thống tự động lọc danh sách người đội thua cần nộp phạt.
            </div>
          ) : !obs.length ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-600">
              Hoà — theo luật đã đặt thì không ai phải nộp phạt tiền nước.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-2">
              <div className="mb-2 px-2 pt-1 text-xs text-slate-500 flex justify-between">
                <span>{obs.length} người phải nộp phạt:</span>
                <span className={unpaidCount ? 'text-red-600 font-bold' : 'text-green-700 font-bold'}>
                  {unpaidCount ? `Còn ${unpaidCount} người chưa nộp` : '🎉 Đã thu đủ 100%'}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 text-sm">
                {obs.map((x) => (
                  <li key={x.id} className="flex items-center justify-between px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                        {name(ctx, x.memberId).trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-slate-800">{name(ctx, x.memberId)}</div>
                        <div className="text-xs text-slate-500">{money(x.amount)}</div>
                      </div>
                    </div>

                    <div>
                      {canEdit ? (
                        <PayToggle paid={x.paid} onChange={(p) => setPaid(x, p)} />
                      ) : (
                        <PaidBadge paid={x.paid} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 4. NÚT XOÁ TRẬN */}
        {canEdit && (
          <div className="border-t border-slate-100 pt-2 text-right">
            <Btn kind="danger" className="text-xs px-3 py-1.5" onClick={del}>
              🗑️ Xoá trận này
            </Btn>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function PayToggle({ paid, onChange }: { paid: boolean; onChange: (p: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!paid)}
      className={`min-w-28 rounded-full px-3 py-1.5 text-xs font-bold transition ring-1 shadow-xs ${
        paid
          ? 'bg-green-600 text-white ring-green-600 hover:bg-green-700'
          : 'bg-white text-red-600 ring-red-300 hover:bg-red-50'
      }`}
    >
      {paid ? '✓ Đã đóng' : 'Chưa đóng'}
    </button>
  )
}
