-- =====================================================================
-- La Negrada · base de datos en la nube (Supabase)
-- Pegar TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede correr más de una vez sin romper nada.
-- =====================================================================

-- Una sola tabla guarda todo: cada fila es un registro de la app
-- (un producto, una venta, un movimiento de stock, una peña, una reserva o la configuración).
create table if not exists public.registros (
  coleccion   text        not null,             -- productos, movimientos, facturas, eventos, reservas, config
  id          text        not null,
  datos       jsonb       not null,
  actualizado bigint      not null,             -- marca de hora del cambio (la pone la app)
  recibido    timestamptz not null default clock_timestamp(),  -- cuándo llegó a la nube
  primary key (coleccion, id)
);
create index if not exists registros_recibido_idx on public.registros (recibido);

-- Mails que pueden usar la app (los de la cuenta del bar)
create table if not exists public.accesos (
  email text primary key
);

-- Si dos compus cambian lo mismo, gana el cambio más nuevo:
-- un cambio más viejo que el guardado se ignora.
create or replace function public.registros_gana_el_mas_nuevo()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.actualizado < old.actualizado then
    return null;  -- no se pisa el registro más nuevo
  end if;
  new.recibido := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists registros_gana_el_mas_nuevo on public.registros;
create trigger registros_gana_el_mas_nuevo
  before insert or update on public.registros
  for each row execute function public.registros_gana_el_mas_nuevo();

-- Seguridad: solo los mails de la tabla "accesos" pueden leer y escribir.
alter table public.registros enable row level security;
alter table public.accesos  enable row level security;

drop policy if exists "ver mi acceso" on public.accesos;
create policy "ver mi acceso" on public.accesos
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

drop policy if exists "solo cuentas del bar" on public.registros;
create policy "solo cuentas del bar" on public.registros
  for all to authenticated
  using (exists (select 1 from public.accesos a where a.email = lower(auth.jwt() ->> 'email')))
  with check (exists (select 1 from public.accesos a where a.email = lower(auth.jwt() ->> 'email')));

grant select on public.accesos to authenticated;
grant select, insert, update on public.registros to authenticated;
revoke all on public.registros from anon;
revoke all on public.accesos from anon;

-- =====================================================================
-- ÚLTIMO PASO: autorizar el mail de la cuenta del bar.
-- Cambiá el mail de abajo por el que creaste en Authentication > Users y corré solo esta línea.
-- (Se pueden agregar más mails, uno por línea.)
-- =====================================================================
-- insert into public.accesos (email) values ('lanegrada@gmail.com') on conflict do nothing;
