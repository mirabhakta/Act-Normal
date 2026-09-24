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
    generated_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.rooms where code = generated_code);
  end loop;
  insert into public.rooms (code, host_player_id) values (generated_code, auth.uid()) returning * into created_room;
  insert into public.room_players (room_id, player_id, display_name, avatar_key, is_host)
  values (created_room.id, auth.uid(), trim(p_display_name), p_avatar_key, true);
  return created_room;
end;
$$;

grant execute on function public.create_room(text, text) to authenticated;
