import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildObligations } from './logic'
import Fund from './pages/Fund'
import Matches from './pages/Matches'
import Members from './pages/Members'
import Overview from './pages/Overview'
import SettingsModal from './pages/Settings'
import Split from './pages/Split'
import { isDemo, login, logout, store, watchAuth, type AuthState } from './store'
import { DEFAULT_SETTINGS, type AppData } from './types'
import { Icon, type IconName } from './icons'
import { AppCtx, Btn, Modal, copyText, type Ctx, useToast } from './ui'

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'home' },
  { id: 'split', label: 'Chia đội', icon: 'shuffle' },
  { id: 'matches', label: 'Trận đấu', icon: 'ball' },
  { id: 'fund', label: 'Quỹ', icon: 'wallet' },
  { id: 'members', label: 'Thành viên', icon: 'users' },
]

const THEME_KEY = 'bongda-theme'
const readDark = () => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark'
  } catch {
    return false
  }
}

const initialTab = () => {
  const h = location.hash.slice(1)
  return TABS.some((t) => t.id === h) ? h : 'overview'
}

export default function App() {
  const [data, setData] = useState<AppData>({ members: [], matches: [], months: [], payments: [], expenses: [], incomes: [], settings: DEFAULT_SETTINGS })
  const [ready, setReady] = useState(false)
  const [auth, setAuth] = useState<AuthState>({ user: null, isAdmin: false })
  const [tab, setTab] = useState(initialTab)
  const [editMatchId, setEditMatchId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [authError, setAuthError] = useState<{ code: string; message: string; domain?: string } | null>(null)
  const [toastNode, toast] = useToast()
  // Sáng / tối — mỗi máy tự nhớ lựa chọn của mình
  const [dark, setDark] = useState(readDark)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f0d' : '#15803d')
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      /* chế độ ẩn danh — vẫn đổi được trong phiên */
    }
  }, [dark])
  const themeBtn = (cls: string) => (
    <button
      onClick={() => setDark((d) => !d)}
      className={cls}
      aria-label={dark ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
      title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
    >
      <Icon name={dark ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
  )

  useEffect(() => store.subscribe((d, r) => (setData(d), setReady(r))), [])
  useEffect(() => watchAuth(setAuth), [])
  useEffect(() => {
    const h = () => setTab(initialTab())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  useEffect(() => {
    document.title = data.settings.teamName
  }, [data.settings.teamName])

  const go = (t: string, id?: string) => {
    location.hash = t
    setTab(t)
    if (t === 'split') {
      setEditMatchId(id ?? null)
    }
    window.scrollTo(0, 0)
  }

  const doLogin = useCallback(() => {
    login().catch((e: any) => {
      const code = e?.code || 'unknown'
      const hostname = window.location.hostname
      if (code === 'auth/unauthorized-domain') {
        setAuthError({
          code,
          message: 'Tên miền hiện tại chưa được cấp quyền (Authorized Domain) trong Firebase Authentication.',
          domain: hostname,
        })
      } else if (code === 'auth/popup-blocked') {
        setAuthError({
          code,
          message: 'Trình duyệt hoặc khung iFrame đã chặn cửa sổ Popup đăng nhập của Google.',
          domain: hostname,
        })
      } else if (code === 'auth/popup-closed-by-user') {
        toast('Đã hủy đăng nhập.')
      } else {
        setAuthError({
          code,
          message: e?.message || String(e),
          domain: hostname,
        })
      }
    })
  }, [toast])

  const ctx: Ctx = useMemo(
    () => ({
      data,
      obligations: buildObligations(data),
      canEdit: auth.isAdmin,
      memberById: new Map(data.members.map((m) => [m.id, m])),
      toast,
      login: doLogin,
    }),
    [data, auth.isAdmin, toast, doLogin],
  )

  const current = TABS.find((t) => t.id === tab) ?? TABS[0]

  const authButtons = !isDemo &&
    (auth.user ? (
      <button
        onClick={() => logout()}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10"
        title={auth.user.email ?? undefined}
      >
        <Icon name="logout" className="h-4 w-4" /> Đăng xuất
      </button>
    ) : (
      <button
        onClick={doLogin}
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/20 transition hover:bg-white/20"
      >
        <Icon name="login" className="h-4 w-4" /> Thủ quỹ đăng nhập
      </button>
    ))

  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen lg:pl-64">
        {/* Sidebar (desktop) */}
        <aside className="keep-colors fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-green-900 to-emerald-950 text-white lg:flex">
          <div className="flex items-center gap-3 px-5 py-6">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-green-800 shadow-lg shadow-black/20">
              <Icon name="ball" className="h-6 w-6" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <div className="line-clamp-2 text-[15px] leading-snug font-bold">{data.settings.teamName}</div>
              <div className="mt-0.5 text-xs text-green-200/70">Quản lý đội bóng</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {TABS.map((t) => {
              const on = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    on ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-green-100/75 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon name={t.icon} className={`h-5 w-5 ${on ? 'text-green-300' : ''}`} />
                  {t.label}
                </button>
              )
            })}
          </nav>
          <div className="space-y-2 border-t border-white/10 p-4">
            <button
              onClick={() => setDark((d) => !d)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-green-100/90 transition hover:bg-white/10"
            >
              <Icon name={dark ? 'sun' : 'moon'} className="h-5 w-5" /> {dark ? 'Giao diện sáng' : 'Giao diện tối'}
            </button>
            {auth.isAdmin && (
              <button onClick={() => setShowSettings(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-green-100/90 transition hover:bg-white/10">
                <Icon name="settings" className="h-5 w-5" /> Cài đặt
              </button>
            )}
            {auth.user && <div className="truncate px-3 text-xs text-green-200/70">{auth.user.email}</div>}
            <div className="[&>button]:w-full">{authButtons}</div>
          </div>
        </aside>

        {/* Header (mobile) */}
        <header className="keep-colors sticky top-0 z-30 bg-green-800 px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 text-white shadow-md lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-green-800">
                <Icon name="ball" className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[15px] font-bold">{data.settings.teamName}</div>
                <div className="text-[11px] text-green-100/80">{current.label}</div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 [&>button]:px-2.5 [&>button]:text-xs">
              {themeBtn('grid h-9 w-9 cursor-pointer place-items-center rounded-xl !px-0 hover:bg-white/10')}
              {auth.isAdmin && (
                <button onClick={() => setShowSettings(true)} className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl hover:bg-white/10" aria-label="Cài đặt">
                  <Icon name="settings" className="h-5 w-5" />
                </button>
              )}
              {authButtons}
            </div>
          </div>
        </header>

        {isDemo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:px-10">
            Chế độ thử: dữ liệu chỉ lưu trên trình duyệt này. Gắn Firebase để cả đội cùng xem (xem README).
          </div>
        )}
        {!isDemo && auth.user && !auth.isAdmin && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 lg:px-10">
            Tài khoản {auth.user.email} chỉ được xem. Nhờ admin thêm email này vào danh sách thủ quỹ.
          </div>
        )}

        <main className="px-4 pt-4 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">
          <div className="mb-6 hidden items-end justify-between lg:flex">
            <div>
              <p className="text-xs font-semibold tracking-widest text-green-700 uppercase">{data.settings.teamName}</p>
              <h1 className="mt-1 text-[28px] font-extrabold tracking-tight text-slate-900">{current.label}</h1>
            </div>
          </div>
          <div key={tab} className="animate-fade-up">
            {!ready ? (
              <p className="py-10 text-center text-slate-500">Đang tải dữ liệu…</p>
            ) : tab === 'split' ? (
              <Split go={go} editMatchId={editMatchId} />
            ) : tab === 'matches' ? (
              <Matches go={go} />
            ) : tab === 'fund' ? (
              <Fund />
            ) : tab === 'members' ? (
              <Members />
            ) : (
              <Overview go={go} />
            )}
          </div>
        </main>

        {/* Bottom tabs (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="grid grid-cols-5 px-1">
            {TABS.map((t) => {
              const on = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex cursor-pointer flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] transition ${on ? 'font-semibold text-green-800' : 'text-slate-500'}`}
                >
                  <span className={`grid h-7 w-12 place-items-center rounded-full transition ${on ? 'bg-green-100' : ''}`}>
                    <Icon name={t.icon} className="h-5 w-5" strokeWidth={on ? 2.1 : 1.8} />
                  </span>
                  {t.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {authError && (
        <Modal title="Lỗi đăng nhập Thủ quỹ" onClose={() => setAuthError(null)}>
          <div className="space-y-4 text-sm text-slate-700">
            {authError.code === 'auth/unauthorized-domain' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 font-medium">
                  Tên miền chưa được thêm vào Authorized Domains của Firebase
                </div>
                <p className="text-xs leading-relaxed text-slate-600">
                  Firebase Authentication chỉ cho phép đăng nhập Google từ các tên miền có trong danh sách được cấp phép của dự án <strong>app-from-ai</strong>.
                </p>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-bold text-slate-600 mb-1">Tên miền hiện tại cần thêm:</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-lg bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 border border-slate-200 truncate select-all">
                      {authError.domain}
                    </code>
                    <Btn
                      kind="soft"
                      className="text-xs shrink-0"
                      onClick={async () => {
                        await copyText(authError.domain ?? '')
                        toast('Đã sao chép tên miền!')
                      }}
                    >
                      <Icon name="copy" className="h-3.5 w-3.5" /> Copy
                    </Btn>
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1.5">
                  <div className="font-bold">Cách thêm tên miền (1 phút):</div>
                  <ol className="list-decimal pl-4 space-y-1 leading-relaxed">
                    <li>Vào <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="underline font-bold text-green-800">Firebase Console</a> → Chọn project <strong>app-from-ai</strong>.</li>
                    <li>Vào mục <strong>Authentication</strong> → tab <strong>Settings</strong>.</li>
                    <li>Cuộn xuống mục <strong>Authorized domains</strong> → bấm <strong>Add domain</strong>.</li>
                    <li>Dán tên miền ở trên vào và bấm <strong>Done</strong>. Sau đó quay lại đây bấm đăng nhập lại.</li>
                  </ol>
                </div>
              </div>
            ) : authError.code === 'auth/popup-blocked' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 font-medium">
                  Trình duyệt chặn cửa sổ Popup đăng nhập
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Cửa sổ đăng nhập Google bị trình duyệt chặn. Bạn có thể mở trực tiếp ứng dụng trong một tab mới của trình duyệt để đăng nhập bình thường:
                </p>
                <div className="text-center pt-2">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-xl bg-green-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-green-800"
                  >
                    ↗ Mở ứng dụng trong tab mới
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 font-medium">
                  Mã lỗi: {authError.code}
                </div>
                <p className="text-xs text-slate-600">{authError.message}</p>
              </div>
            )}

            <div className="pt-2 text-right">
              <Btn onClick={() => setAuthError(null)} className="text-xs px-4 py-2">
                Đóng
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {toastNode}
    </AppCtx.Provider>
  )
}

