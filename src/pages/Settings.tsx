import { useState } from 'react'
import { money, todayISO } from '../logic'
import { store } from '../store'
import type { AppData, DrawRule } from '../types'
import { Btn, Field, Modal, inputCls, useApp } from '../ui'

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { data, toast } = useApp()
  const [s, setS] = useState(data.settings)
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0

  const save = async () => {
    await store.saveSettings({ ...s, teamName: s.teamName.trim() || 'FC Kỹ thuật - An toàn & friends' })
    toast('Đã lưu cài đặt')
    onClose()
  }

  const backup = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bongda-saoluu-${todayISO()}.json`
    a.click()
    // Thu hồi ngay sẽ làm hỏng lượt tải trên Firefox/Safari
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  const restore = async (file: File) => {
    let d: AppData
    try {
      d = JSON.parse(await file.text())
      if (!Array.isArray(d.members) || !Array.isArray(d.months)) throw new Error('sai cấu trúc')
    } catch (e) {
      return toast('File không đúng định dạng: ' + (e as Error).message)
    }
    const summary = `${d.members.length} thành viên, ${d.matches?.length ?? 0} trận, ${d.months.length} tháng quỹ, ${d.payments?.length ?? 0} lượt đóng tiền`
    if (!confirm(`Nạp file "${file.name}" (${summary})?

TOÀN BỘ dữ liệu hiện tại sẽ bị THAY THẾ. Nên tải bản sao lưu trước.`)) return
    try {
      backup() // tự tải bản sao lưu dữ liệu hiện tại trước khi thay thế
      await store.replaceAll(d)
      toast('Đã nạp xong: ' + summary)
      onClose()
    } catch (e) {
      toast('Nạp lỗi: ' + ((e as { code?: string }).code ?? (e as Error).message))
    }
  }

  return (
    <Modal title="Cài đặt đội" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Tên đội">
          <input value={s.teamName} onChange={(e) => setS({ ...s, teamName: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tiền phạt / người đội thua" hint={money(s.waterFee)}>
            <input inputMode="numeric" value={s.waterFee} onChange={(e) => setS({ ...s, waterFee: num(e.target.value) })} className={inputCls} />
          </Field>
          <Field label="Mức quỹ tháng mặc định (người mới)" hint={money(s.monthlyFee)}>
            <input inputMode="numeric" value={s.monthlyFee} onChange={(e) => setS({ ...s, monthlyFee: num(e.target.value) })} className={inputCls} />
          </Field>
        </div>
        <Field label="Khi hoà thì sao?">
          <select value={s.drawRule} onChange={(e) => setS({ ...s, drawRule: e.target.value as DrawRule })} className={inputCls}>
            <option value="half">Cả hai đội, mỗi người đóng một nửa</option>
            <option value="full">Cả hai đội, mỗi người đóng đủ</option>
            <option value="none">Không ai phải đóng</option>
          </select>
        </Field>
        <Field label="Thông tin chuyển khoản (hiện trong tin nhắc)">
          <input value={s.bankInfo} onChange={(e) => setS({ ...s, bankInfo: e.target.value })} className={inputCls} placeholder="VD: Vietcombank 0123456789 – Nguyễn Văn A" />
        </Field>
        <p className="text-xs text-slate-500">Mức tiền mới chỉ áp dụng cho trận / tháng tạo sau khi lưu, không làm thay đổi sổ cũ.</p>
        <Btn className="w-full" onClick={save}>
          Lưu cài đặt
        </Btn>
        <Btn kind="ghost" className="w-full ring-1 ring-slate-200" onClick={backup}>
          ⬇️ Tải bản sao lưu dữ liệu (.json)
        </Btn>
        <label className="block cursor-pointer rounded-xl px-3 py-2 text-center text-sm font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50">
          ⬆️ Nạp dữ liệu từ file (.json) — thay thế toàn bộ
          <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = '' // để chọn lại đúng file đó lần nữa vẫn chạy
              if (f) restore(f)
            }}
          />
        </label>
      </div>
    </Modal>
  )
}
