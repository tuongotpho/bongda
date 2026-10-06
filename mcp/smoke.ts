/**
 * Thử MCP server đầu-cuối trên Firestore EMULATOR (không đụng dữ liệu thật):
 *   1) firebase emulators:start --only firestore --project demo-bongda
 *   2) npx tsx mcp/smoke.ts
 * Đóng vai Claude: nối vào server qua stdio, liệt kê nút, bấm một loạt nút như dùng thật.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const env = { ...process.env, FIRESTORE_EMULATOR_HOST: HOST, BONGDA_PROJECT: 'demo-bongda', METADATA_SERVER_DETECTION: 'none' } as Record<string, string>
process.env.FIRESTORE_EMULATOR_HOST = HOST
process.env.METADATA_SERVER_DETECTION = 'none'

const here = dirname(fileURLToPath(import.meta.url))
const client = new Client({ name: 'smoke', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(here, 'node_modules/tsx/dist/cli.mjs'), join(here, 'server.ts')], env }))

const { tools } = await client.listTools()
console.log(`== ${tools.length} nút:`, tools.map((t) => t.name).join(', '))

let fails = 0
const call = async (name: string, args: Record<string, unknown> = {}, expectError = false) => {
  const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  const text = r.content.map((c) => c.text).join('\n')
  const bad = !!r.isError !== expectError
  if (bad) fails++
  console.log(`\n>> ${name} ${JSON.stringify(args)}${bad ? '   <<< SAI KỲ VỌNG' : ''}\n${text}`)
  return text
}

await call('them_thanh_vien', { danh_sach: ['Anh Hùng', 'Anh Nam', 'Tuấn', 'Dũng'] })
await call('sua_thanh_vien', { ten: 'dung', nap_them_ung: 100000 })
await call('tao_tran', { ngay: '05/10/2026', doi_a: ['hung', 'nam'], doi_b: ['tuan', 'dung'] })
await call('ghi_ket_qua', { tran: '05/10/2026', ti_so_a: 3, ti_so_b: 1 })
await call('gach_no', { ten: 'tuan', khoan: '05/10' })
await call('ghi_ket_qua', { tran: '05/10/2026', doi_thang: 'B' }, true) // đã chốt kết quả → không cho sửa
await call('tong_quan')
await call('soan_tin_nhac')

// Dữ liệu ghi ra phải đúng định dạng web đọc được: không có trường id, không có undefined
const db = getFirestore(initializeApp({ projectId: 'demo-bongda' }), 'bongda')
const pays = await db.collection('payments').get()
const match = (await db.collection('matches').get()).docs[0].data()
const shapeOk = pays.docs.every((d) => !('id' in d.data())) && !('id' in match) && match.scoreA === 3
console.log(`\n== Định dạng dữ liệu trong database "bongda": ${shapeOk ? 'ĐÚNG' : 'SAI'} (${pays.size} khoản đã đóng)`)
if (!shapeOk) fails++

await client.close()
console.log(fails ? `\n== ${fails} chỗ SAI` : '\n== TẤT CẢ ĐẠT')
process.exit(fails ? 1 : 0)
