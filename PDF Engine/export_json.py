import sys, json, os
sys.path.insert(0, r'C:\OpenRide.bike\PDF Engine')
from natchez_trace import ROUTE

def export_guide_json(
    output_path,
    pace='moderate',
    lodging='bnb',
    season='spring'
):
    """Export route data as JSON for the HTML guide template."""

    route = ROUTE
    days = route['days'][pace]

    # Build day pages
    day_pages = []
    for day in days:
        town_key = day.get('overnight_town')
        town = route['towns'].get(town_key, {}) if town_key else {}

        # Lodging — highlight first, then rest
        lodging_options = town.get('lodging', {})
        all_lodging = (
            lodging_options.get('bnb', []) +
            lodging_options.get('hotel', []) +
            lodging_options.get('camping', [])
        )

        dinner = town.get('dining', {}).get('dinner', [])
        breakfast = town.get('dining', {}).get('breakfast', [])

        day_pages.append({
            'number': day['number'],
            'title': day['title'],
            'miles': day.get('miles', 0),
            'elevation': day.get('elevation', ''),
            'description': day.get('description', ''),
            'cues': day.get('cues', []),
            'tip': day.get('tip', ''),
            'overnight_town': town_key,
            'lodging': all_lodging,
            'dinner': dinner,
            'breakfast': breakfast,
        })

    # Gear list for lodging style
    gear = route.get('gear', {})
    gear_all = gear.get('all', [])
    gear_style = gear.get(lodging, [])

    # Build final JSON
    guide = {
        'route': {
            'name': route['name'],
            'subtitle': route['subtitle'],
            'origin': route['origin'],
            'destination': route['destination'],
            'header_label': route['header_label'],
            'stats': route['stats'],
            'essentials': route.get('essentials', {}),
            'logistics': route.get('logistics', {}),
            'closing': route.get('closing', ''),
        },
        'config': {
            'pace': pace,
            'lodging': lodging,
            'season': season,
        },
        'days': day_pages,
        'gear': {
            'all': gear_all,
            'style': gear_style,
        },
        'navigation': route.get('navigation', {}),
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(guide, f, indent=2, ensure_ascii=False)

    print(f"Guide JSON exported: {output_path}")
    print(f"  Pace: {pace} | Lodging: {lodging} | Season: {season}")
    print(f"  Days: {len(day_pages)}")
    return output_path


if __name__ == '__main__':
    export_guide_json(
        r'C:\OpenRide.bike\pdfs\guide-data.json',
        pace='moderate',
        lodging='bnb',
        season='spring'
    )
