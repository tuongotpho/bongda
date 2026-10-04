import { useMemo, useState } from 'react'
import { setPaid } from '../actions'
import { matchOutcome, money, newId } from '../logic'
import { login, store } from '../store'
import type { Member } from '../types'
import { Btn, Card, Empty, Field, Modal, PaidBadge, inputCls, useApp } from '../ui'
import { PayToggle } from './Matches'

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

  const stats = useMemo(() => {
    const s = new Map<string, Stat>()
    const get = (id: string) => s.get(id) ?? (s.set(id, { played: 0, won: 0, lost: 0, drawn: 0 }), s.get(id)!)
    for (const m of data.matches) {
      const o = matchOutcome(m)
      if (o === 'pending') continue
      for (const [ids, side] of [[m.teamA, 'A'], [m.teamB, 'B']] as const)
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

  const handleDeleteQuick = async (m: Member, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để xóa thành viên.')
      login().catch(() => {})
      return
    }

    const matchesCount = data.matches.filter((match) => match.teamA.includes(m.id) || match.teamB.includes(m.id)).length
    const monthsCount = data.months.filter((mo) => m.id in mo.amounts).length
    const paymentsCount = data.payments.filter((p) => p.memberId === m.id).length
    const hasHistory = matchesCount > 0 || monthsCount > 0 || paymentsCount > 0

    const msg = hasHistory
      ? `Thành viên "${m.name}" đã tham gia ${matchesCount} trận và có tên trong ${monthsCount} tháng quỹ.\n\nBạn có chắc chắn muốn XÓA HẲN người này khỏi danh sách đội?\n(Nếu chỉ muốn tạm ẩn người này khỏi các trận mới, hãy chọn "Cho nghỉ" thay vì xóa hẳn)`
      : `Xác nhận xóa thành viên "${m.name}" khỏi danh sách đội?`

    if (!confirm(msg)) return
    await store.remove('members', m.id)
    toast(`Đã xóa thành viên "${m.name}"`)
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
            🔐 Đăng nhập Thủ quỹ ngay
          </button>
        </div>
      )}

      <Card
        title={
          <div className="flex flex-wrap items-baseline gap-2">
            <span>Danh sách thành viên</span>
            <span className="text-xs font-normal text-slate-500">
              ({activeMembers.length} đang đá · {gkCount} thủ môn 🧤 {inactiveMembers.length > 0 && `· ${inactiveMembers.length} tạm nghỉ`})
            </span>
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <Btn kind="soft" onClick={handleBulkAdd} className="px-2.5 py-1.5 text-xs">
              📋 Thêm nhiều người
            </Btn>
            <Btn onClick={handleAddNew} className="px-3 py-1.5 text-xs">
              + Thêm thành viên
            </Btn>
          </div>
        }
      >
        {/* Search & Filter Bar */}
        {data.members.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                placeholder="🔍 Tìm tên thành viên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={inputCls}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1 text-xs">
              {[
                { id: 'active', label: `Đang đá (${activeMembers.length})` },
                { id: 'debt', label: `Còn nợ (${activeMembers.filter((m) => debt.get(m.id)).length})` },
                { id: 'inactive', label: `Tạm nghỉ (${inactiveMembers.length})` },
                { id: 'all', label: `Tất cả (${data.members.length})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as typeof filter)}
                  className={`rounded-full px-3 py-1 font-medium transition ${
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
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-green-50 text-3xl">👥</div>
            <h3 className="text-base font-bold text-slate-800">Chưa có thành viên nào trong đội</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Hãy thêm danh sách cầu thủ vào đội để bắt đầu chia đội cân bằng, ghi nhận trận đấu và theo dõi quỹ tháng.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Btn onClick={handleAddNew}>+ Thêm thành viên đầu tiên</Btn>
              <Btn kind="soft" onClick={handleBulkAdd}>📋 Dán danh sách cả đội</Btn>
            </div>
          </div>
        ) : !filteredList.length ? (
          <Empty>Không tìm thấy thành viên phù hợp với bộ lọc.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredList.map((m) => {
              const st = stats.get(m.id)
              const owe = debt.get(m.id) ?? 0
              return (
                <li key={m.id} className="group relative">
                  <button
                    onClick={() => setEdit(m)}
                    className={`flex h-full w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-green-200 hover:bg-white hover:shadow-md ${
                      m.active ? '' : 'opacity-60 grayscale'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-base font-bold shadow-sm ${
                          owe ? 'bg-red-100 text-red-700' : m.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {m.name.trim().split(/\s+/).pop()?.[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 truncate font-bold text-slate-800">
                          <span className="truncate">{m.name}</span>
                          {m.isGK && <span title="Bắt gôn được">🧤</span>}
                          {!m.active && (
                            <span className="rounded bg-slate-200 px-1 py-0.2 text-[10px] font-normal text-slate-600">Nghỉ</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                          <span className="text-amber-500 font-medium">{'★'.repeat(m.skill)}</span>
                          <span>·</span>
                          <span>{money(m.monthlyFee)}/th</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {st ? `${st.played} trận (${st.won}T·${st.drawn}H·${st.lost}B)` : 'chưa đá trận nào'}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {owe ? (
                        <span className="rounded-lg bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 ring-1 ring-red-200">
                          Nợ {money(owe)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                          Đủ
                        </span>
                      )}

                      {/* Quick Delete button on hover (desktop) or always tap-accessible */}
                      {canEdit && (
                        <span
                          role="button"
                          onClick={(e) => handleDeleteQuick(m, e)}
                          title={`Xóa ${m.name}`}
                          className="rounded-lg p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          🗑️
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

      {/* Single Add / Edit Modal */}
      {edit && <MemberModal member={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}

      {/* Bulk Add Modal */}
      {showBulkAdd && <BulkAddModal onClose={() => setShowBulkAdd(false)} />}
    </div>
  )
}

function MemberModal({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const { data, obligations, canEdit, toast } = useApp()
  const [nm, setNm] = useState(member?.name ?? '')
  const [skill, setSkill] = useState(member?.skill ?? 3)
  const [isGK, setIsGK] = useState(member?.isGK ?? false)
  const [fee, setFee] = useState(String(member?.monthlyFee ?? data.settings.monthlyFee))
  const obs = member ? obligations.filter((o) => o.memberId === member.id).reverse() : []
  const owe = obs.filter((o) => !o.paid).reduce((s, o) => s + o.amount, 0)

  const matchesCount = member ? data.matches.filter((m) => m.teamA.includes(member.id) || m.teamB.includes(member.id)).length : 0
  const monthsCount = member ? data.months.filter((mo) => member.id in mo.amounts).length : 0
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
    const m: Member = member
      ? { ...member, name: n, skill, isGK, monthlyFee, ...patch }
      : { id: newId(), name: n, skill, isGK, monthlyFee, active: true, createdAt: Date.now() }

    await store.put('members', m.id, m)
    toast(member ? 'Đã lưu thông tin' : `Đã thêm thành viên "${n}"`)

    if (member) onClose()
    else {
      setNm('')
      setSkill(3)
      setIsGK(false)
      setFee(String(data.settings.monthlyFee))
    }
  }

  const del = async () => {
    if (!member) return
    if (!canEdit) {
      toast('Vui lòng đăng nhập tài khoản Thủ quỹ để xóa thành viên.')
      login().catch(() => {})
      return
    }

    const confirmMsg = hasHistory
      ? `Thành viên "${member.name}" đã tham gia ${matchesCount} trận và ${monthsCount} tháng quỹ.\n\nBạn có chắc chắn muốn XÓA HẲN người này khỏi danh sách đội?\n(Nếu chỉ muốn ẩn khỏi danh sách chia đội và quỹ tương lai, hãy chọn "Cho nghỉ" thay vì xóa)`
      : `Xác nhận xóa thành viên "${member.name}" khỏi danh sách đội?`

    if (!confirm(confirmMsg)) return
    await store.remove('members', member.id)
    toast(`Đã xóa thành viên "${member.name}"`)
    onClose()
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
                  className={`text-2xl transition hover:scale-125 ${n <= skill ? 'text-amber-400' : 'text-slate-200'}`}
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
              <span className="font-semibold text-slate-800">Biết bắt gôn 🧤</span>
              <span className="block text-xs text-slate-500">Hệ thống sẽ tự động rải đều thủ môn cho hai bên khi chia đội</span>
            </div>
          </label>

          <Btn className="w-full py-2.5" onClick={() => save()}>
            {member ? '💾 Lưu thay đổi' : '➕ Thêm (Enter để thêm tiếp người sau)'}
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
                {obs.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium text-slate-700">{o.label}</div>
                      <div className="text-xs text-slate-500">{money(o.amount)}</div>
                    </div>
                    {canEdit ? <PayToggle paid={o.paid} onChange={(p) => setPaid(o, p)} /> : <PaidBadge paid={o.paid} />}
                  </li>
                ))}
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
                🗑️ Xóa thành viên
              </Btn>
            </div>
            {hasHistory && (
              <p className="mt-2 text-[11px] text-slate-400 text-center">
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
    return lines.map((line) => {
      let isGK = false
      let name = line
      if (/(?:^|\s|\()(?:gk|thủ môn|thu mon)(?:\)|\s|$)/i.test(line)) {
        isGK = true
        name = line.replace(/(?:^|\s|\()(?:gk|thủ môn|thu mon)(?:\)|\s|$)/gi, ' ').trim()
      }
      const duplicate = existing.has(name.toLowerCase())
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
    <Modal title="📋 Thêm nhanh danh sách thành viên" onClose={onClose}>
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
                    {p.name} {p.isGK && '🧤 (Thủ môn)'}
                  </span>
                  {p.duplicate && <span className="text-[10px] text-red-500 font-semibold">Trùng tên đã có</span>}
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
            ➕ Thêm {validToAdd.length} thành viên
          </Btn>
        </div>
      </div>
    </Modal>
  )
}
