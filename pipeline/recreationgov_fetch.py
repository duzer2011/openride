"""
OpenRide Data Pipeline — Recreation.gov NPS Campsite Fetcher
Fetches campsite data along the Natchez Trace corridor
and seeds into Supabase lodging table.

Usage:
  python pipeline/recreationgov_fetch.py --corridor natchez-trace --dry-run
  python pipeline/recreationgov_fetch.py --corridor natchez-trace
"""

import requests
import json
import os
import time
import argparse
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()

REC_GOV_BASE = 'https://ridb.recreation.gov/api/v1'
CACHE_DIR = 'pipeline/cache'

CORRIDORS = {
    'natchez-trace': {
        'corridor_id': 'natchez-trace',
        'name': 'Natchez Trace Parkway',
        'search_terms': [
            'Natchez Trace',
            'Natchez Trace Parkway'
        ],
        'org_id': '126',  # NPS org ID in Recreation.gov
        'rec_area_ids': [2872],  # Natchez Trace Parkway rec area
        'bounds': {
            'sw_lat': 31.44, 'sw_lon': -91.55,
            'ne_lat': 36.15, 'ne_lon': -86.80
        }
    }
}

def fetch_facilities(search_term, activity='CAMPING', limit=50, offset=0):
    """Search Recreation.gov for camping facilities."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    import hashlib
    cache_key = hashlib.md5(f"{search_term}{activity}{offset}".encode()).hexdigest()
    cache_file = f"{CACHE_DIR}/recgov_{cache_key}.json"

    if os.path.exists(cache_file):
        with open(cache_file) as f:
            print(f"  [cache] {search_term} offset={offset}")
            return json.load(f)

    params = {
        'query': search_term,
        'activity': activity,
        'limit': limit,
        'offset': offset,
        'full': 'true'
    }

    # Recreation.gov API key is optional for basic queries
    api_key = os.environ.get('RECGOV_API_KEY', '')
    headers = {'apikey': api_key} if api_key else {}

    resp = requests.get(
        f"{REC_GOV_BASE}/facilities",
        params=params,
        headers=headers
    )

    if resp.status_code == 200:
        data = resp.json()
        with open(cache_file, 'w') as f:
            json.dump(data, f)
        return data
    elif resp.status_code == 429:
        print(f"  Rate limited -- waiting 30s...")
        time.sleep(30)
        return {}
    else:
        print(f"  Error {resp.status_code}: {resp.text[:200]}")
        return {}

def fetch_campsites_for_facility(facility_id):
    """Get individual campsites for a facility."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = f"{CACHE_DIR}/recgov_facility_{facility_id}.json"

    if os.path.exists(cache_file):
        with open(cache_file) as f:
            return json.load(f)

    resp = requests.get(f"{REC_GOV_BASE}/facilities/{facility_id}/campsites")
    if resp.status_code == 200:
        data = resp.json()
        with open(cache_file, 'w') as f:
            json.dump(data, f)
        return data
    return {}

def is_in_corridor(facility, bounds):
    """Check if facility is within corridor bounding box."""
    lat = facility.get('FacilityLatitude', 0)
    lon = facility.get('FacilityLongitude', 0)

    if not lat or not lon:
        return False

    return (bounds['sw_lat'] <= float(lat) <= bounds['ne_lat'] and
            bounds['sw_lon'] <= float(lon) <= bounds['ne_lon'])

def build_lodging_record(facility, corridor_id):
    """Convert Recreation.gov facility to OpenRide lodging record."""
    lat = float(facility.get('FacilityLatitude', 0))
    lon = float(facility.get('FacilityLongitude', 0))
    name = facility.get('FacilityName', 'Unknown Campsite')
    facility_id = facility.get('FacilityID', '')
    description = facility.get('FacilityDescription', '')
    phone = facility.get('FacilityPhone', '')
    url = f"https://www.recreation.gov/camping/campgrounds/{facility_id}"

    # Determine campsite type
    facility_type = facility.get('FacilityTypeDescription', '').lower()
    if 'primitive' in facility_type or 'backcountry' in facility_type:
        lodging_type = 'nps_campsite'
        price_range = 'free'
    else:
        lodging_type = 'campsite'
        price_range = '$'

    # Check if reservable
    reservable = facility.get('Reservable', False)

    return {
        'corridor_id': corridor_id,
        'name': name.title(),
        'type': lodging_type,
        'lat': lat,
        'lon': lon,
        'price_range': price_range,
        'booking_url': url,
        'affiliate_url': url,
        'affiliate_network': 'recreation_gov',
        'has_water': True,  # NPS sites generally have water
        'has_restrooms': True,
        'first_come_first_served': not reservable,
        'reservation_url': url if reservable else None,
        'notes': f"Recreation.gov ID: {facility_id}. {description[:200] if description else ''}",
        'verified': True,
        'seasonal_open_month': 3,
        'seasonal_close_month': 11
    }

def save_to_supabase(records, dry_run=False):
    """Save lodging records to Supabase."""
    if dry_run:
        print(f"\n[DRY RUN] Would save {len(records)} campsites")
        return

    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_KEY')
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY not set")
        return

    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

    saved = 0
    for record in records:
        resp = requests.post(
            f"{url}/rest/v1/lodging",
            headers=headers,
            json=record
        )
        if resp.status_code in (200, 201):
            saved += 1
            print(f"  OK {record['name']}")
        else:
            print(f"  FAIL {record['name']}: {resp.text[:100]}")
        time.sleep(0.05)

    print(f"\nSaved {saved}/{len(records)} campsites to Supabase")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--corridor', required=True, choices=CORRIDORS.keys())
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--no-cache', action='store_true')
    args = parser.parse_args()

    corridor = CORRIDORS[args.corridor]
    print(f"Fetching NPS campsites for: {corridor['name']}")

    all_facilities = {}

    # Strategy 1: Fetch by rec area ID (most reliable for NPS)
    rec_area_ids = corridor.get('rec_area_ids', [])
    if rec_area_ids:
        for rec_id in rec_area_ids:
            print(f"\nFetching RecArea {rec_id}...")
            api_key = os.environ.get('RECGOV_API_KEY', '')
            headers = {'apikey': api_key} if api_key else {}
            resp = requests.get(
                f"{REC_GOV_BASE}/recareas/{rec_id}/facilities",
                params={'limit': 50, 'full': 'true'},
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                facilities = data.get('RECDATA', [])
                for f in facilities:
                    fid = f.get('FacilityID')
                    if fid and fid not in all_facilities:
                        all_facilities[fid] = f
                print(f"  {len(facilities)} facilities (total unique: {len(all_facilities)})")
            else:
                print(f"  Error {resp.status_code}")
            time.sleep(0.5)

    # Strategy 2: Keyword search (fallback)
    for term in corridor['search_terms']:
        print(f"\nSearching: '{term}'")
        for offset in [0, 50, 100]:
            data = fetch_facilities(term, offset=offset)
            facilities = data.get('RECDATA', [])
            if not facilities:
                break
            for f in facilities:
                fid = f.get('FacilityID')
                if fid and fid not in all_facilities:
                    all_facilities[fid] = f
            print(f"  offset={offset}: {len(facilities)} facilities "
                  f"(total unique: {len(all_facilities)})")
            if len(facilities) < 50:
                break
            time.sleep(0.5)

    print(f"\nTotal unique facilities found: {len(all_facilities)}")

    # Filter to corridor bounds
    in_bounds = [
        f for f in all_facilities.values()
        if is_in_corridor(f, corridor['bounds'])
    ]
    print(f"Within corridor bounds: {len(in_bounds)}")

    # Show what we found
    print("\nCampsites found:")
    for f in in_bounds:
        name = f.get('FacilityName', 'Unknown')
        lat = f.get('FacilityLatitude', 0)
        lon = f.get('FacilityLongitude', 0)
        reservable = f.get('Reservable', False)
        print(f"  {name} | {lat},{lon} | "
              f"{'Reservable' if reservable else 'First-come'}")

    # Filter to actual campgrounds only — exclude visitor centers and info cabins
    campgrounds = [
        f for f in in_bounds
        if 'campground' in f.get('FacilityName', '').lower()
        and f.get('FacilityLatitude') and f.get('FacilityLongitude')
    ]
    print(f"\nCampgrounds only (filtered): {len(campgrounds)}")
    for f in campgrounds:
        print(f"  {f.get('FacilityName')} | {f.get('FacilityLatitude')},{f.get('FacilityLongitude')}")

    records = [
        build_lodging_record(f, corridor['corridor_id'])
        for f in campgrounds
    ]

    # Save output
    os.makedirs('pipeline/output', exist_ok=True)
    out = f"pipeline/output/recgov_{args.corridor}_{datetime.now().strftime('%Y%m%d')}.json"
    with open(out, 'w') as f:
        json.dump(records, f, indent=2)
    print(f"\nRaw data saved to: {out}")

    # Save to Supabase
    save_to_supabase(records, dry_run=args.dry_run)

if __name__ == '__main__':
    main()
