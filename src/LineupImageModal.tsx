import { useState } from 'react'
import ImageShareModal from './ImageShareModal'
import { generateLineupCanvas, type LineupImageParams } from './lineupImage'

export default function LineupImageModal({ params, onClose }: { params: LineupImageParams; onClose: () => void }) {
  const [showPayment, setShowPayment] = useState(params.isFinished ?? false)
  const withPayment = showPayment && !!params.isFinished
  const tab = (on: boolean, label: string, pick: boolean) => (
    <button
      type="button"
      onClick={() => setShowPayment(pick)}
      className={`flex-1 cursor-pointer rounded-lg py-1.5 text-center font-bold transition ${
        on ? 'bg-white text-green-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  )

  return (
    <ImageShareModal
      // Đổi kiểu ảnh → đổi key để modal vẽ lại
      key={String(withPayment)}
      title={withPayment ? 'Xuất ảnh kết quả & nộp tiền' : 'Xuất ảnh đội hình'}
      fileName={`${withPayment ? 'ket-qua-thu-tien' : 'doi-hinh'}-${params.date.replace(/[^0-9]/g, '-')}.png`}
      generate={() => generateLineupCanvas({ ...params, showPaymentStatus: showPayment })}
      header={
        params.isFinished && (
          <div className="mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 p-1 text-xs">
            {tab(
              showPayment,
              `Kèm cột đã đóng tiền (${params.outcome === 'A' ? 'Đội B thua' : params.outcome === 'B' ? 'Đội A thua' : 'Đội nộp phạt'})`,
              true,
            )}
            {tab(!showPayment, 'Chỉ đội hình', false)}
          </div>
        )
      }
      onClose={onClose}
    />
  )
}
