create or replace function public.start_round(p_room_id uuid)
returns public.rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  new_round public.rounds;
  next_number integer;
  rogue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_room from public.rooms where id = p_room_id for update;
  if target_room.id is null then raise exception 'Room not found'; end if;
  if target_room.host_player_id <> auth.uid() then raise exception 'Only the host can start the round'; end if;
  if target_room.status <> 'lobby' then raise exception 'This room has already started'; end if;
  if (select count(*) from public.room_players where room_id = p_room_id) < 2 then raise exception 'At least two players are required'; end if;

  next_number := target_room.round_number + 1;
  select player_id into rogue_id from public.room_players where room_id = p_room_id order by random() limit 1;

  insert into public.rounds (room_id, round_number, event_key, public_rules, phase, phase_ends_at)
  values (p_room_id, next_number, 'harvest_feast', jsonb_build_object(
    'title', 'Harvest Feast',
    'prompt', 'Every villager must defend one dish.',
    'rules', jsonb_build_array('Keep your answer to one sentence.', 'Do not say the word “maybe.”')
  ), 'investigation', timezone('utc', now()) + interval '3 minutes')
  returning * into new_round;

  insert into public.round_private_roles (round_id, player_id, role, secret_rule)
  select new_round.id, player_id,
    case when player_id = rogue_id then 'rogue' else 'villager' end,
    case when player_id = rogue_id
      then jsonb_build_object('instruction', 'Break exactly one village rule, but make it look accidental.')
      else jsonb_build_object('instruction', 'Watch for one player breaking a village rule.')
    end
  from public.room_players where room_id = p_room_id;

  update public.rooms set status = 'investigation', round_number = next_number,
    phase_ends_at = new_round.phase_ends_at, updated_at = timezone('utc', now()) where id = p_room_id;
  return new_round;
end;
$$;

create or replace function public.open_voting(p_room_id uuid)
returns public.rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room public.rooms;
  current_round public.rounds;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_room from public.rooms where id = p_room_id for update;
  if target_room.host_player_id <> auth.uid() then raise exception 'Only the host can open voting'; end if;
  select * into current_round from public.rounds where room_id = p_room_id and round_number = target_room.round_number;
  if current_round.id is null or current_round.phase <> 'investigation' then raise exception 'No investigation is in progress'; end if;
  update public.rounds set phase = 'voting', phase_ends_at = timezone('utc', now()) + interval '60 seconds' where id = current_round.id returning * into current_round;
  update public.rooms set status = 'voting', phase_ends_at = current_round.phase_ends_at, updated_at = timezone('utc', now()) where id = p_room_id;
  return current_round;
end;
$$;

create or replace function public.send_message(p_room_id uuid, p_round_id uuid, p_body text)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare created_message public.messages;
begin
  if auth.uid() is null or not public.is_room_member(p_room_id) then raise exception 'You are not in this room'; end if;
  insert into public.messages (room_id, round_id, player_id, body)
  values (p_room_id, p_round_id, auth.uid(), trim(p_body)) returning * into created_message;
  return created_message;
end;
$$;

create or replace function public.submit_vote(p_round_id uuid, p_suspect_id uuid)
returns public.round_votes
language plpgsql
security definer
set search_path = public
as $$
declare created_vote public.round_votes;
declare target_room_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select room_id into target_room_id from public.rounds where id = p_round_id and phase = 'voting';
  if target_room_id is null or not public.is_room_member(target_room_id) then raise exception 'Voting is not open'; end if;
  if not exists (select 1 from public.room_players where room_id = target_room_id and player_id = p_suspect_id) then raise exception 'That player is not in the room'; end if;
  insert into public.round_votes (round_id, voter_id, suspect_id) values (p_round_id, auth.uid(), p_suspect_id)
  on conflict (round_id, voter_id) do update set suspect_id = excluded.suspect_id, submitted_at = timezone('utc', now())
  returning * into created_vote;
  return created_vote;
end;
$$;

grant execute on function public.start_round(uuid) to authenticated;
grant execute on function public.open_voting(uuid) to authenticated;
grant execute on function public.send_message(uuid, uuid, text) to authenticated;
grant execute on function public.submit_vote(uuid, uuid) to authenticated;
