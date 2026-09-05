-- Lista pública mínima para participaciones pendientes y verificadas.
-- Nunca expone teléfonos, rutas de comprobantes, notas ni identificadores internos.
create or replace function public.public_registered_predictions(p_event_id uuid)
returns table (
  masked_name text,
  team_selected public.team_selection,
  display_amount numeric,
  status public.prediction_status,
  created_at timestamptz,
  verified_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.mask_participant_name(p.name),
    p.team_selected,
    case
      when p.status = 'VERIFIED' then p.verified_amount
      else p.declared_amount
    end as display_amount,
    p.status,
    p.created_at,
    p.verified_at
  from public.predictions p
  where p.event_id = p_event_id
    and p.status in ('PENDING', 'VERIFIED')
    and (p.status <> 'VERIFIED' or p.verified_amount is not null)
  order by p.created_at desc
  limit 200;
$$;

revoke all on function public.public_registered_predictions(uuid) from public;
grant execute on function public.public_registered_predictions(uuid) to anon, authenticated, service_role;

-- Normaliza el orden visual del clásico conservando la elección real de cada
-- participante y, si ya existe, el resultado deportivo registrado.
do $$
declare
  v_event_id uuid;
begin
  for v_event_id in
    select id
    from public.events
    where team_a = 'Universitario'
      and team_b = 'Alianza Lima'
  loop
    update public.predictions
    set team_selected = case team_selected
      when 'TEAM_A' then 'TEAM_B'::public.team_selection
      else 'TEAM_A'::public.team_selection
    end
    where event_id = v_event_id;

    update public.events
    set
      team_a = team_b,
      team_b = team_a,
      team_a_logo = team_b_logo,
      team_b_logo = team_a_logo,
      result = case result
        when 'TEAM_A' then 'TEAM_B'::public.match_result
        when 'TEAM_B' then 'TEAM_A'::public.match_result
        else result
      end
    where id = v_event_id;
  end loop;
end;
$$;
