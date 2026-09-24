create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code = upper(code) and code ~ '^[A-Z0-9]{6}$'),
  host_player_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'lobby' check (status in ('lobby', 'role_reveal', 'investigation', 'voting', 'results', 'closed')),
  round_number integer not null default 0 check (round_number >= 0),
  phase_ends_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '24 hours'
);

create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  avatar_key text not null default 'farmer',
  score integer not null default 0,
  is_host boolean not null default false,
  is_connected boolean not null default true,
  joined_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, player_id)
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_number integer not null,
  event_key text not null,
  public_rules jsonb not null default '{}'::jsonb,
  phase text not null default 'role_reveal' check (phase in ('role_reveal', 'investigation', 'voting', 'results')),
  phase_ends_at timestamptz,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  unique (room_id, round_number)
);

create table if not exists public.round_private_roles (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('villager', 'rogue')),
  secret_rule jsonb not null default '{}'::jsonb,
  primary key (round_id, player_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.round_votes (
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  suspect_id uuid not null references auth.users(id) on delete cascade,
  submitted_at timestamptz not null default timezone('utc', now()),
  primary key (round_id, voter_id)
);

create index if not exists room_players_player_idx on public.room_players(player_id);
create index if not exists rounds_room_idx on public.rounds(room_id, round_number desc);
create index if not exists messages_room_idx on public.messages(room_id, created_at);
create index if not exists votes_round_idx on public.round_votes(round_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.rounds enable row level security;
alter table public.round_private_roles enable row level security;
alter table public.messages enable row level security;
alter table public.round_votes enable row level security;

create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_players
    where room_id = target_room_id and player_id = auth.uid()
  );
$$;

create policy "members can read rooms" on public.rooms for select to authenticated
using (public.is_room_member(id));

create policy "members can read players" on public.room_players for select to authenticated
using (public.is_room_member(room_id));

create policy "members can read rounds" on public.rounds for select to authenticated
using (public.is_room_member(room_id));

create policy "players can read their role" on public.round_private_roles for select to authenticated
using (player_id = auth.uid());

create policy "members can read messages" on public.messages for select to authenticated
using (public.is_room_member(room_id));

create policy "members can send messages" on public.messages for insert to authenticated
with check (player_id = auth.uid() and public.is_room_member(room_id));

create policy "members can read votes" on public.round_votes for select to authenticated
using (public.is_room_member((select room_id from public.rounds where id = round_id)));

create policy "players can submit their vote" on public.round_votes for insert to authenticated
with check (voter_id = auth.uid() and public.is_room_member((select room_id from public.rounds where id = round_id)));

create or replace function public.create_room(
  p_display_name text,
  p_avatar_key text default 'farmer'
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  created_room public.rooms;
  generated_code text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  loop
    generated_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (select 1 from public.rooms where code = generated_code);
  end loop;
  insert into public.rooms (code, host_player_id) values (generated_code, auth.uid()) returning * into created_room;
  insert into public.room_players (room_id, player_id, display_name, avatar_key, is_host)
  values (created_room.id, auth.uid(), trim(p_display_name), p_avatar_key, true);
  return created_room;
end;
$$;

create or replace function public.join_room(
  p_code text,
  p_display_name text,
  p_avatar_key text default 'farmer'
)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_room from public.rooms where code = upper(trim(p_code)) and status = 'lobby' and expires_at > now();
  if target_room.id is null then raise exception 'Room not found or no longer accepting players'; end if;
  if (select count(*) from public.room_players where room_id = target_room.id) >= 8 then raise exception 'Room is full'; end if;
  insert into public.room_players (room_id, player_id, display_name, avatar_key)
  values (target_room.id, auth.uid(), trim(p_display_name), p_avatar_key)
  on conflict (room_id, player_id) do update set display_name = excluded.display_name, is_connected = true, last_seen_at = now();
  return target_room;
end;
$$;

grant execute on function public.create_room(text, text) to authenticated;
grant execute on function public.join_room(text, text, text) to authenticated;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.rounds;
alter publication supabase_realtime add table public.round_private_roles;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.round_votes;

create policy "room members can receive private channel messages"
on realtime.messages for select to authenticated
using (
  realtime.topic() like 'room:%'
  and exists (
    select 1
    from public.room_players
    where room_id = split_part(realtime.topic(), ':', 2)::uuid
      and player_id = auth.uid()
  )
);

create policy "room members can send private channel messages"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() like 'room:%'
  and exists (
    select 1
    from public.room_players
    where room_id = split_part(realtime.topic(), ':', 2)::uuid
      and player_id = auth.uid()
  )
);
