# OpenRide.bike

Self-guided cycling tour platform.

## Netlify Setup

1. Connect this repo to Netlify (Add new site → Import from Git)
2. Build settings: leave blank (static site + functions)
3. Add environment variable in Netlify dashboard:
   - Key: `MAPBOX_TOKEN`
   - Value: your `pk.` Mapbox public token

## Folder Structure

```
openride/
  index.html                  ← Main site
  profile.html                ← Rider profile page  
  community.html              ← Community feed
  pdf_engine.py               ← PDF generation engine
  map_generator.py            ← Mapbox static map fetcher
  requirements.txt            ← Python deps (reportlab)
  netlify.toml                ← Netlify config
  netlify/functions/
    generate-pdf.py          ← Serverless PDF endpoint
  routes/
    natchez_trace.py          ← Natchez Trace route data
    natchez_trace_days_patch.py — Day enrichment content
```

## PDF Generation

POST to `/.netlify/functions/generate-pdf` with JSON body:
```json
{
  "pace": "moderate",
  "lodging": "bnb",
  "transport": "driving",
  "season": "spring",
  "ebike": false
}
```
Returns a PDF file download.
