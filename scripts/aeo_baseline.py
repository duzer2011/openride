"""AEO baseline: ask each question to OpenAI (web search) and Gemini (Google Search grounding).
Records whether openride.bike is mentioned or cited and which sites/companies are cited.
Keys are read from .env and never printed. One run = 2 calls per question.
Usage: python scripts/aeo_baseline.py
"""
import csv, datetime, os, re, sys
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPENAI_MODEL = 'gpt-5.5'
GEMINI_MODEL = 'gemini-3.8-flash'

QUESTIONS = [
    "How do I plan a self-guided bike tour of the Natchez Trace?",
    "What's the best month to bike the Natchez Trace?",
    "How do I get back to my car after riding the Natchez Trace one way?",
    "Where should I stay biking the lower Natchez Trace?",
    "Self-guided vs guided bike tour on the Natchez Trace: cost?",
    "Can I ride the Natchez Trace on an e-bike?",
    "Best self-guided bike tours in the US for beginners",
    "Katy Trail in October: what to know",
    "How do I get back from a one-way GAP and C&O ride?",
    "Best inn-to-inn bike tours in the US",
]

# Companies worth tracking when they appear in the answer text.
COMPANIES = ['Adventure Cycling', 'Backroads', 'Trek Travel', 'VBT', 'REI', 'Trailhead Tours', 'Bike the Trace',
             'Trail Tours', 'Natchez Trace Parkway', 'National Park Service', 'Natchez Trace Bicycle Route',
             'Cycle Kentucky', 'Ride with GPS', 'Komoot', 'Bikepacking.com', 'TripAdvisor', 'Reddit',
             'Great Allegheny Passage', 'Trail Town', 'Rails-to-Trails Conservancy', 'Katy Trail State Park',
             'Discover Cars', 'Booking.com', 'Hipcamp']


def load_env(path):
    env = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$', line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env


def domain(url):
    d = urlparse(url).netloc.lower()
    return d[4:] if d.startswith('www.') else d


def ask_openai(client, q):
    r = client.responses.create(model=OPENAI_MODEL, tools=[{"type": "web_search"}], input=q)
    text = r.output_text or ''
    urls = []
    for item in r.output:
        if getattr(item, 'type', '') == 'message':
            for c in item.content:
                for a in (getattr(c, 'annotations', None) or []):
                    if getattr(a, 'type', '') == 'url_citation':
                        urls.append(a.url)
    return text, [domain(u) for u in urls]


def ask_gemini(client, types, q):
    r = client.models.generate_content(
        model=GEMINI_MODEL, contents=q,
        config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())]))
    text = r.text or ''
    sites = []
    cands = r.candidates or []
    gm = cands[0].grounding_metadata if cands else None
    for ch in ((gm.grounding_chunks or []) if gm else []):
        if ch.web:
            # Gemini returns a redirect URI; the title is normally the source domain.
            sites.append((ch.web.title or domain(ch.web.uri or '')).lower())
    return text, sites


def main():
    env = load_env(os.path.join(ROOT, '.env'))
    from openai import OpenAI
    from google import genai
    from google.genai import types
    oa = OpenAI(api_key=env['OPENAI_API_KEY'])
    gm = genai.Client(api_key=env['GEMINI_API_KEY'])

    today = datetime.date.today().isoformat()
    out = os.path.join(ROOT, '_reports', f'aeo-baseline-{today}.csv')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    rows = []
    for q in QUESTIONS:
        for engine, model, fn in (('openai', OPENAI_MODEL, lambda: ask_openai(oa, q)),
                                  ('gemini', GEMINI_MODEL, lambda: ask_gemini(gm, types, q))):
            try:
                text, sites = fn()
                err = ''
            except Exception as e:
                text, sites, err = '', [], type(e).__name__ + ': ' + str(e)[:200]
            uniq = list(dict.fromkeys(sites))
            blob = (text + ' ' + ' '.join(sites)).lower()
            rows.append({
                'date': today, 'engine': engine, 'model': model, 'question': q,
                'mentions_openride': 'yes' if 'openride' in text.lower() else 'no',
                'cites_openride': 'yes' if any('openride' in s for s in sites) else 'no',
                'cited_sites': '; '.join(uniq),
                'companies_named': '; '.join(c for c in COMPANIES if c.lower() in text.lower()),
                'error': err,
                'answer': text.replace('\r', ' ').replace('\n', ' ')[:3000],
            })
            print(f"{engine:6} | {q[:55]:55} | mention={rows[-1]['mentions_openride']} cite={rows[-1]['cites_openride']} "
                  f"sites={len(uniq)} {('ERR ' + err[:80]) if err else ''}")
            sys.stdout.flush()
    with open(out, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print('saved', out)


if __name__ == '__main__':
    main()
