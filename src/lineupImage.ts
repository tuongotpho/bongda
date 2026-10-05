import { fmtDate, money } from './logic'
import type { Member } from './types'

export interface LineupImageParams {
  teamName: string
  date: string
  teamA: string[]
  teamB: string[]
  waterFee: number
  memberById: Map<string, Member>

  // Thông tin kết quả trận đấu & đóng tiền
  isFinished?: boolean
  scoreA?: number | null
  scoreB?: number | null
  penaltyScoreA?: number | null
  penaltyScoreB?: number | null
  penaltyWinner?: 'A' | 'B' | null
  outcome?: 'A' | 'B' | 'draw' | 'pending'
  /** map memberId -> boolean (đã nộp phạt hay chưa) */
  paidByMemberId?: Map<string, boolean>
  /** map memberId -> boolean (khoản phạt được trừ từ tiền ứng hay không) */
  paidFromAdvanceByMemberId?: Map<string, boolean>
  /** Tập hợp ID những người có nghĩa vụ nộp phạt tiền nước */
  chargedMemberIds?: Set<string>
  /** Cho phép bật/tắt hiển thị trạng thái đóng tiền (mặc định true khi trận đã có kết quả) */
  showPaymentStatus?: boolean
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Vẽ ảnh đội hình trận đấu độ phân giải cao (2x retina)
 * - Khi chưa đá (hoặc showPaymentStatus = false): Chỉ xuất ảnh chia 2 đội thuần túy, TUYỆT ĐỐI không có nội dung thu tiền.
 * - Khi đã đá xong và xác định đội thua: Hiển thị tỉ số, đội thua, và cột trạng thái [✓ ĐÃ ĐÓNG] / [✕ CHƯA ĐÓNG] từng cầu thủ.
 */
export async function generateLineupCanvas(params: LineupImageParams): Promise<HTMLCanvasElement> {
  const {
    teamName,
    date,
    teamA,
    teamB,
    waterFee,
    memberById,
    isFinished = false,
    scoreA,
    scoreB,
    penaltyScoreA,
    penaltyScoreB,
    penaltyWinner,
    outcome = 'pending',
    paidByMemberId,
    paidFromAdvanceByMemberId,
    chargedMemberIds,
    showPaymentStatus = isFinished,
  } = params

  const isPostMatch = isFinished && showPaymentStatus

  const safeTeamA = Array.isArray(params.teamA) ? params.teamA : []
  let safeTeamB = Array.isArray(params.teamB) ? params.teamB : []

  // Nếu là trận nhập từ sổ cũ không có danh sách đội hình nhưng có người bị phạt:
  if (!safeTeamA.length && !safeTeamB.length && chargedMemberIds && chargedMemberIds.size > 0) {
    safeTeamB = Array.from(chargedMemberIds)
  }

  const maxPlayers = Math.max(safeTeamA.length, safeTeamB.length, 5)
  const cardW = 1080
  const itemH = 68
  const listH = maxPlayers * itemH + 130
  const headerH = isPostMatch ? 320 : 225
  const footerH = 120
  const cardH = headerH + listH + footerH

  const canvas = document.createElement('canvas')
  canvas.width = cardW
  canvas.height = cardH
  const ctx = canvas.getContext('2d')!

  // 1. Nền sân cỏ bóng đá cao cấp (gradient xanh lá thẫm)
  const bg = ctx.createLinearGradient(0, 0, cardW, cardH)
  bg.addColorStop(0, '#042f24')
  bg.addColorStop(0.5, '#064e3b')
  bg.addColorStop(1, '#022c22')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cardW, cardH)

  // Hoạ tiết sọc cỏ sân bóng
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'
  const stripeH = 90
  for (let y = 0; y < cardH; y += stripeH * 2) {
    ctx.fillRect(0, y, cardW, stripeH)
  }

  // Đường kẻ vạch sân bóng đá trang trí
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.lineWidth = 4

  // Vòng tròn giữa sân
  ctx.beginPath()
  ctx.arc(cardW / 2, cardH / 2, 220, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cardW / 2, cardH / 2, 8, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.fill()

  // Đường phân cách giữa sân
  ctx.beginPath()
  ctx.moveTo(cardW / 2, 90)
  ctx.lineTo(cardW / 2, cardH - 80)
  ctx.stroke()

  // Khung viền ngoài sân bóng
  roundRect(ctx, 36, 36, cardW - 72, cardH - 72, 32)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
  ctx.lineWidth = 3
  ctx.stroke()

  // 2. HEADER
  ctx.textAlign = 'center'

  // Icon bóng
  ctx.font = '48px sans-serif'
  ctx.fillText('⚽', cardW / 2, 96)

  // Tên CLB đúng chính tả: FC Kỹ thuật - An toàn & friends
  let clubName = teamName?.trim()
  if (!clubName || clubName === 'Đội bóng') {
    clubName = 'FC Kỹ thuật - An toàn & friends'
  }

  ctx.fillStyle = '#ffffff'
  let fontSize = 40
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  while (ctx.measureText(clubName).width > cardW - 140 && fontSize > 24) {
    fontSize -= 2
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  }
  ctx.fillText(clubName, cardW / 2, 146)

  // Ngày đá & Tiêu đề
  ctx.fillStyle = '#a7f3d0'
  ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const subTitle = isPostMatch
    ? `KẾT QUẢ & ĐỘI HÌNH THI ĐẤU · ${fmtDate(date).toUpperCase()}`
    : `ĐỘI HÌNH THI ĐẤU · ${fmtDate(date).toUpperCase()}`
  ctx.fillText(subTitle, cardW / 2, 182)

  // Nếu là trận ĐÃ ĐÁ XONG (isPostMatch):
  if (isPostMatch) {
    // 2.1 Hộp hiển thị Tỉ số trận đấu
    const scored = scoreA != null && scoreB != null
    const tied = scored ? scoreA === scoreB : outcome === 'draw' || !!penaltyWinner
    const hasPen = tied && (penaltyWinner || (penaltyScoreA != null && penaltyScoreB != null))

    // Không có tỉ số (chọn nhanh đội thắng) thì ghi kết quả bằng chữ — không bịa "0 – 0"
    let scoreLine = scored
      ? `🟦 ĐỘI A   ${scoreA} – ${scoreB}   ĐỘI B 🟧`
      : tied
        ? '🟦 ĐỘI A   HOÀ   ĐỘI B 🟧'
        : `🟦 ĐỘI A   ${outcome === 'A' ? 'THẮNG' : 'THUA'}   ĐỘI B 🟧`
    if (hasPen) {
      if (penaltyScoreA != null && penaltyScoreB != null) {
        scoreLine += `  (Pen: ${penaltyScoreA}-${penaltyScoreB} · Đội ${penaltyWinner} thắng)`
      } else if (penaltyWinner) {
        scoreLine += `  (Đội ${penaltyWinner} thắng Pen)`
      }
    }

    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const scoreBoxW = Math.min(cardW - 120, ctx.measureText(scoreLine).width + 48)
    roundRect(ctx, cardW / 2 - scoreBoxW / 2, 202, scoreBoxW, 42, 21)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.fillStyle = '#ffffff'
    ctx.fillText(scoreLine, cardW / 2, 231)

    // 2.2 Banner thông báo Đội thua nộp phạt & Tiến độ thu tiền
    let outcomeText = ''
    if (outcome === 'A') {
      outcomeText = `🏆 Đội A thắng  ·  💧 Đội B nộp phạt: ${money(waterFee)}/người`
    } else if (outcome === 'B') {
      outcomeText = `🏆 Đội B thắng  ·  💧 Đội A nộp phạt: ${money(waterFee)}/người`
    } else if (outcome === 'draw') {
      outcomeText = `🤝 Hòa trận  ·  💧 Nộp phạt: ${money(waterFee)}/người`
    } else {
      outcomeText = `💧 Tiền nước: ${money(waterFee)}/người`
    }

    // Tính toán tiến độ nộp tiền
    let totalObligations = 0
    let paidCount = 0
    if (chargedMemberIds && chargedMemberIds.size > 0) {
      totalObligations = chargedMemberIds.size
      for (const id of chargedMemberIds) {
        if (paidByMemberId?.get(id)) paidCount++
      }
    } else {
      const losingList = outcome === 'A' ? teamB : outcome === 'B' ? teamA : []
      totalObligations = losingList.length
      for (const id of losingList) {
        if (paidByMemberId?.get(id)) paidCount++
      }
    }

    if (totalObligations > 0) {
      const remaining = totalObligations - paidCount
      outcomeText += `  •  Đã đóng: ${paidCount}/${totalObligations} ${remaining === 0 ? '(Đủ 100% 🎉)' : `(Còn ${remaining} người)`}`
    }

    ctx.font = '600 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const feeW = Math.min(cardW - 100, ctx.measureText(outcomeText).width + 36)
    roundRect(ctx, cardW / 2 - feeW / 2, 254, feeW, 36, 18)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fill()
    ctx.strokeStyle = remainingCount(totalObligations, paidCount) === 0 ? 'rgba(74, 222, 128, 0.4)' : 'rgba(251, 146, 60, 0.4)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.fillStyle = '#fef08a'
    ctx.fillText(outcomeText, cardW / 2, 278)
  } else {
    // KHI CHƯA ĐÁ: TUYỆT ĐỐI KHÔNG CÓ NỘI DUNG THU TIỀN!
    // Chỉ có thông điệp bóng đá đẹp
    const cheerText = '⚽ Chúc hai đội thi đấu cống hiến, fair-play và nhiều bàn thắng!'
    ctx.font = '500 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    const cheerW = ctx.measureText(cheerText).width + 36
    roundRect(ctx, cardW / 2 - cheerW / 2, 198, cheerW, 32, 16)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.fillStyle = '#d1fae5'
    ctx.fillText(cheerText, cardW / 2, 220)
  }

  // 3. VẼ 2 ĐỘI A VÀ B
  const colW = (cardW - 72 - 36) / 2
  const colY = headerH + 18

  const drawTeam = (
    teamLetter: 'A' | 'B',
    playerIds: string[],
    colX: number,
  ) => {
    const isA = teamLetter === 'A'
    const teamColor = isA ? '#38bdf8' : '#fb923c'
    const teamBadgeBg = isA ? 'rgba(14, 165, 233, 0.2)' : 'rgba(249, 115, 22, 0.2)'
    const teamBadgeBorder = isA ? 'rgba(56, 189, 248, 0.5)' : 'rgba(251, 146, 60, 0.5)'

    const isWinner = isPostMatch && outcome === teamLetter
    const isLoser = isPostMatch && outcome !== 'draw' && outcome !== 'pending' && outcome !== teamLetter

    // Tổng số sao & thủ môn
    let totalSkill = 0
    let gkCount = 0
    let teamPaidCount = 0
    let teamChargedCount = 0

    for (const id of playerIds) {
      const m = memberById.get(id)
      totalSkill += m?.skill ?? 3
      if (m?.isGK) gkCount++

      const isCharged = chargedMemberIds ? chargedMemberIds.has(id) : isLoser
      if (isCharged) {
        teamChargedCount++
        if (paidByMemberId?.get(id)) teamPaidCount++
      }
    }

    // Hộp chứa đội
    roundRect(ctx, colX, colY, colW, listH, 24)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fill()
    ctx.strokeStyle = teamBadgeBorder
    ctx.lineWidth = 2
    ctx.stroke()

    // Header của đội
    roundRect(ctx, colX + 16, colY + 16, colW - 32, 70, 18)
    ctx.fillStyle = teamBadgeBg
    ctx.fill()
    ctx.strokeStyle = teamBadgeBorder
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.textAlign = 'left'
    ctx.fillStyle = teamColor
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    let teamHeaderTitle = `${isA ? '🟦' : '🟧'} ĐỘI ${teamLetter}`
    if (isPostMatch) {
      if (isWinner) teamHeaderTitle += ' · 🏆 THẮNG'
      else if (isLoser) teamHeaderTitle += ' · 💧 THUA'
      else if (outcome === 'draw') teamHeaderTitle += ' · 🤝 HÒA'
    }
    ctx.fillText(teamHeaderTitle, colX + 28, colY + 58)

    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    if (isPostMatch && teamChargedCount > 0) {
      ctx.fillText(`${teamPaidCount}/${teamChargedCount} đã nộp phạt`, colX + colW - 28, colY + 58)
    } else {
      ctx.fillText(`${playerIds.length} người · ${totalSkill}★`, colX + colW - 28, colY + 58)
    }

    // Danh sách cầu thủ
    let py = colY + 102
    for (let i = 0; i < playerIds.length; i++) {
      const id = playerIds[i]
      const mem = memberById.get(id)
      const pName = mem?.name ?? '(đã xoá)'
      const isGK = mem?.isGK ?? false
      const pSkill = mem?.skill ?? 3

      // Hộp từng cầu thủ
      roundRect(ctx, colX + 16, py, colW - 32, 56, 14)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Avatar tròn nhỏ chữ cái đầu
      const initial = pName.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '•'
      ctx.beginPath()
      ctx.arc(colX + 44, py + 28, 16, 0, Math.PI * 2)
      ctx.fillStyle = isA ? '#0284c7' : '#ea580c'
      ctx.fill()

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(initial, colX + 44, py + 34)

      // Cầu thủ có bị tính tiền phạt trận này không?
      const isPlayerCharged = chargedMemberIds ? chargedMemberIds.has(id) : isLoser

      // Tên cầu thủ (rút gọn nếu cần dành chỗ cho cột đóng tiền)
      ctx.textAlign = 'left'
      ctx.fillStyle = '#f8fafc'
      ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      const maxChar = isPostMatch ? 13 : 17
      let dispName = pName
      if (dispName.length > maxChar) dispName = dispName.slice(0, maxChar - 1) + '…'
      ctx.fillText(dispName, colX + 70, py + 35)

      // VỊ TRÍ BÊN PHẢI CỦA ROW:
      const rightEdge = colX + colW - 32

      if (isPostMatch && isPlayerCharged) {
        // CỘT TRẠNG THÁI ĐÓNG TIỀN CHO ĐỘI THUA / CẦU THỦ BỊ PHẠT:
        const hasPaid = paidByMemberId?.get(id) ?? false
        const isFromAdvance = paidFromAdvanceByMemberId?.get(id) ?? false
        const badgeW = isFromAdvance ? 142 : 126
        const badgeH = 34
        const badgeX = rightEdge - badgeW - 8
        const badgeY = py + 11

        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 17)
        if (hasPaid) {
          if (isFromAdvance) {
            ctx.fillStyle = 'rgba(2, 132, 199, 0.4)'
            ctx.fill()
            ctx.strokeStyle = '#38bdf8'
            ctx.lineWidth = 1.5
            ctx.stroke()

            ctx.textAlign = 'center'
            ctx.fillStyle = '#bae6fd'
            ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillText('💧 TRỪ TIỀN ỨNG', badgeX + badgeW / 2, badgeY + 22)
          } else {
            ctx.fillStyle = 'rgba(22, 163, 74, 0.35)'
            ctx.fill()
            ctx.strokeStyle = '#22c55e'
            ctx.lineWidth = 1.5
            ctx.stroke()

            ctx.textAlign = 'center'
            ctx.fillStyle = '#86efac'
            ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            ctx.fillText('✓ ĐÃ ĐÓNG', badgeX + badgeW / 2, badgeY + 22)
          }
        } else {
          ctx.fillStyle = 'rgba(220, 38, 38, 0.35)'
          ctx.fill()
          ctx.strokeStyle = '#ef4444'
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.textAlign = 'center'
          ctx.fillStyle = '#fca5a5'
          ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          ctx.fillText('✕ CHƯA ĐÓNG', badgeX + badgeW / 2, badgeY + 22)
        }

        // GK icon ở bên trái badge đóng tiền nếu có
        if (isGK) {
          ctx.textAlign = 'right'
          ctx.font = '16px sans-serif'
          ctx.fillText('🧤', badgeX - 8, py + 35)
        }
      } else if (isPostMatch && isWinner) {
        // Đội thắng trận (không bị phạt tiền nước)
        const badgeW = 100
        const badgeH = 30
        const badgeX = rightEdge - badgeW - 8
        const badgeY = py + 13

        roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 15)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.textAlign = 'center'
        ctx.fillStyle = '#7dd3fc'
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillText('MIỄN PHẠT', badgeX + badgeW / 2, badgeY + 20)

        // GK icon nếu có
        if (isGK) {
          ctx.textAlign = 'right'
          ctx.font = '16px sans-serif'
          ctx.fillText('🧤', badgeX - 8, py + 35)
        }
      } else {
        // KHI CHƯA ĐÁ: Chỉ hiển thị Thủ môn 🧤 và Sao ★, KHÔNG có cột thu tiền
        ctx.textAlign = 'right'
        ctx.fillStyle = '#facc15'
        ctx.font = '17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.fillText('★'.repeat(pSkill), rightEdge - 8, py + 34)

        if (isGK) {
          ctx.font = '16px sans-serif'
          ctx.fillText('🧤', rightEdge - pSkill * 16 - 16, py + 35)
        }
      }

      py += itemH
    }
  }

  // Vẽ Đội A (cột trái) và Đội B (cột phải)
  drawTeam('A', safeTeamA, 54)
  drawTeam('B', safeTeamB, 54 + colW + 18)

  // 4. FOOTER
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.65)'
  ctx.font = 'italic 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  const footerMessage = isPostMatch
    ? '⚽ Anh em đội thua vui lòng nộp phạt đầy đủ vào quỹ để thủ quỹ thanh toán tiền nước!'
    : '⚽ Chúc hai đội thi đấu cống hiến, fair-play và nhiều bàn thắng!'
  ctx.fillText(footerMessage, cardW / 2, cardH - 55)

  return canvas
}

function remainingCount(total: number, paid: number): number {
  return Math.max(0, total - paid)
}
