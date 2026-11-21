# Hitster – házi kiadás (2. fázis)

## Első indítás helyben
1. `npm install`
2. Másold a `.env.example`-t `.env` néven, és töltsd ki a Supabase
   Dashboard -> Settings -> API oldalról (Project URL + anon public kulcs).
3. `npm run dev` – a kiírt címen nyílik (alapból http://localhost:5173)

## Kipróbálás több "telefonnal"
Nyisd meg két külön böngészőablakban (az egyik lehet inkognitó, az számít
külön eszköznek): az egyikben nyiss szobát (az lesz az admin), a másikban
lépj be a kóddal és alakíts csapatot.

## Telepítés Vercelre (hogy bárki elérje)
1. Tölts fel mindent egy GitHub repóba (a .env NE kerüljön fel – a
   .gitignore ezt már intézi).
2. vercel.com -> Add New -> Project -> importáld a repót.
3. Environment Variables: vedd fel a VITE_SUPABASE_URL és
   VITE_SUPABASE_ANON_KEY értékeket, majd Deploy.

## Linkellenőrzés
`npm run verify` – minden zenénél megnézi a YouTube/SoundCloud valódi címét,
és összeveti a kártyán lévővel. Az eredmény a `verify-report.html` fájlban
lesz (a gépeden, nem kerül fel a GitHubra). Javítás: Műhely → sorszám → új link.

## Tipp-pontozás szabályai
Lásd `src/lib/match.js` fejlécét: kis/nagybetű, ékezet, szóköz, írásjel,
zárójeles kiegészítés és kezdő "The" nem számít; rövid címnél pontos egyezés
kell, hosszabbnál néhány elgépelés belefér. A mester a felfordult lapnál
egy koppintással felülbírálhatja a bónuszt.

## Saját színvilágok
Műhely → 🎨 Új színvilág (vagy egy zenénél a stílusrács "+" mezője / "Másolat erről").
Egyszínű, színátmenetes (8 irány + tetszőleges szög) vagy körkörös háttér, 2–4 színpont,
szövegszín automatikus kontrasztajánlással. A gyári színvilágok nem írhatók felül.
