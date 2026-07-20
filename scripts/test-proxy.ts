/**
 * Quick proxy test — verifies that Playwright can route traffic through
 * the IPRoyal residential proxy and that we get a Croatian IP.
 * 
 * Usage: npx tsx scripts/test-proxy.ts
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = process.env.PROXY_PORT || "";
const PROXY_USER = process.env.PROXY_USER || "";
const PROXY_PASS = process.env.PROXY_PASS || "";

async function main() {
  if (!PROXY_HOST || !PROXY_PORT || !PROXY_USER || !PROXY_PASS) {
    console.error("❌ Missing PROXY_HOST/PORT/USER/PASS in .env.local");
    process.exit(1);
  }

  console.log(`🔌 Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`👤 User:  ${PROXY_USER}`);
  console.log("");

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require("playwright-extra");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  chromium.use(StealthPlugin());

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });

  // --- Test 1: Direct (no proxy) ---
  console.log("📡 Test 1: Direct connection (no proxy)...");
  const directCtx = await browser.newContext();
  const directPage = await directCtx.newPage();
  try {
    await directPage.goto("https://ipv4.icanhazip.com", { timeout: 15000 });
    const directIP = (await directPage.textContent("body"))?.trim();
    console.log(`   VPS/Local IP: ${directIP}`);
  } catch (err) {
    console.error("   Failed:", (err as Error).message);
  }
  await directCtx.close();

  // --- Test 2: Proxy ---
  console.log("\n🌐 Test 2: Proxy connection (IPRoyal residential)...");
  const proxyCtx = await browser.newContext({
    proxy: {
      server: `http://${PROXY_HOST}:${PROXY_PORT}`,
      username: PROXY_USER,
      password: PROXY_PASS,
    },
  });
  const proxyPage = await proxyCtx.newPage();
  try {
    await proxyPage.goto("https://ipv4.icanhazip.com", { timeout: 15000 });
    const proxyIP = (await proxyPage.textContent("body"))?.trim();
    console.log(`   Proxy IP:     ${proxyIP}`);
  } catch (err) {
    console.error("   Failed:", (err as Error).message);
  }
  await proxyCtx.close();

  // --- Test 3: Proxy + Njuškalo detail page ---
  console.log("\n🏠 Test 3: Proxy + Njuškalo detail page...");
  const njCtx = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    proxy: {
      server: `http://${PROXY_HOST}:${PROXY_PORT}`,
      username: PROXY_USER,
      password: PROXY_PASS,
    },
  });
  const njPage = await njCtx.newPage();

  // Block images/CSS/fonts to save bandwidth
  await njPage.route("**/*", (route: any) => {
    const type = route.request().resourceType();
    if (["image", "stylesheet", "font", "media"].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    await njPage.goto("https://www.njuskalo.hr/prodaja-stanova", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const title = await njPage.title();
    const blocked = title.includes("ShieldSquare") || title.includes("Captcha");
    console.log(`   Page title: ${title.substring(0, 60)}`);
    console.log(`   Blocked:    ${blocked ? "❌ YES" : "✅ NO"}`);
  } catch (err) {
    console.error("   Failed:", (err as Error).message);
  }
  await njCtx.close();

  await browser.close();
  console.log("\n✅ Proxy test complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
