import { useMemo, useState } from 'react'
import { setPaid } from '../actions'
import { fmtDate, getMemberAdvanceInfo, isAdvancePayment, matchOutcome, money, newId, todayISO } from '../logic'
import { login, store } from '../store'
import type { Member } from '../types'
import { Icon } from '../icons'
import { Avatar, Btn, Card, Empty, Field, Modal, PaidBadge, inputCls, useApp } from '../ui'
import { PayToggle } from './Matches'

/** Nợ từ mức này trở lên mới tô đỏ; nợ nhỏ (vài trận tiền nước) để màu vàng cho đỡ báo động */
const BIG_DEBT = 100000

interface Stat {
  played: number
  won: number
  lost: number
  drawn: number
}

export default function Members() {
  const { data, obligations, canEdit, toast } = useApp()
  const [edit, setEdit] = useState<Member | 'new' | null>(null)
  const [showBulkAdd, setShowBulkAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'debt'>('active')
  const [deleteConfirmMember, setDeleteConfirmMember] = useState<Member | null>(null)

  const stats = useMemo(() => {
    const s = new Map<string, Stat>()
    const get = (id: string) => s.get(id) ?? (s.set(id, { played: 0, won: 0, lost: 0, drawn: 0 }), s.get(id)!)
    for (const m of data.matches) {
      const o = matchOutcome(m)
      if (o === 'pending') continue
      for (const [ids, side] of [[m.teamA || [], 'A'], [m.teamB || [], 'B']] as const)
        for (const id of ids) {
          const st = get(id)
          st.played++
          if (o === 'draw') st.drawn++
          else if (o === side) st.won++
          else st.lost++
        }
    }
    return s
  }, [data.matches])

  const debt = useMemo(() => {
    const d = new Map<string, number>()
    for (const o of obligations) if (!o.paid) d.set(o.memberId, (d.get(o.memberId) ?? 0) + o.amount)
    return d
  }, [obligations])

  const activeMembers = useMemo(() => data.members.filter((m) => m.active), [data.members])
  const inactiveMembers = useMemo(() => data.members.filter((m) => !m.active), [data.members])
  const gkCount = useMemo(() => data.members.filter((m) => m.active && m.isGK).length, [data.members])

  const filteredList = useMemo(() => {
    return data.members
      .filter((m) => {
        if (filter === 'active' && !m.active) return false
        if (filter === 'inactive' && m.active) return false
        if (filter === 'debt' && (!debt.get(m.id) || !m.active)) return false
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          return m.name.toLowerCase().includes(q)
        }
        return true
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'vi'))
  }, [data.members, filter, search, debt])

  const handleAddNew = () => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để thêm thành viên.')
      login().catch(() => {})
      return
    }
    setEdit('new')
  }

  const handleBulkAdd = () => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để thêm thành viên.')
      login().catch(() => {})
      return
    }
    setShowBulkAdd(true)
  }

  const handleDeleteQuick = (m: Member, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để xóa thành viên.')
      login().catch(() => {})
      return
    }
    setDeleteConfirmMember(m)
  }

  return (
    <div className="space-y-6">
      {/* Top Banner if not admin */}
      {!canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">ℹ️</span>
            <span>Bạn đang ở chế độ xem. Để thêm hoặc xóa thành viên, vui lòng đăng nhập tài khoản Thủ quỹ.</span>
          </div>
          <button
            onClick={() => login().catch((err) => toast('Đăng nhập lỗi: ' + (err?.code ?? err)))}
            className="rounded-xl bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-900"
          >
            Đăng nhập Thủ quỹ
          </button>
        </div>
      )}

      <Card
        title="Danh sách thành viên"
        subtitle={`${activeMembers.length} đang đá · ${gkCount} thủ môn${inactiveMembers.length > 0 ? ` · ${inactiveMembers.length} tạm nghỉ` : ''}`}
        right={
          <>
            <Btn kind="soft" onClick={handleBulkAdd} className="px-2.5 py-1.5 text-xs">
              <Icon name="list" className="h-3.5 w-3.5" /> Thêm nhiều
            </Btn>
            <Btn onClick={handleAddNew} className="px-2.5 py-1.5 text-xs">
              <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} /> Thêm người
            </Btn>
          </>
        }
      >
        {/* Search & Filter Bar */}
        {data.members.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên thành viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputCls} pl-9`}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute top-1/2 right-2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Xoá tìm kiếm"
                >
                  <Icon name="x" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 text-xs [scrollbar-width:none]">
              {[
                { id: 'active', label: `Đang đá (${activeMembers.length})` },
                { id: 'debt', label: `Còn nợ (${activeMembers.filter((m) => debt.get(m.id)).length})` },
                { id: 'inactive', label: `Tạm nghỉ (${inactiveMembers.length})` },
                { id: 'all', label: `Tất cả (${data.members.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as typeof filter)}
                  className={`shrink-0 cursor-pointer rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition ${
                    filter === tab.id
                      ? 'bg-green-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Members Grid or Empty State */}
        {!data.members.length ? (
          <div className="py-12 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-green-50 text-green-700"><Icon name="users" className="h-7 w-7" /></div>
            <h3 className="text-base font-bold text-slate-800">Chưa có thành viên nào trong đội</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Hãy thêm danh sách cầu thủ vào đội để bắt đầu chia đội cân bằng, ghi nhận trận đấu và theo dõi quỹ tháng.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Btn onClick={handleAddNew}>+ Thêm thành viên đầu tiên</Btn>
              <Btn kind="soft" onClick={handleBulkAdd}><Icon name="list" className="h-4 w-4" /> Dán danh sách cả đội</Btn>
            </div>
          </div>
        ) : !filteredList.length ? (
          <Empty>Không tìm thấy thành viên phù hợp với bộ lọc.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {filteredList.map((m) => {
              const st = stats.get(m.id)
              const owe = debt.get(m.id) ?? 0
              return (
                <li key={m.id} className="group relative">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setEdit(m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEdit(m)
                      }
                    }}
                    className={`flex h-full w-full cursor-pointer items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition hover:border-green-300 hover:shadow-md ${
                      m.active ? '' : 'opacity-60'
                    }`}
                  >
                    <Avatar name={m.name} className="h-10 w-10 text-base" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold text-slate-900">{m.name}</span>
                          {m.isGK && (
                            <span title="Bắt gôn được" className="shrink-0 rounded-md bg-violet-100 px-1 py-0.5 text-violet-700">
                              <Icon name="glove" className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {!m.active && <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">Nghỉ</span>}
                        </div>
                        {owe ? (
                          <span
                            className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold ${
                              owe >= BIG_DEBT ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            −{money(owe)}
                          </span>
                        ) : (
                          <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-green-700">
                            <Icon name="check" className="h-3 w-3" strokeWidth={3} /> Đủ
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                        <span className="tracking-tight text-amber-600">
                          {'★'.repeat(m.skill)}
                          <span className="text-slate-200">{'★'.repeat(5 - m.skill)}</span>
                        </span>
                        <span>·</span>
                        <span>{money(m.monthlyFee)}/tháng</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {st ? `${st.played} trận · ${st.won} thắng · ${st.drawn} hoà · ${st.lost} thua` : 'Chưa đá trận nào'}
                      </div>
                      {(() => {
                        const adv = getMemberAdvanceInfo(m, data.payments)
                        if (!adv.total) return null
                        return (
                          <div
                            className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                              adv.remaining > 0 ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-500'
                            }`}
                            title={`Đã ứng: ${money(adv.total)} (ngày ${fmtDate(m.advanceDate || '')}) · Đã trừ ${adv.usedCount} trận (${money(adv.used)})`}
                          >
                            <Icon name="coins" className="h-3.5 w-3.5" />
                            {adv.remaining > 0 ? `Ứng còn ${money(adv.remaining)}` : 'Hết tiền ứng'}
                          </div>
                        )
                      })()}
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteQuick(m, e)
                        }}
                        title={`Xóa ${m.name}`}
                        aria-label={`Xóa ${m.name}`}
                        className="-mr-1 shrink-0 cursor-pointer self-end rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* Single Add / Edit Modal */}
      {edit && (
        <MemberModal
          member={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onDeleteMember={(m) => setDeleteConfirmMember(m)}
        />
      )}

      {/* Bulk Add Modal */}
      {showBulkAdd && <BulkAddModal onClose={() => setShowBulkAdd(false)} />}

      {/* Modal xác nhận xóa an toàn — không dùng window.confirm tránh lỗi iframe */}
      {deleteConfirmMember && (
        <ConfirmDeleteModal
          member={deleteConfirmMember}
          onConfirm={async () => {
            const m = deleteConfirmMember
            try {
              await store.remove('members', m.id)
              toast(`Đã xóa thành viên "${m.name}" khỏi danh sách đội!`)
              setDeleteConfirmMember(null)
            } catch (err: any) {
              console.error('Lỗi khi xóa thành viên:', err)
              toast('Lỗi khi xóa: ' + (err?.message || 'Không thể xóa thành viên'))
            }
          }}
          onDeactivate={async () => {
            const m = deleteConfirmMember
            try {
              await store.put('members', m.id, { ...m, active: false })
              toast(`Đã chuyển "${m.name}" sang trạng thái tạm nghỉ.`)
              setDeleteConfirmMember(null)
            } catch (err: any) {
              console.error('Lỗi khi cập nhật:', err)
              toast('Lỗi: ' + (err?.message || 'Không thể cập nhật'))
            }
          }}
          onClose={() => setDeleteConfirmMember(null)}
        />
      )}
    </div>
  )
}

function MemberModal({
  member,
  onClose,
  onDeleteMember,
}: {
  member: Member | null
  onClose: () => void
  onDeleteMember?: (m: Member) => void
}) {
  const { data, obligations, canEdit, toast } = useApp()
  const [nm, setNm] = useState(member?.name ?? '')
  const [skill, setSkill] = useState(member?.skill ?? 3)
  const [isGK, setIsGK] = useState(member?.isGK ?? false)
  const [fee, setFee] = useState(String(member?.monthlyFee ?? data.settings.monthlyFee))
  const [advanceAmount, setAdvanceAmount] = useState(
    member?.advanceAmount ? String(member.advanceAmount) : '',
  )
  const [advanceDate, setAdvanceDate] = useState(member?.advanceDate ?? todayISO())
  const [advanceNote, setAdvanceNote] = useState(member?.advanceNote ?? '')

  const obs = member ? obligations.filter((o) => o.memberId === member.id).reverse() : []
  const owe = obs.filter((o) => !o.paid).reduce((s, o) => s + o.amount, 0)
  const advInfo = member ? getMemberAdvanceInfo(member, data.payments) : null

  const matchesCount = member
    ? data.matches.filter((m) => (m.teamA || []).includes(member.id) || (m.teamB || []).includes(member.id)).length
    : 0
  const monthsCount = member ? data.months.filter((mo) => member.id in (mo.amounts || {})).length : 0
  const paymentsCount = member ? data.payments.filter((p) => p.memberId === member.id).length : 0
  const hasHistory = matchesCount > 0 || monthsCount > 0 || paymentsCount > 0

  const save = async (patch: Partial<Member> = {}) => {
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để lưu thay đổi.')
      login().catch(() => {})
      return
    }

    const n = nm.trim()
    if (!n) return toast('Vui lòng nhập tên thành viên')
    if (data.members.some((m) => m.id !== member?.id && m.name.toLowerCase() === n.toLowerCase())) {
      return toast('Trùng tên với thành viên khác — vui lòng thêm họ hoặc biệt danh')
    }

    const monthlyFee = Number(fee) || 0
    const advAmt = advanceAmount.trim() ? Math.max(0, Number(advanceAmount)) : undefined
    const advDt = advAmt ? advanceDate || todayISO() : undefined
    const advNt = advAmt ? advanceNote.trim() || undefined : undefined

    const m: Member = member
      ? {
          ...member,
          name: n,
          skill,
          isGK,
          monthlyFee,
          advanceAmount: advAmt,
          advanceDate: advDt,
          advanceNote: advNt,
          ...patch,
        }
      : {
          id: newId(),
          name: n,
          skill,
          isGK,
          monthlyFee,
          advanceAmount: advAmt,
          advanceDate: advDt,
          advanceNote: advNt,
          active: true,
          createdAt: Date.now(),
        }

    await store.put('members', m.id, m)
    toast(member ? 'Đã lưu thông tin' : `Đã thêm thành viên "${n}"`)

    if (member) onClose()
    else {
      setNm('')
      setSkill(3)
      setIsGK(false)
      setFee(String(data.settings.monthlyFee))
      setAdvanceAmount('')
      setAdvanceDate(todayISO())
      setAdvanceNote('')
    }
  }

  const del = () => {
    if (!member) return
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để xóa thành viên.')
      login().catch(() => {})
      return
    }
    onClose()
    onDeleteMember?.(member)
  }

  return (
    <Modal title={member ? `Thành viên: ${member.name}` : 'Thêm thành viên mới'} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-3">
          <Field label="Tên thành viên">
            <input
              value={nm}
              onChange={(e) => setNm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className={inputCls}
              placeholder="VD: Tuấn Anh, Minh Đức..."
              autoFocus={!member}
            />
          </Field>

          <Field label="Trình độ thi đấu" hint="1 = mới chơi · 3 = trung bình · 5 = trụ cột / gánh team">
            <div className="flex items-center gap-1.5 py-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSkill(n)}
                  className={`text-2xl transition hover:scale-125 ${n <= skill ? 'text-amber-500' : 'text-slate-300'}`}
                  aria-label={`${n} sao`}
                >
                  ★
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold text-slate-600">({skill} sao)</span>
            </div>
          </Field>

          <Field
            label="Mức đóng quỹ tháng (đồng)"
            hint={`${money(Number(fee) || 0)}/tháng · Điền 0 nếu được miễn đóng quỹ tháng.`}
          >
            <input
              inputMode="numeric"
              value={fee}
              onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))}
              className={inputCls}
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm">
            <input
              type="checkbox"
              checked={isGK}
              onChange={(e) => setIsGK(e.target.checked)}
              className="h-4 w-4 rounded accent-green-700"
            />
            <div>
              <span className="font-semibold text-slate-800">Biết bắt gôn</span>
              <span className="block text-xs text-slate-500">Hệ thống sẽ tự động rải đều thủ môn cho hai bên khi chia đội</span>
            </div>
          </label>

          {/* KHU VỰC ỨNG TIỀN PHẠT THUA TRƯỚC */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sky-950 text-xs sm:text-sm flex items-center gap-1.5">
                <Icon name="coins" className="h-4 w-4" /> Ứng trước tiền thua trận
              </span>
              {advInfo && advInfo.total > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    advInfo.remaining > 0 ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  Còn dư: {money(advInfo.remaining)}
                </span>
              )}
            </div>

            {advInfo && advInfo.total > 0 && (
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-white p-2.5 text-center shadow-2xs text-xs">
                <div>
                  <div className="text-[11px] text-slate-500">Đã ứng</div>
                  <div className="font-bold text-slate-800 mt-0.5">{money(advInfo.total)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Đã trừ ({advInfo.usedCount} trận)</div>
                  <div className="font-bold text-orange-600 mt-0.5">-{money(advInfo.used)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Còn lại</div>
                  <div className="font-bold text-emerald-600 mt-0.5">{money(advInfo.remaining)}</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field
                label="Số tiền ứng trước (đồng)"
                hint={advanceAmount ? money(Number(advanceAmount) || 0) : 'Để trống nếu không ứng'}
              >
                <input
                  inputMode="numeric"
                  placeholder="VD: 100000, 200000..."
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value.replace(/\D/g, ''))}
                  className={inputCls}
                />
              </Field>
              <Field label="Ngày ứng tiền">
                <input
                  type="date"
                  value={advanceDate}
                  onChange={(e) => setAdvanceDate(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            {/* Các nút nạp nhanh */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
              <span className="font-medium text-slate-500">Nạp nhanh:</span>
              {[100000, 200000, 500000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    const cur = Number(advanceAmount) || 0
                    setAdvanceAmount(String(cur + amt))
                    setAdvanceDate(todayISO())
                  }}
                  className="rounded-lg border border-sky-200 bg-white px-2 py-0.5 font-semibold text-sky-800 hover:bg-sky-100 transition cursor-pointer text-xs"
                >
                  +{money(amt)}
                </button>
              ))}
              {Number(advanceAmount) > 0 && (
                <button
                  type="button"
                  onClick={() => setAdvanceAmount('')}
                  className="rounded-lg px-2 py-0.5 text-slate-500 hover:text-red-600 transition cursor-pointer text-xs"
                >
                  Xóa ứng
                </button>
              )}
            </div>

            <Field label="Ghi chú ứng tiền" hint="Tùy chọn">
              <input
                placeholder="VD: Chuyển khoản ngày 01/10..."
                value={advanceNote}
                onChange={(e) => setAdvanceNote(e.target.value)}
                className={inputCls}
              />
            </Field>

            <p className="text-[11px] text-sky-900/80 leading-relaxed">
              Khi thành viên này thua trận, hệ thống sẽ <b>tự động trừ tiền phạt</b> vào số tiền ứng này và gạch nợ ngay lập tức.
            </p>
          </div>

          <Btn className="w-full py-2.5" onClick={() => save()}>
            {member ? 'Lưu thay đổi' : 'Thêm (Enter để thêm tiếp người sau)'}
          </Btn>
        </div>

        {/* Member Debt & History */}
        {member && (
          <div className="border-t border-slate-100 pt-3">
            <h4 className="mb-2 flex items-center justify-between font-bold text-slate-800">
              <span>Lịch sử nghĩa vụ</span>
              {owe > 0 ? (
                <span className="text-sm font-bold text-red-600">Còn nợ: {money(owe)}</span>
              ) : (
                <span className="text-xs font-medium text-green-700">Đã hoàn thành tất cả</span>
              )}
            </h4>
            {!obs.length ? (
              <Empty>Chưa phát sinh nghĩa vụ nào.</Empty>
            ) : (
              <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto text-sm">
                {obs.map((o) => {
                  const pay = data.payments.find((p) => p.id === o.id)
                  const isAdv = pay && isAdvancePayment(pay)
                  return (
                    <li key={o.id} className="flex items-center justify-between py-2">
                      <div>
                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                          <span>{o.label}</span>
                          {isAdv && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                              Trừ tiền ứng
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">{money(o.amount)}</div>
                      </div>
                      {canEdit ? <PayToggle paid={o.paid} onChange={(p) => setPaid(o, p)} /> : <PaidBadge paid={o.paid} />}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Actions for Existing Member: Active/Inactive & Delete */}
        {member && (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Btn
                kind="ghost"
                className="flex-1 border border-slate-200 text-xs"
                onClick={() => save({ active: !member.active })}
              >
                {member.active ? '⏸️ Cho tạm nghỉ (ẩn khỏi chia đội & quỹ mới)' : '▶️ Kích hoạt lại (đá tiếp)'}
              </Btn>
              <Btn kind="danger" className="border border-red-200 text-xs" onClick={del}>
                <Icon name="trash" className="h-3.5 w-3.5" /> Xóa thành viên
              </Btn>
            </div>
            {hasHistory && (
              <p className="mt-2 text-[11px] text-slate-500 text-center">
                * Khuyên dùng: Nếu người này chỉ nghỉ đá một thời gian, hãy chọn "Cho tạm nghỉ" để giữ lại lịch sử các trận cũ.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

function BulkAddModal({ onClose }: { onClose: () => void }) {
  const { data, toast } = useApp()
  const [text, setText] = useState('')
  const [defaultFee, setDefaultFee] = useState(String(data.settings.monthlyFee))

  const lines = useMemo(() => {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }, [text])

  const parsed = useMemo(() => {
    const existing = new Set(data.members.map((m) => m.name.toLowerCase()))
    const seen = new Set<string>()
    return lines.map((line) => {
      let isGK = false
      let name = line
      if (/(?:^|\s|\()(?:gk|thủ môn|thu mon)(?:\)|\s|$)/i.test(line)) {
        isGK = true
        name = line.replace(/(?:^|\s|\()(?:gk|thủ môn|thu mon)(?:\)|\s|$)/gi, ' ').trim()
      }
      const key = name.toLowerCase()
      const duplicate = existing.has(key) ? 'Trùng tên đã có' : seen.has(key) ? 'Lặp trong danh sách' : ''
      seen.add(key)
      return { raw: line, name, isGK, duplicate }
    })
  }, [lines, data.members])

  const validToAdd = parsed.filter((p) => p.name && !p.duplicate)

  const handleAddAll = async () => {
    if (!validToAdd.length) {
      toast('Không có tên hợp lệ nào để thêm.')
      return
    }

    const fee = Number(defaultFee) || 0
    let count = 0
    for (const item of validToAdd) {
      const m: Member = {
        id: newId(),
        name: item.name,
        skill: 3,
        isGK: item.isGK,
        monthlyFee: fee,
        active: true,
        createdAt: Date.now() + count,
      }
      await store.put('members', m.id, m)
      count++
    }

    toast(`Đã thêm thành công ${count} thành viên vào đội!`)
    onClose()
  }

  return (
    <Modal title="Thêm nhanh danh sách thành viên" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-600">
          Dán danh sách tên cầu thủ từ Zalo hoặc Excel vào đây (mỗi dòng 1 tên). Thêm chữ <b>(GK)</b> hoặc <b>thủ môn</b> nếu người đó bắt gôn.
        </p>

        <Field label="Danh sách tên (mỗi dòng 1 người)">
          <textarea
            rows={8}
            className={`${inputCls} font-mono text-sm leading-relaxed`}
            placeholder={`Tuấn Anh\nMinh Đức (GK)\nHuy Hoàng\nQuốc Bảo\nThanh Tùng`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Mức quỹ tháng áp dụng cho đợt này (đồng)" hint={`${money(Number(defaultFee) || 0)}/tháng`}>
          <input
            inputMode="numeric"
            value={defaultFee}
            onChange={(e) => setDefaultFee(e.target.value.replace(/\D/g, ''))}
            className={inputCls}
          />
        </Field>

        {parsed.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
            <div className="font-semibold text-slate-700">
              Nhận diện: {parsed.length} dòng · Sẽ thêm: <span className="text-green-700 font-bold">{validToAdd.length} người mới</span>
            </div>
            <div className="mt-2 max-h-32 divide-y divide-slate-200 overflow-y-auto">
              {parsed.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between py-1">
                  <span className={p.duplicate ? 'line-through text-slate-400' : 'font-medium text-slate-800'}>
                    {p.name} {p.isGK && '(thủ môn)'}
                  </span>
                  {p.duplicate && <span className="text-[10px] text-red-500 font-semibold">{p.duplicate}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Btn kind="ghost" className="flex-1" onClick={onClose}>
            Hủy
          </Btn>
          <Btn className="flex-1" disabled={!validToAdd.length} onClick={handleAddAll}>
            Thêm {validToAdd.length} thành viên
          </Btn>
        </div>
      </div>
    </Modal>
  )
}

function ConfirmDeleteModal({
  member,
  onConfirm,
  onDeactivate,
  onClose,
}: {
  member: Member
  onConfirm: () => Promise<void>
  onDeactivate: () => Promise<void>
  onClose: () => void
}) {
  const { data, obligations } = useApp()
  const [loading, setLoading] = useState(false)
  // Xoá người còn nợ thì khoản nợ biến khỏi danh sách nhắc — phải báo rõ
  const owe = obligations.filter((o) => o.memberId === member.id && !o.paid).reduce((s, o) => s + o.amount, 0)

  const matchesCount = data.matches.filter(
    (match) => (match.teamA || []).includes(member.id) || (match.teamB || []).includes(member.id),
  ).length
  const monthsCount = data.months.filter((mo) => member.id in (mo.amounts || {})).length
  const paymentsCount = data.payments.filter((p) => p.memberId === member.id).length
  const hasHistory = matchesCount > 0 || monthsCount > 0 || paymentsCount > 0

  return (
    <Modal title={`Xác nhận xóa: ${member.name}`} onClose={onClose} zIndex="z-60">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5">
          <Avatar name={member.name} className="h-12 w-12 text-lg" />
          <div>
            <div className="font-bold text-slate-800 text-base">{member.name}</div>
            <div className="text-xs text-slate-500">
              {hasHistory ? (
                <span>Đã có {matchesCount} trận đấu · {monthsCount} tháng quỹ · {paymentsCount} lần nộp tiền</span>
              ) : (
                <span className="text-emerald-700 font-medium">Chưa phát sinh dữ liệu lịch sử thi đấu</span>
              )}
            </div>
          </div>
        </div>

        {owe > 0 && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
            <b>{member.name} còn nợ {money(owe)}.</b> Xoá hẳn thì khoản nợ này sẽ không còn hiện trong danh sách nhắc nữa.
          </div>
        )}

        {hasHistory ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-sm">
              Cầu thủ này đã có lịch sử trong đội
            </div>
            <p className="leading-relaxed">
              Nếu bạn <b>XÓA HẲN</b>, tên cầu thủ này vẫn hiển thị là <i>(đã xoá)</i> trong các trận cũ để không làm lệch quỹ.<br />
              <b>Khuyên dùng:</b> Nếu người này chỉ nghỉ đá một thời gian, hãy chọn <b>"Cho tạm nghỉ"</b> để giữ lại tên và lịch sử đẹp trong sổ.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Bạn có chắc chắn muốn xóa thành viên <b>{member.name}</b> khỏi danh sách đội bóng? Hành động này không thể hoàn tác.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          {hasHistory && member.active && (
            <Btn
              kind="soft"
              disabled={loading}
              onClick={async () => {
                setLoading(true)
                await onDeactivate()
                setLoading(false)
              }}
              className="w-full py-2.5 font-semibold text-xs text-center"
            >
              ⏸️ Cho tạm nghỉ (khuyên dùng — ẩn khỏi trận mới)
            </Btn>
          )}

          <div className="flex gap-2">
            <Btn kind="ghost" disabled={loading} className="flex-1" onClick={onClose}>
              Hủy
            </Btn>
            <Btn
              kind="danger"
              disabled={loading}
              className="flex-1 font-bold"
              onClick={async () => {
                setLoading(true)
                await onConfirm()
                setLoading(false)
              }}
            >
              {loading ? 'Đang xóa...' : 'Vẫn xóa hẳn'}
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}
