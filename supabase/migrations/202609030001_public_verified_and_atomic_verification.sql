-- Exposición pública mínima: nunca devuelve nombres completos ni datos privados.
create or replace function public.mask_participant_name(p_name text)
returns text language plpgsql immutable set search_path = public as $$
declare v_parts text[];
begin
  v_parts := regexp_split_to_array(trim(regexp_replace(p_name, '\s+', ' ', 'g')), ' ');
  if coalesce(array_length(v_parts, 1), 0) <= 1 then return coalesce(v_parts[1], ''); end if;
  return v_parts[1] || ' ' || upper(left(v_parts[2], 1)) || '.';
end;
$$;

create or replace function public.public_verified_predictions(p_event_id uuid)
returns table (
  masked_name text,
  team_selected public.team_selection,
  verified_amount numeric,
  verified_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select public.mask_participant_name(p.name), p.team_selected, p.verified_amount, p.verified_at, p.created_at
  from public.predictions p
  where p.event_id = p_event_id
    and p.status = 'VERIFIED'
    and p.verified_amount is not null
  order by p.verified_at desc
  limit 200;
$$;

revoke all on function public.mask_participant_name(text) from public, anon, authenticated;
revoke all on function public.public_verified_predictions(uuid) from public;
grant execute on function public.public_verified_predictions(uuid) to anon, authenticated, service_role;

-- La verificación también es atómica: dos admins simultáneos no atraviesan HARD_LIMIT.
create or replace function public.verify_prediction_atomic(
  p_prediction_id uuid,
  p_verified_amount numeric,
  p_admin_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_prediction public.predictions%rowtype;
  v_event public.events%rowtype;
  v_team_a numeric;
  v_team_b numeric;
  v_selected_balance numeric;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_verified_amount <= 0 or p_verified_amount > 10000 then raise exception 'INVALID_AMOUNT'; end if;
  if char_length(coalesce(p_admin_note, '')) > 500 then raise exception 'INVALID_NOTE'; end if;

  select * into v_prediction from public.predictions where id = p_prediction_id for update;
  if not found or v_prediction.status <> 'PENDING' then raise exception 'PREDICTION_NOT_PENDING'; end if;
  if v_prediction.receipt_path is null or v_prediction.receipt_path = '' then raise exception 'RECEIPT_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_prediction.event_id::text, 0));
  select * into v_event from public.events where id = v_prediction.event_id for update;
  if v_event.status in ('FINISHED', 'CANCELLED') then raise exception 'EVENT_FINALIZED'; end if;

  select
    coalesce(sum(verified_amount) filter (where team_selected = 'TEAM_A'), 0),
    coalesce(sum(verified_amount) filter (where team_selected = 'TEAM_B'), 0)
  into v_team_a, v_team_b
  from public.predictions
  where event_id = v_prediction.event_id and status = 'VERIFIED';

  if v_prediction.team_selected = 'TEAM_A' then v_team_a := v_team_a + p_verified_amount;
  else v_team_b := v_team_b + p_verified_amount; end if;
  v_selected_balance := case when v_prediction.team_selected = 'TEAM_A'
    then (v_team_a + v_team_b) - (v_team_a * v_event.multiplier)
    else (v_team_a + v_team_b) - (v_team_b * v_event.multiplier) end;
  if v_event.risk_mode = 'HARD_LIMIT' and v_selected_balance < (0 - v_event.risk_limit_amount) then raise exception 'RISK_LIMIT'; end if;

  update public.predictions set
    status = 'VERIFIED', verified_amount = p_verified_amount,
    admin_note = nullif(trim(p_admin_note), ''), verified_at = now(), verified_by = auth.uid()
  where id = p_prediction_id;
end;
$$;

revoke all on function public.verify_prediction_atomic(uuid,numeric,text) from public, anon;
grant execute on function public.verify_prediction_atomic(uuid,numeric,text) to authenticated;
