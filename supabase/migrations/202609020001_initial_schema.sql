create extension if not exists pgcrypto;

create type public.event_status as enum ('OPEN', 'CLOSED', 'FINISHED', 'CANCELLED');
create type public.prediction_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'PAID', 'CANCELLED');
create type public.team_selection as enum ('TEAM_A', 'TEAM_B');
create type public.risk_mode as enum ('OPEN', 'WARN', 'HARD_LIMIT');
create type public.match_result as enum ('TEAM_A', 'DRAW', 'TEAM_B');
create type public.settlement_status as enum ('PENDING_SETTLEMENT', 'SETTLED', 'VOID', 'IRF_FUNDS');

create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 80),
  team_a text not null,
  team_b text not null,
  team_a_logo text,
  team_b_logo text,
  match_date date not null,
  match_time time not null,
  betting_close_at timestamptz not null,
  status public.event_status not null default 'OPEN',
  minimum_amount numeric(10,2) not null default 10 check (minimum_amount > 0),
  multiplier numeric(6,2) not null default 1.5 check (multiplier >= 1 and multiplier <= 10),
  result public.match_result,
  risk_mode public.risk_mode not null default 'OPEN',
  risk_limit_amount numeric(12,2) not null default 0 check (risk_limit_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.settings (
  id uuid primary key default gen_random_uuid(),
  payment_qr_path text,
  payment_receiver_name text not null default '',
  rules_text text not null,
  maintenance_mode boolean not null default false,
  max_receipt_mb integer not null default 5 check (max_receipt_mb between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^IRF-[A-Z0-9]{6}$'),
  event_id uuid not null references public.events(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 100),
  phone text not null check (phone ~ '^9[0-9]{8}$'),
  refund_phone text not null check (refund_phone ~ '^9[0-9]{8}$'),
  team_selected public.team_selection not null,
  declared_amount numeric(10,2) not null check (declared_amount > 0),
  verified_amount numeric(10,2) check (verified_amount > 0),
  receipt_path text not null,
  status public.prediction_status not null default 'PENDING',
  admin_note text check (char_length(admin_note) <= 500),
  idempotency_key uuid not null unique,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null
);

create index predictions_event_status_idx on public.predictions(event_id, status);
create index predictions_event_team_idx on public.predictions(event_id, team_selected);
create index predictions_created_at_idx on public.predictions(created_at desc);

create table public.submission_attempts (
  id bigint generated always as identity primary key,
  request_fingerprint text not null,
  created_at timestamptz not null default now()
);
create index submission_attempts_lookup_idx on public.submission_attempts(request_fingerprint, created_at desc);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null unique references public.predictions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  result text not null check (result in ('WIN', 'LOSE', 'DRAW')),
  calculated_amount numeric(10,2) not null check (calculated_amount >= 0),
  status public.settlement_status not null default 'PENDING_SETTLEMENT',
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

alter table public.admins enable row level security;
alter table public.events enable row level security;
alter table public.settings enable row level security;
alter table public.predictions enable row level security;
alter table public.submission_attempts enable row level security;
alter table public.settlements enable row level security;

create policy "admins can read own role" on public.admins for select to authenticated using (user_id = auth.uid());
create policy "admins manage events" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settings" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage predictions" on public.predictions for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage settlements" on public.settlements for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.admins, public.events, public.settings, public.predictions, public.submission_attempts, public.settlements from anon;
grant select, insert, update, delete on public.events, public.settings, public.predictions, public.settlements to authenticated;
grant select on public.admins to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-assets', 'payment-assets', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "admins read private assets" on storage.objects for select to authenticated using (bucket_id in ('receipts','payment-assets') and public.is_admin());
create policy "admins upload private assets" on storage.objects for insert to authenticated with check (bucket_id in ('receipts','payment-assets') and public.is_admin());
create policy "admins update private assets" on storage.objects for update to authenticated using (bucket_id in ('receipts','payment-assets') and public.is_admin()) with check (bucket_id in ('receipts','payment-assets') and public.is_admin());
create policy "admins delete private assets" on storage.objects for delete to authenticated using (bucket_id in ('receipts','payment-assets') and public.is_admin());

create or replace function public.create_prediction_atomic(
  p_event_id uuid, p_code text, p_name text, p_phone text, p_refund_phone text,
  p_team_selected public.team_selection, p_declared_amount numeric, p_receipt_path text,
  p_idempotency_key uuid, p_request_fingerprint text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_event public.events%rowtype;
  v_existing text;
  v_team_a numeric;
  v_team_b numeric;
  v_projected_selected_balance numeric;
begin
  -- One lock per event makes the risk check and insert atomic under concurrency.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  select code into v_existing from public.predictions where idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  delete from public.submission_attempts where created_at < now() - interval '1 day';
  if (select count(*) from public.submission_attempts where request_fingerprint = p_request_fingerprint and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.submission_attempts(request_fingerprint) values (p_request_fingerprint);

  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'OPEN' or v_event.betting_close_at <= now() then raise exception 'EVENT_CLOSED'; end if;
  if p_declared_amount < v_event.minimum_amount then raise exception 'BELOW_MINIMUM'; end if;
  if p_receipt_path is null or p_receipt_path = '' then raise exception 'RECEIPT_REQUIRED'; end if;
  if p_name !~ '.{2,}' or p_phone !~ '^9[0-9]{8}$' or p_refund_phone !~ '^9[0-9]{8}$' then raise exception 'INVALID_INPUT'; end if;

  select
    coalesce(sum(coalesce(verified_amount, declared_amount)) filter (where team_selected = 'TEAM_A'), 0),
    coalesce(sum(coalesce(verified_amount, declared_amount)) filter (where team_selected = 'TEAM_B'), 0)
  into v_team_a, v_team_b from public.predictions
  where event_id = p_event_id and status = 'VERIFIED';

  if p_team_selected = 'TEAM_A' then
    v_team_a := v_team_a + p_declared_amount;
  else
    v_team_b := v_team_b + p_declared_amount;
  end if;
  v_projected_selected_balance := case when p_team_selected = 'TEAM_A'
    then (v_team_a + v_team_b) - (v_team_a * v_event.multiplier)
    else (v_team_a + v_team_b) - (v_team_b * v_event.multiplier) end;
  if v_event.risk_mode = 'HARD_LIMIT' and v_projected_selected_balance < (0 - v_event.risk_limit_amount) then raise exception 'RISK_LIMIT'; end if;

  insert into public.predictions(code,event_id,name,phone,refund_phone,team_selected,declared_amount,receipt_path,idempotency_key,request_fingerprint)
  values (p_code,p_event_id,trim(p_name),p_phone,p_refund_phone,p_team_selected,p_declared_amount,p_receipt_path,p_idempotency_key,p_request_fingerprint);
  return p_code;
end;
$$;
revoke all on function public.create_prediction_atomic(uuid,text,text,text,text,public.team_selection,numeric,text,uuid,text) from public, anon, authenticated;
grant execute on function public.create_prediction_atomic(uuid,text,text,text,text,public.team_selection,numeric,text,uuid,text) to service_role;

create or replace function public.set_event_result(p_event_id uuid, p_result public.match_result)
returns void language plpgsql security definer set search_path = public as $$
declare v_multiplier numeric;
begin
  if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  select multiplier into v_multiplier from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  update public.events set result = p_result, status = 'FINISHED' where id = p_event_id;
  insert into public.settlements(prediction_id,event_id,result,calculated_amount,status)
  select p.id,p.event_id,
    case when p_result = 'DRAW' then 'DRAW' when p.team_selected::text = p_result::text then 'WIN' else 'LOSE' end,
    case when p_result = 'DRAW' then 0 when p.team_selected::text = p_result::text then round(p.verified_amount * v_multiplier,2) else 0 end,
    case when p_result = 'DRAW' then 'IRF_FUNDS'::public.settlement_status when p.team_selected::text = p_result::text then 'PENDING_SETTLEMENT'::public.settlement_status else 'VOID'::public.settlement_status end
  from public.predictions p where p.event_id = p_event_id and p.status = 'VERIFIED' and p.verified_amount is not null
  on conflict (prediction_id) do update set result=excluded.result, calculated_amount=excluded.calculated_amount, status=excluded.status, settled_at=null;
end;
$$;
revoke all on function public.set_event_result(uuid,public.match_result) from public, anon;
grant execute on function public.set_event_result(uuid,public.match_result) to authenticated;
