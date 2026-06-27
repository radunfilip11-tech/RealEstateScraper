async function checkCategories() {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7"
  };
  
  const urlsToTest = [
    "https://www.njuskalo.hr/vikendice",
    "https://www.njuskalo.hr/prodaja-vikendica",
    "https://www.njuskalo.hr/kuce-odmor",
    "https://www.njuskalo.hr/parkiralista-garaze",
    "https://www.njuskalo.hr/novogradnja"
  ];
  
  for (const url of urlsToTest) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow' });
      console.log(`[${res.status}] ${url} -> ${res.url}`);
    } catch(e) {
      console.log(`Error testing ${url}: ${e.message}`);
    }
  }
}

checkCategories();
