import { supabase } from './supabase.js'
import { TEAM_COLORS } from './colors.js'

// Könnyen bemondható, összetéveszthetetlen betűk (nincs I/O/Q stb.)
const CODE_ABC = 'ABCDEFGHJKMNPRSTUVWXYZ'
const randomCode = () =>
  Array.from({ length: 4 }, () => CODE_ABC[Math.floor(Math.random() * CODE_ABC.length)]).join('')

export async function createGame(scoreLimit) {
  // ütközés esetén (nagyon ritka) új kóddal próbálkozunk
  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase
      .from('games')
      .insert({ code: randomCode(), score_limit: scoreLimit })
      .select()
      .single()
    if (!error) return data
    if (error.code !== '23505') throw error
  }
  throw new Error('Nem sikerült szobakódot foglalni, próbáld újra.')
}

export async function getGameByCode(code) {
  const { data, error } = await supabase
    .from('games')
    .select()
    .eq('code', code.toUpperCase())
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchTeams(gameId) {
  const { data, error } = await supabase
    .from('teams')
    .select()
    .eq('game_id', gameId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function fetchPlacements(gameId) {
  const { data, error } = await supabase
    .from('placements')
    .select('*, songs(*)')
    .eq('game_id', gameId)
  if (error) throw error
  return data
}

export const MAX_TEAM_MEMBERS = 4

export async function createTeam(gameId, name, existingCount) {
  const color = TEAM_COLORS[existingCount % TEAM_COLORS.length]
  const { data, error } = await supabase
    .from('teams')
    .insert({ game_id: gameId, name, color })
    .select()
    .single()
  if (error) throw error
  await supabase.from('team_members').insert({ game_id: gameId, team_id: data.id })
  return data
}

// Csatlakozás meglévő csapathoz (max 4 fő)
export async function joinTeam(gameId, teamId) {
  const { count } = await supabase
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
  if ((count ?? 0) >= MAX_TEAM_MEMBERS) {
    throw new Error('TELE')
  }
  const { error } = await supabase
    .from('team_members')
    .insert({ game_id: gameId, team_id: teamId })
  if (error) throw error
}

export async function fetchMembers(gameId) {
  const { data, error } = await supabase
    .from('team_members')
    .select()
    .eq('game_id', gameId)
  if (error) throw error
  return data
}

export async function updateScoreLimit(gameId, scoreLimit) {
  const { error } = await supabase.from('games').update({ score_limit: scoreLimit }).eq('id', gameId)
  if (error) throw error
}

export async function getSong(cardNumber) {
  const { data, error } = await supabase
    .from('songs')
    .select()
    .eq('card_number', cardNumber)
    .single()
  if (error) throw error
  return data
}

// Véletlen, még nem használt lap húzása az adatbázisból
export async function drawRandomCardNumber(usedNumbers) {
  const used = new Set(usedNumbers)
  const { count, error } = await supabase
    .from('songs')
    .select('card_number', { count: 'exact', head: true })
  if (error) throw error
  if (used.size >= count) throw new Error('Elfogyott a pakli!')
  for (let i = 0; i < 25; i++) {
    const offset = Math.floor(Math.random() * count)
    const { data } = await supabase
      .from('songs')
      .select('card_number')
      .order('card_number')
      .range(offset, offset)
    const n = data?.[0]?.card_number
    if (n != null && !used.has(n)) return n
  }
  // vészmegoldás: teljes lista, ha már majdnem üres a pakli
  const { data: all } = await supabase
    .from('songs')
    .select('card_number')
    .order('card_number')
    .range(0, 99999)
  const free = all.map((r) => r.card_number).filter((n) => !used.has(n))
  return free[Math.floor(Math.random() * free.length)]
}

export async function drawForTurn(game, placements) {
  const used = placements.map((p) => p.card_number)
  const n = await drawRandomCardNumber(used)
  const { error } = await supabase
    .from('games')
    .update({ current_card: n, card_revealed: false, pending_slot: null })
    .eq('id', game.id)
  if (error) throw error
  return n
}

export async function setPendingSlot(gameId, slot) {
  const { error } = await supabase.from('games').update({ pending_slot: slot }).eq('id', gameId)
  if (error) throw error
}

// Felfordítás: lehelyezés kiértékelve + bónuszok + kártya felfedése
export async function revealPlacement(
  game, team, song, { correct, titleOk, artistOk, titleGuess = '', artistGuess = '' }
) {
  const row = {
    game_id: game.id,
    team_id: team.id,
    card_number: song.card_number,
    correct,
    title_correct: titleOk,
    artist_correct: artistOk,
    title_guess: titleGuess.trim() || null,
    artist_guess: artistGuess.trim() || null,
  }
  let { error: e1 } = await supabase.from('placements').insert(row)
  if (e1 && (e1.code === 'PGRST204' || e1.code === '42703')) {
    // a tipp-oszlopok még nincsenek az adatbázisban: mentés nélkülük
    delete row.title_guess
    delete row.artist_guess
    ;({ error: e1 } = await supabase.from('placements').insert(row))
  }
  if (e1) {
    if (e1.code === '23505') return // egy csapattárs már felfordította
    throw e1
  }
  const bonus = (titleOk ? 1 : 0) + (artistOk ? 1 : 0)
  if (bonus > 0) {
    const { error: e2 } = await supabase
      .from('teams')
      .update({ bonus_points: team.bonus_points + bonus })
      .eq('id', team.id)
    if (e2) throw e2
  }
  const { error: e3 } = await supabase
    .from('games')
    .update({ card_revealed: true })
    .eq('id', game.id)
  if (e3) throw e3
}

export async function startGame(game, teams) {
  // körsorrend sorsolása
  const shuffled = [...teams].sort(() => Math.random() - 0.5)
  await Promise.all(
    shuffled.map((t, i) =>
      supabase.from('teams').update({ turn_order: i }).eq('id', t.id)
    )
  )
  // kezdőlap osztása: minden csapat egy felfordított lappal indul
  const used = []
  for (const t of shuffled) {
    const n = await drawRandomCardNumber(used)
    used.push(n)
    const { error } = await supabase.from('placements').insert({
      game_id: game.id,
      team_id: t.id,
      card_number: n,
      correct: true,
    })
    if (error) throw error
  }
  const { error } = await supabase
    .from('games')
    .update({ status: 'active', current_team_id: shuffled[0].id })
    .eq('id', game.id)
  if (error) throw error
}

export async function nextTurn(game, teams, placements = []) {
  // pontlimit-ellenőrzés: ha valaki elérte, a kör végén zárul a játék
  if (game.score_limit) {
    const reached = teams.some((t) => {
      const cards = placements.filter((p) => p.team_id === t.id && p.correct).length
      return cards + t.bonus_points >= game.score_limit
    })
    if (reached) {
      await setStatus(game.id, 'finished')
      return
    }
  }
  const ordered = [...teams].sort((a, b) => a.turn_order - b.turn_order)
  const idx = ordered.findIndex((t) => t.id === game.current_team_id)
  const next = ordered[(idx + 1) % ordered.length]
  const { error } = await supabase
    .from('games')
    .update({ current_team_id: next.id, current_card: null, card_revealed: false, pending_slot: null })
    .eq('id', game.id)
  if (error) throw error
}

export async function setStatus(gameId, status) {
  const { error } = await supabase.from('games').update({ status }).eq('id', gameId)
  if (error) throw error
}

// Konkrét (beolvasott) lap játékba hozása
export async function playCard(game, cardNumber) {
  const { error } = await supabase
    .from('games')
    .update({ current_card: cardNumber, card_revealed: false, pending_slot: null })
    .eq('id', game.id)
  if (error) throw error
}

// Játékmesteri felülbírálás: a cím/előadó bónusz kézi megadása vagy elvétele
export async function setBonus(placement, team, field, value) {
  if (placement[field] === value) return
  const { error: e1 } = await supabase
    .from('placements')
    .update({ [field]: value })
    .eq('id', placement.id)
  if (e1) throw e1
  const { error: e2 } = await supabase
    .from('teams')
    .update({ bonus_points: Math.max(0, team.bonus_points + (value ? 1 : -1)) })
    .eq('id', team.id)
  if (e2) throw e2
}

// Mesteri bírálat: a cím/előadó bónusz végleges eldöntése (a gép javaslata felülírható).
// decision: { title_correct?: bool, artist_correct?: bool } – csak amire volt tipp
export async function reviewBonus(placement, team, decision) {
  const upd = { bonus_reviewed: true }
  let delta = 0
  for (const f of ['title_correct', 'artist_correct']) {
    if (decision[f] === undefined || decision[f] === placement[f]) continue
    upd[f] = decision[f]
    delta += decision[f] ? 1 : -1
  }
  const { error: e1 } = await supabase.from('placements').update(upd).eq('id', placement.id)
  if (e1) throw e1
  if (delta && team) {
    const { error: e2 } = await supabase
      .from('teams')
      .update({ bonus_points: Math.max(0, team.bonus_points + delta) })
      .eq('id', team.id)
    if (e2) throw e2
  }
}
