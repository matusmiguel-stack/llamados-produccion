-- Permite marcar contraseñas temporales y que cada usuario actualice su perfil.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

drop policy if exists "Usuarios pueden actualizar su perfil" on public.profiles;

create policy "Usuarios pueden actualizar su perfil"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
