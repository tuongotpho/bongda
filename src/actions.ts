import { autoDeductMatchAdvance, isAdvancePayment, money, obligationId, stalePayments } from './logic'
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
  const stale = stalePayments(next, data.payments)
  const cash = stale.filter((p) => !isAdvancePayment(p))
  if (cash.length) {
    const total = cash.reduce((s, p) => s + p.amount, 0)
    const ok = confirm(
      `Thay đổi này làm ${cash.length} khoản tiền phạt ĐÃ THU (${money(total)}) không còn khớp ` +
        `(người đó không còn phải nộp, hoặc mức phạt đổi khi chuyển thắng ↔ hoà).\n\n` +
        `Các khoản này sẽ được gỡ khỏi sổ quỹ — nếu người đó vẫn phải nộp thì gạch lại "Đã đóng" sau. Tiếp tục?`,
    )
    if (!ok) return null
  }
  await store.put('matches', next.id, next)
  if (stale.length) await store.removeMany(stale.map((p) => ({ coll: 'payments' as const, id: p.id })))
  if (!deductAdvance) return []
  const staleIds = new Set(stale.map((p) => p.id))
  const { paymentsToAdd, deductedMemberIds } = autoDeductMatchAdvance(next, {
    ...data,
    payments: data.payments.filter((p) => !staleIds.has(p.id)),
  })
  for (const p of paymentsToAdd) await store.put('payments', p.id, p)
  return deductedMemberIds
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

export function deleteMonth(monthId: string, memberIds: string[]) {
  return store.removeMany([
    { coll: 'months', id: monthId },
    ...memberIds.map((m) => ({ coll: 'payments' as const, id: obligationId('monthly', monthId, m) })),
  ])
}
