const fs = require('fs');

const config = `const CONFIG = {
  supabaseUrl: 'https://zjbadlzjbtwnpqdmvpbm.supabase.co',
  supabaseAnon: '${process.env.SUPABASE_ANON}',
  mapboxToken: '${process.env.MAPBOX_TOKEN}',
  anthropicKey: '${process.env.ANTHROPIC_KEY}'
};`;

fs.writeFileSync('config.js', config);
console.log('config.js generated');
