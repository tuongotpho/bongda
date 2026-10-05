import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import type { LineupImageParams } from '../lineupImage'
import { deleteMatch, saveMatch, setPaid } from '../actions'
import { ADVANCE_NOTE, fmtDate, getMemberAdvanceInfo, getPenaltyWinner, isAdvancePayment, isPenaltyDecided, matchOutcome, money, splitTeams } from '../logic'
import type { Match, Member } from '../types'
import { Icon } from '../icons'
import { Btn, Card, Field, Modal, PaidBadge, copyText, inputCls, name, useApp } from '../ui'

// Phần xuất ảnh chỉ tải khi bấm nút — app mở nhanh hơn
const LineupImageModal = lazy(() => import('../LineupImageModal'))

export default function Matches({ go }: { go: (tab: string, id?: string) => void }) {
  const ctx = useApp()
  const { data, obligations, canEdit } = ctx
  const [openId, setOpenId] = useState<string | null>(null)
  const [imageParams, setImageParams] = useState<LineupImageParams | null>(null)
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
        title="Lịch sử trận đấu"
        subtitle={`${data.matches.length} trận · A thắng ${record.a} · B thắng ${record.b} · Hoà ${record.d}`}
        right={
          canEdit && (
            <Btn kind="soft" onClick={() => go('split')} className="px-2.5 py-1.5 text-xs">
              <Icon name="shuffle" className="h-3.5 w-3.5" /> Chia đội trận mới
            </Btn>
          )
        }
      >
        {!sorted.length ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-green-50 text-green-700">
              <Icon name="ball" className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Chưa có trận đấu nào</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Vào tab "Chia đội" để xếp 2 đội hình cho trận đấu đầu tiên.</p>
            <div className="mt-4">
              <Btn onClick={() => go('split')}>Chia đội ngay</Btn>
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sorted.map((m) => {
              const o = matchOutcome(m)
              const obs = obligations.filter((x) => x.kind === 'water' && x.refId === m.id)
              const unpaid = obs.filter((x) => !x.paid).length
              const unpaidAmount = obs.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0)
              const pen = isPenaltyDecided(m)
              const badge =
                o === 'pending' && !m.charges
                  ? { text: 'Chưa có tỉ số', cls: 'bg-amber-100 text-amber-800' }
                  : m.charges
                    ? { text: 'Sổ cũ', cls: 'bg-slate-100 text-slate-600' }
                    : o === 'draw'
                      ? { text: 'Hoà', cls: 'bg-slate-100 text-slate-700' }
                      : { text: `Đội ${o} thắng${pen ? ' pen' : ''}`, cls: o === 'A' ? 'bg-sky-100 text-sky-800' : 'bg-orange-100 text-orange-800' }
              const team = (k: 'A' | 'B') => {
                const ids = (k === 'A' ? m.teamA : m.teamB) ?? []
                const score = k === 'A' ? m.scoreA : m.scoreB
                const lost = o !== 'pending' && o !== 'draw' && o !== k
                return (
                  <div className={`flex items-center gap-2.5 ${lost ? 'opacity-55' : ''}`}>
                    <span className={`h-6 w-1 shrink-0 rounded-full ${k === 'A' ? 'bg-sky-500' : 'bg-orange-500'}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">
                        Đội {k} <span className="font-normal text-slate-500">· {ids.length} người</span>
                      </div>
                      <div className="truncate text-[11px] text-slate-500">{ids.map((id) => name(ctx, id)).join(', ')}</div>
                    </div>
                    <span className="w-7 text-right text-2xl font-black text-slate-900">{score ?? '–'}</span>
                  </div>
                )
              }
              return (
                <li key={m.id} className="min-w-0">
                  <button
                    onClick={() => setOpenId(m.id)}
                    className="flex h-full w-full min-w-0 cursor-pointer flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-green-300 hover:shadow-md"
                  >
                    <div className="flex w-full items-center justify-between text-xs">
                      <span className="font-semibold text-slate-600">{fmtDate(m.date)}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${badge.cls}`}>{badge.text}</span>
                    </div>

                    {m.charges ? (
                      <div className="text-sm text-slate-600">Nhập từ sổ cũ · {m.charges.length} người bị phạt</div>
                    ) : (
                      <div className="w-full space-y-2">
                        {team('A')}
                        {team('B')}
                        {pen && (
                          <div className="text-[11px] font-semibold text-emerald-700">
                            {m.penaltyScoreA != null && m.penaltyScoreB != null
                              ? `Luân lưu ${m.penaltyScoreA}–${m.penaltyScoreB}`
                              : `Đội ${getPenaltyWinner(m)} thắng luân lưu`}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-auto w-full border-t border-slate-100 pt-2.5 text-xs">
                      {!obs.length ? (
                        <span className="text-slate-400">Không phát sinh tiền phạt</span>
                      ) : unpaid > 0 ? (
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-600">
                            Chưa nộp {unpaid}/{obs.length}
                          </span>
                          <span className="font-bold text-red-600">{money(unpaidAmount)}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-green-700">
                          <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} /> Đã thu đủ ({obs.length} người)
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
          onExportImage={(params) => setImageParams(params)}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setOpenId(null)
            go('split', open.id)
          }}
        />
      )}

      {/* Modal xuất ảnh kết quả & nộp tiền hiển thị trực tiếp ở root level */}
      {imageParams && (
        <Suspense fallback={null}>
          <LineupImageModal
            params={imageParams}
            onClose={() => setImageParams(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

function MatchModal({
  m,
  allMatches,
  onSelectMatch,
  onExportImage,
  onClose,
  onEdit,
}: {
  m: Match
  allMatches: Match[]
  onSelectMatch: (m: Match) => void
  onExportImage: (params: LineupImageParams) => void
  onClose: () => void
  onEdit: () => void
}) {
  const ctx = useApp()
  const { obligations, canEdit, toast } = ctx
  const [scoreA, setScoreA] = useState(m.scoreA?.toString() ?? '')
  const [scoreB, setScoreB] = useState(m.scoreB?.toString() ?? '')
  const [date] = useState(m.date)
  const [note, setNote] = useState(m.note ?? '')
  const [penaltyWinner, setPenaltyWinner] = useState<'A' | 'B' | null>(m.penaltyWinner ?? null)
  const [penaltyScoreA, setPenaltyScoreA] = useState(m.penaltyScoreA?.toString() ?? '')
  const [penaltyScoreB, setPenaltyScoreB] = useState(m.penaltyScoreB?.toString() ?? '')
  const hasResult = (m.scoreA != null && m.scoreB != null) || !!m.charges
  const [view, setView] = useState<'lineup' | 'result'>(hasResult ? 'result' : 'lineup')
  // Chỉ đổi thẻ khi chuyển sang trận khác (không reset mỗi lần lưu dữ liệu)
  useEffect(() => setView(hasResult ? 'result' : 'lineup'), [m.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setScoreA(m.scoreA?.toString() ?? '')
    setScoreB(m.scoreB?.toString() ?? '')
    setNote(m.note ?? '')
    setPenaltyWinner(m.penaltyWinner ?? null)
    setPenaltyScoreA(m.penaltyScoreA?.toString() ?? '')
    setPenaltyScoreB(m.penaltyScoreB?.toString() ?? '')
  }, [m])

  const obs = obligations.filter((x) => x.kind === 'water' && x.refId === m.id)
  const o = matchOutcome(m)
  const toNum = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.floor(Number(s))))

  const skill = (ids: string[]) => ids.reduce((s, id) => s + (ctx.memberById.get(id)?.skill ?? 3), 0)

  const movePlayer = async (id: string) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để sửa đội hình.')
      ctx.login?.()
      return
    }
    const inA = m.teamA.includes(id)
    const nextA = inA ? m.teamA.filter((x) => x !== id) : [...m.teamA, id]
    const nextB = inA ? [...m.teamB, id] : m.teamB.filter((x) => x !== id)
    if (!(await saveMatch({ ...m, teamA: nextA, teamB: nextB }, ctx.data))) return
    toast(`Đã chuyển ${name(ctx, id)} sang Đội ${inA ? 'B' : 'A'}`)
  }

  const removePlayerFromMatch = async (id: string) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để sửa đội hình.')
      ctx.login?.()
      return
    }
    const pName = name(ctx, id)
    if (!confirm(`Xoá cầu thủ "${pName}" khỏi trận ngày ${fmtDate(m.date)}?`)) return
    const nextA = m.teamA.filter((x) => x !== id)
    const nextB = m.teamB.filter((x) => x !== id)
    if (!(await saveMatch({ ...m, teamA: nextA, teamB: nextB }, ctx.data))) return
    toast(`Đã xoá ${pName} khỏi danh sách trận đấu.`)
  }

  const reSplit = async () => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để chia lại đội.')
      ctx.login?.()
      return
    }
    const allIds = [...m.teamA, ...m.teamB]
    const players = allIds.map((id) => ctx.memberById.get(id)).filter(Boolean) as Member[]
    if (players.length < 2) {
      toast('Cần ít nhất 2 cầu thủ để chia đội.')
      return
    }
    const res = splitTeams(players)
    if (!(await saveMatch({ ...m, teamA: res.teamA, teamB: res.teamB }, ctx.data))) return
    toast('Đã chia lại 2 đội ngẫu nhiên cân bằng!')
  }

  // Lưu tỉ số và thông tin trận (bao gồm cả phân định luân lưu penalty nếu hòa)
  const saveWithScores = async (
    a: number | null,
    b: number | null,
    penWinner?: 'A' | 'B' | null,
    penA?: number | null,
    penB?: number | null,
  ) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để ghi nhận kết quả.')
      return
    }
    const isTied = a != null && b != null && a === b
    const pWinner = isTied ? (penWinner !== undefined ? penWinner : penaltyWinner) : null
    const pA = isTied ? (penA !== undefined ? penA : toNum(penaltyScoreA)) : null
    const pB = isTied ? (penB !== undefined ? penB : toNum(penaltyScoreB)) : null

    const updatedMatch: Match = {
      ...m,
      scoreA: a,
      scoreB: b,
      penaltyWinner: pWinner,
      penaltyScoreA: pA,
      penaltyScoreB: pB,
      date,
      note: note.trim() || undefined,
    }

    const deducted = await saveMatch(updatedMatch, ctx.data, a != null && b != null)
    if (!deducted) return
    setScoreA(a?.toString() ?? '')
    setScoreB(b?.toString() ?? '')
    setPenaltyWinner(pWinner)
    setPenaltyScoreA(pA?.toString() ?? '')
    setPenaltyScoreB(pB?.toString() ?? '')

    if (a != null && b != null) {
      // saveMatch đã tự trừ tiền ứng cho người đội thua nếu họ còn số dư ứng
      const deductedNames = deducted.map((id) => name(ctx, id)).join(', ')
      const advMsg = deducted.length > 0 ? ` · Đã trừ tiền ứng cho: ${deductedNames} 💧` : ''

      if (isTied && pWinner) {
        toast(`Đã lưu kết quả: ${a} – ${b} (Đội ${pWinner} thắng luân lưu)${advMsg}`)
      } else {
        toast(`Đã lưu kết quả: ${a} – ${b}${advMsg}`)
      }
    } else {
      toast('Đã xóa tỉ số trận đấu')
    }
  }

  // Nút bấm nhanh thắng / hoà / thua
  const setQuickWinner = (winner: 'A' | 'B' | 'draw' | 'clear') => {
    if (winner === 'A') {
      const curA = toNum(scoreA) ?? 0
      const curB = toNum(scoreB) ?? 0
      const nextA = curA > curB ? curA : curB + 1
      saveWithScores(nextA, curB, null, null, null)
    } else if (winner === 'B') {
      const curA = toNum(scoreA) ?? 0
      const curB = toNum(scoreB) ?? 0
      const nextB = curB > curA ? curB : curA + 1
      saveWithScores(curA, nextB, null, null, null)
    } else if (winner === 'draw') {
      const curA = toNum(scoreA) ?? 1
      saveWithScores(curA, curA, null, null, null)
    } else {
      saveWithScores(null, null, null, null, null)
    }
  }

  // Nút bấm phân định luân lưu penalty khi hòa tỉ số
  const setQuickPenalty = (winner: 'A' | 'B' | null) => {
    const curA = toNum(scoreA) ?? 1
    const curB = toNum(scoreB) ?? 1
    const tieScore = curA === curB ? curA : 1
    saveWithScores(tieScore, tieScore, winner, toNum(penaltyScoreA), toNum(penaltyScoreB))
  }

  const handleManualSave = async () => {
    const a = toNum(scoreA)
    const b = toNum(scoreB)
    if ((a == null) !== (b == null)) return toast('Nhập đủ tỉ số cả hai đội (hoặc xóa trắng cả 2)')
    const pa = toNum(penaltyScoreA)
    const pb = toNum(penaltyScoreB)
    let pWinner = penaltyWinner
    if (a != null && b != null && a === b) {
      if (pa != null && pb != null) {
        if (pa > pb) pWinner = 'A'
        else if (pb > pa) pWinner = 'B'
      }
    }
    await saveWithScores(a, b, pWinner, pa, pb)
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
      if (!paid) {
        await setPaid(x, false)
      } else {
        const mem = ctx.memberById.get(x.memberId)
        const adv = mem ? getMemberAdvanceInfo(mem, ctx.data.payments) : null
        const note = adv && adv.remaining >= x.amount ? ADVANCE_NOTE : undefined
        await setPaid(x, true, note)
      }
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
    const paidCount = ctx.data.payments.filter((p) => p.kind === 'water' && p.refId === m.id).length
    if (
      !confirm(
        `Xoá trận ${fmtDate(m.date)}?${
          paidCount ? `\n${paidCount} khoản tiền phạt đã thu của trận này cũng sẽ bị xoá khỏi sổ quỹ.` : ''
        }`,
      )
    )
      return
    await deleteMatch(m.id, ctx.data.payments)
    onClose()
    toast('Đã xoá trận')
  }

  const unpaidCount = obs.filter((x) => !x.paid).length

  const openLineupImage = () => {
    const numA = toNum(scoreA)
    const numB = toNum(scoreB)
    const isFinished = (numA != null && numB != null) || (m.scoreA != null && m.scoreB != null)
    const finalScoreA = numA ?? m.scoreA
    const finalScoreB = numB ?? m.scoreB

    const paidByMemberId = new Map(obs.map((x) => [x.memberId, x.paid]))
    const paidFromAdvanceByMemberId = new Map(
      obs.map((x) => {
        const pay = ctx.data.payments.find((p) => p.id === x.id)
        return [x.memberId, Boolean(pay && isAdvancePayment(pay))]
      }),
    )
    const chargedMemberIds = new Set(obs.map((x) => x.memberId))

    let teamA = m.teamA ?? []
    let teamB = m.teamB ?? []
    if (!teamA.length && !teamB.length && m.charges?.length) {
      teamB = m.charges.map((c) => c.memberId)
    }

    onExportImage({
      teamName: ctx.data.settings.teamName,
      date: m.date,
      teamA,
      teamB,
      waterFee: m.waterFee,
      memberById: ctx.memberById,
      isFinished,
      scoreA: finalScoreA,
      scoreB: finalScoreB,
      penaltyScoreA: toNum(penaltyScoreA) ?? m.penaltyScoreA,
      penaltyScoreB: toNum(penaltyScoreB) ?? m.penaltyScoreB,
      penaltyWinner: penaltyWinner ?? m.penaltyWinner,
      outcome: o,
      paidByMemberId,
      paidFromAdvanceByMemberId,
      chargedMemberIds,
    })
  }

  return (
    <Modal title={`Chi tiết trận ngày ${fmtDate(m.date)}`} onClose={onClose}>
      <div className="space-y-5">
        {/* Thanh chọn trận khác */}
        {allMatches.length > 1 && (
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2.5 text-xs text-slate-600">
            <span className="hidden font-semibold sm:inline">Xem trận khác:</span>
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

        {/* Hai thẻ con: tách đội hình và phần tiền cho đỡ rối */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {([
            ['lineup', 'Đội hình'],
            ['result', unpaidCount > 0 ? `Kết quả & tiền · ${unpaidCount}` : 'Kết quả & tiền'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              aria-pressed={view === k}
              className={`cursor-pointer rounded-lg px-2 py-2 transition ${view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'lineup' && (
          <>
        {/* 1. HIỂN THỊ ĐỘI HÌNH 2 ĐỘI TRỰC QUAN */}
        {!m.charges ? (
          <div>
            <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Đội hình 2 đội</span>
              <span className="font-normal text-slate-500">
                {m.teamA.length + m.teamB.length} cầu thủ tham gia
              </span>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 p-2.5 text-xs text-sky-900">
              <span className="font-medium">Bấm tên cầu thủ để chuyển sang đội kia</span>
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
                  onClick={openLineupImage}
                  className="rounded-xl border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 shadow-xs hover:bg-sky-100 transition cursor-pointer"
                >
                  Xuất ảnh Zalo
                </button>
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded-xl border border-green-300 bg-green-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-green-800 transition cursor-pointer"
                >
                  Sửa danh sách / ngày
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              {(['A', 'B'] as const).map((k) => {
                const list = k === 'A' ? m.teamA : m.teamB
                const isWinner = o === k
                return (
                  <div
                    key={k}
                    className={`min-w-0 rounded-2xl p-2.5 transition sm:p-3 ${
                      k === 'A'
                        ? isWinner
                          ? 'bg-sky-100/80 ring-2 ring-sky-400'
                          : 'bg-sky-50 ring-1 ring-sky-200'
                        : isWinner
                          ? 'bg-orange-100/80 ring-2 ring-orange-400'
                          : 'bg-orange-50 ring-1 ring-orange-200'
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 border-b border-black/5 pb-2 font-bold">
                      <span className={k === 'A' ? 'text-sky-900' : 'text-orange-900'}>
                        {k === 'A' ? 'Đội A' : 'Đội B'} {isWinner && <span className="ml-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">Thắng</span>}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {list.length} người · {skill(list)}★
                      </span>
                    </div>

                    <ul className="space-y-1">
                      {list.map((id) => {
                        const mem = ctx.memberById.get(id)
                        return (
                          <li key={id} className="flex min-w-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => movePlayer(id)}
                              title="Bấm để đổi sang đội kia"
                              className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-1 rounded-lg bg-white px-2 py-1.5 text-left text-[13px] font-medium ring-1 ring-black/5 transition hover:ring-green-400"
                            >
                              <span className="truncate">{name(ctx, id)}</span>
                              <span className="flex shrink-0 items-center gap-0.5 text-[11px]">
                                {mem?.isGK && <Icon name="glove" className="h-3.5 w-3.5 text-violet-600" />}
                                <span className="text-amber-600">{mem?.skill ?? 3}★</span>
                              </span>
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => removePlayerFromMatch(id)}
                                title={`Xoá ${name(ctx, id)} khỏi trận`}
                                aria-label={`Xoá ${name(ctx, id)} khỏi trận`}
                                className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Icon name="x" className="h-3.5 w-3.5" />
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
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><Icon name="receipt" className="h-5 w-5" /></span>
              <div className="flex-1">
                <div className="font-bold text-slate-800">Trận nhập từ sổ Google Sheet cũ</div>
                <p className="mt-1 text-xs text-slate-600">
                  Trận này hiện chỉ có danh sách {m.charges.length} người bị phạt tiền nước, chưa phân chia đội hình 2 đội.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Btn onClick={onEdit} className="text-xs py-2 px-3.5 shadow-sm">
                    <Icon name="edit" className="h-3.5 w-3.5" /> Sắp xếp & sửa đội hình
                  </Btn>
                  {!canEdit && (
                    <span className="text-[11px] text-amber-800">
                      (Đăng nhập Thủ quỹ để lưu kết quả vào sổ)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

          </>
        )}

        {view === 'result' && (
          <>
        {/* 2. CHỌN NHANH KẾT QUẢ THẮNG / THUA ĐỂ TÍNH TIỀN NƯỚC */}
        {!m.charges && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Kết quả trận
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
                    o === 'A' && !isPenaltyDecided(m)
                      ? 'bg-sky-600 text-white ring-2 ring-sky-700 scale-102'
                      : 'bg-white text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50'
                  }`}
                >
                  Đội A thắng
                  <span className="block text-[10px] font-normal opacity-80">Đội B nộp phạt</span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickWinner('draw')}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition shadow-xs ${
                    o === 'draw' || isPenaltyDecided(m)
                      ? 'bg-slate-700 text-white ring-2 ring-slate-900 scale-102'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Hoà
                  <span className="block text-[10px] font-normal opacity-80">
                    {isPenaltyDecided(m) ? `Đội ${o} thắng Pen` : 'Theo luật đã đặt'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setQuickWinner('B')}
                  className={`rounded-xl px-2.5 py-2 text-xs font-bold transition shadow-xs ${
                    o === 'B' && !isPenaltyDecided(m)
                      ? 'bg-orange-600 text-white ring-2 ring-orange-700 scale-102'
                      : 'bg-white text-orange-800 ring-1 ring-orange-200 hover:bg-orange-50'
                  }`}
                >
                  Đội B thắng
                  <span className="block text-[10px] font-normal opacity-80">Đội A nộp phạt</span>
                </button>
              </div>
            ) : (
              <div className="text-center text-lg font-bold">
                {o === 'pending'
                  ? 'Trận đấu chưa nhập kết quả'
                  : isPenaltyDecided(m)
                    ? `Hoà ${m.scoreA}–${m.scoreB} · Đội ${o} thắng Pen (Đội ${o === 'A' ? 'B' : 'A'} đóng tiền phạt)`
                    : o === 'draw'
                      ? 'Kết quả: Hoà'
                      : `Đội ${o} thắng (Đội ${o === 'A' ? 'B' : 'A'} đóng tiền phạt)`}
              </div>
            )}

            {/* Phân định Penalty khi hòa tỉ số */}
            {canEdit &&
              ((toNum(scoreA) != null && toNum(scoreB) != null && toNum(scoreA) === toNum(scoreB)) ||
                penaltyWinner ||
                o === 'draw') && (
                <div className="mt-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-3 shadow-xs">
                  <div className="mb-2 flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span className="flex items-center gap-1.5">
                      Hoà — có đá luân lưu không?
                    </span>
                    {penaltyWinner ? (
                      <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                        Đội {penaltyWinner} thắng pen
                      </span>
                    ) : (
                      <span className="text-[11px] font-normal text-slate-500">
                        (Không đá pen: tính hòa theo luật)
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickPenalty('A')}
                      className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-bold transition shadow-xs ${
                        penaltyWinner === 'A'
                          ? 'scale-102 bg-sky-600 text-white ring-2 ring-sky-700 shadow-md'
                          : 'bg-white text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50'
                      }`}
                    >
                      Đội A thắng pen
                      <span className="block text-[10px] font-normal opacity-85">Đội B nộp phạt</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickPenalty(null)}
                      className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-bold transition shadow-xs ${
                        !penaltyWinner
                          ? 'scale-102 bg-slate-700 text-white ring-2 ring-slate-900 shadow-md'
                          : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Không đá pen
                      <span className="block text-[10px] font-normal opacity-85">Hòa theo luật</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setQuickPenalty('B')}
                      className={`cursor-pointer rounded-xl px-2 py-2 text-xs font-bold transition shadow-xs ${
                        penaltyWinner === 'B'
                          ? 'scale-102 bg-orange-600 text-white ring-2 ring-orange-700 shadow-md'
                          : 'bg-white text-orange-800 ring-1 ring-orange-200 hover:bg-orange-50'
                      }`}
                    >
                      Đội B thắng pen
                      <span className="block text-[10px] font-normal opacity-85">Đội A nộp phạt</span>
                    </button>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-emerald-200/80 pt-2 text-xs text-slate-700">
                    <span className="font-medium">Tỉ số luân lưu Pen (tùy chọn):</span>
                    <div className="flex items-center gap-1.5 font-bold">
                      <input
                        inputMode="numeric"
                        value={penaltyScoreA}
                        onChange={(e) => {
                          const val = e.target.value
                          setPenaltyScoreA(val)
                          const pa = toNum(val)
                          const pb = toNum(penaltyScoreB)
                          if (pa != null && pb != null) {
                            if (pa > pb) setPenaltyWinner('A')
                            else if (pb > pa) setPenaltyWinner('B')
                          }
                        }}
                        placeholder="Pen A"
                        className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-1 text-center text-xs font-bold shadow-xs"
                      />
                      <span className="text-slate-400">–</span>
                      <input
                        inputMode="numeric"
                        value={penaltyScoreB}
                        onChange={(e) => {
                          const val = e.target.value
                          setPenaltyScoreB(val)
                          const pa = toNum(penaltyScoreA)
                          const pb = toNum(val)
                          if (pa != null && pb != null) {
                            if (pa > pb) setPenaltyWinner('A')
                            else if (pb > pa) setPenaltyWinner('B')
                          }
                        }}
                        placeholder="Pen B"
                        className="w-16 rounded-xl border border-slate-300 bg-white px-2 py-1 text-center text-xs font-bold shadow-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

            {/* Chi tiết tỉ số bàn thắng & Ghi chú */}
            {canEdit && (
              <div className="mt-3 border-t border-slate-200/60 pt-3">
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <Field label="Bàn Đội A">
                    <input
                      inputMode="numeric"
                      value={scoreA}
                      onChange={(e) => setScoreA(e.target.value)}
                      className={`${inputCls} text-center font-bold text-base`}
                      placeholder="?"
                    />
                  </Field>
                  <span className="pb-2 text-lg font-bold text-slate-400">–</span>
                  <Field label="Bàn Đội B">
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
                    Lưu tỉ số
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
                Tiền phạt thua{' '}
                {!m.charges && (
                  <span className="text-xs font-normal text-slate-500">
                    ({money(m.waterFee)} / người đội thua)
                  </span>
                )}
              </h4>
            </div>

            {canEdit && obs.length > 0 && (
              <div className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
                {unpaidCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => markAllPaid(true)}
                    className="rounded-xl bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-300 hover:bg-green-100"
                  >
                    Thu đủ cả đội ({unpaidCount})
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
                  Chép tin nhắc
                </button>
                <button
                  type="button"
                  onClick={openLineupImage}
                  className="rounded-xl bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-300 hover:bg-sky-100"
                  title="Xuất ảnh danh sách đóng tiền để gửi Zalo"
                >
                  Xuất ảnh
                </button>
              </div>
            )}
          </div>

          {o === 'pending' && !m.charges ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Bấm chọn đội thắng ở trên để hệ thống tự động lọc danh sách người đội thua cần nộp phạt.
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
                  {unpaidCount ? `Còn ${unpaidCount} người chưa nộp` : 'Đã thu đủ'}
                </span>
              </div>
              <ul className="divide-y divide-slate-100 text-sm">
                {obs.map((x) => {
                  const mem = ctx.memberById.get(x.memberId)
                  const payItem = ctx.data.payments.find((p) => p.id === x.id)
                  const isFromAdv = payItem && isAdvancePayment(payItem)
                  const advInfo = mem ? getMemberAdvanceInfo(mem, ctx.data.payments) : null

                  return (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                          {name(ctx, x.memberId).trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                            <span>{name(ctx, x.memberId)}</span>
                            {isFromAdv && (
                              <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                                Đã trừ tiền ứng
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{money(x.amount)}</span>
                            {advInfo && advInfo.total > 0 && (
                              <span className="text-sky-700 text-[11px] font-medium">
                                (Tiền ứng còn: {money(advInfo.remaining)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!x.paid && canEdit && advInfo && advInfo.remaining >= x.amount && (
                          <button
                            type="button"
                            onClick={() => setPaid(x, true, ADVANCE_NOTE)}
                            className="rounded-xl bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-800 ring-1 ring-sky-300 hover:bg-sky-100 transition cursor-pointer"
                          >
                            Trừ tiền ứng
                          </button>
                        )}
                        {canEdit ? (
                          <PayToggle
                            paid={x.paid}
                            onChange={(p) => {
                              const note = !p ? undefined : (advInfo && advInfo.remaining >= x.amount ? ADVANCE_NOTE : undefined)
                              setPaid(x, p, note)
                            }}
                          />
                        ) : (
                          <PaidBadge paid={x.paid} />
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

          </>
        )}

        {/* 4. NÚT XOÁ TRẬN */}
        {canEdit && (
          <div className="border-t border-slate-100 pt-2 text-right">
            <Btn kind="danger" className="text-xs px-3 py-1.5" onClick={del}>
              <Icon name="trash" className="h-3.5 w-3.5" /> Xoá trận này
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
