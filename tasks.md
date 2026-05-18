# ✅ TASKS.MD — Checklist Pengerjaan

Centang satu per satu. Jangan loncat-loncat.

---

## FASE 1 — Setup (30 menit)

- [ ] `npx create-next-app@latest live-score --typescript --tailwind --app`
- [ ] Install dependencies:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  ```
- [ ] Buat project di [supabase.com](https://supabase.com)
- [ ] Copy `SUPABASE_URL` dan `SUPABASE_ANON_KEY` ke `.env.local`
- [ ] Jalankan SQL dari `database-setup.md` di Supabase SQL Editor
- [ ] Buat file `lib/supabase.ts` (lihat `claude.md`)

---

## FASE 2 — Admin Panel `/admin` (20 menit)

- [ ] Buat `app/admin/page.tsx`
- [ ] Form tambah nama regu
- [ ] List regu dengan tombol `+1` dan `-1` score
- [ ] Tombol hapus regu
- [ ] Tombol reset semua score ke 0

---

## FASE 3 — Live Display `/display` (20 menit)

- [ ] Buat `app/display/page.tsx`
- [ ] Tampilkan semua regu + score (diurutkan dari tertinggi)
- [ ] Subscribe Supabase Realtime → update otomatis tanpa refresh
- [ ] Desain besar, kontras tinggi (untuk proyektor/layar besar)

---

## FASE 4 — Timer (15 menit)

- [ ] Buat `components/Timer.tsx`
- [ ] Input durasi (menit : detik)
- [ ] Tombol Start / Pause / Reset
- [ ] Simpan state timer ke Supabase tabel `timer_config`
- [ ] Timer di `/display` sync dengan admin via Realtime

---

## FASE 5 — Realtime Integration (15 menit)

- [ ] Aktifkan Realtime di Supabase dashboard untuk tabel `teams`
- [ ] Aktifkan Realtime untuk tabel `timer_config`
- [ ] Test: ubah score di admin → cek langsung update di `/display`
- [ ] Test: start timer di admin → cek timer jalan di `/display`

---

## FASE 6 — Final Check (10 menit)

- [ ] Buka dua browser: satu `/admin`, satu `/display`
- [ ] Test tambah regu
- [ ] Test ubah score → display update realtime
- [ ] Test timer countdown
- [ ] Siap dipakai ✅

---

## Catatan Cepat

> Kalau ada error Supabase Realtime tidak connect → cek di Supabase Dashboard > Database > Replication > pastikan tabel `teams` dan `timer_config` di-enable
