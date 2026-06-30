require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('listings')
    .select('url, external_id')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) throw error;
  
  for (const row of data) {
    if (!row.url) continue;
    console.log("Checking", row.url);
    const res = await fetch(row.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });
    const html = await res.text();
    
    let isPromoted = false;
    
    // Check various patterns
    if (/Ovaj oglas je istaknut/i.test(html)) {
      console.log("-> MATCHED: Ovaj oglas je istaknut");
      isPromoted = true;
    }
    if (/Istaknuto ogla/i.test(html)) {
      console.log("-> MATCHED: Istaknuto oglašavanje");
      isPromoted = true;
    }
    if (/istaknut/i.test(html)) {
      console.log("-> MATCHED: istaknut (generic)");
      const match = html.match(/.{0,40}istaknut.{0,40}/gi);
      if (match) console.log("   Context:", match);
      isPromoted = true;
    }
    if (/VauVau/i.test(html)) {
      console.log("-> MATCHED: VauVau");
      isPromoted = true;
    }
    
    if (isPromoted) {
      console.log("FOUND PROMOTED AD:", row.url);
      break; // stop after finding one
    }
  }
}

main().catch(console.error);
