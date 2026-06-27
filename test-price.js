const fs = require('fs');

async function testPrice() {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept": "text/html"
  };
  
  const res = await fetch("https://www.njuskalo.hr/prodaja-stanova", { headers });
  const html = await res.text();
  
  const prices = [];
  const matches = html.matchAll(/class="price[^"]*"[^>]*>([\s\S]*?)<\/strong>/gi);
  for (const match of matches) {
    prices.push(match[1].trim());
  }
  
  console.log("Found prices:");
  console.log(prices.slice(0, 10));
}

testPrice();
