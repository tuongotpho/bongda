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
import { AppCtx, Btn, Modal, copyText, type Ctx, useToast } from './ui'

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: '🏠' },
  { id: 'split', label: 'Chia đội', icon: '🎲' },
  { id: 'matches', label: 'Trận đấu', icon: '⚽' },
  { id: 'fund', label: 'Quỹ', icon: '💰' },
  { id: 'members', label: 'Thành viên', icon: '👥' },
] as const

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
      <button onClick={() => logout()} className="rounded-xl px-3 py-2 text-sm font-medium transition hover:bg-white/10" title={auth.user.email ?? undefined}>
        Đăng xuất
      </button>
    ) : (
      <button onClick={doLogin} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/20 transition hover:bg-white/20">
        Thủ quỹ đăng nhập
      </button>
    ))

  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen lg:pl-64">
        {/* Sidebar (desktop) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-green-800 via-green-900 to-emerald-950 text-white lg:flex">
          <div className="flex items-center gap-3 px-6 py-6">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-2xl ring-1 ring-white/20">⚽</div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold leading-tight">{data.settings.teamName}</div>
              <div className="text-xs text-green-200/80">Quản lý đội bóng</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3">
            {TABS.map((t) => {
              const on = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    on ? 'bg-white text-green-900 shadow-lg shadow-black/20' : 'text-green-100/90 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className={`text-lg transition ${on ? '' : 'group-hover:scale-110'}`}>{t.icon}</span>
                  {t.label}
                </button>
              )
            })}
          </nav>
          <div className="space-y-2 border-t border-white/10 p-4">
            {auth.isAdmin && (
              <button onClick={() => setShowSettings(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-green-100/90 transition hover:bg-white/10">
                <span className="text-lg">⚙️</span> Cài đặt
              </button>
            )}
            {auth.user && <div className="truncate px-3 text-xs text-green-200/70">{auth.user.email}</div>}
            <div className="[&>button]:w-full">{authButtons}</div>
          </div>
        </aside>

        {/* Header (mobile) */}
        <header className="sticky top-0 z-30 bg-gradient-to-r from-green-800 to-emerald-700 px-4 py-3 text-white shadow-md lg:hidden">
          <div className="flex items-center justify-between gap-2">
            <h1 className="truncate text-lg font-bold">⚽ {data.settings.teamName}</h1>
            <div className="flex shrink-0 items-center gap-1">
              {auth.isAdmin && (
                <button onClick={() => setShowSettings(true)} className="rounded-xl px-2 py-1.5 hover:bg-white/10" aria-label="Cài đặt">
                  ⚙️
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
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">
                {current.icon} {current.label}
              </h1>
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
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="grid grid-cols-5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${tab === t.id ? 'font-semibold text-green-700' : 'text-slate-500'}`}
              >
                <span className={`text-lg leading-none transition ${tab === t.id ? 'scale-110' : ''}`}>{t.icon}</span>
                {t.label}
              </button>
            ))}
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
                  ⚠️ Tên miền chưa được thêm vào Authorized Domains của Firebase
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
                      📋 Copy
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
                  ⚠️ Trình duyệt chặn cửa sổ Popup đăng nhập
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

