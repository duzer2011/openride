const fs = require('fs');

const config = `const CONFIG = {
  supabaseUrl: 'https://zjbadlzjbtwnpqdmvpbm.supabase.co',
  supabaseAnon: '${process.env.SUPABASE_ANON}',
  mapboxToken: '${process.env.MAPBOX_TOKEN}'
};`;

fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/config.js', config);
console.log('public/config.js generated');
