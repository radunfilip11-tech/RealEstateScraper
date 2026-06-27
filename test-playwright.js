const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

console.log(typeof StealthPlugin);
const stealth = StealthPlugin();
console.log('stealth created');
chromium.use(stealth);
console.log('stealth used');

(async () => {
  const browser = await chromium.launch({ headless: true });
  console.log('browser launched');
  await browser.close();
  console.log('done');
})();
