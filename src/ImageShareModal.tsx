import { useEffect, useState, type ReactNode } from 'react'
import { Icon } from './icons'
import { Btn, Modal, useApp } from './ui'

/** Xem trước một ảnh vẽ bằng canvas, cho chép vào clipboard (dán Zalo) hoặc tải về */
export default function ImageShareModal({
  title,
  fileName,
  generate,
  header,
  onClose,
}: {
  title: string
  fileName: string
  /** Chỉ chạy một lần — muốn vẽ lại thì đổi `key` của modal */
  generate: () => HTMLCanvasElement | Promise<HTMLCanvasElement>
  /** Tuỳ chọn hiện phía trên ảnh (vd. nút chọn kiểu ảnh) */
  header?: ReactNode
  onClose: () => void
}) {
  const { toast } = useApp()
  const [url, setUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [size, setSize] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    Promise.resolve()
      .then(generate)
      .then(
        (canvas) =>
          new Promise<void>((resolve) =>
            canvas.toBlob((b) => {
              if (active && b) {
                objectUrl = URL.createObjectURL(b)
                setBlob(b)
                setUrl(objectUrl)
                setSize(`${canvas.width}×${canvas.height}px`)
              } else if (active) setFailed(true)
              resolve()
            }, 'image/png'),
          ),
      )
      .catch((err) => {
        console.error('Lỗi xuất ảnh:', err)
        if (active) setFailed(true)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    toast('Đang tải ảnh về máy')
  }

  const copy = async () => {
    if (!blob) return
    try {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('no clipboard')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('✓ Đã chép ảnh — mở Zalo bấm Ctrl+V để gửi')
    } catch {
      download()
    }
  }

  return (
    <Modal title={title} onClose={onClose} zIndex="z-60">
      {header}
      {failed ? (
        <div className="py-8 text-center text-sm text-red-600">Không tạo được ảnh. Thử lại nhé.</div>
      ) : !url ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-slate-500">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-green-600 border-t-transparent" />
          <span className="text-sm font-medium">Đang tạo ảnh độ phân giải cao…</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100 p-2">
            <img src={url} alt={title} className="mx-auto block w-full rounded-xl shadow" />
          </div>
          <p className="text-center text-xs text-slate-500">
            Ảnh {size} · Bấm <b>Sao chép ảnh</b> rồi dán vào Zalo (Ctrl+V hoặc chạm giữ → Dán)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={copy} className="py-2.5 text-xs">
              <Icon name="copy" className="h-4 w-4" /> Sao chép ảnh
            </Btn>
            <Btn kind="soft" onClick={download} className="py-2.5 text-xs">
              ⬇️ Tải ảnh về máy
            </Btn>
          </div>
        </div>
      )}
    </Modal>
  )
}
