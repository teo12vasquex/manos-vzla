-- ============================================================
-- MANOS VZLA — Esquema de base de datos
-- Pegar en Supabase SQL Editor y ejecutar
-- ============================================================

-- Extensiones
create extension if not exists postgis;
create extension if not exists "uuid-ossp";

-- ============================================================
-- TABLA: reports (puntos en el mapa)
-- ============================================================
create table if not exists public.reports (
  id           uuid primary key default uuid_generate_v4(),
  category     text not null check (category in ('rescue','medical','supplies','shelter','missing')),
  description  text not null check (char_length(description) <= 200),
  location     geography(point, 4326) not null,
  lat          double precision not null,
  lng          double precision not null,
  nickname     text check (char_length(nickname) <= 40),
  photo_url    text,
  status       text not null default 'urgent' check (status in ('urgent','active','resolved','flagged')),
  confirmations int not null default 0,
  resolved_votes int not null default 0,
  flag_votes   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours',
  device_hash  text -- hash anonimo del dispositivo, para rate-limit
);

create index if not exists reports_location_idx on public.reports using gist(location);
create index if not exists reports_status_idx on public.reports(status) where status != 'resolved';
create index if not exists reports_created_idx on public.reports(created_at desc);

-- ============================================================
-- TABLA: confirmations (votos de otros usuarios)
-- ============================================================
create table if not exists public.confirmations (
  id          uuid primary key default uuid_generate_v4(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  device_hash text not null,
  vote_type   text not null check (vote_type in ('still_active','resolved','flag')),
  created_at  timestamptz not null default now(),
  unique(report_id, device_hash, vote_type)
);

create index if not exists confirmations_report_idx on public.confirmations(report_id);

-- ============================================================
-- TABLA: moderators (voluntarios de ONGs verificadas)
-- ============================================================
create table if not exists public.moderators (
  id          uuid primary key default uuid_generate_v4(),
  email       text unique not null,
  org_name    text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- FUNCIÓN: actualizar estado segun votos
-- ============================================================
create or replace function public.update_report_status()
returns trigger as $$
begin
  -- 3 votos "resolved" => marcar como resuelto
  if new.vote_type = 'resolved' then
    update public.reports
      set resolved_votes = resolved_votes + 1,
          status = case when resolved_votes + 1 >= 3 then 'resolved' else status end,
          updated_at = now()
      where id = new.report_id;
  -- 3 flags => ocultar como spam
  elsif new.vote_type = 'flag' then
    update public.reports
      set flag_votes = flag_votes + 1,
          status = case when flag_votes + 1 >= 3 then 'flagged' else status end,
          updated_at = now()
      where id = new.report_id;
  -- confirmacion: extiende vida util del punto
  elsif new.vote_type = 'still_active' then
    update public.reports
      set confirmations = confirmations + 1,
          expires_at = now() + interval '12 hours',
          status = case when status = 'urgent' and now() - created_at > interval '2 hours' then 'active' else status end,
          updated_at = now()
      where id = new.report_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_update_report_status on public.confirmations;
create trigger trg_update_report_status
  after insert on public.confirmations
  for each row execute function public.update_report_status();

-- ============================================================
-- FUNCIÓN: auto-degradar puntos viejos (correr via cron)
-- ============================================================
create or replace function public.expire_old_reports()
returns void as $$
begin
  -- urgente => activo despues de 2h
  update public.reports
    set status = 'active', updated_at = now()
    where status = 'urgent' and now() - created_at > interval '2 hours';
  -- activo => resuelto despues de expiracion
  update public.reports
    set status = 'resolved', updated_at = now()
    where status in ('urgent','active') and now() > expires_at;
end;
$$ language plpgsql security definer;

-- ============================================================
-- FUNCIÓN: rate-limit por dispositivo (max 10 reportes/hora)
-- ============================================================
create or replace function public.check_rate_limit()
returns trigger as $$
declare
  recent_count int;
begin
  if new.device_hash is not null then
    select count(*) into recent_count
      from public.reports
      where device_hash = new.device_hash
        and created_at > now() - interval '1 hour';
    if recent_count >= 10 then
      raise exception 'rate_limit_exceeded';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_rate_limit on public.reports;
create trigger trg_rate_limit
  before insert on public.reports
  for each row execute function public.check_rate_limit();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.reports enable row level security;
alter table public.confirmations enable row level security;
alter table public.moderators enable row level security;

-- Cualquiera lee reportes activos
drop policy if exists "read_active_reports" on public.reports;
create policy "read_active_reports" on public.reports
  for select using (status in ('urgent','active','resolved'));

-- Cualquiera puede publicar (con rate-limit del trigger)
drop policy if exists "insert_reports" on public.reports;
create policy "insert_reports" on public.reports
  for insert with check (true);

-- Cualquiera puede confirmar
drop policy if exists "read_confirmations" on public.confirmations;
create policy "read_confirmations" on public.confirmations
  for select using (true);

drop policy if exists "insert_confirmations" on public.confirmations;
create policy "insert_confirmations" on public.confirmations
  for insert with check (true);

-- ============================================================
-- REALTIME (suscripciones en vivo)
-- ============================================================
alter publication supabase_realtime add table public.reports;
alter publication supabase_realtime add table public.confirmations;

-- ============================================================
-- STORAGE: bucket para fotos
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('report-photos', 'report-photos', true, 2097152, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

-- politicas de storage
drop policy if exists "public_read_photos" on storage.objects;
create policy "public_read_photos" on storage.objects
  for select using (bucket_id = 'report-photos');

drop policy if exists "public_upload_photos" on storage.objects;
create policy "public_upload_photos" on storage.objects
  for insert with check (bucket_id = 'report-photos');

-- ============================================================
-- CRON (correr cada 10 min) — configurar en Supabase Dashboard
-- ============================================================
-- select cron.schedule('expire-reports', '*/10 * * * *', 'select public.expire_old_reports()');
