import { fmtDate, isLocked, money, planMatchSave } from './logic'
import { store } from './store'
import type { AppData, Match, Obligation, Payment } from './types'

export function setPaid(o: Obligation, paid: boolean, note?: string) {
  if (!paid) return store.remove('payments', o.id)
  const p: Payment = { id: o.id, memberId: o.memberId, kind: o.kind, refId: o.refId, amount: o.amount, paidAt: Date.now(), note }
  return store.put('payments', o.id, p)
}

/**
 * Lưu trận và giữ sổ quỹ khớp: gỡ các khoản đã đóng không còn đúng với kết quả/đội hình mới
 * (hỏi trước nếu có tiền mặt bị gỡ), rồi tự trừ tiền ứng nếu bật `deductAdvance`.
 * Trả về null nếu người dùng bấm Huỷ; ngược lại trả danh sách người vừa được trừ tiền ứng.
 */
export async function saveMatch(next: Match, data: AppData, deductAdvance = false): Promise<string[] | null> {
  // Chốt chặn chung: trận đã có kết quả (hoặc sổ cũ) thì không sửa nữa, dù gọi từ màn hình nào
  const prev = data.matches.find((x) => x.id === next.id)
  if (prev && isLocked(prev)) {
    alert(`Trận ${fmtDate(prev.date)} ${prev.charges ? 'nhập từ sổ cũ' : 'đã chốt kết quả'} nên KHÔNG sửa được. Nhập nhầm thì xoá trận này rồi chia đội tạo trận mới.`)
    return null
  }
  const plan = planMatchSave(next, data, deductAdvance)
  if (plan.staleCash.length) {
    const total = plan.staleCash.reduce((s, p) => s + p.amount, 0)
    const ok = confirm(
      `Thay đổi này làm ${plan.staleCash.length} khoản tiền phạt ĐÃ THU (${money(total)}) không còn khớp ` +
        `(người đó không còn phải nộp, hoặc mức phạt đổi khi chuyển thắng ↔ hoà).\n\n` +
        `Các khoản này sẽ được gỡ khỏi sổ quỹ — nếu người đó vẫn phải nộp thì gạch lại "Đã đóng" sau. Tiếp tục?`,
    )
    if (!ok) return null
  }
  await store.put('matches', next.id, next)
  if (plan.stale.length) await store.removeMany(plan.stale.map((p) => ({ coll: 'payments' as const, id: p.id })))
  for (const p of plan.toAdd) await store.put('payments', p.id, p)
  return plan.deducted
}

/** Xoá trận kèm MỌI khoản đã đóng của trận đó (kể cả trận sổ cũ không có đội hình) để sổ quỹ không lệch */
export function deleteMatch(matchId: string, payments: Payment[]) {
  return store.removeMany([
    { coll: 'matches', id: matchId },
    ...payments
      .filter((p) => p.kind === 'water' && p.refId === matchId)
      .map((p) => ({ coll: 'payments' as const, id: p.id })),
  ])
}

/** Xoá quỹ tháng kèm MỌI khoản đã đóng của tháng đó (kể cả người đã bị bỏ khỏi tháng) */
export function deleteMonth(monthId: string, payments: Payment[]) {
  return store.removeMany([
    { coll: 'months', id: monthId },
    ...payments
      .filter((p) => p.kind === 'monthly' && p.refId === monthId)
      .map((p) => ({ coll: 'payments' as const, id: p.id })),
  ])
}
