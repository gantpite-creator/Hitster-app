// Eszköz-szintű szerepek: aki létrehozta a játékot, az az admin ezen az
// eszközön; aki csapatot hozott létre, annak az eszköze a "csapateszköz".
export const setAdmin = (gameId) => localStorage.setItem(`hitster-admin-${gameId}`, '1')
export const isAdmin = (gameId) => localStorage.getItem(`hitster-admin-${gameId}`) === '1'
export const setMyTeam = (gameId, teamId) => localStorage.setItem(`hitster-team-${gameId}`, teamId)
export const myTeam = (gameId) => localStorage.getItem(`hitster-team-${gameId}`)
