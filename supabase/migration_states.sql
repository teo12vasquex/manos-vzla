-- ============================================================
-- MANOS VZLA — Migración: sistema de 5 estados
-- Ejecutar en Supabase Dashboard > SQL Editor
-- ============================================================

-- ============================================================
-- 1. Ampliar constraint de reports.status
--    Agrega: 'en_route'
-- ============================================================
alter table public.reports
  drop constraint if exists reports_status_check;

alter table public.reports
  add constraint reports_status_check
  check (status in ('urgent', 'active', 'en_route', 'resolved', 'flagged'));

-- ============================================================
-- 2. Ampliar constraint de confirmations.vote_type
--    Agrega: 'on_my_way'
-- ============================================================
alter table public.confirmations
  drop constraint if exists confirmations_vote_type_check;

alter table public.confirmations
  add constraint confirmations_vote_type_check
  check (vote_type in ('still_active', 'on_my_way', 'resolved', 'flag'));

-- ============================================================
-- 3. Reescribir update_report_status() con los 4 vote_types
-- ============================================================
create or replace function public.update_report_status()
returns trigger as $$
begin
  if new.vote_type = 'on_my_way' then
    -- 1 voto basta para pasar a en_route
    update public.reports
      set status     = case when status in ('urgent', 'active') then 'en_route' else status end,
          confirmations = confirmations + 1,
          updated_at = now()
      where id = new.report_id;

  elsif new.vote_type = 'still_active' then
    -- extiende vida util 12h y degrada urgente → activo tras 2h
    update public.reports
      set confirmations = confirmations + 1,
          expires_at = now() + interval '12 hours',
          status     = case
                         when status = 'urgent' and now() - created_at > interval '2 hours'
                         then 'active'
                         else status
                       end,
          updated_at = now()
      where id = new.report_id;

  elsif new.vote_type = 'resolved' then
    -- 3 votos → resolved
    update public.reports
      set resolved_votes = resolved_votes + 1,
          status         = case when resolved_votes + 1 >= 3 then 'resolved' else status end,
          updated_at     = now()
      where id = new.report_id;

  elsif new.vote_type = 'flag' then
    -- 3 flags → flagged (oculto)
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
-- 4. Reescribir expire_old_reports()
--    Degrada resolved → flagged tras 24h desde updated_at
-- ============================================================
create or replace function public.expire_old_reports()
returns void as $$
begin
  -- urgent → active tras 2h sin votos
  update public.reports
    set status = 'active', updated_at = now()
    where status = 'urgent'
      and now() - created_at > interval '2 hours';

  -- urgent / active / en_route → resolved cuando expira el tiempo
  update public.reports
    set status = 'resolved', updated_at = now()
    where status in ('urgent', 'active', 'en_route')
      and now() > expires_at;

  -- resolved → flagged (oculto) tras 24h desde que se resolvió (updated_at)
  update public.reports
    set status = 'flagged', updated_at = now()
    where status = 'resolved'
      and now() - updated_at > interval '24 hours';
end;
$$ language plpgsql security definer;

-- ============================================================
-- 5. Actualizar RLS: incluir en_route en lecturas públicas
-- ============================================================
drop policy if exists "read_active_reports" on public.reports;
create policy "read_active_reports" on public.reports
  for select using (status in ('urgent', 'active', 'en_route', 'resolved'));
