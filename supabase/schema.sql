-- PING relay. Stores only ciphertext until the recipient downloads it; chats live on the phones.

create table public.profiles (
  id uuid primary key default auth.uid() references auth.users on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  pub text not null check (length(pub) = 44),
  seen_at timestamptz
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table public.queue (
  id bigint generated always as identity primary key,
  sender uuid not null default auth.uid() references auth.users on delete cascade,
  recipient uuid not null references auth.users on delete cascade,
  box text not null check (length(box) <= 65536),
  created_at timestamptz not null default now()
);
create index queue_recipient on public.queue (recipient, id);
alter table public.queue enable row level security;
create policy "send" on public.queue for insert to authenticated with check (sender = auth.uid());
create policy "receive" on public.queue for select to authenticated using (recipient = auth.uid());
create policy "ack" on public.queue for delete to authenticated using (recipient = auth.uid());
alter publication supabase_realtime add table public.queue;

-- Pairing lookup without exposing the profiles table.
create function public.find_code(c text) returns table (id uuid, pub text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.pub from public.profiles p where p.code = upper(c) and p.id <> auth.uid();
$$;

-- Public key and last seen for peers whose id you already hold.
create function public.peers(ids uuid[]) returns table (id uuid, pub text, seen_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.pub, p.seen_at from public.profiles p where p.id = any(ids) limit 64;
$$;

revoke execute on function public.find_code(text), public.peers(uuid[]) from public, anon;
grant execute on function public.find_code(text), public.peers(uuid[]) to authenticated;
revoke all on public.profiles, public.queue from anon;

-- Undelivered events older than 30 days are dropped.
create extension if not exists pg_cron;
select cron.schedule('ping-queue-cleanup', '0 3 * * *', $$delete from public.queue where created_at < now() - interval '30 days'$$);

-- Encrypted attachments. Uploaded to <recipient>/<random>; the recipient deletes after download.
insert into storage.buckets (id, name, public, file_size_limit) values ('media', 'media', false, 26214400);
create policy "media send" on storage.objects for insert to authenticated with check (bucket_id = 'media' and owner_id = auth.uid()::text);
create policy "media receive" on storage.objects for select to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media ack" on storage.objects for delete to authenticated using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
