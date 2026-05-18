# 📋 PLAN.MD — Live Score Lomba App

## Target: Selesai dalam 2 Jam

### Stack
- **Frontend**: Next.js 14 (App Router)
- **Database**: Supabase (Postgres + Realtime)
- **Styling**: Tailwind CSS
- **Deploy**: Vercel (opsional, bisa skip kalau mau local dulu)

---

## Fitur Wajib (MVP)
1. **Timer mundur** — bisa diset durasi sendiri (start/pause/reset)
2. **Custom regu** — tambah nama tim lomba
3. **Live score** — tambah/kurangi poin per regu, update realtime
4. **Scoreboard display** — tampil besar untuk ditonton

---

## Halaman Aplikasi (Simpel)

| Halaman | Route | Fungsi |
|---|---|---|
| Admin Panel | `/admin` | Kelola regu, score, timer |
| Live Display | `/display` | Tampilan besar untuk ditonton (layar proyektor) |

Hanya 2 halaman. Tidak lebih.

---

## Arsitektur Data (Supabase)

### Tabel: `teams`
- id, name, score, created_at

### Tabel: `timer_config`
- id, duration_seconds, started_at, is_running, label

Realtime aktif di kedua tabel.

---

## Prioritas Pengerjaan

```
[30 menit] Setup project + Supabase
[20 menit] Halaman /admin (CRUD regu + score)
[20 menit] Halaman /display (live scoreboard)
[15 menit] Timer component
[15 menit] Supabase Realtime integration
[10 menit] Polish & test
```

---

## Yang TIDAK dikerjakan (scope out)
- Auth/login (skip, pakai URL langsung)
- Multiple match/session
- History score
- Bracket tournament
- Mobile responsive yang sempurna
