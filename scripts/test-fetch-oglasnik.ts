import fs from "fs";

async function test() {
  const res = await fetch("https://www.oglasnik.hr/stanovi-prodaja?page=1");
  const html = await res.text();
  console.log(`HTML length: ${html.length}`);
  
  const matches = html.match(/self\.__next_f\.push/g);
  console.log(`__next_f matches: ${matches?.length || 0}`);
  
  fs.writeFileSync("scratch/oglasnik_page.html", html);
  console.log("Saved to scratch/oglasnik_page.html");
}

test();
