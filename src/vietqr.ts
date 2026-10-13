import QRCode from 'qrcode'

/** Nội dung CK: bỏ dấu, chỉ chữ số + khoảng trắng, ≤ 25 ký tự (nhiều ngân hàng cắt/không nhận ký tự lạ) */
export function transferNote(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 25)
    .trim()
}

const tlv = (id: string, v: string) => id + String(v.length).padStart(2, '0') + v

/** CRC-16/CCITT-FALSE theo chuẩn EMVCo */
function crc16(s: string): string {
  let crc = 0xffff
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Chuỗi VietQR (EMVCo). Có số tiền → QR động, app ngân hàng điền sẵn tiền + nội dung */
export function vietQrPayload(bin: string, account: string, amount?: number, note?: string): string {
  const merchant = tlv('00', 'A000000727') + tlv('01', tlv('00', bin) + tlv('01', account.trim())) + tlv('02', 'QRIBFTTA')
  let s = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('38', merchant) + tlv('53', '704')
  if (amount) s += tlv('54', String(Math.round(amount)))
  s += tlv('58', 'VN')
  if (note) s += tlv('62', tlv('08', note))
  s += '6304'
  return s + crc16(s)
}

/** Ma trận QR: size × size, true = ô đen */
export function qrMatrix(text: string): { size: number; dark: (r: number, c: number) => boolean } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, dark: (r, c) => !!modules.get(r, c) }
}

/** Path SVG gộp các ô đen theo hàng — nét căng ở mọi kích thước */
export function qrSvgPath(text: string): { size: number; d: string } {
  const { size, dark } = qrMatrix(text)
  let d = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dark(r, c)) continue
      let w = 1
      while (c + w < size && dark(r, c + w)) w++
      d += `M${c} ${r}h${w}v1h-${w}z`
      c += w - 1
    }
  }
  return { size, d }
}

/** Vẽ QR lên canvas tại (x, y), cạnh `px` pixel, có viền trắng 2 ô */
export function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number) {
  const { size, dark } = qrMatrix(text)
  const cell = px / (size + 4)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(x, y, px, px)
  ctx.fillStyle = '#0f172a'
  // Chồng mép 0,3 điểm để các ô liền nhau không hở vệt trắng khi canvas đang phóng (scale)
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (dark(r, c)) ctx.fillRect(x + (c + 2) * cell, y + (r + 2) * cell, cell + 0.3, cell + 0.3)
}
