import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Room, RoomPlayer } from './gameTypes'

export async function ensureAnonymousSession() {
  const { data: sessionData } = await supabase.auth.getSession()
  if (sessionData.session) return sessionData.session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  return data.session
}

export async function createRoom(displayName: string, avatarKey = 'farmer') {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('create_room', {
    p_display_name: displayName,
    p_avatar_key: avatarKey,
  })
  if (error) throw error
  return data as Room
}

export async function joinRoom(code: string, displayName: string, avatarKey = 'farmer') {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('join_room', {
    p_code: code,
    p_display_name: displayName,
    p_avatar_key: avatarKey,
  })
  if (error) throw error
  return data as Room
}

export async function getRoomPlayers(roomId: string) {
  const { data, error } = await supabase.from('room_players').select('*').eq('room_id', roomId).order('joined_at')
  if (error) throw error
  return data as RoomPlayer[]
}

export async function startRound(roomId: string) {
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('start_round', { p_room_id: roomId })
  if (error) throw error
  return data
}

export async function openVoting(roomId: string) {
  const { data, error } = await supabase.rpc('open_voting', { p_room_id: roomId })
  if (error) throw error
  return data
}

export async function getCurrentRound(roomId: string, roundNumber: number) {
  const { data, error } = await supabase.from('rounds').select('*').eq('room_id', roomId).eq('round_number', roundNumber).single()
  if (error) throw error
  return data
}

export async function getLatestRound(roomId: string) {
  const { data, error } = await supabase.from('rounds').select('*').eq('room_id', roomId).order('round_number', { ascending: false }).limit(1).single()
  if (error) throw error
  return data
}

export async function getMyRole(roundId: string) {
  const { data, error } = await supabase.from('round_private_roles').select('*').eq('round_id', roundId).maybeSingle()
  if (error) throw error
  return data
}

export async function getMessages(roomId: string, roundId: string) {
  const { data, error } = await supabase.from('messages').select('*').eq('room_id', roomId).eq('round_id', roundId).order('created_at')
  if (error) throw error
  return data
}

export async function sendMessage(roomId: string, roundId: string, body: string) {
  const { data, error } = await supabase.rpc('send_message', { p_room_id: roomId, p_round_id: roundId, p_body: body })
  if (error) throw error
  return data
}

export async function submitVote(roundId: string, suspectId: string) {
  const { data, error } = await supabase.rpc('submit_vote', { p_round_id: roundId, p_suspect_id: suspectId })
  if (error) throw error
  return data
}

export function subscribeToRoom(roomId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`room:${roomId}`, { config: { private: true } })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe()
}

export async function leaveRoom(channel: RealtimeChannel) {
  await supabase.removeChannel(channel)
}
