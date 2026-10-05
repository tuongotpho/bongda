import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { Btn } from './ui'

/** Sự kiện Chrome/Android bắn ra khi trang đủ điều kiện cài như app */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const HIDE_KEY = 'bongda-install-hidden'
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/**
 * Thẻ gợi ý "Cài app lên màn hình chính" — chỉ hiện trên điện thoại, khi chưa cài, chưa bấm ẩn.
 * Android: bấm là hiện hộp cài của Chrome. iPhone: Apple không cho tự cài → hướng dẫn 3 bước.
 */
export default function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1' || isStandalone()
    } catch {
      return isStandalone()
    }
  })
  const [showIOS, setShowIOS] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // tự hiện nút của mình thay cho thanh cài mặc định
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const hide = () => {
    setHidden(true)
    try {
      localStorage.setItem(HIDE_KEY, '1')
    } catch {
      /* chế độ ẩn danh */
    }
  }

  // Không phải iPhone mà trình duyệt cũng không cho cài (vd. đang mở trong Zalo) → không làm phiền
  if (hidden || (!prompt && !isIOS())) return null

  const install = async () => {
    if (prompt) {
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') hide()
      setPrompt(null)
    } else setShowIOS((v) => !v)
  }

  return (
    <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 p-3 lg:hidden">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold text-green-900">Cài app lên màn hình chính</div>
          <div className="text-xs text-green-800">Mở nhanh như app thật, toàn màn hình.</div>
        </div>
        <Btn className="shrink-0 px-3 py-1.5 text-xs" onClick={install}>
          Cài
        </Btn>
        <button onClick={hide} className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-green-700 hover:bg-green-100" aria-label="Ẩn gợi ý cài app">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      {showIOS && (
        <ol className="mt-3 list-decimal space-y-1 border-t border-green-200 pt-3 pl-5 text-xs text-green-900">
          <li>
            Mở trang này bằng <b>Safari</b> (nếu đang trong Zalo: bấm <b>⋯</b> → Mở bằng trình duyệt).
          </li>
          <li>
            Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên) ở thanh dưới.
          </li>
          <li>
            Chọn <b>Thêm vào MH chính</b> → <b>Thêm</b>.
          </li>
        </ol>
      )}
    </div>
  )
}
