/**
 * MCP server "bongda" — cho Claude (Desktop / Code) đọc và ghi sổ đội bóng.
 *
 * Chạy:  npx tsx F:/AI/bongda/mcp/server.ts   (Claude tự chạy theo cấu hình, không cần mở tay)
 * Biến môi trường:
 *   GOOGLE_APPLICATION_CREDENTIALS  đường dẫn file khoá service account (KHÔNG để trong repo)
 *   BONGDA_DATABASE                 mặc định "bongda" (KHÔNG dùng (default) — project dùng chung)
 *   BONGDA_PROJECT                  mặc định "app-from-ai"
 *   BONGDA_READONLY=1               chỉ bật các nút xem, tắt hết nút ghi
 *   FIRESTORE_EMULATOR_HOST         (khi test) trỏ vào emulator thay vì dữ liệu thật
 * Mỗi lần ghi được chép vào mcp/audit.log (một dòng JSON / lần).
 */
import { appendFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { z } from 'zod'
import { DEFAULT_SETTINGS, type AppData, type Settings } from '../src/types'
import { ToolError, tools, type Op } from './tools'

const PROJECT = process.env.BONGDA_PROJECT || 'app-from-ai'
const DATABASE = process.env.BONGDA_DATABASE || 'bongda'
const READONLY = process.env.BONGDA_READONLY === '1'
const AUDIT = join(dirname(fileURLToPath(import.meta.url)), 'audit.log')
const COLLS = ['members', 'matches', 'months', 'payments', 'expenses', 'incomes'] as const

if (DATABASE === '(default)') throw new Error('Không dùng database (default) — project app-from-ai dùng chung với app khác.')

// Thư viện Google ném thêm lỗi "lạc" (không gắn với lời gọi nào) khi khoá sai/thiếu → đừng để cả server chết,
// nếu không Claude chỉ thấy "Connection closed" ở mọi nút sau đó
process.on('unhandledRejection', (e) => console.error('[bongda] lỗi nền:', (e as Error)?.message ?? e))

// Thiếu file khoá thì báo rõ cách sửa ngay ở nút đầu tiên, không gọi Firestore
const KEY = process.env.GOOGLE_APPLICATION_CREDENTIALS
const KEY_PROBLEM =
  !process.env.FIRESTORE_EMULATOR_HOST && KEY && !existsSync(KEY)
    ? `Không thấy file khoá service account: ${KEY}. Đặt biến môi trường BONGDA_MCP_KEY trỏ tới file khoá (xem mcp/README.md) rồi khởi động lại Claude.`
    : null

// Chạy với emulator: không cần dò máy chủ Google (bỏ cảnh báo MetadataLookupWarning)
if (process.env.FIRESTORE_EMULATOR_HOST) process.env.METADATA_SERVER_DETECTION = 'none'
const app = initializeApp(process.env.FIRESTORE_EMULATOR_HOST ? { projectId: PROJECT } : { projectId: PROJECT, credential: applicationDefault() })
const db = getFirestore(app, DATABASE)

/** Firestore không nhận undefined; id nằm ở tên tài liệu, không lưu trong dữ liệu (giống web) */
const clean = (v: object) => Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && k !== 'id'))

async function load(): Promise<AppData> {
  const [snaps, settings] = await Promise.all([Promise.all(COLLS.map((c) => db.collection(c).get())), db.doc('config/settings').get()])
  const d = Object.fromEntries(COLLS.map((c, i) => [c, snaps[i].docs.map((x) => ({ ...x.data(), id: x.id }))])) as unknown as AppData
  d.settings = { ...DEFAULT_SETTINGS, ...(settings.data() as Partial<Settings> | undefined) }
  return d
}

async function apply(ops: Op[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch()
    for (const op of ops.slice(i, i + 450)) {
      if (op.kind === 'settings') b.set(db.doc('config/settings'), op.data)
      else if (op.kind === 'delete') b.delete(db.collection(op.coll).doc(op.id))
      else b.set(db.collection(op.coll).doc(op.id), clean(op.data))
    }
    await b.commit()
  }
}

// ---------- Khai báo tham số từng nút (để AI biết truyền gì) ----------

const tran = z.string().optional().describe('Ngày trận (05/10/2026 hoặc 5/10), mã trận, hoặc "gần nhất" (mặc định)')
const ten = z.string().describe('Tên thành viên (không dấu cũng được, vd. "hung")')
const tenList = z.array(z.string())
const ok = z.boolean().optional()

const schemas: Record<keyof typeof tools, z.ZodRawShape> = {
  tong_quan: {},
  danh_sach_no: { ten: ten.optional() },
  soan_tin_nhac: { ten: ten.optional().describe('Bỏ trống = tin nhắc cả nhóm') },
  thanh_vien: { loc: z.enum(['dang_da', 'tam_nghi', 'con_no', 'tat_ca']).optional() },
  lich_su_tran: { so_tran: z.number().int().min(1).max(100).optional() },
  chi_tiet_tran: { tran },
  so_quy: { thang: z.string().optional().describe('vd. 9/2026') },
  chia_doi: { nguoi: tenList.min(2).describe('Danh sách người đi đá') },
  tao_tran: {
    ngay: z.string().optional(),
    nguoi: tenList.optional().describe('Để máy tự chia cân bằng'),
    doi_a: tenList.optional(),
    doi_b: tenList.optional(),
    ghi_chu: z.string().optional(),
  },
  sua_doi_hinh: {
    tran,
    chuyen: tenList.optional().describe('Chuyển sang đội kia'),
    them_a: tenList.optional(),
    them_b: tenList.optional(),
    bot: tenList.optional(),
    ngay_moi: z.string().optional(),
    xac_nhan_go_khoan_da_thu: ok.describe('Chỉ đặt true sau khi người dùng đồng ý gỡ khoản tiền mặt đã thu'),
  },
  ghi_ket_qua: {
    tran,
    ti_so_a: z.number().int().min(0).optional(),
    ti_so_b: z.number().int().min(0).optional(),
    doi_thang: z.enum(['A', 'B', 'hoa']).optional().describe('Dùng khi KHÔNG có tỉ số'),
    luan_luu: z.enum(['A', 'B', 'khong']).optional(),
    pen_a: z.number().int().min(0).optional(),
    pen_b: z.number().int().min(0).optional(),
    ghi_chu: z.string().optional(),
  },
  gach_no: {
    ten,
    khoan: z.string().optional().describe('vd. "28/09" (phạt trận) hoặc "T9/2026" (quỹ tháng)'),
    tat_ca: ok,
    hinh_thuc: z.enum(['tien_mat', 'tru_ung']).optional(),
  },
  bo_gach_no: { ten, khoan: z.string().optional(), tat_ca: ok },
  them_thanh_vien: {
    ten: z.string().optional(),
    danh_sach: tenList.optional(),
    sao: z.number().min(1).max(5).optional(),
    thu_mon: ok,
    muc_quy_thang: z.number().min(0).optional(),
  },
  sua_thanh_vien: {
    ten,
    ten_moi: z.string().optional(),
    sao: z.number().min(1).max(5).optional(),
    thu_mon: ok,
    muc_quy_thang: z.number().min(0).optional(),
    dang_da: ok.describe('false = cho tạm nghỉ'),
    tien_ung: z.number().min(0).optional().describe('Đặt lại TỔNG tiền đã ứng'),
    nap_them_ung: z.number().min(0).optional().describe('Cộng thêm vào tiền ứng'),
    ngay_ung: z.string().optional(),
    ghi_chu_ung: z.string().optional(),
  },
  xoa_thanh_vien: {
    ten,
    xoa_han: ok.describe('true = xoá hẳn; mặc định chỉ tạm nghỉ'),
    xac_nhan_bo_no: ok.describe('Chỉ đặt true sau khi người dùng đồng ý xoá dù người đó còn nợ'),
  },
  mo_quy_thang: { thang: z.string().describe('vd. 10/2026') },
  ghi_thu_chi: {
    loai: z.enum(['thu', 'chi']),
    quy: z.enum(['bong_da', 'ung_ho_phat']),
    so_tien: z.number().positive(),
    ghi_chu: z.string().min(1),
    nguoi: z.string().optional(),
    ngay: z.string().optional(),
  },
  xoa_thu_chi: { ma: z.string().describe('Mã từ so_quy, dạng thu:xxx / chi:xxx') },
  xoa_tran: { tran: z.string().describe('Bắt buộc ghi rõ ngày hoặc mã trận') },
  xem_cai_dat: {},
  cai_dat: {
    ten_doi: z.string().optional(),
    tien_phat: z.number().min(0).optional(),
    quy_thang: z.number().min(0).optional(),
    luat_hoa: z.enum(['khong_phat', 'phat_nua', 'phat_du']).optional(),
    tai_khoan: z.string().optional(),
  },
}

const server = new McpServer({ name: 'bongda', version: '0.1.0' })

for (const [name, t] of Object.entries(tools)) {
  if (READONLY && t.write) continue
  server.registerTool(
    name,
    {
      title: t.title,
      description: t.description,
      inputSchema: schemas[name as keyof typeof tools],
      annotations: { readOnlyHint: !t.write, destructiveHint: t.write, idempotentHint: !t.write, openWorldHint: false },
    },
    async (args: Record<string, unknown>) => {
      if (KEY_PROBLEM) return { content: [{ type: 'text' as const, text: KEY_PROBLEM }], isError: true }
      try {
        const res = t.run(args ?? {}, await load())
        if (res.ops?.length) {
          await apply(res.ops)
          appendFileSync(AUDIT, JSON.stringify({ at: new Date().toISOString(), tool: name, args, ops: res.ops.map((o) => (o.kind === 'settings' ? 'settings' : `${o.kind} ${o.coll}/${o.id}`)) }) + '\n')
        }
        return { content: [{ type: 'text' as const, text: res.text }] }
      } catch (e) {
        const msg = e instanceof ToolError ? e.message : `Lỗi hệ thống: ${(e as Error).message}`
        return { content: [{ type: 'text' as const, text: msg }], isError: true }
      }
    },
  )
}

await server.connect(new StdioServerTransport())
