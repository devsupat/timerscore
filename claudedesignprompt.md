# 🎨 CLAUDEDESIGNPROMPT.MD — Prompt Siap Pakai untuk Claude

Gunakan prompt-prompt ini kalau butuh Claude generate atau perbaiki bagian tertentu dari app.

---

## Prompt 1 — Generate Halaman `/display` (Scoreboard Besar)

```
Buatkan komponen Next.js "app/display/page.tsx" untuk live scoreboard lomba.

Requirement:
- Dark background (bg-gray-900 atau hitam)
- Judul besar "LIVE SCORE" di atas
- Timer countdown besar di tengah atas (format MM:SS, warna kuning/amber)
- List regu diurutkan score tertinggi ke bawah
- Setiap baris: nomor urut / medal emoji, nama regu, score (font besar)
- Posisi 1 highlight warna emas, posisi 2 perak, posisi 3 bronze
- Subscribe Supabase Realtime dari tabel 'teams' dan 'timer_config'
- useRef untuk interval countdown lokal

Stack: Next.js 14 App Router, TypeScript, Tailwind CSS, @supabase/supabase-js
Supabase client ada di @/lib/supabase
Tipe Team: { id: number; name: string; score: number }
```

---

## Prompt 2 — Generate Halaman `/admin`

```
Buatkan "app/admin/page.tsx" untuk panel admin lomba.

Requirement:
- Form input nama regu + tombol Tambah
- List semua regu dengan: nama, score, tombol +1, -1, hapus
- Tombol "Reset Semua Score ke 0"
- Komponen TimerAdmin terpisah di bawah:
  - Input menit dan detik
  - Tombol Start / Pause / Reset
  - Tampilkan sisa waktu
  - Simpan state ke Supabase tabel timer_config (update row pertama atau insert kalau kosong)

Stack: Next.js 14, TypeScript, Tailwind CSS, Supabase
Gunakan @/lib/supabase untuk koneksi.
```

---

## Prompt 3 — Fix Realtime Tidak Jalan

```
Di app Next.js saya, Supabase Realtime tidak update otomatis di halaman /display.
Saya subscribe seperti ini:

[paste kode subscribe kamu]

Tolong debug dan fix. Pastikan:
- Channel name unik
- .subscribe() dipanggil dengan benar
- cleanup di return useEffect
- table sudah di-add ke supabase_realtime publication
```

---

## Prompt 4 — Perbaiki Timer Sync

```
Timer saya disimpan di Supabase tabel timer_config dengan kolom:
- duration_seconds (total durasi)
- started_at (timestamp kapan mulai)
- is_running (boolean)

Di halaman /display, saya mau hitung sisa waktu secara realtime:
- Kalau is_running = true: sisa = duration_seconds - (now - started_at) dalam detik
- Kalau is_running = false: sisa = duration_seconds

Buatkan fungsi TypeScript yang menghitung timeLeft dari row timer_config,
dan useEffect untuk countdown lokal dengan setInterval setiap 1 detik.
```

---

## Prompt 5 — Tambah Fitur Input Score Manual

```
Di halaman /admin, tambahkan fitur input score manual per regu.
Setiap baris regu ada input number di sebelah tombol +/-.
User bisa ketik angka langsung lalu tekan Enter atau tombol "Set"
untuk langsung mengubah score ke nilai tersebut (bukan increment).
Gunakan Supabase update ke tabel teams.
```

---

## Tips Penggunaan Prompt

- Selalu sebutkan stack (Next.js 14, TypeScript, Tailwind, Supabase)
- Sebutkan struktur tabel yang ada
- Paste error message kalau ada bug
- Minta satu fitur per prompt agar hasilnya focused
