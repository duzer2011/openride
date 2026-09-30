const fs = require('fs');

const config = `const CONFIG = {
  supabaseUrl: 'https://zjbadlzjbtwnpqdmvpbm.supabase.co',
  supabaseAnon: '${process.env.SUPABASE_ANON}',
  mapboxToken: '${process.env.MAPBOX_TOKEN}'
};`;

// Stamp the service worker with this deploy so every deploy installs a new worker and drops old caches.
// Only on Netlify, so local runs never modify the tracked file.
if (process.env.NETLIFY === 'true') {
  const swPath = 'public/sw.js';
  const version = (process.env.COMMIT_REF || String(Date.now())).slice(0, 10);
  const sw = fs.readFileSync(swPath, 'utf8');
  if (!/const VERSION = 'dev';/.test(sw)) throw new Error('sw.js VERSION placeholder not found');
  fs.writeFileSync(swPath, sw.replace("const VERSION = 'dev';", "const VERSION = '" + version + "';"));
  console.log('sw.js version', version);
}

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/config.js', config);
console.log('public/config.js generated');
