-- ═══════════════════════════════════════════════════════════════════════
-- Fiches clientes : modification et fusion des doublons (admin)
--
-- modifier_cliente(id, nom, telephone)
--   Corrige le nom / le numero. Le numero est enregistre normalise
--   (prive.normaliser_tel). Refuse un numero deja porte par une autre fiche :
--   c'est alors un doublon, a fusionner.
--
-- fusionner_clientes(garder, absorber)
--   Rattache TOUTES les ventes (annulees comprises) de la fiche « absorber »
--   a la fiche « garder », puis supprime « absorber ». Si « garder » n'a pas
--   de numero, elle recupere celui de « absorber ». Renvoie le nombre de
--   ventes deplacees. Seule la table ventes reference clientes.
--
-- Conventions habituelles : security definer, search_path vide, admin
-- uniquement (prive.est_admin()), execute retire a public / anon.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.modifier_cliente(
  p_id        bigint,
  p_nom       text,
  p_telephone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel    text;
  v_autre  text;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;

  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'Le nom de la cliente est obligatoire';
  end if;

  if not exists (select 1 from public.clientes where id = p_id) then
    raise exception 'Cliente introuvable';
  end if;

  v_tel := prive.normaliser_tel(p_telephone);

  if v_tel is not null then
    select nom into v_autre
      from public.clientes
     where id <> p_id and prive.normaliser_tel(telephone) = v_tel
     limit 1;
    if v_autre is not null then
      raise exception 'Ce numero appartient deja a la fiche « % » : fusionnez les deux fiches', v_autre;
    end if;
  end if;

  update public.clientes
     set nom = btrim(p_nom), telephone = v_tel
   where id = p_id;
end;
$$;

create or replace function public.fusionner_clientes(
  p_garder   bigint,
  p_absorber bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel_garder   text;
  v_tel_absorber text;
  v_nb           integer;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;

  if p_garder is null or p_absorber is null or p_garder = p_absorber then
    raise exception 'Choisissez deux fiches differentes';
  end if;

  -- Verrou des deux fiches (ordre fixe pour eviter un interblocage).
  perform 1 from public.clientes where id in (p_garder, p_absorber) order by id for update;

  select telephone into v_tel_garder from public.clientes where id = p_garder;
  if not found then raise exception 'Fiche a conserver introuvable'; end if;
  select telephone into v_tel_absorber from public.clientes where id = p_absorber;
  if not found then raise exception 'Fiche a fusionner introuvable'; end if;

  update public.ventes set cliente_id = p_garder where cliente_id = p_absorber;
  get diagnostics v_nb = row_count;

  delete from public.clientes where id = p_absorber;

  -- Numero recupere apres la suppression (index unique sur telephone).
  if v_tel_garder is null and v_tel_absorber is not null then
    update public.clientes set telephone = v_tel_absorber where id = p_garder;
  end if;

  return v_nb;
end;
$$;

revoke execute on function public.modifier_cliente(bigint, text, text) from public, anon;
grant  execute on function public.modifier_cliente(bigint, text, text) to authenticated;
revoke execute on function public.fusionner_clientes(bigint, bigint) from public, anon;
grant  execute on function public.fusionner_clientes(bigint, bigint) to authenticated;
