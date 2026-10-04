"""
Chuyển sổ Google Sheet cũ của đội (file .xlsx tải về) thành file .json để nạp vào app
(Cài đặt ⚙️ → "Nạp dữ liệu từ file").

Cách chạy:
    python scripts/import_sheet.py <duong-dan-file.xlsx> <file-ra.json>

Quy ước đọc sổ (đã hỏi người dùng 04/10/2026):
  - Bảng phạt (trang NPSC): ô SỐ = đã đóng, ô CHỮ ("20.000đ") = còn nợ, "x" = bỏ qua.
  - Quỹ tháng (Thu_BĐ): mỗi người một mức ("Hạn mức"). "miễn" / 0 = miễn tháng đó.
    Nộp dư thì tự trừ dần sang tháng sau. Tính nghĩa vụ từ tháng 3 tới tháng 9/2026.
  - Hai quỹ: quỹ tháng + tiền sân → main; ủng hộ + phạt + mua sắm → extra.
"""
import json
import re
import sys
import time
from datetime import date, datetime, timedelta

import openpyxl

MONTH_COLS = 'DEFGHIJKLM'  # Tháng 3 → Tháng 12
FIRST_MONTH, LAST_MONTH = 3, 9  # tháng 10 mở trong app
YEAR = 2026
# tên ở bảng phạt → tên ở bảng quỹ tháng (cùng một người)
ALIASES = {'A Hải KTAT': 'A Hải', 'E Sơn': 'Sơn'}

now = int(time.time() * 1000)
warnings: list[str] = []


def slug(s: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', s.lower().encode('ascii', 'ignore').decode()).strip('-') or 'x'


def money_text(v) -> int | None:
    """'20.000đ' → 20000"""
    if isinstance(v, str):
        d = re.sub(r'\D', '', v)
        return int(d) if d else None
    return None


def iso(d) -> str:
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, (int, float)):  # số ngày kiểu Excel
        return (date(1899, 12, 30) + timedelta(days=int(d))).isoformat()
    raise ValueError(d)


def main(src: str, out: str):
    wb = openpyxl.load_workbook(src, data_only=True)
    thu, npsc, chi = wb['Thu_BĐ'], wb['NPSC'], wb['Chi_BĐ']

    members: dict[str, dict] = {}  # tên → member
    used_ids: set[str] = set()

    def add_member(name: str, fee: int) -> dict:
        mid = slug(name)
        while mid in used_ids:
            mid += '-2'
        used_ids.add(mid)
        m = {'id': mid, 'name': name, 'skill': 3, 'isGK': False, 'active': True, 'monthlyFee': fee, 'createdAt': now}
        members[name] = m
        return m

    # ---------- Thành viên + quỹ tháng ----------
    months = {f'{YEAR}-{mo:02d}': {'id': f'{YEAR}-{mo:02d}', 'amounts': {}, 'createdAt': now} for mo in range(FIRST_MONTH, LAST_MONTH + 1)}
    payments = []
    monthly_total = 0
    for r in range(2, thu.max_row + 1):
        name = thu[f'B{r}'].value
        if not name:
            continue
        name = str(name).strip()
        fee = int(thu[f'C{r}'].value or 0)
        m = add_member(name, fee)
        cells = {FIRST_MONTH + i: thu[f'{c}{r}'].value for i, c in enumerate(MONTH_COLS)}
        if all(v is None for v in cells.values()):
            warnings.append(f'{name}: chưa có ô quỹ tháng nào → chưa tính nợ tháng nào')
            continue
        credit = 0
        stopped = False  # ô gần nhất là "miễn"/0 thì các tháng trống sau đó coi như vẫn nghỉ
        for mo in range(FIRST_MONTH, LAST_MONTH + 1):
            ym = f'{YEAR}-{mo:02d}'
            v = cells[mo]
            if isinstance(v, str) and 'miễn' in v.lower() or v == 0:
                stopped = True
                continue
            if v is None and stopped:
                continue
            stopped = False
            paid_now = int(v) if isinstance(v, (int, float)) else 0
            monthly_total += paid_now
            credit += paid_now
            months[ym]['amounts'][m['id']] = fee
            if credit >= fee:
                credit -= fee
                note = None
                if paid_now == 0:
                    note = 'đã nộp trước'
                elif paid_now > fee:
                    note = f'nộp trước {paid_now // fee} tháng' if paid_now % fee == 0 else 'nộp dư'
                p = {'id': f'monthly_{ym}_{m["id"]}', 'memberId': m['id'], 'kind': 'monthly', 'refId': ym, 'amount': paid_now, 'paidAt': now}
                if note:
                    p['note'] = note
                payments.append(p)
            elif paid_now:
                # nộp thiếu: vẫn ghi tiền đã thu để sổ quỹ khớp, nhưng tháng này coi là chưa đủ
                warnings.append(f'{name} {ym}: nộp {paid_now:,} < mức {fee:,} — ghi vào ghi chú, tháng này vẫn tính nợ')
        if credit:
            warnings.append(f'{name}: còn dư {credit:,}đ nộp trước sau tháng {LAST_MONTH} (chưa trừ vào tháng nào)')
    # Nộp thiếu không có payment → cộng lại kiểm tra
    paid_monthly = sum(p['amount'] for p in payments if p['kind'] == 'monthly')
    if paid_monthly != monthly_total:
        warnings.append(f'LỆCH quỹ tháng: đã ghi {paid_monthly:,} / trong sổ {monthly_total:,}')

    # ---------- Tiền phạt (trang NPSC, cột G = tên, H..R = các tuần) ----------
    date_cols = []
    for col in 'HIJKLMNOPQR':
        d = npsc[f'{col}2'].value
        if d:
            date_cols.append((col, iso(d)))
    matches = {d: {'id': f'sheet-{d}', 'date': d, 'teamA': [], 'teamB': [], 'scoreA': None, 'scoreB': None,
                   'waterFee': 20000, 'drawRule': 'half', 'charges': [], 'note': 'Nhập từ sổ Google Sheet', 'createdAt': now}
               for _, d in date_cols}
    incomes, expenses = [], []
    for r in range(3, npsc.max_row + 1):
        raw = npsc[f'G{r}'].value
        if not raw:
            continue
        raw = str(raw).strip()
        name = ALIASES.get(raw, raw)
        if name not in members:
            m = add_member(name, 0)
            warnings.append(f'"{raw}" có trong bảng phạt nhưng không có trong danh sách quỹ tháng → tạo thành viên riêng, mức quỹ 0đ')
        m = members[name]
        if raw != name:
            m['name'] = raw  # giữ tên rõ hơn (A Hải KTAT, E Sơn)
        for col, d in date_cols:
            v = npsc[f'{col}{r}'].value
            if v is None or (isinstance(v, str) and v.strip().lower() == 'x'):
                continue
            if isinstance(v, (int, float)):
                amount, paid = int(v), True
            else:
                amount, paid = money_text(v), False
                if amount is None:
                    warnings.append(f'Ô phạt {col}{r} không đọc được: {v!r}')
                    continue
            mt = matches[d]
            mt['charges'].append({'memberId': m['id'], 'amount': amount})
            if paid:
                payments.append({'id': f'water_{mt["id"]}_{m["id"]}', 'memberId': m['id'], 'kind': 'water', 'refId': mt['id'], 'amount': amount, 'paidAt': now})
        # cột S không có ngày (VD Cường 60.000đ) → ghi thành khoản thu riêng của quỹ phạt
        extra = npsc[f'S{r}'].value
        if isinstance(extra, (int, float)) and extra:
            incomes.append({'id': f'sheet-s{r}', 'date': date_cols[-1][1], 'amount': int(extra), 'note': f'{raw} nộp thêm (cột S trong sổ, không ghi ngày)',
                            'by': raw, 'fund': 'extra', 'createdAt': now})
            warnings.append(f'{raw}: ô S{r} = {int(extra):,}đ không có ngày → ghi là khoản thu thêm của quỹ phạt, cần xác nhận')

    # ---------- Ủng hộ (A3:D16) và chi mua sắm (A19:D34) ----------
    for r in range(3, 17):
        note, by, d, amt = (npsc[f'{c}{r}'].value for c in 'ABCD')
        if note and amt:
            incomes.append({'id': f'sheet-uh{r}', 'date': iso(d), 'amount': int(amt), 'note': str(note).strip(), 'by': str(by).strip(), 'fund': 'extra', 'createdAt': now})
    for r in range(19, 35):
        note, by, d, amt = (npsc[f'{c}{r}'].value for c in 'ABCD')
        if note and amt:
            detail = npsc[f'E{r}'].value
            expenses.append({'id': f'sheet-chi{r}', 'date': iso(d), 'amount': int(amt), 'note': str(note).strip() + (f' ({detail})' if detail else ''),
                             'by': str(by).strip().capitalize(), 'fund': 'extra', 'createdAt': now})

    # ---------- Tiền sân (Chi_BĐ: hàng 2 = ngày hoặc "Tháng n", hàng 3 = số tiền) ----------
    for col in 'CDEFGHIJKLM':
        amt = chi[f'{col}3'].value
        if not amt:
            continue
        head = chi[f'{col}2'].value
        if isinstance(head, (int, float)):
            d = iso(head)
        else:
            d = f'{YEAR}-{int(re.sub(r"\D", "", str(head))):02d}-01'
        expenses.append({'id': f'sheet-san-{col}', 'date': d, 'amount': int(amt), 'note': 'Trả tiền sân', 'fund': 'main', 'createdAt': now})

    data = {
        'members': list(members.values()),
        'matches': [m for m in matches.values() if m['charges']],
        'months': list(months.values()),
        'payments': payments,
        'expenses': expenses,
        'incomes': incomes,
        'settings': {'teamName': 'Đội bóng NPSC', 'waterFee': 20000, 'monthlyFee': 100000, 'drawRule': 'half', 'bankInfo': ''},
    }

    # ---------- Đối chiếu với các ô tổng trong sổ ----------
    def total(xs, **f):
        return sum(x['amount'] for x in xs if all(x.get(k) == v for k, v in f.items()))

    checks = [
        ('Quỹ tháng đã thu (Thu_BĐ!N1)', thu['N1'].value, total(payments, kind='monthly')),
        ('Tiền sân đã chi (Chi_BĐ!A4)', chi['A4'].value, total(expenses, fund='main')),
        ('Ủng hộ (NPSC!D1)', npsc['D1'].value, sum(i['amount'] for i in incomes if i['id'].startswith('sheet-uh'))),
        ('Chi mua sắm (NPSC!D17)', npsc['D17'].value, total(expenses, fund='extra')),
    ]
    print('== ĐỐI CHIẾU VỚI SỔ ==')
    ok = True
    for label, expect, got in checks:
        mark = 'KHỚP' if expect == got else 'LỆCH'
        ok &= expect == got
        print(f'  [{mark}] {label}: sổ {expect:,} — app {got:,}')
    fines_paid = total(payments, kind='water')
    fines_owed = sum(c['amount'] for m in data['matches'] for c in m['charges']) - fines_paid
    print(f'  Tiền phạt: đã thu {fines_paid:,} · còn nợ {fines_owed:,} ({len(data["matches"])} buổi)')
    print(f'  {len(data["members"])} thành viên · {len(payments)} lượt đóng · {len(incomes)} khoản thu · {len(expenses)} khoản chi')
    print('== CẦN XÁC NHẬN ==')
    for w in warnings:
        print('  - ' + w)

    with open(out, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f'Đã ghi {out}')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
