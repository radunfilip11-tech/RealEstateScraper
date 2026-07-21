import { getSupabaseServerClient } from "../src/lib/supabase/server";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

async function main() {
  const supabase = getSupabaseServerClient();
  console.log("Starting query with quoted comma in filter...");
  const search = "OTOK RAB, PALIT ";
  const safeSearch = search.replace(/"/g, '""');
  const { data, error } = await supabase.from("listings").select("*").or(`title.ilike."%${safeSearch}%",external_id.ilike."%${safeSearch}%",location.ilike."%${safeSearch}%"`);
  
  if (error) {
    console.error("Error from Supabase:", JSON.stringify(error, null, 2));
  } else {
    console.log("Success! Got data:", data.length);
  }
}
main();
