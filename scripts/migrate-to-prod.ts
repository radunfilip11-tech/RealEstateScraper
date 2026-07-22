/**
 * migrate-to-prod.ts
 *
 * Migrates all listings from dev Supabase (nekretnine) → prod Supabase (nekretnine-prod).
 *
 * Uses ON CONFLICT (external_id) DO NOTHING, so it's safe to run multiple times.
 * Reads dev keys from .env.local and prod keys from .env.production.local.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-prod.ts
 *   npx tsx scripts/migrate-to-prod.ts --dry-run   # preview only, no writes
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

const isDryRun = process.argv.includes('--dry-run');

const dev  = createClient(DEV_URL,  DEV_KEY);
const prod = createClient(PROD_URL, PROD_KEY);

// ── Config ─────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 500;   // rows per read (Supabase default limit = 1000)
const WRITE_BATCH = 200;  // rows per upsert (keep payloads < 1 MB)

const COLUMNS = [
  'external_id', 'title', 'price', 'price_numeric', 'size_m2',
  'location', 'location_region', 'location_county', 'location_city', 'location_neighborhood',
  'property_type', 'advertiser_type', 'url', 'image_url',
  'source', 'description', 'notified',
  'created_at', 'transaction_type', 'status', 'hidden',
  'is_promoted', 'published_at',
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function countDev(): Promise<number> {
  const { count, error } = await dev.from('listings').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countProd(): Promise<number> {
  const { count, error } = await prod.from('listings').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Listings migration: dev → prod`);
  console.log(`   Dev:  ${DEV_URL}`);
  console.log(`   Prod: ${PROD_URL}`);
  if (isDryRun) console.log(`   ⚠️  DRY RUN — no writes will happen\n`);
  else console.log();

  const totalDev  = await countDev();
  const totalProd = await countProd();
  console.log(`📊 Dev has ${totalDev.toLocaleString()} listings`);
  console.log(`📊 Prod has ${totalProd.toLocaleString()} listings`);
  console.log();

  let offset = 0;
  let totalInserted = 0;
  let totalSkipped  = 0;
  let page = 1;

  while (true) {
    // Read a batch from dev
    const { data, error } = await dev
      .from('listings')
      .select(COLUMNS.join(','))
      .range(offset, offset + BATCH_SIZE - 1)
      .order('created_at', { ascending: true });

    if (error) { console.error('❌ Dev read error:', error.message); process.exit(1); }
    if (!data || data.length === 0) break;

    console.log(`📥 Page ${page}: read ${data.length} rows (offset ${offset})`);

    if (!isDryRun) {
      // Write in sub-batches to avoid payload limits
      const subBatches = chunk(data, WRITE_BATCH);
      for (const batch of subBatches) {
        const { error: writeErr, count } = await prod
          .from('listings')
          .upsert(batch as any[], {
            onConflict: 'external_id',
            ignoreDuplicates: true,
          })
          .select('id', { count: 'exact', head: true });

        if (writeErr) {
          console.error('❌ Prod write error:', writeErr.message);
          console.error('   First row external_id:', (batch[0] as any).external_id);
          process.exit(1);
        }

        const inserted = count ?? 0;
        const skipped  = batch.length - inserted;
        totalInserted += inserted;
        totalSkipped  += skipped;
      }
    } else {
      totalInserted += data.length; // dry-run: count as would-be inserts
    }

    offset += data.length;
    page++;

    if (data.length < BATCH_SIZE) break; // last page
  }

  console.log('\n✅ Migration complete!');
  console.log(`   Inserted: ${totalInserted.toLocaleString()}`);
  console.log(`   Skipped (duplicates): ${totalSkipped.toLocaleString()}`);

  if (!isDryRun) {
    const finalCount = await countProd();
    console.log(`   Prod total: ${finalCount.toLocaleString()} listings`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
