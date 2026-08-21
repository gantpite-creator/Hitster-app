// Szerepek tárolása:
// - JÁTÉKMESTER: fülszintű (sessionStorage). Csak az a böngészőfül mester,
//   amelyik a /mester oldalról nyitotta a játékot vagy onnan lépett be.
//   Így ugyanazon a gépen egy másik fül már sima játékos - és a nyilvános
//   címről kóddal belépők soha nem kapnak véletlenül mesteri jogot.
//   Ha a mester-fül bezárul, a jog a /mester oldal "Futó játékok"
//   listájából egy koppintással visszaszerezhető.
// - CSAPATTAGSÁG: eszközszintű (localStorage), hogy egy frissítés vagy
//   véletlen fülbezárás ne dobja ki a játékost a csapatából.
export const setAdmin = (gameId) => sessionStorage.setItem(`hitster-admin-${gameId}`, '1')
export const isAdmin = (gameId) => sessionStorage.getItem(`hitster-admin-${gameId}`) === '1'
export const setMyTeam = (gameId, teamId) => localStorage.setItem(`hitster-team-${gameId}`, teamId)
export const myTeam = (gameId) => localStorage.getItem(`hitster-team-${gameId}`)
