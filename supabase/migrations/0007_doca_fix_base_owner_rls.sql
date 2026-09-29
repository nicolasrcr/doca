-- O front-end manda owner_id = user.id no insert, mas isso confia no cliente para acertar o
-- valor exato no mesmo instante da chamada — qualquer descompasso (sessão renovando, etc.)
-- faz a política "owner_id = auth.uid()" falhar com "violates row-level security policy",
-- mesmo com login válido. Passamos a definir owner_id no servidor, a partir do uid da sessão
-- autenticada, e o cliente não decide mais esse valor.
create or replace function set_base_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.owner_id := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_force_base_owner on bases;
create trigger trg_force_base_owner
before insert on bases
for each row execute function set_base_owner();

drop policy if exists "member can insert base" on bases;
create policy "authenticated can insert base"
on bases for insert
to authenticated
with check (auth.uid() is not null);
