# 🗄️ DATABASE-SETUP.MD — Supabase SQL Setup

Buka **Supabase Dashboard → SQL Editor → New Query**, paste SQL di bawah, lalu klik **Run**.

---

## Step 1 — Buat Tabel

```sql
-- Tabel regu dan score
CREATE TABLE teams (
  id bigint generated always as identity primary key,
  name text not null,
  score integer not null default 0,
  created_at timestamptz default now()
);

-- Tabel config timer (hanya 1 baris)
CREATE TABLE timer_config (
  id bigint generated always as identity primary key,
  duration_seconds integer not null default 300,
  started_at timestamptz,
  is_running boolean not null default false,
  label text default 'Babak 1'
);

-- Insert 1 row default timer
INSERT INTO timer_config (duration_seconds, is_running) VALUES (300, false);
```

---

## Step 2 — Aktifkan Realtime

```sql
-- Aktifkan realtime untuk kedua tabel
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE timer_config;
```

---

## Step 3 — Row Level Security (RLS)

Karena tidak pakai auth, disable RLS agar bisa akses langsung dari frontend:

```sql
-- Disable RLS (ok untuk internal/event tool tanpa public internet)
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE timer_config DISABLE ROW LEVEL SECURITY;
```

> ⚠️ Kalau app ini diakses publik, aktifkan RLS dan tambahkan policy.  
> Untuk lomba internal, disable RLS sudah cukup.

---

## Step 4 — Atomic Score Function

Mencegah race condition ketika dua operator memberi nilai bersamaan:

```sql
CREATE OR REPLACE FUNCTION increment_score(team_id bigint, delta integer)
RETURNS void AS $$
BEGIN
  UPDATE teams
  SET score = GREATEST(0, score + delta)
  WHERE id = team_id;
END;
$$ LANGUAGE plpgsql;
```

> Fungsi ini dipanggil dari frontend via `supabase.rpc('increment_score', { team_id, delta })`.  
> Operasi dilakukan langsung di Postgres — tidak ada window of conflict antar client.

---

## Selesai ✅

Tabel yang dibuat:
| Tabel | Fungsi |
|---|---|
| `teams` | Simpan nama regu dan score |
| `timer_config` | Simpan state timer (durasi, running, start time) |

Realtime sudah aktif → perubahan data langsung terkirim ke semua client yang subscribe.
