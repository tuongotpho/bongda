import { useEffect, useState } from 'react'
import { generateLineupCanvas, type LineupImageParams } from './lineupImage'
import { Btn, Modal, useApp } from './ui'

export default function LineupImageModal({
  params,
  onClose,
}: {
  params: LineupImageParams
  onClose: () => void
}) {
  const { toast } = useApp()
  const [showPayment, setShowPayment] = useState(params.isFinished ?? false)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    generateLineupCanvas({ ...params, showPaymentStatus: showPayment })
      .then((canvas) => {
        if (!active) return
        const url = canvas.toDataURL('image/png')
        setDataUrl(url)
        setLoading(false)
        canvas.toBlob((b) => {
          if (active && b) {
            setBlob(b)
          }
        }, 'image/png')
      })
      .catch((err) => {
        console.error('Lỗi xuất ảnh:', err)
        toast('Không tạo được ảnh đội hình.')
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [params, showPayment, toast])

  const downloadImage = () => {
    if (!dataUrl) return
    const a = document.createElement('a')
    a.href = dataUrl
    const safeDate = params.date.replace(/[^0-9]/g, '-')
    const prefix = showPayment && params.isFinished ? 'ket-qua-thu-tien' : 'doi-hinh'
    a.download = `FC-Ky-Thuat-An-Toan-${prefix}-${safeDate}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast('Đang tải ảnh về máy!')
  }

  const copyImageToClipboard = async () => {
    if (!blob) return
    try {
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob,
          }),
        ])
        toast('✓ Đã sao chép ảnh! Bạn mở Zalo và bấm Ctrl+V để gửi ngay.')
      } else {
        downloadImage()
      }
    } catch (err) {
      console.warn('Lỗi chép ảnh vào clipboard, tải ảnh về thay thế:', err)
      downloadImage()
      toast('Trình duyệt chưa hỗ trợ chép trực tiếp, đã tự động tải ảnh về máy!')
    }
  }

  const modalTitle =
    params.isFinished && showPayment
      ? '📸 Xuất ảnh kết quả & nộp tiền nước'
      : '📸 Xuất ảnh đội hình trận đấu'

  return (
    <Modal title={modalTitle} onClose={onClose} zIndex="z-60">
      <div className="space-y-4">
        {/* Toggle tùy chọn nếu trận đấu đã kết thúc */}
        {params.isFinished && (
          <div className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 p-1 text-xs">
            <button
              type="button"
              onClick={() => setShowPayment(true)}
              className={`flex-1 rounded-lg py-1.5 font-bold transition cursor-pointer text-center ${
                showPayment
                  ? 'bg-white text-green-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              💰 Kèm cột đã đóng tiền ({params.outcome === 'A' ? 'Đội B thua' : params.outcome === 'B' ? 'Đội A thua' : 'Đội nộp phạt'})
            </button>
            <button
              type="button"
              onClick={() => setShowPayment(false)}
              className={`flex-1 rounded-lg py-1.5 font-bold transition cursor-pointer text-center ${
                !showPayment
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📋 Chỉ đội hình thuần
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-green-600 border-t-transparent" />
            <span className="text-sm font-medium">Đang tạo ảnh sân bóng HD...</span>
          </div>
        ) : dataUrl ? (
          <div className="space-y-3">
            {/* Vùng xem trước ảnh có giới hạn chiều cao để cuộn mượt mà */}
            <div className="max-h-[56vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-950 p-2 shadow-inner">
              <img
                src={dataUrl}
                alt="Đội hình trận đấu"
                className="mx-auto block w-full max-w-md rounded-xl shadow-lg"
              />
            </div>

            <p className="text-center text-xs text-slate-500">
              💡 Bấm <strong>"Sao chép ảnh"</strong> rồi mở Zalo nhấn <strong>Ctrl+V</strong> (hoặc chạm giữ chọn Dán) để gửi ảnh cho cả đội!
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn onClick={copyImageToClipboard} className="text-xs py-2.5 flex items-center justify-center gap-1.5">
                <span>📋</span> Sao chép ảnh Zalo
              </Btn>
              <Btn kind="soft" onClick={downloadImage} className="text-xs py-2.5 flex items-center justify-center gap-1.5">
                <span>⬇️</span> Tải ảnh về máy
              </Btn>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-red-600">
            Không thể tạo ảnh đội hình. Vui lòng thử lại!
          </div>
        )}
      </div>
    </Modal>
  )
}
