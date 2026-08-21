import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase.js'
import { getGameByCode, fetchTeams, fetchPlacements, fetchMembers } from './gameApi.js'

// Egyetlen hook adja a teljes élő játékállapotot: a games/teams/placements
// táblák bármely változására újratöltjük a (kicsi) állapotot – egyszerű és
// megbízható, baráti társaság méretében bőven elég.
export function useGame(code) {
  const [game, setGame] = useState(null)
  const [teams, setTeams] = useState([])
  const [placements, setPlacements] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const reload = useCallback(async (gameId) => {
    const [g, t, p, m] = await Promise.all([
      supabase.from('games').select().eq('id', gameId).single().then((r) => r.data),
      fetchTeams(gameId),
      fetchPlacements(gameId),
      fetchMembers(gameId),
    ])
    setGame(g)
    setTeams(t)
    setPlacements(p)
    setMembers(m)
  }, [])

  useEffect(() => {
    let channel
    let cancelled = false
    ;(async () => {
      const g = await getGameByCode(code)
      if (cancelled) return
      if (!g) {
        setNotFound(true)
        setLoading(false)
        return
      }
      await reload(g.id)
      setLoading(false)
      channel = supabase
        .channel(`game-${g.id}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `id=eq.${g.id}` },
          () => reload(g.id))
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${g.id}` },
          () => reload(g.id))
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'placements', filter: `game_id=eq.${g.id}` },
          () => reload(g.id))
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'team_members', filter: `game_id=eq.${g.id}` },
          () => reload(g.id))
        .subscribe()
    })()
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [code, reload])

  return { game, teams, placements, members, loading, notFound }
}
