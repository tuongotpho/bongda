import type { Settings } from './types'

/** Mã BIN (NAPAS) các ngân hàng hay dùng — chuẩn VietQR cần BIN chứ không cần tên */
export const BANKS: { bin: string; name: string }[] = [
  { bin: '970422', name: 'MB Bank' },
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970426', name: 'MSB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970448', name: 'OCB' },
]

export const bankName = (bin: string) => BANKS.find((b) => b.bin === bin)?.name ?? `Ngân hàng ${bin}`

export const hasBank = (s: Settings) => !!(s.bankBin && s.bankAccount.trim())

/** Dòng chữ chuyển khoản dùng trong tin nhắn / ảnh: ưu tiên chữ tự ghi, không có thì ghép từ tài khoản */
export function bankText(s: Settings): string {
  if (s.bankInfo.trim()) return s.bankInfo.trim()
  if (!hasBank(s)) return ''
  return [bankName(s.bankBin), `STK ${s.bankAccount.trim()}`, s.bankHolder.trim()].filter(Boolean).join(' · ')
}
