import { fmtDate, isLocked, money, planMatchSave } from './logic'
import { alertDialog, confirmDialog } from './dialog'
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
    await alertDialog({
      title: `Trận ${fmtDate(prev.date)} đã khoá`,
      message: `Trận này ${prev.charges ? 'nhập từ sổ cũ' : 'đã chốt kết quả'} nên không sửa được nữa. Nhập nhầm thì xoá trận rồi chia đội tạo trận mới.`,
      tone: 'warning',
    })
    return null
  }
  const plan = planMatchSave(next, data, deductAdvance)
  if (plan.staleCash.length) {
    const total = plan.staleCash.reduce((s, p) => s + p.amount, 0)
    const ok = await confirmDialog({
      title: `Gỡ ${plan.staleCash.length} khoản đã thu (${money(total)})?`,
      message:
        'Thay đổi này làm các khoản tiền phạt đã thu không còn khớp (người đó không còn phải nộp, hoặc mức phạt đổi khi chuyển thắng ↔ hoà).',
      details: ['Các khoản này sẽ được gỡ khỏi sổ quỹ', 'Nếu người đó vẫn phải nộp thì gạch lại "Đã đóng" sau'],
      confirmText: 'Gỡ và lưu',
      tone: 'warning',
    })
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
