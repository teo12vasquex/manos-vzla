-- ============================================================
-- MANOS VZLA — Fix: votos y feedback de popup
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Idempotente: se puede correr múltiples veces sin fallar
-- ============================================================

-- ============================================================
-- 1. Reemplazar CHECK constraint de vote_type en confirmations
--    Usa pg_constraint con contype='c' para evitar NOT NULL
-- ============================================================
do $$
declare r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.confirmations'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) like '%vote_type%'
  ) loop
    execute format('alter table public.confirmations drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.confirmations
  add constraint confirmations_vote_type_check
  check (vote_type in ('still_active', 'on_my_way', 'resolved', 'flag'));

-- ============================================================
-- 2. Reemplazar CHECK constraint de status en reports
--    Solo toca el que contiene 'status' (no afecta char_length)
-- ============================================================
do $$
declare r record;
begin
  for r in (
    select conname
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype  = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  ) loop
    execute format('alter table public.reports drop constraint %I', r.conname);
  end loop;
end;
$$;

alter table public.reports
  add constraint reports_status_check
  check (status in ('urgent', 'active', 'en_route', 'resolved', 'flagged'));

-- ============================================================
-- 3. Reescribir update_report_status() — versión definitiva
-- ============================================================
create or replace function public.update_report_status()
returns trigger as $$
begin
  if new.vote_type = 'on_my_way' then
    update public.reports
      set status        = case when status in ('urgent', 'active') then 'en_route' else status end,
          confirmations = confirmations + 1,
          updated_at    = now()
      where id = new.report_id;

  elsif new.vote_type = 'still_active' then
    update public.reports
      set confirmations = confirmations + 1,
          expires_at    = now() + interval '12 hours',
          status        = case
                            when status = 'urgent' and now() - created_at > interval '2 hours'
                            then 'active'
                            else status
                          end,
          updated_at    = now()
      where id = new.report_id;

  elsif new.vote_type = 'resolved' then
    update public.reports
      set resolved_votes = resolved_votes + 1,
          status         = case when resolved_votes + 1 >= 3 then 'resolved' else status end,
          updated_at     = now()
      where id = new.report_id;

  elsif new.vote_type = 'flag' then
    update public.reports
      set flag_votes = flag_votes + 1,
          status     = case when flag_votes + 1 >= 3 then 'flagged' else status end,
          updated_at = now()
      where id = new.report_id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- 4. Recrear trigger explícitamente
-- ============================================================
drop trigger if exists trg_update_report_status on public.confirmations;
create trigger trg_update_report_status
  after insert on public.confirmations
  for each row execute function public.update_report_status();

-- ============================================================
-- 5. RLS: asegurar que en_route y resolved son legibles
-- ============================================================
drop policy if exists "read_active_reports" on public.reports;
create policy "read_active_reports" on public.reports
  for select using (status in ('urgent', 'active', 'en_route', 'resolved'));
