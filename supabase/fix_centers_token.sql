-- Hacer location nullable (ya no la generamos en el insert)
alter table public.centers alter column location drop not null;

-- Hacer edit_token sin default de pgcrypto (lo generamos en el frontend)
alter table public.centers alter column edit_token drop default;
