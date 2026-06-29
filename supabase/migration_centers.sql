-- ============================================================
-- MANOS VZLA — Centros de acopio
-- ============================================================

-- Tabla principal de centros
create table if not exists public.centers (
  id uuid primary key default uuid_generate_v4(),
  name text not null check (char_length(name) <= 100),
  address text not null check (char_length(address) <= 200),
  city text not null check (char_length(city) <= 100),
  country text not null default 'US',
  lat double precision not null,
  lng double precision not null,
  location geography(point, 4326),
  contact text check (char_length(contact) <= 100),
  instagram text check (char_length(instagram) <= 60),
  edit_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists centers_location_idx on public.centers using gist(location);
create index if not exists centers_verified_idx on public.centers(verified) where verified = true;

-- Tabla de insumos por centro
create table if not exists public.center_supplies (
  id uuid primary key default uuid_generate_v4(),
  center_id uuid not null references public.centers(id) on delete cascade,
  category text not null check (category in ('water','food','clothing','medicine','hygiene','tools','volunteers')),
  status text not null default 'needed' check (status in ('needed','ok','full')),
  updated_at timestamptz not null default now(),
  unique(center_id, category)
);

create index if not exists center_supplies_center_idx on public.center_supplies(center_id);

-- Trigger: al crear un centro, auto-crear los 7 insumos
create or replace function public.create_default_supplies()
returns trigger as $$
begin
  insert into public.center_supplies (center_id, category, status)
  values
    (new.id, 'water', 'needed'),
    (new.id, 'food', 'needed'),
    (new.id, 'clothing', 'needed'),
    (new.id, 'medicine', 'needed'),
    (new.id, 'hygiene', 'needed'),
    (new.id, 'tools', 'needed'),
    (new.id, 'volunteers', 'needed');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_create_default_supplies on public.centers;
create trigger trg_create_default_supplies
  after insert on public.centers
  for each row execute function public.create_default_supplies();

-- RLS
alter table public.centers enable row level security;
alter table public.center_supplies enable row level security;

drop policy if exists "read_verified_centers" on public.centers;
create policy "read_verified_centers" on public.centers
  for select using (verified = true and active = true);

drop policy if exists "insert_centers" on public.centers;
create policy "insert_centers" on public.centers
  for insert with check (true);

drop policy if exists "read_center_supplies" on public.center_supplies;
create policy "read_center_supplies" on public.center_supplies
  for select using (
    exists (
      select 1 from public.centers c
      where c.id = center_id and c.verified = true and c.active = true
    )
  );

drop policy if exists "update_supplies_by_token" on public.center_supplies;
create policy "update_supplies_by_token" on public.center_supplies
  for update using (true) with check (true);
