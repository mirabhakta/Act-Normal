export type RoomStatus = 'lobby' | 'role_reveal' | 'investigation' | 'voting' | 'results' | 'closed'

export interface Room {
  id: string
  code: string
  host_player_id: string
  status: RoomStatus
  round_number: number
  phase_ends_at: string | null
  created_at: string
  updated_at: string
  expires_at: string
}

export interface RoomPlayer {
  room_id: string
  player_id: string
  display_name: string
  avatar_key: string
  score: number
  is_host: boolean
  is_connected: boolean
  joined_at: string
  last_seen_at: string
}

export interface Round {
  id: string
  room_id: string
  round_number: number
  event_key: string
  public_rules: Record<string, unknown>
  phase: 'role_reveal' | 'investigation' | 'voting' | 'results'
  phase_ends_at: string | null
  started_at: string
  ended_at: string | null
}

export interface PrivateRole {
  round_id: string
  player_id: string
  role: 'villager' | 'rogue'
  secret_rule: { instruction?: string }
}

export interface Message {
  id: string
  room_id: string
  round_id: string
  player_id: string
  body: string
  created_at: string
}
