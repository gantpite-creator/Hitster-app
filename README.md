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
