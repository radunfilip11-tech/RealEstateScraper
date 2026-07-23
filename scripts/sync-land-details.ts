/**
 * sync-land-details.ts
 *
 * Synchronizes size_m2 and land_type from local/dev DB to prod DB
 * for listings that were updated by the detail-fill workers.
 *
 * Uses `.update()` to ensure we do NOT overwrite existing data with empty fields,
 * only updating specific targeted fields for the given external_id.
 *
 * Usage:
 *   npx tsx scripts/sync-land-details.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// ── Load envs ──────────────────────────────────────────────────────────────────
const root = path.resolve(process.cwd());
const devEnv = dotenv.parse(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
const prodEnv = dotenv.parse(fs.readFileSync(path.join(root, '.env.production.local'), 'utf8'));

const DEV_URL  = devEnv['NEXT_PUBLIC_SUPABASE_URL'];
const DEV_KEY  = devEnv['SUPABASE_SERVICE_ROLE_KEY'];
const PROD_URL = prodEnv['NEXT_PUBLIC_SUPABASE_URL'];
const PROD_KEY = prodEnv['SUPABASE_SERVICE_ROLE_KEY'];

if (!DEV_URL || !DEV_KEY)   { console.error('❌ Missing dev Supabase env vars in .env.local'); process.exit(1); }
if (!PROD_URL || !PROD_KEY) { console.error('❌ Missing prod Supabase env vars in .env.production.local'); process.exit(1); }

const dev  = createClient(DEV_URL,  DEV_KEY);
const prod = createClient(PROD_URL, PROD_KEY);

const BATCH_SIZE = 1000;

async function countDev(): Promise<number> {
  const { count, error } = await dev
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .not('land_type', 'is', null);
  
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  console.log(`\n🚀 Syncing land details (size_m2 & land_type): dev → prod`);
  console.log(`   Dev:  ${DEV_URL}`);
  console.log(`   Prod: ${PROD_URL}\n`);

  const totalDev = await countDev();
  console.log(`📊 Dev has ${totalDev.toLocaleString()} listings with land_type populated\n`);

  let offset = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  while (true) {
    const { data, error } = await dev
      .from('listings')
      .select('external_id, size_m2, land_type')
      .not('land_type', 'is', null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) { console.error('❌ Dev read error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    console.log(`📥 Read ${data.length} rows (offset ${offset})`);

    // Perform updates in parallel batches of 50
    const chunks = [];
    for (let i = 0; i < data.length; i += 50) {
      chunks.push(data.slice(i, i + 50));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(row => 
        prod.from('listings')
            .update({ size_m2: row.size_m2, land_type: row.land_type })
            .eq('external_id', row.external_id)
      );

      const results = await Promise.all(promises);
      
      for (const res of results) {
        if (res.error) {
          console.error('❌ Prod update error:', res.error.message);
          totalErrors++;
        } else {
          totalUpdated++;
        }
      }
    }

    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }

  console.log('\n✅ Sync complete!');
  console.log(`   Successfully updated: ${totalUpdated.toLocaleString()}`);
  console.log(`   Errors: ${totalErrors.toLocaleString()}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
