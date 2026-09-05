-- Bootstrap del evento real solicitado. No inserta participantes, teléfonos,
-- receptores ni QR ficticios. Revisa la fecha nuevamente antes de producción.
insert into public.events (
  id, title, team_a, team_b, team_a_logo, team_b_logo,
  match_date, match_time, betting_close_at, status,
  minimum_amount, multiplier, risk_mode, risk_limit_amount
) values (
  '00000000-0000-4000-8000-000000000001',
  'Clásico IRF', 'Alianza Lima', 'Universitario',
  '/teams/alianza-lima.svg', '/teams/universitario.svg',
  '2026-09-12', '20:00', '2026-09-12 19:45:00-05',
  'CLOSED', 10, 1.50, 'OPEN', 0
) on conflict (id) do nothing;

insert into public.settings (
  id, payment_qr_path, payment_receiver_name, rules_text,
  maintenance_mode, max_receipt_mb
) values (
  '00000000-0000-4000-8000-000000000002',
  null, '',
  'Solo participan registros cuyo pago haya sido verificado manualmente. Si gana un equipo, sus participaciones verificadas reciben el cálculo del multiplicador configurado. Si el partido termina empatado, las participaciones verificadas se destinan a apoyar los fondos y actividades de IRF.',
  false, 5
) on conflict (id) do nothing;

-- El evento inicia CLOSED y sin QR por seguridad. Después de cargar el QR real
-- desde /admin, cambia el estado a OPEN cuando corresponda.
