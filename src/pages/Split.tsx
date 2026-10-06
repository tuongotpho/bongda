import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import type { LineupImageParams } from '../lineupImage'
import { isLocked, fmtDate, matchOutcome, outcomeLabel, money, newId, splitTeams, todayISO } from '../logic'
import { saveMatch } from '../actions'
import type { Match } from '../types'
import { Icon } from '../icons'
import { confirmDialog } from '../dialog'
import { Btn, Card, Empty, Field, Modal, copyText, inputCls, name, useApp } from '../ui'

// Phần xuất ảnh chỉ tải khi bấm nút — app mở nhanh hơn
const LineupImageModal = lazy(() => import('../LineupImageModal'))

export default function Split({ go, editMatchId }: { go: (tab: string, id?: string) => void; editMatchId?: string | null }) {
  const ctx = useApp()
  const { data, canEdit, toast } = ctx
  const active = useMemo(() => data.members.filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name, 'vi')), [data.members])
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [date, setDate] = useState(todayISO())
  const [teams, setTeams] = useState<{ teamA: string[]; teamB: string[] } | null>(null)
  const [viewMatch, setViewMatch] = useState<Match | null>(null)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [imageModalParams, setImageModalParams] = useState<LineupImageParams | null>(null)

  // Chỉ sửa đội hình được khi trận chưa chốt kết quả (trận sổ cũ cũng khoá)
  const editMatch = useMemo(() => {
    const m = data.matches.find((x) => x.id === editMatchId)
    return m && !isLocked(m) ? m : undefined
  }, [data.matches, editMatchId])

  const selectableMembers = useMemo(() => {
    const map = new Map<string, (typeof data.members)[0]>()
    for (const m of data.members) {
      if (m.active) map.set(m.id, m)
    }
    if (editMatch) {
      for (const id of [...(editMatch.teamA || []), ...(editMatch.teamB || [])]) {
        const found = data.members.find((m) => m.id === id)
        if (found) map.set(found.id, found)
      }
      if (editMatch.charges) {
        for (const c of editMatch.charges) {
          const found = data.members.find((m) => m.id === c.memberId)
          if (found) map.set(found.id, found)
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [data.members, editMatch])

  // Nạp đội hình trận cần sửa một lần khi mở — không chạy lại mỗi lần dữ liệu cập nhật (sẽ xoá mất chỗ đang sửa dở)
  const editId = editMatch?.id
  useEffect(() => {
    if (!editMatch) {
      // Huỷ sửa / trận vừa bị chốt hoặc xoá → về form chia trận mới
      setDate(todayISO())
      setPicked(new Set())
      setTeams(null)
      return
    }
    setDate(editMatch.date)
    setPicked(new Set([...editMatch.teamA, ...editMatch.teamB]))
    setTeams({ teamA: editMatch.teamA, teamB: editMatch.teamB })
  }, [editId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Danh sách các trận có đội hình (sắp xếp mới nhất lên đầu)
  const matchesWithLineup = useMemo(() => {
    return [...data.matches]
      .filter((m) => !m.charges && (m.teamA?.length > 0 || m.teamB?.length > 0))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
  }, [data.matches])

  const upcoming = useMemo(() => matchesWithLineup.filter((m) => matchOutcome(m) === 'pending'), [matchesWithLineup])

  const toggle = (id: string) => {
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

    // Đồng bộ trực tiếp vào teams nếu teams đang hiển thị
    setTeams((t) => {
      if (!t) return t
      const inA = t.teamA.includes(id)
      const inB = t.teamB.includes(id)
      if (inA || inB) {
        // Cầu thủ bị bỏ chọn trong danh sách -> lập tức bỏ khỏi 2 đội
        return {
          teamA: t.teamA.filter((x) => x !== id),
          teamB: t.teamB.filter((x) => x !== id),
        }
      } else {
        // Cầu thủ mới được tích chọn -> thêm vào đội có ít người hơn
        if (t.teamA.length <= t.teamB.length) {
          return { teamA: [...t.teamA, id], teamB: t.teamB }
        } else {
          return { teamA: t.teamA, teamB: [...t.teamB, id] }
        }
      }
    })
  }

  const removePlayerFromTeams = (id: string) => {
    setPicked((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
    setTeams((t) => {
      if (!t) return t
      return {
        teamA: t.teamA.filter((x) => x !== id),
        teamB: t.teamB.filter((x) => x !== id),
      }
    })
    toast(`Đã xoá ${name(ctx, id)} khỏi đội hình.`)
  }

  const resultRef = useRef<HTMLDivElement>(null)
  const doSplit = () => {
    setTeams(splitTeams(selectableMembers.filter((m) => picked.has(m.id))))
    // Màn hẹp: kết quả nằm dưới danh sách → tự cuộn xuống cho thấy ngay
    if (window.innerWidth < 1280) requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

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
    if (!teams && !picked.size) return
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để lưu trận vào sổ.')
      ctx.login?.()
      return
    }

    // Đảm bảo teamA và teamB chỉ chứa những người thực sự được chọn trong picked:
    let finalA = teams ? teams.teamA.filter((id) => picked.has(id)) : []
    let finalB = teams ? teams.teamB.filter((id) => picked.has(id)) : []

    // Nếu có người trong picked mà chưa có trong team nào (ví dụ vừa tick thêm):
    for (const id of picked) {
      if (!finalA.includes(id) && !finalB.includes(id)) {
        if (finalA.length <= finalB.length) finalA.push(id)
        else finalB.push(id)
      }
    }

    if (finalA.length === 0 && finalB.length === 0) {
      toast('Vui lòng chọn ít nhất 2 cầu thủ cho trận đấu.')
      return
    }

    const m: Match = editMatch
      ? {
          ...editMatch,
          date,
          teamA: finalA,
          teamB: finalB,
          charges: undefined,
        }
      : {
          id: newId(),
          date,
          teamA: finalA,
          teamB: finalB,
          scoreA: null,
          scoreB: null,
          waterFee: data.settings.waterFee,
          drawRule: data.settings.drawRule,
          createdAt: Date.now(),
        }

    if (!(await saveMatch(m, data, matchOutcome(m) !== 'pending'))) return
    toast(editMatch ? `Đã cập nhật trận ngày ${fmtDate(date)} (${finalA.length + finalB.length} người)!` : 'Đã lưu trận mới vào sổ.')
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
            Vào tab Thành viên để thêm người
          </Btn>
        </div>
      </Card>
    )

  return (
    <div className="space-y-6">
      {/* Banner thông báo khi đang chỉnh sửa đội hình trận có sẵn */}
      {editMatch && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 p-4 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-200 text-amber-900">
              <Icon name="edit" className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-amber-900">
                Đang sửa đội hình trận ngày {fmtDate(editMatch.date)}
              </div>
              <div className="text-xs text-amber-800">
                Bạn có thể chọn lại danh sách cầu thủ, bấm "Chia lại", hoặc bấm trực tiếp vào tên cầu thủ bên dưới để đổi đội.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              kind="ghost"
              onClick={() => go('split', undefined)}
              className="border border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
            >
              Huỷ sửa / Chia trận mới
            </Btn>
            {teams && (
              <Btn onClick={save} className="text-xs">
                Lưu đội hình
              </Btn>
            )}
          </div>
        </div>
      )}

      {/* Trận sắp tới nếu có */}
      {upcoming.length > 0 && (
        <Card title="Trận sắp tới" subtitle="Đã chia đội, chưa nhập tỉ số">
          <div className="grid gap-4 sm:grid-cols-2">
            {upcoming.map((m) => (
              <div
                key={m.id}
                onClick={() => setViewMatch(m)}
                className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white p-4 transition hover:border-green-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                  <span className="font-bold text-slate-700">{fmtDate(m.date)}</span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Chưa đá</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border-l-4 border-sky-500 bg-sky-50/60 p-2.5">
                    <div className="font-bold text-sky-800">Đội A · {m.teamA.length}</div>
                    <div className="mt-1 line-clamp-2 text-slate-600">
                      {m.teamA.map((id) => name(ctx, id)).join(', ')}
                    </div>
                  </div>
                  <div className="rounded-xl border-l-4 border-orange-500 bg-orange-50/60 p-2.5">
                    <div className="font-bold text-orange-800">Đội B · {m.teamB.length}</div>
                    <div className="mt-1 line-clamp-2 text-slate-600">
                      {m.teamB.map((id) => name(ctx, id)).join(', ')}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-right text-xs font-semibold text-green-700">
                  Xem chi tiết & sửa đội hình ›
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Khu vực tạo và sắp xếp đội hình mới */}
      <div className={`grid items-start gap-6 ${teams ? 'xl:grid-cols-2' : ''}`}>
        <Card
          title={editMatch ? `Danh sách đi đá ngày ${fmtDate(date)}` : 'Ai đi đá hôm nay?'}
          subtitle="Bước 1 · Bấm chọn người có mặt"
          right={
            <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-800 ring-1 ring-green-200 ring-inset">
              {picked.size} người
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
              <Btn kind="ghost" onClick={() => setPicked(new Set(selectableMembers.map((m) => m.id)))} className="px-2.5 text-xs">
                Chọn hết ({selectableMembers.length})
              </Btn>
              <Btn kind="ghost" onClick={() => setPicked(new Set())} className="px-2.5 text-xs">
                Bỏ chọn
              </Btn>
              {matchesWithLineup.length > 0 && (
                <Btn kind="soft" onClick={() => setShowHistoryModal(true)} className="px-2.5 text-xs">
                  <Icon name="calendar" className="h-3.5 w-3.5" /> Lấy theo ngày cũ
                </Btn>
              )}
            </div>
          </div>

          <div
            className={`grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 ${
              teams ? 'xl:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8'
            }`}
          >
            {selectableMembers.map((m) => {
              const on = picked.has(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  aria-pressed={on}
                  className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm ring-1 transition active:scale-[0.98] ${
                    on ? 'bg-green-50 ring-2 ring-green-600' : 'bg-white ring-slate-200 hover:ring-green-400'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                      on ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300 bg-white text-transparent'
                    }`}
                  >
                    <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-semibold text-slate-800">
                      <span className="truncate">{m.name}</span>
                      {m.isGK && <Icon name="glove" className="h-3.5 w-3.5 shrink-0 text-violet-600" />}
                    </span>
                    <span className="block text-[11px] leading-tight tracking-tight text-amber-600">
                      {'★'.repeat(m.skill)}
                      <span className="text-slate-200">{'★'.repeat(5 - m.skill)}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <p className="mt-3 text-xs text-slate-500">Máy tự cân bằng tổng số sao và rải đều thủ môn cho 2 đội.</p>
          {/* Nút chính dính đáy màn hình — chọn người xong bấm luôn, không phải cuộn */}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-4 mt-3 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:bottom-0 lg:rounded-b-2xl">
            <Btn disabled={picked.size < 2} onClick={doSplit} className="w-full py-3 text-[15px]">
              <Icon name="shuffle" className="h-4.5 w-4.5" />
              {picked.size < 2 ? 'Chọn ít nhất 2 người' : `Chia đội cân bằng · ${picked.size} người`}
            </Btn>
          </div>
        </Card>

        {/* Kết quả sắp xếp đội hình */}
        {teams && (
          <Card
            title={editMatch ? 'Đội hình trận đấu' : 'Kết quả chia đội'}
            subtitle="Bước 2 · Bấm tên để chuyển sang đội kia"
            right={
              <Btn kind="soft" onClick={doSplit} className="px-2.5 py-1.5 text-xs">
                <Icon name="shuffle" className="h-3.5 w-3.5" /> Chia lại
              </Btn>
            }
          >
            <div ref={resultRef} className="scroll-mt-48" />
            <div className="grid grid-cols-2 gap-3">
              {(['teamA', 'teamB'] as const).map((k) => (
                <div
                  key={k}
                  className={`min-w-0 rounded-2xl border-t-4 p-2.5 sm:p-3 ${
                    k === 'teamA' ? 'border-sky-500 bg-sky-50/70' : 'border-orange-500 bg-orange-50/70'
                  }`}
                >
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-2 px-0.5 text-sm font-bold">
                    <span className={k === 'teamA' ? 'text-sky-900' : 'text-orange-900'}>{k === 'teamA' ? 'Đội A' : 'Đội B'}</span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {teams[k].length} người · {skill(teams[k])}★
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {teams[k].map((id) => (
                      <li key={id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => move(id)}
                          title="Bấm để đổi sang đội kia"
                          className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-lg bg-white px-2 py-1.5 text-left text-[13px] font-medium ring-1 ring-black/5 transition hover:ring-green-400"
                        >
                          <span className="truncate">{name(ctx, id)}</span>
                          <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-amber-600">
                            {ctx.memberById.get(id)?.isGK && <Icon name="glove" className="h-3.5 w-3.5 text-violet-600" />}
                            {ctx.memberById.get(id)?.skill ?? 3}★
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removePlayerFromTeams(id)}
                          title={`Xoá ${name(ctx, id)} khỏi trận này`}
                          aria-label={`Xoá ${name(ctx, id)} khỏi trận này`}
                          className="hidden shrink-0 cursor-pointer rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600 sm:block"
                        >
                          <Icon name="x" className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Btn kind="soft" onClick={() => copyLineup(teams)}>
                <Icon name="copy" className="h-4 w-4" /> Chép chữ Zalo
              </Btn>
              <Btn
                kind="soft"
                onClick={() => {
                  const isFinished = !!editMatch && matchOutcome(editMatch) !== 'pending'
                  const editObs = editMatch ? ctx.obligations.filter((x) => x.kind === 'water' && x.refId === editMatch.id) : []
                  const paidByMemberId = new Map(editObs.map((x) => [x.memberId, x.paid]))
                  const chargedMemberIds = new Set(editObs.map((x) => x.memberId))
                  const outcome = editMatch ? matchOutcome(editMatch) : 'pending'

                  setImageModalParams({
                    teamName: data.settings.teamName,
                    date,
                    teamA: teams.teamA,
                    teamB: teams.teamB,
                    waterFee: editMatch?.waterFee ?? data.settings.waterFee,
                    memberById: ctx.memberById,
                    isFinished,
                    scoreA: editMatch?.scoreA,
                    scoreB: editMatch?.scoreB,
                    penaltyScoreA: editMatch?.penaltyScoreA,
                    penaltyScoreB: editMatch?.penaltyScoreB,
                    penaltyWinner: editMatch?.penaltyWinner,
                    outcome,
                    paidByMemberId,
                    chargedMemberIds,
                  })
                }}
              >
                <Icon name="image" className="h-4 w-4" /> Xuất ảnh
              </Btn>
              <Btn onClick={save} disabled={!teams.teamA.length || !teams.teamB.length} className="col-span-2 py-2.5 sm:col-span-1">
                <Icon name="check" className="h-4 w-4" strokeWidth={2.4} />
                {editMatch ? 'Lưu đội hình' : 'Lưu trận vào sổ'}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {/* Lịch sử: xem lại / tái dùng danh sách ngày cũ */}
      {matchesWithLineup.length > 0 && (
        <Card
          title="Các ngày đã chia đội"
          subtitle={`${matchesWithLineup.length} ngày · bấm để xem lại, sửa hoặc lấy lại danh sách người`}
          right={
            <Btn kind="ghost" onClick={() => setShowHistoryModal(true)} className="px-2 py-1 text-xs">
              Xem tất cả <Icon name="chevron" className="h-3.5 w-3.5" />
            </Btn>
          }
        >
          <div className="flex flex-wrap gap-2">
            {matchesWithLineup.slice(0, 4).map((m) => (
              <button
                key={m.id}
                onClick={() => setViewMatch(m)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-green-300 hover:bg-green-50/60"
              >
                <Icon name="calendar" className="h-3.5 w-3.5 text-slate-400" />
                {fmtDate(m.date)} <span className="font-normal text-slate-500">· {m.teamA.length + m.teamB.length} người</span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Modal xem chi tiết một trận cũ / đội hình ngày cũ */}
      {viewMatch && (
        <PastMatchDetailModal
          match={viewMatch}
          allMatches={matchesWithLineup}
          onSelectMatch={(m) => setViewMatch(m)}
          onReusePlayers={() => loadPlayersFromMatch(viewMatch)}
          onCopyLineup={() => copyLineup({ teamA: viewMatch.teamA, teamB: viewMatch.teamB }, viewMatch.date)}
          onExportImage={() => {
            const isFinished = matchOutcome(viewMatch) !== 'pending'
            const pastObs = ctx.obligations.filter((x) => x.kind === 'water' && x.refId === viewMatch.id)
            const paidByMemberId = new Map(pastObs.map((x) => [x.memberId, x.paid]))
            const chargedMemberIds = new Set(pastObs.map((x) => x.memberId))
            const outcome = matchOutcome(viewMatch)

            setImageModalParams({
              teamName: data.settings.teamName,
              date: viewMatch.date,
              teamA: viewMatch.teamA,
              teamB: viewMatch.teamB,
              waterFee: viewMatch.waterFee,
              memberById: ctx.memberById,
              isFinished,
              scoreA: viewMatch.scoreA,
              scoreB: viewMatch.scoreB,
              penaltyScoreA: viewMatch.penaltyScoreA,
              penaltyScoreB: viewMatch.penaltyScoreB,
              penaltyWinner: viewMatch.penaltyWinner,
              outcome,
              paidByMemberId,
              chargedMemberIds,
            })
          }}
          onEditLineup={() => {
            const m = viewMatch
            setViewMatch(null)
            go('split', m.id)
          }}
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
          onEditMatch={(m) => {
            setShowHistoryModal(false)
            go('split', m.id)
          }}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {/* Modal xuất ảnh đội hình sân bóng chất lượng cao */}
      {imageModalParams && (
        <Suspense fallback={null}>
          <LineupImageModal
            params={imageModalParams}
            onClose={() => setImageModalParams(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

/** Modal xem chi tiết đội hình ngày cũ — thiết kế 2 đội tương tự modal sắp xếp trận mới */
function PastMatchDetailModal({
  match: initialMatch,
  allMatches,
  onSelectMatch,
  onReusePlayers,
  onCopyLineup,
  onExportImage,
  onEditLineup,
  onClose,
}: {
  match: Match
  allMatches: Match[]
  onSelectMatch: (m: Match) => void
  onReusePlayers: () => void
  onCopyLineup: () => void
  onExportImage: () => void
  onEditLineup: () => void
  onClose: () => void
}) {
  const ctx = useApp()
  const { canEdit, toast } = ctx
  const liveMatch = ctx.data.matches.find((m) => m.id === initialMatch.id) ?? initialMatch
  const [match, setMatch] = useState<Match>(liveMatch)

  useEffect(() => {
    setMatch(liveMatch)
  }, [liveMatch])

  const skill = (ids: string[]) => ids.reduce((s, id) => s + (ctx.memberById.get(id)?.skill ?? 3), 0)
  const totalPlayers = match.teamA.length + match.teamB.length
  const locked = isLocked(match)

  const movePlayer = async (id: string) => {
    if (locked) return
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để sửa đội hình.')
      ctx.login?.()
      return
    }
    const inA = match.teamA.includes(id)
    const nextA = inA ? match.teamA.filter((x) => x !== id) : [...match.teamA, id]
    const nextB = inA ? [...match.teamB, id] : match.teamB.filter((x) => x !== id)
    const nextMatch: Match = { ...match, teamA: nextA, teamB: nextB }
    if (!(await saveMatch(nextMatch, ctx.data))) return
    setMatch(nextMatch)
    toast(`Đã chuyển ${name(ctx, id)} sang Đội ${inA ? 'B' : 'A'}`)
  }

  const removePlayer = async (id: string) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để sửa đội hình.')
      ctx.login?.()
      return
    }
    const pName = name(ctx, id)
    if (
      !(await confirmDialog({
        title: `Bỏ ${pName} khỏi trận?`,
        message: `Cầu thủ sẽ bị xoá khỏi đội hình trận ngày ${fmtDate(match.date)}.`,
        confirmText: 'Bỏ khỏi trận',
        danger: true,
      }))
    )
      return
    const nextA = match.teamA.filter((x) => x !== id)
    const nextB = match.teamB.filter((x) => x !== id)
    const nextMatch: Match = { ...match, teamA: nextA, teamB: nextB }
    if (!(await saveMatch(nextMatch, ctx.data))) return
    setMatch(nextMatch)
    toast(`Đã xoá ${pName} khỏi danh sách trận đấu.`)
  }

  const reSplit = async () => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để chia lại đội.')
      ctx.login?.()
      return
    }
    const allIds = [...match.teamA, ...match.teamB]
    const players = allIds.map((id) => ctx.memberById.get(id)).filter(Boolean) as (typeof ctx.data.members)[0][]
    if (players.length < 2) {
      toast('Cần ít nhất 2 cầu thủ để chia đội.')
      return
    }
    const res = splitTeams(players)
    const nextMatch: Match = { ...match, teamA: res.teamA, teamB: res.teamB }
    if (!(await saveMatch(nextMatch, ctx.data))) return
    setMatch(nextMatch)
    toast('Đã chia lại 2 đội ngẫu nhiên cân bằng!')
  }

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
                  {fmtDate(m.date)} — {m.teamA.length + m.teamB.length} người {m.scoreA != null ? `(${m.scoreA} - ${m.scoreB})` : matchOutcome(m) === 'pending' ? '(chưa đá)' : `(${outcomeLabel(m)})`}
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
            {matchOutcome(match) !== 'pending' ? (
              <span className="rounded-lg bg-green-100 px-2.5 py-1 font-bold text-green-900">
                {match.scoreA != null ? `Tỉ số: ${match.scoreA} – ${match.scoreB}` : outcomeLabel(match)}
              </span>
            ) : (
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                Chưa có tỉ số
              </span>
            )}
          </div>
        </div>

        {/* Thanh công cụ sửa đội hình nhanh — trận đã chốt thì không sửa */}
        {!locked && <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 p-2.5 text-xs text-sky-900">
          <span className="flex items-center gap-1.5 font-medium">
            Bấm tên cầu thủ để chuyển sang đội kia
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={reSplit}
              className="rounded-xl border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800 shadow-xs hover:bg-sky-50 transition cursor-pointer"
            >
              Chia lại 2 đội
            </button>
            <button
              type="button"
              onClick={onEditLineup}
              className="rounded-xl border border-green-300 bg-green-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-green-800 transition cursor-pointer"
            >
              Chọn lại người / ngày
            </button>
          </div>
        </div>}

        {/* Bố cục 2 đội tương tự sắp xếp trận mới */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(['teamA', 'teamB'] as const).map((k) => {
            const list = k === 'teamA' ? match.teamA : match.teamB
            const isWinner = matchOutcome(match) === (k === 'teamA' ? 'A' : 'B')

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
                    {k === 'teamA' ? 'Đội A' : 'Đội B'} {isWinner && <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">Thắng</span>}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    {list.length} người · {skill(list)}★
                  </span>
                </div>

                    <ul className="space-y-1.5 text-xs">
                      {list.map((id) => {
                        const mem = ctx.memberById.get(id)
                        return (
                          <li key={id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePlayer(id)}
                              title="Bấm để đổi sang đội kia"
                              className="flex flex-1 items-center justify-between rounded-xl bg-white px-2.5 py-2 text-left text-xs font-medium shadow-xs ring-1 ring-black/5 transition hover:scale-[1.01] hover:ring-green-400 cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100 text-[10px] font-bold">
                                  {name(ctx, id).trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                                </span>
                                <span className="truncate">{name(ctx, id)}</span>
                              </div>
                              <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                                {mem?.isGK && <Icon name="glove" className="h-3.5 w-3.5 text-violet-600" />}
                                <span className="text-amber-600">{mem?.skill ?? 3}★</span>
                                <span className="text-[10px] text-slate-300">⇄</span>
                              </span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removePlayer(id)}
                                title={`Xoá ${name(ctx, id)} khỏi trận`}
                                className="rounded-xl p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
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
            <Icon name="copy" className="h-3.5 w-3.5" /> Sao chép chữ
          </Btn>
          <Btn
            kind="soft"
            className="flex-1 bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100"
            onClick={onExportImage}
          >
            <Icon name="image" className="h-3.5 w-3.5" /> Xuất ảnh Zalo
          </Btn>
          {!locked && (
            <Btn kind="ghost" className="flex-1 border border-slate-200" onClick={onEditLineup}>
              <Icon name="edit" className="h-3.5 w-3.5" /> Sửa đầy đủ
            </Btn>
          )}
          <Btn className="flex-1" onClick={onReusePlayers}>
            Dùng cho hôm nay
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
  onEditMatch,
  onClose,
}: {
  matches: Match[]
  onSelectMatch: (m: Match) => void
  onReusePlayers: (m: Match) => void
  onEditMatch: (m: Match) => void
  onClose: () => void
}) {

  return (
    <Modal title="Lịch sử đội hình các ngày đã đá" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Bấm vào ngày để xem chi tiết hoặc bấm "Sửa" để thay đổi đội hình.
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
                      {matchOutcome(m) !== 'pending' ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">
                          {m.scoreA != null ? `${m.scoreA} – ${m.scoreB}` : outcomeLabel(m)}
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                          Chưa đá
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Đội A {m.teamA.length} · Đội B {m.teamB.length} · {total} người
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Btn
                      kind="ghost"
                      className="border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100"
                      onClick={() => onEditMatch(m)}
                    >
                      <Icon name="edit" className="h-3.5 w-3.5" /> Sửa
                    </Btn>
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
