/* Ručne overené údaje. Každý údaj má zdroj. Priraďujú sa k objektom z OpenStreetMap podľa názvu. */
const SOURCES = {
  osm:      {t: 'OpenStreetMap (Overpass API)', u: 'https://www.openstreetmap.org/copyright'},
  zony:     {t: 'GIS hl. mesta Bratislavy, vrstva ZONY', u: 'https://services8.arcgis.com/pRlN1m0su5BYaFAS/arcgis/rest/services/ZONY/FeatureServer'},
  rezidentske: {t: 'GIS hl. mesta Bratislavy, vrstva Rezidentske_parkovanie', u: 'https://services8.arcgis.com/pRlN1m0su5BYaFAS/arcgis/rest/services/Rezidentske_parkovanie/FeatureServer'},
  plan_zon: {t: 'GIS hl. mesta Bratislavy, vrstva Plán zón', u: 'https://services8.arcgis.com/pRlN1m0su5BYaFAS/arcgis/rest/services'},
  petrzalka:{t: 'GIS mestskej časti Petržalka, vrstva Vyhradené parkovanie zóny', u: 'https://services-eu1.arcgis.com/gfD2sIpeuhWr0Ulz/ArcGIS/rest/services/Vyhraden%c3%a9_parkovanie_zony/FeatureServer'},
  paas:     {t: 'paas.sk, záchytné parkoviská', u: 'https://paas-next.dev.bratislava.sk/en/zachytne-parkoviska'},
  aupark:   {t: 'aupark-bratislava.sk, parkovanie', u: 'https://aupark-bratislava.sk/en/parking'},
  avion:    {t: 'Startitup, zmena parkovania v Avione od 1. 4. 2026', u: 'https://www.startitup.sk/?p=1165148'},
  autotrip: {t: 'Autotrip.cz, parkovanie v Bratislave', u: 'https://autotrip.cz/parkovani-bratislava/'},
  guide:    {t: 'Bratislava Guide, parkovanie (nedatované)', u: 'https://www.bratislavaguide.com/bratislava-info/bratislava-parking-availability-and-regulations'},
  tariff:   {t: 'Autotrip.cz, tarify PAAS podľa pásma', u: 'https://autotrip.cz/parkovani-bratislava/'},
  osrm:     {t: 'OSRM, trasy po cestách OpenStreetMap', u: 'https://project-osrm.org'}
};
const FACTS = [
  {k: /pr[ií]stavn/i, kind: 'pr', label: 'P+R Prístavný most', cap: 107, lines: '87', ride: '25 min', src: 'paas'},
  {k: /macharov/i, kind: 'pr', label: 'P+R Macharova', cap: 95, lines: '59, 83, 84, 91, 92, 93, 94, 191, 192', ride: '3 min', src: 'paas'},
  {k: /lanfranconi/i, kind: 'pr', label: 'P+R Lanfranconi sever', cap: 37, lines: '4, 9, 29, 31, 37, 39', ride: '5 min', src: 'paas'},
  {k: /shopping palace/i, kind: 'pr', label: 'P+R Shopping Palace a Tesco', cap: 73, lines: '4, 56, 57, 65', ride: '21 min', src: 'paas'},
  {k: /lama[čc]/i, kind: 'pr', label: 'P+R Tesco Lamač', cap: 33, lines: '20, 30, 37, 45', ride: '23 min', src: 'paas'},
  {k: /komis[áa]rk/i, kind: 'pr', label: 'P+R Komisárky', cap: 163, lines: '3, 7', ride: '28 min', src: 'paas'},
  {k: /vraku[ňn]/i, kind: 'pr', label: 'P+R cintorín Vrakuňa', cap: 283, lines: '65, 71, 72, 75', ride: '15 min', src: 'paas'},
  {k: /jasovsk/i, kind: 'pr', label: 'P+R Jasovská', cap: 53, lines: '90, 91, 98, 191', ride: '10 min', src: 'paas'},
  {k: /^aupark/i, kind: 'oc', label: 'Aupark', cap: 1906, free: 'P1, P4, P7: 3 h zdarma v pracovné dni, 5 h cez víkend, potom 3,50 € za každú začatú hodinu. P5 (118 miest): zdarma.', src: 'aupark'},
  {k: /^eurovea/i, kind: 'oc', label: 'Eurovea', cap: 1900, free: 'Pracovné dni 3 h zdarma, víkend a sviatky 5 h zdarma, potom 3,50 €/h.', src: 'autotrip'},
  {k: /^nivy/i, kind: 'oc', label: 'Nivy', cap: 2150, free: 'Pracovné dni 3 h zdarma, víkend a sviatky 5 h zdarma, potom 3 €/h.', src: 'autotrip'},
  {k: /^avion/i, kind: 'oc', label: 'Avion Shopping Park', free: 'Od 1. 4. 2026: 3 h zdarma v pracovné dni, 5 h cez víkend a sviatky, potom spoplatnené (sadzba v zdroji neuvedená).', src: 'avion'},
  {k: /^central/i, kind: 'oc', label: 'Central', free: 'Pracovné dni 3 h zdarma, potom 3 €/h, víkend zdarma.', src: 'guide'}
];
