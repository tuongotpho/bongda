import { obligationId } from './logic'
import { store } from './store'
import type { Obligation, Payment } from './types'

export function setPaid(o: Obligation, paid: boolean) {
  if (!paid) return store.remove('payments', o.id)
  const p: Payment = { id: o.id, memberId: o.memberId, kind: o.kind, refId: o.refId, amount: o.amount, paidAt: Date.now() }
  return store.put('payments', o.id, p)
}

/** Xoá trận kèm các khoản đã đóng của trận đó để sổ quỹ không lệch */
export function deleteMatch(matchId: string, memberIds: string[]) {
  return store.removeMany([
    { coll: 'matches', id: matchId },
    ...memberIds.map((m) => ({ coll: 'payments' as const, id: obligationId('water', matchId, m) })),
  ])
}

export function deleteMonth(monthId: string, memberIds: string[]) {
  return store.removeMany([
    { coll: 'months', id: monthId },
    ...memberIds.map((m) => ({ coll: 'payments' as const, id: obligationId('monthly', monthId, m) })),
  ])
}
