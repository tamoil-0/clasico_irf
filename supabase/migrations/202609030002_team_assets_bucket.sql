-- Logos de equipos: assets públicos, sin datos sensibles.
-- Bucket propio para no mezclarlos con receipts/payment-assets, que son privados.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'team-assets', 'team-assets', true, 2097152,
  array['image/jpeg','image/png','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lectura pública: los logos se muestran en la portada antes de cualquier login.
create policy "anyone reads team assets" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'team-assets');

-- Escritura solo para administradores autenticados.
create policy "admins upload team assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-assets' and public.is_admin());

create policy "admins update team assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'team-assets' and public.is_admin())
  with check (bucket_id = 'team-assets' and public.is_admin());

create policy "admins delete team assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-assets' and public.is_admin());
