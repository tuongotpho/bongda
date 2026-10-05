/**
 * Lớp lưu dữ liệu. Hai chế độ:
 *  - Firebase (khi có biến môi trường VITE_FIREBASE_*): cả đội cùng xem một bộ dữ liệu, chỉ admin được ghi.
 *  - Chế độ thử (không cấu hình gì): lưu trong trình duyệt của máy đang mở, ai mở cũng sửa được.
 */
import { initializeApp } from 'firebase/app'
import { getAnalytics, isSupported } from 'firebase/analytics'
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { collection, deleteDoc, doc, getDocs, getFirestore, onSnapshot, setDoc, writeBatch } from 'firebase/firestore'
import { DEFAULT_SETTINGS, type AppData, type Settings } from './types'

export type Coll = 'members' | 'matches' | 'months' | 'payments' | 'expenses' | 'incomes'
export const COLLS: Coll[] = ['members', 'matches', 'months', 'payments', 'expenses', 'incomes']

const env = import.meta.env
const fbConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
}
export const isDemo = !fbConfig.apiKey || !fbConfig.projectId

const adminEmails = String(env.VITE_ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

const emptyData = (): AppData => ({
  members: [],
  matches: [],
  months: [],
  payments: [],
  expenses: [],
  incomes: [],
  settings: { ...DEFAULT_SETTINGS },
})

export interface Store {
  subscribe(cb: (d: AppData, ready: boolean) => void): () => void
  put(coll: Coll, id: string, value: object): Promise<void>
  remove(coll: Coll, id: string): Promise<void>
  removeMany(items: { coll: Coll; id: string }[]): Promise<void>
  saveSettings(s: Settings): Promise<void>
  /** Xoá sạch rồi nạp lại toàn bộ (khôi phục sao lưu / chuyển sổ cũ) */
  replaceAll(d: AppData): Promise<void>
}

// ---------- Chế độ thử: localStorage ----------

const LS_KEY = 'bongda-data-v1'
type LocalShape = Record<Coll, Record<string, object>> & { settings: Settings }

function createLocalStore(): Store {
  const listeners = new Set<(d: AppData, ready: boolean) => void>()
  const load = (): LocalShape => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) return { ...emptyShape(), ...JSON.parse(raw) }
    } catch {
      /* dữ liệu hỏng thì bắt đầu lại */
    }
    return emptyShape()
  }
  const emptyShape = (): LocalShape => ({
    members: {},
    matches: {},
    months: {},
    payments: {},
    expenses: {},
    incomes: {},
    settings: { ...DEFAULT_SETTINGS },
  })
  let state = load()
  const toData = (): AppData => {
    const d = emptyData()
    for (const c of COLLS) (d[c] as object[]) = Object.entries(state[c]).map(([id, v]) => ({ ...v, id }))
    d.settings = { ...DEFAULT_SETTINGS, ...state.settings }
    return d
  }
  const commit = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state))
    } catch {
      /* hết chỗ / chế độ ẩn danh — vẫn chạy trong phiên */
    }
    const d = toData()
    listeners.forEach((l) => l(d, true))
  }
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY) {
      state = load()
      const d = toData()
      listeners.forEach((l) => l(d, true))
    }
  })
  return {
    subscribe(cb) {
      listeners.add(cb)
      cb(toData(), true)
      return () => listeners.delete(cb)
    },
    async put(coll, id, value) {
      state[coll] = { ...state[coll], [id]: value }
      commit()
    },
    async remove(coll, id) {
      const next = { ...state[coll] }
      delete next[id]
      state[coll] = next
      commit()
    },
    async removeMany(items) {
      for (const { coll, id } of items) {
        const next = { ...state[coll] }
        delete next[id]
        state[coll] = next
      }
      commit()
    },
    async saveSettings(s) {
      state.settings = s
      commit()
    },
    async replaceAll(d) {
      const next = emptyShape()
      for (const c of COLLS) for (const x of d[c] ?? []) next[c][x.id] = x
      next.settings = { ...DEFAULT_SETTINGS, ...d.settings }
      state = next
      commit()
    },
  }
}

// ---------- Firebase ----------

const fbApp = isDemo ? null : initializeApp(fbConfig)
if (fbApp && fbConfig.measurementId && typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) getAnalytics(fbApp)
  }).catch(() => {})
}
const dbId = (env.VITE_FIREBASE_DATABASE_ID as string | undefined) || '(default)'
const db = fbApp ? getFirestore(fbApp, dbId) : null
const auth = fbApp ? getAuth(fbApp) : null

/** Firestore không nhận giá trị undefined */
const clean = (v: object) => Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && k !== 'id'))

function createFirebaseStore(): Store {
  const fs = db!
  return {
    subscribe(cb) {
      const d = emptyData()
      const loaded = new Set<string>()
      const total = COLLS.length + 1
      const emit = () => cb({ ...d }, loaded.size === total)
      const unsubs = COLLS.map((c) =>
        onSnapshot(collection(fs, c), (snap) => {
          ;(d[c] as object[]) = snap.docs.map((x) => ({ ...x.data(), id: x.id }))
          loaded.add(c)
          emit()
        }),
      )
      unsubs.push(
        onSnapshot(doc(fs, 'config', 'settings'), (snap) => {
          d.settings = { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) }
          loaded.add('settings')
          emit()
        }),
      )
      return () => unsubs.forEach((u) => u())
    },
    put: (coll, id, value) => setDoc(doc(fs, coll, id), clean(value)),
    remove: (coll, id) => deleteDoc(doc(fs, coll, id)),
    async removeMany(items) {
      // Firestore giới hạn 500 thao tác / lô
      for (let i = 0; i < items.length; i += 450) {
        const b = writeBatch(fs)
        items.slice(i, i + 450).forEach(({ coll, id }) => b.delete(doc(fs, coll, id)))
        await b.commit()
      }
    },
    saveSettings: (s) => setDoc(doc(fs, 'config', 'settings'), s),
    async replaceAll(d) {
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = []
      for (const c of COLLS) {
        const existing = await getDocs(collection(fs, c))
        existing.forEach((x) => ops.push((b) => b.delete(x.ref)))
        for (const x of d[c] ?? []) ops.push((b) => b.set(doc(fs, c, x.id), clean(x)))
      }
      ops.push((b) => b.set(doc(fs, 'config', 'settings'), { ...DEFAULT_SETTINGS, ...d.settings }))
      for (let i = 0; i < ops.length; i += 450) {
        const b = writeBatch(fs)
        ops.slice(i, i + 450).forEach((op) => op(b))
        await b.commit()
      }
    },
  }
}

export const store: Store = isDemo ? createLocalStore() : createFirebaseStore()

// ---------- Đăng nhập (chỉ thủ quỹ / admin cần) ----------

export interface AuthState {
  user: { email: string; name: string } | null
  isAdmin: boolean
}

export function watchAuth(cb: (s: AuthState) => void): () => void {
  if (!auth) {
    cb({ user: null, isAdmin: true })
    return () => {}
  }
  return onAuthStateChanged(auth, (u: User | null) => {
    const email = u?.email?.toLowerCase() ?? ''
    cb({
      user: u ? { email, name: u.displayName ?? email } : null,
      isAdmin: !!u && adminEmails.includes(email),
    })
  })
}

export const login = () => {
  if (!auth) return Promise.resolve()
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(auth, provider).then(() => {})
}
export const logout = () => (auth ? signOut(auth) : Promise.resolve())
