import { describe, expect, it } from 'vitest'
import { transferNote, vietQrPayload } from './vietqr'

describe('vietqr', () => {
  it('QR tĩnh trùng đúng mã của app MB (STK 0414)', () => {
    expect(vietQrPayload('970422', '0414')).toBe(
      '00020101021138480010A00000072701180006970422010404140208QRIBFTTA53037045802VN6304481D',
    )
  })
  it('QR động có số tiền + nội dung', () => {
    const s = vietQrPayload('970422', '0414', 150000, 'Nguyen Van A dong quy')
    expect(s).toContain('010212')
    expect(s).toContain('5406150000')
    expect(s).toContain('62250821Nguyen Van A dong quy')
  })
  it('nội dung CK bỏ dấu, tối đa 25 ký tự', () => {
    expect(transferNote('Đặng Thị Hồng — đóng quỹ T10')).toBe('Dang Thi Hong dong quy T1')
  })
})
