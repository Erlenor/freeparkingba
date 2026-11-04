# FreeParkingBA

Maturitný projekt (Lýceum C. S. Lewisa, 2026/27). Mapa parkovania v Bratislave bez rizika pokuty: zóny PAAS, rezidentské úseky, plánované zóny, P+R a nákupné centrá.

## Dáta
Každú noc ich sťahuje GitHub Action (`.github/workflows/web.yml`, skript `scripts/fetch_data.py`) do priečinka `data/`:

* GIS hlavného mesta Bratislavy: vrstvy `ZONY`, `Rezidentske_parkovanie`, `Plán_Zón`
* GIS mestskej časti Petržalka: vrstva `Vyhradené_parkovanie_zony`
* OpenStreetMap (Overpass API): P+R a nákupné centrá
* Ručne overené údaje so zdrojmi: `facts.js`

Podklad mapy: © OpenStreetMap prispievatelia, satelit © Esri. Trasy: OSRM.
