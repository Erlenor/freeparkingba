"""Downloads real parking data for FreeParkingBA and saves it to data/.

Runs in GitHub Actions every night. Uses only the Python standard library.
Sources:
  * Bratislava city GIS (ArcGIS, services8 pRlN1m0su5BYaFAS): PAAS zones, resident parking areas, zone plan
  * Petržalka district GIS (ArcGIS, services-eu1 gfD2sIpeuhWr0Ulz): detailed Petržalka zones and P+R areas
  * OpenStreetMap via Overpass API: P+R lots and shopping centres
"""
import json, time, urllib.parse, urllib.request, pathlib, datetime, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)
UA = {"User-Agent": "FreeParkingBA/1.0 (school project; github.com/Erlenor/freeparkingba)"}

CITY = "https://services8.arcgis.com/pRlN1m0su5BYaFAS/arcgis/rest/services"
PETR = "https://services-eu1.arcgis.com/gfD2sIpeuhWr0Ulz/ArcGIS/rest/services"
ARCGIS = {
    "zony": f"{CITY}/ZONY/FeatureServer",
    "rezidentske": f"{CITY}/Rezidentske_parkovanie/FeatureServer",
    "plan_zon": f"{CITY}/" + urllib.parse.quote("Plán_Zón") + "/FeatureServer",
    "petrzalka": f"{PETR}/" + urllib.parse.quote("Vyhradené_parkovanie_zony") + "/FeatureServer",
}
BBOX = "48.05,16.95,48.27,17.30"
OVERPASS_Q = f"""[out:json][timeout:90];
(
 nwr["amenity"="parking"]["park_ride"]["park_ride"!="no"]({BBOX});
 nwr["amenity"="parking"]["name"~"P ?\\\\+ ?R",i]({BBOX});
 nwr["shop"="mall"]({BBOX});
);
out center tags;"""
OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]


def get_json(url, data=None, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            err = e
            time.sleep(5 * (i + 1))
    raise err


def arcgis_service(base):
    info = get_json(base + "?f=json")
    feats, layers = [], []
    for lyr in info.get("layers", []):
        lid, name = lyr["id"], lyr.get("name", "")
        offset, got = 0, 0
        while True:
            q = urllib.parse.urlencode({"where": "1=1", "outFields": "*", "outSR": "4326", "f": "geojson",
                                        "resultOffset": offset, "resultRecordCount": 1000})
            page = get_json(f"{base}/{lid}/query?{q}")
            fs = page.get("features", [])
            for f in fs:
                f.setdefault("properties", {})["_layer"] = name
            feats += [f for f in fs if f.get("geometry")]
            got += len(fs)
            if not fs or not page.get("properties", {}).get("exceededTransferLimit") and len(fs) < 1000:
                break
            offset += len(fs)
        layers.append({"id": lid, "name": name, "count": got})
    return {"type": "FeatureCollection", "features": feats}, layers


def overpass():
    body = urllib.parse.urlencode({"data": OVERPASS_Q}).encode()
    last = None
    for u in OVERPASS_URLS:
        try:
            j = get_json(u, data=body)
            break
        except Exception as e:
            last = e
    else:
        raise last
    feats = []
    for e in j.get("elements", []):
        lat = e.get("lat", e.get("center", {}).get("lat"))
        lon = e.get("lon", e.get("center", {}).get("lon"))
        if lat is None:
            continue
        t = e.get("tags", {})
        kind = "oc" if t.get("shop") == "mall" else "pr"
        feats.append({"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
                      "properties": {"kind": kind, "osm": f"{e['type']}/{e['id']}", **t}})
    return {"type": "FeatureCollection", "features": feats}


def main():
    meta_path = OUT / "meta.json"
    old = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    meta = {"updated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "sources": {}}
    for key, base in ARCGIS.items():
        try:
            fc, layers = arcgis_service(base)
            (OUT / f"{key}.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
            meta["sources"][key] = {"url": base, "ok": True, "count": len(fc["features"]), "layers": layers, "fetched": meta["updated"]}
            print(f"{key}: {len(fc['features'])} features")
        except Exception as e:
            prev = old.get("sources", {}).get(key, {})
            meta["sources"][key] = {**prev, "url": base, "ok": False, "error": str(e)[:300]}
            print(f"{key}: FAILED {e}", file=sys.stderr)
    try:
        fc = overpass()
        (OUT / "miesta.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")))
        meta["sources"]["osm"] = {"url": "https://www.openstreetmap.org", "ok": True, "count": len(fc["features"]), "fetched": meta["updated"]}
        print(f"osm: {len(fc['features'])} features")
    except Exception as e:
        prev = old.get("sources", {}).get("osm", {})
        meta["sources"]["osm"] = {**prev, "ok": False, "error": str(e)[:300]}
        print(f"osm: FAILED {e}", file=sys.stderr)
    # list of city GIS services, to help find more datasets later
    try:
        d = get_json(CITY + "?f=json")
        meta["city_services"] = sorted(s["name"] for s in d.get("services", []))
    except Exception:
        meta["city_services"] = old.get("city_services", [])
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
