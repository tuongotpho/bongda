import { useEffect, useMemo, useState } from 'react'
import { fmtDate, money, newId, splitTeams, todayISO } from '../logic'
import { store } from '../store'
import type { Match } from '../types'
import { Btn, Card, Empty, Field, Modal, copyText, inputCls, name, useApp } from '../ui'

export default function Split({ go, editMatchId }: { go: (tab: string, id?: string) => void; editMatchId?: string | null }) {
  const ctx = useApp()
  const { data, canEdit, toast } = ctx
  const active = useMemo(() => data.members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [data.members])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [date, setDate] = useState(todayISO())
  const [teams, setTeams] = useState<{ teamA: string[]; teamB: string[] } | null>(null)
  const [viewMatch, setViewMatch] = useState<Match | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)

  const editMatch = useMemo(() => data.matches.find((m) => m.id === editMatchId), [data.matches, editMatchId])

  useEffect(() => {
    if (editMatch) {
      setDate(editMatch.date)
      if (editMatch.charges) {
        // Trận cũ từ sổ chỉ có danh sách người nộp phạt (thường là đội thua)
        // Mình sẽ tự tick những người này vào danh sách, còn lại user tự tick thêm
        setPicked(new Set(editMatch.charges.map((c) => c.memberId)))
        setTeams(null)
      } else {
        // Trận đã có đội hình
        setPicked(new Set([...editMatch.teamA, ...editMatch.teamB]))
        setTeams({ teamA: editMatch.teamA, teamB: editMatch.teamB })
      }
    }
  }, [editMatch])

  // Danh sách các trận có đội hình (sắp xếp mới nhất lên đầu)
  const matchesWithLineup = useMemo(() => {
    return [...data.matches]
      .filter((m) => !m.charges && (m.teamA?.length > 0 || m.teamB?.length > 0))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  }, [data.matches])

  const upcoming = useMemo(() => matchesWithLineup.filter((m) => m.scoreA == null), [matchesWithLineup])
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const doSplit = () => setTeams(splitTeams(active.filter((m) => picked.has(m.id))))

  const move = (id: string) =>
    setTeams((t) =>
      !t
        ? t
        : t.teamA.includes(id)
          ? { teamA: t.teamA.filter((x) => x !== id), teamB: [...t.teamB, id] }
          : { teamB: t.teamB.filter((x) => x !== id), teamA: [...t.teamA, id] },
    )

  const skill = (ids: string[]) => ids.reduce((s, id) => s + (ctx.memberById.get(id)?.skill ?? 3), 0)

  const lineupText = (t: { teamA: string[]; teamB: string[] }, matchDate = date) =>
    [
      `⚽ ${data.settings.teamName} — ĐỘI HÌNH ${fmtDate(matchDate)}`,
      `🟦 Đội A (${t.teamA.length}): ${t.teamA.map((id) => name(ctx, id)).join(', ')}`,
      `🟧 Đội B (${t.teamB.length}): ${t.teamB.map((id) => name(ctx, id)).join(', ')}`,
      `Đội thua mỗi người ${money(data.settings.waterFee)} tiền phạt 💧`,
    ].join('\n')

  const copyLineup = async (t: { teamA: string[]; teamB: string[] }, matchDate = date) => {
    const ok = await copyText(lineupText(t, matchDate))
    toast(ok ? 'Đã sao chép đội hình — dán vào Zalo nhé!' : 'Không sao chép được')
  }

  // Lấy danh sách thành viên từ một trận cũ và tích chọn vào form chia đội
  const loadPlayersFromMatch = (m: Match) => {
    const ids = [...m.teamA, ...m.teamB]
    const validIds = ids.filter((id) => active.some((a) => a.id === id))
    setPicked(new Set(validIds))
    setViewMatch(null)
    setShowHistoryModal(false)
    toast(`Đã chọn ${validIds.length} người từ trận ngày ${fmtDate(m.date)}!`)
  }

  const save = async () => {
    if (!teams) return
    if (!canEdit) {
      toast('Chỉ tài khoản Thủ quỹ mới có quyền lưu trận vào sổ. Bạn vẫn có thể bấm "Sao chép đội hình" để gửi Zalo!')
      return
    }

    const m: Match = editMatch
      ? {
          ...editMatch,
          date,
          teamA: teams.teamA,
          teamB: teams.teamB,
          // Nếu trận cũ có charges, khi chuyển qua format mới ta bỏ charges đi
          // Nhưng ta giữ lại note, score (nếu có)
          charges: undefined,
        }
      : {
          id: newId(),
          date,
          teamA: teams.teamA,
          teamB: teams.teamB,
          scoreA: null,
          scoreB: null,
          waterFee: data.settings.waterFee,
          drawRule: data.settings.drawRule,
          createdAt: Date.now(),
        }

    await store.put('matches', m.id, m)
    toast(editMatch ? 'Đã cập nhật đội hình cho trận đấu!' : 'Đã lưu trận mới. Đá xong nhớ nhập tỉ số!')
    setTeams(null)
    setPicked(new Set())
    go('matches')
  }

  if (!active.length)
    return (
      <Card title={editMatch ? `Cập nhật đội hình trận ${fmtDate(editMatch.date)}` : 'Chia đội'}>
        <Empty>Chưa có thành viên nào đang hoạt động trong danh sách đội.</Empty>
        <div className="mt-3 text-center">
          <Btn kind="soft" onClick={() => go('members')}>
            👥 Vào tab Thành viên để thêm người
          </Btn>
        </div>
      </Card>
    )

  return (
    <div className="space-y-6">
      {/* Thanh tác vụ nhanh: Xem lại ngày cũ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-green-100 text-lg text-green-800">📅</span>
          <div>
            <div className="font-bold text-slate-800">Lịch sử chia đội các ngày cũ</div>
            <div className="text-xs text-slate-500">
              Đã lưu {matchesWithLineup.length} ngày đá · Xem lại đội hình hoặc tái sử dụng người đi đá
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {matchesWithLineup.slice(0, 3).map((m) => (
            <button
              key={m.id}
              onClick={() => setViewMatch(m)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-green-300 hover:bg-green-50/60"
            >
              {fmtDate(m.date)} ({m.teamA.length + m.teamB.length} người) ↗
            </button>
          ))}
          {matchesWithLineup.length > 0 && (
            <Btn kind="soft" onClick={() => setShowHistoryModal(true)} className="px-3 py-1.5 text-xs">
              Xem tất cả ({matchesWithLineup.length}) →
            </Btn>
          )}
        </div>
      </div>

      {/* Trận sắp tới nếu có */}
      {upcoming.length > 0 && (
        <Card title="⚽ Đội hình trận sắp tới (chưa nhập tỉ số)">
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((m) => (
              <div
                key={m.id}
                onClick={() => setViewMatch(m)}
                className="cursor-pointer rounded-2xl border border-green-100 bg-green-50/40 p-4 transition hover:bg-green-50 hover:shadow-sm"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span className="font-bold text-green-800">Ngày {fmtDate(m.date)}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Chưa đá</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white p-2.5 shadow-xs ring-1 ring-sky-200">
                    <div className="font-bold text-sky-800">🟦 Đội A ({m.teamA.length})</div>
                    <div className="mt-1 line-clamp-2 text-slate-600">
                      {m.teamA.map((id) => name(ctx, id)).join(', ')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white p-2.5 shadow-xs ring-1 ring-orange-200">
                    <div className="font-bold text-orange-800">🟧 Đội B ({m.teamB.length})</div>
                    <div className="mt-1 line-clamp-2 text-slate-600">
                      {m.teamB.map((id) => name(ctx, id)).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-right text-xs font-semibold text-green-700">
                  Bấm xem chi tiết & xếp lại →
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Khu vực tạo và sắp xếp đội hình mới */}
      <div className={`grid items-start gap-6 ${teams ? 'xl:grid-cols-2' : ''}`}>
        <Card
          title="1. Ai đi đá hôm nay?"
          right={
            <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-semibold text-green-800">
              Đã chọn: {picked.size} người
            </span>
          }
        >
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="w-44">
              <Field label="Ngày đá">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1">
              <Btn kind="ghost" onClick={() => setPicked(new Set(active.map((m) => m.id)))} className="text-xs">
                Chọn hết ({active.length})
              </Btn>
              <Btn kind="ghost" onClick={() => setPicked(new Set())} className="text-xs">
                Bỏ chọn
              </Btn>
              {matchesWithLineup.length > 0 && (
                <Btn kind="soft" onClick={() => setShowHistoryModal(true)} className="text-xs">
                  📅 Lấy theo ngày cũ...
                </Btn>
              )}
            </div>
          </div>

          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 ${
              teams ? 'xl:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'
            }`}
          >
            {active.map((m) => {
              const on = picked.has(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className={`flex flex-col justify-between rounded-xl px-3 py-2 text-left text-sm ring-1 transition ${
                    on ? 'bg-green-700 text-white ring-green-700 shadow-sm' : 'bg-white ring-slate-200 hover:ring-green-400'
                  }`}
                >
                  <div className="truncate font-semibold">
                    {m.name} {m.isGK && '🧤'}
                  </div>
                  <div className={`mt-0.5 text-xs ${on ? 'text-green-100' : 'text-slate-400'}`}>
                    {'★'.repeat(m.skill)}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              * Thuật toán sẽ tự động cân bằng số sao và rải đều thủ môn 🧤 cho 2 đội.
            </div>
            <Btn
              disabled={picked.size < 2}
              onClick={doSplit}
              className="w-full py-2.5 sm:w-auto"
            >
              🎲 Chia đội ngẫu nhiên cân bằng ({picked.size} người)
            </Btn>
          </div>
        </Card>

        {/* Kết quả sắp xếp đội hình */}
        {teams && (
          <Card
            title="2. Kết quả chia đội"
            right={
              <Btn kind="ghost" onClick={doSplit} className="text-xs">
                🔄 Chia lại
              </Btn>
            }
          >
            <p className="mb-3 text-xs text-slate-500">
              💡 Bấm vào tên cầu thủ bên dưới để chuyển người đó sang đội đối phương.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(['teamA', 'teamB'] as const).map((k) => (
                <div
                  key={k}
                  className={`rounded-2xl p-3.5 shadow-xs ${
                    k === 'teamA' ? 'bg-sky-50 ring-1 ring-sky-200' : 'bg-orange-50 ring-1 ring-orange-200'
                  }`}
                >
                  <div className="mb-3 flex items-baseline justify-between border-b border-black/5 pb-2 text-sm font-bold">
                    <span className={k === 'teamA' ? 'text-sky-900' : 'text-orange-900'}>
                      {k === 'teamA' ? '🟦 Đội A' : '🟧 Đội B'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {teams[k].length} người · {skill(teams[k])}★
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {teams[k].map((id) => (
                      <li key={id}>
                        <button
                          onClick={() => move(id)}
                          title="Bấm để đổi sang đội kia"
                          className="flex w-full items-center justify-between rounded-xl bg-white px-2.5 py-2 text-left text-sm font-medium shadow-xs ring-1 ring-black/5 transition hover:scale-[1.02] hover:ring-green-400"
                        >
                          <span className="truncate">{name(ctx, id)}</span>
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            {ctx.memberById.get(id)?.isGK && '🧤'}
                            <span>{'★'.repeat(ctx.memberById.get(id)?.skill ?? 3)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn kind="soft" onClick={() => copyLineup(teams)}>
                📋 Sao chép đội hình Zalo
              </Btn>
              <Btn onClick={save} disabled={!teams.teamA.length || !teams.teamB.length}>
                💾 Lưu trận vào sổ
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {/* Modal xem chi tiết một trận cũ / đội hình ngày cũ */}
      {viewMatch && (
        <PastMatchDetailModal
          match={viewMatch}
          allMatches={matchesWithLineup}
          onSelectMatch={(m) => setViewMatch(m)}
          onReusePlayers={() => loadPlayersFromMatch(viewMatch)}
          onCopyLineup={() => copyLineup({ teamA: viewMatch.teamA, teamB: viewMatch.teamB }, viewMatch.date)}
          onClose={() => setViewMatch(null)}
        />
      )}

      {/* Modal danh sách các ngày cũ */}
      {showHistoryModal && (
        <HistoryListModal
          matches={matchesWithLineup}
          onSelectMatch={(m) => {
            setShowHistoryModal(false)
            setViewMatch(m)
          }}
          onReusePlayers={(m) => loadPlayersFromMatch(m)}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </div>
  )
}

/** Modal xem chi tiết đội hình ngày cũ — thiết kế 2 đội tương tự modal sắp xếp trận mới */
function PastMatchDetailModal({
  match,
  allMatches,
  onSelectMatch,
  onReusePlayers,
  onCopyLineup,
  onClose,
}: {
  match: Match
  allMatches: Match[]
  onSelectMatch: (m: Match) => void
  onReusePlayers: () => void
  onCopyLineup: () => void
  onClose: () => void
}) {
  const ctx = useApp()
  const skill = (ids: string[]) => ids.reduce((s, id) => s + (ctx.memberById.get(id)?.skill ?? 3), 0)
  const totalPlayers = match.teamA.length + match.teamB.length

  return (
    <Modal title={`Đội hình ngày ${fmtDate(match.date)}`} onClose={onClose}>
      <div className="space-y-4">
        {/* Selector chuyển nhanh các ngày cũ */}
        {allMatches.length > 1 && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 text-xs text-slate-600">
            <span className="font-semibold">Xem ngày khác:</span>
            <select
              value={match.id}
              onChange={(e) => {
                const found = allMatches.find((m) => m.id === e.target.value)
                if (found) onSelectMatch(found)
              }}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
            >
              {allMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {fmtDate(m.date)} — {m.teamA.length + m.teamB.length} người {m.scoreA != null ? `(${m.scoreA} - ${m.scoreB})` : '(chưa đá)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Thông tin tỉ số / trạng thái */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-xs">
          <div>
            <span className="font-bold text-slate-800">Tổng cộng: {totalPlayers} thành viên</span>
            {match.note && <span className="ml-2 text-slate-500">· {match.note}</span>}
          </div>
          <div>
            {match.scoreA != null && match.scoreB != null ? (
              <span className="rounded-lg bg-green-100 px-2.5 py-1 font-bold text-green-900">
                Tỉ số: 🟦 {match.scoreA} – {match.scoreB} 🟧
              </span>
            ) : (
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                Chưa có tỉ số
              </span>
            )}
          </div>
        </div>

        {/* Bố cục 2 đội tương tự sắp xếp trận mới */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(['teamA', 'teamB'] as const).map((k) => {
            const list = k === 'teamA' ? match.teamA : match.teamB
            const isWinner =
              match.scoreA != null &&
              match.scoreB != null &&
              (k === 'teamA' ? match.scoreA > match.scoreB : match.scoreB > match.scoreA)

            return (
              <div
                key={k}
                className={`rounded-2xl p-3.5 shadow-xs ${
                  k === 'teamA'
                    ? 'bg-sky-50 ring-1 ring-sky-200'
                    : 'bg-orange-50 ring-1 ring-orange-200'
                }`}
              >
                <div className="mb-3 flex items-baseline justify-between border-b border-black/5 pb-2 font-bold">
                  <span className={k === 'teamA' ? 'text-sky-900' : 'text-orange-900'}>
                    {k === 'teamA' ? '🟦 Đội A' : '🟧 Đội B'} {isWinner && '🏆'}
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
                        className="flex items-center justify-between rounded-xl bg-white px-2.5 py-2 font-medium shadow-xs"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-bold">
                            {name(ctx, id).trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                          </span>
                          <span className="truncate">{name(ctx, id)}</span>
                        </div>
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

        {/* Nút tác vụ */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Btn kind="soft" className="flex-1" onClick={onCopyLineup}>
            📋 Sao chép đội hình Zalo
          </Btn>
          <Btn className="flex-1" onClick={onReusePlayers}>
            ✨ Dùng danh sách này cho hôm nay
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

/** Modal danh sách tất cả các ngày cũ đã chia */
function HistoryListModal({
  matches,
  onSelectMatch,
  onReusePlayers,
  onClose,
}: {
  matches: Match[]
  onSelectMatch: (m: Match) => void
  onReusePlayers: (m: Match) => void
  onClose: () => void
}) {

  return (
    <Modal title="📅 Lịch sử đội hình các ngày đã đá" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Bấm vào ngày để xem chi tiết 2 đội hoặc bấm "Dùng lại" để chọn ngay những người đó cho trận hôm nay.
        </p>

        {!matches.length ? (
          <Empty>Chưa có trận nào được ghi nhận đội hình.</Empty>
        ) : (
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {matches.map((m) => {
              const total = m.teamA.length + m.teamB.length
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 py-3 transition hover:bg-slate-50/80"
                >
                  <div
                    onClick={() => onSelectMatch(m)}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{fmtDate(m.date)}</span>
                      {m.scoreA != null ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {m.scoreA} – {m.scoreB}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          Chưa đá
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      🟦 {m.teamA.length} người vs 🟧 {m.teamB.length} người ({total} cầu thủ)
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Btn
                      kind="ghost"
                      className="border border-slate-200 px-2.5 py-1 text-xs"
                      onClick={() => onSelectMatch(m)}
                    >
                      Xem ↗
                    </Btn>
                    <Btn
                      kind="soft"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => onReusePlayers(m)}
                    >
                      Dùng lại
                    </Btn>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
