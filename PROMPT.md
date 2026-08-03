# ระบบบันทึกการลา (Leave Management System) — Plan & Coding Prompt

> เอกสารนี้มี 2 ส่วน: **ส่วน A แผนการทำงาน** (ให้เห็นภาพรวม/ลำดับงาน) และ **ส่วน B Prompt สำหรับ Claude Code** (copy ไปใช้ได้เลย)

---

# ส่วน A — แผนการทำงาน (Build Plan)

## ภาพรวมระบบ
เว็บแอพบันทึกการลาสำหรับองค์กรเล็ก (~20 คน, หัวหน้า 2 คน) รองรับหลายทีม (เริ่มด้วยทีม A), UI ภาษาไทย ธีมขาว-แดง, mobile-first + PWA

## Stack
- **Frontend + Backend:** Next.js 14 (App Router, TypeScript), API routes เป็น backend
- **DB + Auth:** Supabase (Postgres + RLS + Google OAuth)
- **Email:** Resend
- **Excel:** exceljs
- **UI:** Tailwind CSS + shadcn/ui
- **Deploy:** Vercel

## ลำดับการ build (แนะนำทำตามนี้)
1. **SQL migration** — schema + RLS + functions + triggers + seed (ฐานของทุกอย่าง ทำก่อน)
2. **Auth + onboarding** — Google login, สร้าง user record, หน้าเลือกทีมครั้งแรก
3. **Layout + navigation** — bottom tab (mobile) / sidebar (desktop), PWA manifest + service worker
4. **ฟอร์มบันทึกการลา** — คำนวณวันลา realtime, บันทึกร่าง/ส่งอนุมัติ
5. **ค้นหา + รายละเอียดเอกสาร** — timeline history, action ตาม role
6. **Dashboard** — การ์ดสรุปสถานะ
7. **อนุมัติ (approver)** — อนุมัติ/ไม่อนุมัติ/ส่งคืน + optimistic lock
8. **Email (Resend)** — แจ้ง approver / แจ้งผล
9. **รายงาน + export Excel**
10. **Settings (admin)** — teams, users/role, leave_types, holidays
11. **ทดสอบ + deploy Vercel**

## หลักการสำคัญ (ตัดสินใจแล้ว — กันปัญหาอนาคต)
1. **เก็บ ค.ศ. / แสดง พ.ศ.** — DB เก็บ ค.ศ. เสมอ, แปลง +543 เฉพาะตอน render ที่ frontend (utility กลาง `formatThaiDate()`), input จาก date picker ต้องแปลงกลับเป็น ค.ศ. ก่อนบันทึก
2. **เวลาอิง Asia/Bangkok** — date ลาเก็บเป็น `date` ล้วน (ไม่มีเวลา), timestamp เป็น `timestamptz`, คำนวณ/แสดงอิงเวลาไทย
3. **identity = auth uid (uuid)** เป็น PK, email เป็นข้อมูลแสดงผลที่แก้ได้
4. **สายอนุมัติ derive จากทีม** — teams มีหัวหน้าทีม, `approver_mappings` เป็น override กรณีพิเศษเท่านั้น
5. **user เลือกทีมเองได้ + แก้ได้** แต่ห้ามเปลี่ยนทีมถ้ามีคำขอ pending/approved ค้าง, ทุกการเปลี่ยนทีมเขียน `user_team_logs`; role เปลี่ยนได้เฉพาะ admin
6. **master data (teams, leave_types, users) = soft delete** (`is_active=false`) เท่านั้น + FK `ON DELETE RESTRICT`; inactive ไม่โผล่ใน dropdown ใหม่ แต่เอกสารเก่าอ่านได้
7. **total_days freeze ตอน submit** เป็น snapshot ไม่คำนวณใหม่อัตโนมัติ (แก้ holidays ย้อนหลังไม่กระทบเอกสารเก่า)
8. **status transition = transaction + optimistic lock** (เช็ค status ปัจจุบันก่อนเปลี่ยน กัน 2 หัวหน้ากดชนกัน)
9. **request_no gen แบบ atomic** ผ่านตาราง counter + `FOR UPDATE` (ไม่ใช้ COUNT+1)
10. **RLS ที่ระดับ DB** — user เห็นของตัวเอง, approver เห็นทีมตัวเอง, admin เห็นหมด (ไม่ใช่กรองแค่ frontend)
11. **holidays seed ครั้งเดียวใน migration** (วันหยุดไทย 2026), ไม่มีปุ่ม re-sync/เรียก API, จัดการเพิ่ม/แก้/ลบผ่าน Settings

---

# ส่วน B — PROMPT สำหรับ Claude Code

> Copy ส่วนนี้ทั้งหมดไปวางใน Claude Code

---

สร้างเว็บแอพ **"ระบบบันทึกการลา" (Leave Management System)** สำหรับองค์กรเล็ก ~20 คน (หัวหน้า 2 คน) แบบ production-ready

## Stack (ห้ามเปลี่ยน)
- Next.js 14 (App Router, TypeScript) — frontend + backend API routes
- Supabase (Postgres + Row Level Security + Google OAuth) — DB + Auth
- Resend — ส่ง email
- exceljs — export Excel
- Tailwind CSS + shadcn/ui — UI
- Deploy target: Vercel

## ภาษา / ธีม / อุปกรณ์
- UI **ภาษาไทยทั้งหมด**
- ธีมสี **ขาว-แดง** (ขาวเป็นพื้น, แดงเป็น primary/accent), สะอาด อ่านง่าย
- **mobile-first + responsive** และทำเป็น **PWA** (manifest.json + icon + service worker, "เพิ่มลงหน้าจอโฮม" เปิด fullscreen เหมือนแอพ)
- บนมือถือ: ตาราง → แสดงเป็น **card list**, navigation เป็น **bottom tab bar**, ปุ่ม action หลักเป็น **sticky bottom bar**, touch target ≥ 44px
- บน desktop: sidebar + ตารางปกติ

## เวลาทำงาน
จันทร์–ศุกร์ 08:30–17:30 หยุดเสาร์-อาทิตย์และวันหยุดนักขัตฤกษ์ (อ่านจากตาราง `holidays`)

## หลักการข้อมูล (สำคัญมาก — ต้องทำตามเป๊ะ)
- **เก็บ ค.ศ. / แสดง พ.ศ.:** DB เก็บวันที่เป็น ค.ศ. เสมอ. แปลงเป็น พ.ศ. (+543) เฉพาะตอนแสดงผลที่ frontend ผ่าน utility กลาง `formatThaiDate()`. Date picker ที่โชว์ พ.ศ. ต้องแปลงกลับเป็น ค.ศ. ก่อนบันทึกลง DB
- **เวลาอิง Asia/Bangkok:** field วันลา (start_date, end_date) เก็บเป็น `date` ล้วน (ไม่มีเวลา). timestamp อื่น (created_at ฯลฯ) เป็น `timestamptz`. การคำนวณ/แสดงผลอิงเวลาไทยเสมอ
- **identity = Supabase auth uid (uuid)** เป็น primary key ของ users. email เป็นแค่ข้อมูลแสดงผลที่แก้ไขได้ (ห้ามผูกตัวตนด้วย email)

## Auth & Onboarding
- Login ด้วย **Google เท่านั้น** (Supabase Auth OAuth)
- login ครั้งแรก → สร้าง record ใน `users` (id = auth uid, email + full_name จาก Google profile, role default `'user'`, team_id = null)
- ถ้า team_id ยัง null → เด้งหน้า **"เลือกทีม"** ก่อนเข้าใช้งาน (ตอนนี้มีทีม A ทีมเดียว)
- user เปลี่ยนทีมเองได้ที่หน้า Profile **แต่** ถ้ามีคำขอลาสถานะ pending หรือ approved ค้างอยู่ → **ห้ามเปลี่ยนทีม** (แจ้งเตือน). ทุกการเปลี่ยนทีมเขียนลง `user_team_logs`
- **role เปลี่ยนได้เฉพาะ admin** (user เลือกได้แค่ทีม ไม่ใช่สิทธิ์ตัวเอง)

## Roles (3 ระดับ)
- `admin`: จัดการ teams, users & role, approver_mappings, leave_types, holidays (หน้า Settings). เห็นข้อมูลทุกทีม
- `approver` (หัวหน้าทีม): อนุมัติคำขอของ user ในทีมตัวเอง + ขอลาเองแล้ว **อนุมัติด้วยตนเองได้ทันที** (ข้าม pending). เห็นข้อมูลเฉพาะทีมตัวเอง
- `user`: สร้าง/แก้/ส่งคำขอลาของตัวเองเท่านั้น. เห็นเฉพาะของตัวเอง

## สายการอนุมัติ (approval routing)
- **derive จากทีมเป็นหลัก:** teams มีหัวหน้าทีม (approver ของทีม). user ในทีมส่งคำขอ → ไปหาหัวหน้าทีมนั้นอัตโนมัติ. เปลี่ยนหัวหน้าทีมทีเดียว mapping ทั้งทีมเปลี่ยนตาม
- `approver_mappings` เก็บไว้เป็น **override** กรณีพิเศษเท่านั้น (เช่น user คนนี้ให้หัวหน้าอีกคนอนุมัติ)
- ถ้าทีมมีหัวหน้าหลายคน → ใครอนุมัติก่อนถือว่าจบ (first-approve-wins)

## สถานะเอกสาร (document status)
`draft` ฉบับร่าง / `pending` รออนุมัติ / `approved` อนุมัติ / `rejected` ไม่อนุมัติ / `cancelled` ยกเลิก / `returned` ส่งคืน
- flow: draft --submit--> pending --approve--> approved / --reject--> rejected / --return--> returned
- `returned` → user แก้แล้ว submit ใหม่ → กลับเป็น pending
- **ทุกการเปลี่ยนสถานะเขียนลง `leave_request_logs`** (document history: actor, from_status, to_status, note, created_at) เสมอ

## Business rules
- user บันทึก → เป็น `draft` เท่านั้น. ต้องกด "ส่งอนุมัติ" ถึงเป็น `pending` + ส่ง email หา approver
- แก้ไขเอกสารได้เฉพาะสถานะ `draft` และ `returned`
- ลาครึ่งวัน เลือก **เช้า (08:30–12:00)** หรือ **บ่าย (13:00–17:30)**; เต็มวัน = full. (start_period, end_period = 'full' | 'morning' | 'afternoon')
- คำนวณ `total_days` อัตโนมัติ: นับเฉพาะ จ.–ศ. ตัดวันใน `holidays`, ครึ่งวัน = 0.5
- **total_days freeze ตอน submit** เป็น snapshot — ถ้า admin แก้ holidays ทีหลัง เอกสารเก่าไม่เปลี่ยน
- **กันการลาซ้อนทับ** (overlap) กับคำขอ status ∈ {pending, approved} ของ user คนเดียวกัน
- approver: อนุมัติ / ไม่อนุมัติ / ส่งคืน — ไม่อนุมัติและส่งคืน**ต้องใส่เหตุผล** (approver_note)
- approver ขอลาเอง → กด "บันทึกและอนุมัติเลย" → ข้าม pending ไป approved ทันที
- **status transition ทุกครั้งทำใน transaction + optimistic lock:** เช็ค status ปัจจุบันก่อนเปลี่ยน ถ้าไม่ตรงกับที่คาดให้ reject การกดนั้น (กัน 2 หัวหน้ากดพร้อมกัน)

## เลขเอกสาร (request_no)
- format: **`YYYYMMxxx`** โดย **YYYY เป็น ค.ศ.** เช่น `202608001` (สิงหาคม 2026 ใบที่ 1)
- **reset running number ทุกเดือน** (ขึ้นเดือนใหม่กลับเป็น 001)
- gen แบบ **atomic** ผ่านตาราง counter ต่อ YYYYMM + `SELECT ... FOR UPDATE` ใน DB function (ห้ามใช้ COUNT(*)+1). รองรับเกิน 999 (ต่อเป็น 4 หลักได้ ไม่ error)
- > NOTE: ถ้าต้องการเลขเป็น พ.ศ. (`256908001`) ให้แปลงเฉพาะตอน gen string เท่านั้น ไม่กระทบ date ใน DB

## Leave balance (โควตา)
สร้างตาราง `leave_balances` เตรียมไว้ แต่ **ยังไม่ enforce** — ตอนนี้ลาเท่าไหร่ก็ได้

## Holidays
- **seed วันหยุดไทยปี 2026 ลงในไฟล์ migration ตรงๆ** (hardcode INSERT) — ไม่ต้องมีปุ่ม sync หรือเรียก external API ในแอพ
- ตาราง holidays มี column `source` ('seed' | 'manual') แยกว่าอันไหนมาจาก seed vs admin เพิ่มเอง
- admin เพิ่ม/แก้/ลบวันหยุดผ่านหน้า Settings ได้ (วันหยุดบริษัทเพิ่มเองเป็น source='manual')

## Soft delete
master data (teams, leave_types, users) ใช้ **soft delete** (`is_active=false`) เท่านั้น ห้าม hard delete. FK ตั้ง `ON DELETE RESTRICT`. record ที่ inactive ไม่โผล่ใน dropdown ใหม่ แต่เอกสารเก่าที่อ้างอิงยังแสดงผลได้

## หน้าจอ
1. **Login** — Google Sign-in, ธีมขาว-แดง
2. **เลือกทีม** (onboarding ครั้งแรก)
3. **Dashboard** — การ์ดสรุปจำนวนคำขอแต่ละสถานะของฉัน; ถ้าเป็น approver แสดง "คำขอรออนุมัติ" ของทีมด้วย
4. **ค้นหาบันทึกการลา** — filter วันที่/สถานะ/ประเภท; scope ตาม role (user=ตัวเอง, approver=ทีม+ตัวเอง, admin=ทุกทีม); มือถือแสดงเป็น card list
5. **บันทึกการลา (ฟอร์ม)** — เลือกประเภทลา, วันเริ่ม–สิ้นสุด, period (เต็ม/เช้า/บ่าย), เหตุผล; แสดงจำนวนวันที่คำนวณได้ realtime; ปุ่ม "บันทึกร่าง" กับ "ส่งอนุมัติ" แยกกัน; approver มีปุ่ม "บันทึกและอนุมัติเลย"
6. **รายละเอียดเอกสาร** — แสดง timeline จาก leave_request_logs + ปุ่ม action ตาม role/status
7. **รายงานสรุป** — เลือกรายบุคคล/ทั้งหมด + ช่วงวันที่ + ประเภท + ทีม → export **Excel (.xlsx)** (วันที่ในไฟล์แสดงเป็น พ.ศ.)
8. **Settings (admin เท่านั้น)** — จัดการ teams / users & role / approver_mappings (override) / leave_types / holidays

## Email (Resend)
template ภาษาไทย ธีมขาว-แดง สำหรับ:
1. แจ้ง approver เมื่อมีคำขอใหม่ (user กดส่งอนุมัติ)
2. แจ้ง user ผลการพิจารณา (อนุมัติ / ไม่อนุมัติ / ส่งคืน)

## Database schema (สร้างใน migration)
```
teams
  id (uuid PK), name, is_active (default true), created_at
  -- seed: ทีม A

users
  id (uuid PK = auth uid), email, full_name,
  role ('admin'|'approver'|'user', default 'user'),
  team_id (FK -> teams.id, nullable, ON DELETE RESTRICT),
  is_active (default true), created_at, updated_at

team_leads              -- หัวหน้าของแต่ละทีม (derive สายอนุมัติ)
  id, team_id (FK), user_id (FK -> users), created_at
  UNIQUE(team_id, user_id)

user_team_logs          -- ประวัติเปลี่ยนทีม
  id, user_id (FK), from_team_id, to_team_id, changed_at

approver_mappings       -- override กรณีพิเศษ
  id, user_id (FK ผู้ขอ), approver_id (FK), created_at
  UNIQUE(user_id, approver_id)

leave_types             -- soft delete
  id, name, color, is_active (default true), created_at

holidays                -- seed 2026 ใน migration
  id, holiday_date (date, unique), name, source ('seed'|'manual'), created_at

leave_balances          -- เตรียมไว้ ยังไม่ enforce
  id, user_id (FK), leave_type_id (FK), year (int), quota_days, used_days
  UNIQUE(user_id, leave_type_id, year)

leave_requests
  id (uuid PK), request_no (unique), user_id (FK), team_id (FK), leave_type_id (FK),
  start_date (date), end_date (date),
  start_period ('full'|'morning'|'afternoon'), end_period ('full'|'morning'|'afternoon'),
  total_days (numeric(4,1)),          -- freeze ตอน submit
  reason (text),
  status ('draft'|'pending'|'approved'|'rejected'|'cancelled'|'returned', default 'draft'),
  approver_id (FK, nullable), approver_note (text),
  submitted_at, approved_at, created_at, updated_at

leave_request_logs      -- document history
  id, request_id (FK), actor_id (FK), from_status, to_status, note, created_at

doc_counters            -- gen เลขเอกสาร atomic
  ym (text PK, = 'YYYYMM'), last_no (int)
```

## สิ่งที่ต้องส่งมอบ
1. **SQL migration** (ไฟล์เดียวหรือแบ่งเป็นชุด): สร้าง table ทั้งหมด + RLS policies (scope ตาม role/team ที่ระดับ DB) + Postgres function คำนวณ total_days (ตัดเสาร์อาทิตย์+holidays, อิง Asia/Bangkok) + function gen request_no (atomic ผ่าน doc_counters) + trigger เขียน leave_request_logs ทุกครั้งที่ status เปลี่ยน + seed (teams: ทีม A, holidays: วันหยุดไทย 2026, leave_types ตัวอย่าง เช่น ลาป่วย/ลากิจ/ลาพักร้อน)
2. **โครงสร้างโปรเจกต์ Next.js** ครบทุกหน้าตามข้างบน
3. **API routes**: submit / approve / reject / return / cancel / export-excel (แต่ละตัวทำ transaction + optimistic lock)
4. **utility กลาง**: formatThaiDate (ค.ศ.→พ.ศ. แสดงผล), parseThaiDate (input→ค.ศ.), คำนวณวันลาฝั่ง client (สำหรับ realtime preview)
5. **PWA**: manifest.json + service worker + icon
6. **.env.example**: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ฯลฯ
7. **README.md**: วิธี setup Supabase (เปิด Google OAuth), Resend, rrun migration, และ deploy บน Vercel

## คุณภาพโค้ด
เขียนแบบ standard, type-safe (TypeScript strict), จัดการ error ครบทุก API, validate input ทั้ง client + server, comment ภาษาไทยในจุด business logic สำคัญ, แยก concern ชัดเจน (component / lib / api)

---

**เริ่มจาก SQL migration ก่อน** แล้วค่อยไล่ตามลำดับ build plan (auth → layout/PWA → ฟอร์มลา → ค้นหา/รายละเอียด → dashboard → อนุมัติ → email → รายงาน → settings)
