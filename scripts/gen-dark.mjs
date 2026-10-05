// Sinh src/dark.css — chế độ tối bằng cách "đổi bảng màu" thay vì sửa tay từng class.
// Chạy tự động trước mỗi lần dev/build (npm predev/prebuild), tay thì: node scripts/gen-dark.mjs
//
// Nguyên tắc:
//  - Giữ bản gốc của mọi màu ở :root (--k-*), rồi trong html.dark body đổi màu:
//      slate → thang xám tối riêng; các màu khác → lật thang (50↔950, 100↔900, …)
//    → nền nhạt thành nền tối cùng tông, chữ đậm thành chữ sáng.
//  - Nút / nhãn nền ĐẶC (bg-*-500…950, thường kèm chữ trắng) phải GIỮ màu gốc:
//    quét src tìm đúng các class đó (kể cả hover:, /60…) và ghim lại.
//  - Vùng .keep-colors (thanh menu xanh, đầu trang, thông báo) giữ nguyên màu gốc.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PALETTES = ['green', 'emerald', 'red', 'amber', 'sky', 'orange', 'violet', 'teal', 'rose', 'yellow', 'blue']
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const mirror = (s) => SHADES[SHADES.length - 1 - SHADES.indexOf(s)]
// Thang xám tối — chỉnh tay cho dễ đọc (không lật máy móc)
const SLATE_DARK = {
  50: '#151d1b', 100: '#1c2623', 200: '#2a3532', 300: '#3b4744', 400: '#66736f', 500: '#8c9995',
  600: '#a7b3b0', 700: '#c4cdcb', 800: '#dae1df', 900: '#ecf0ef', 950: '#f6f8f7',
}
const SURFACE = '#111816' // nền thẻ (thay bg-white)
const PAGE = '#0a0f0d' // nền trang

const files = []
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p)
  }
}
walk('src')
const src = files.map((f) => readFileSync(f, 'utf8')).join('\n')

// class nền đặc cần ghim: [variants:]bg-{màu}-{500..950}[/NN]
const ALL = ['slate', ...PALETTES].join('|')
const re = new RegExp(`(?<![\\w-])((?:[a-z-]+:)*)bg-(${ALL})-(500|600|700|800|900|950)(?:/(\\d+))?(?![\\w-])`, 'g')
const pinned = new Set()
for (const m of src.matchAll(re)) pinned.add(m[0])

const esc = (c) => c.replace(/[:/[\]().]/g, (ch) => '\\' + ch)
const STATE = { hover: ':hover:not(:disabled)', focus: ':focus', active: ':active', disabled: ':disabled', enabled: ':enabled' }
const ruleFor = (cls) => {
  const parts = cls.split(':')
  const util = parts.pop()
  const [, color, shade, op] = util.match(/^bg-([a-z]+)-(\d+)(?:\/(\d+))?$/)
  const pseudo = parts.map((v) => STATE[v] ?? null)
  if (pseudo.includes(null)) return '' // variant lạ (sm:, group-hover:…) — bỏ qua, hiếm gặp với nền đặc
  const val = op ? `color-mix(in oklab, var(--k-${color}-${shade}) ${op}%, transparent)` : `var(--k-${color}-${shade})`
  return `  :where(html.dark) .${esc(cls)}${pseudo.join('')} { background-color: ${val}; }`
}

const lines = []
lines.push('/* TỰ SINH bởi scripts/gen-dark.mjs — đừng sửa tay */')
lines.push(':root {')
for (const c of ['slate', ...PALETTES]) for (const s of SHADES) lines.push(`  --k-${c}-${s}: var(--color-${c}-${s});`)
lines.push('}')
lines.push('html.dark { color-scheme: dark; }')
lines.push(`html.dark body {`)
lines.push(`  background: ${PAGE};`)
lines.push(`  color: ${SLATE_DARK[900]};`)
for (const s of SHADES) lines.push(`  --color-slate-${s}: ${SLATE_DARK[s]};`)
for (const c of PALETTES) for (const s of SHADES) lines.push(`  --color-${c}-${s}: var(--k-${c}-${mirror(s)});`)
lines.push('}')
lines.push('html.dark body .keep-colors {')
for (const c of ['slate', ...PALETTES]) for (const s of SHADES) lines.push(`  --color-${c}-${s}: var(--k-${c}-${s});`)
lines.push('}')
lines.push('@layer utilities {')
lines.push(`  :where(html.dark) .bg-white { background-color: ${SURFACE}; }`)
for (const op of [80, 90, 95]) lines.push(`  :where(html.dark) .bg-white\\/${op} { background-color: color-mix(in oklab, ${SURFACE} ${op}%, transparent); }`)
lines.push(`  :where(html.dark) .ring-black\\/5 { --tw-ring-color: rgb(255 255 255 / 0.08); }`)
for (const cls of [...pinned].sort()) {
  const r = ruleFor(cls)
  if (r) lines.push(r)
}
lines.push('}')
writeFileSync('src/dark.css', lines.join('\n') + '\n')
console.log(`dark.css: ghim ${pinned.size} class nền đặc`)
