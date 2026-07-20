/**
 * Quick proxy test — verifies IPRoyal sticky sessions + Njuškalo access.
 *
 * Usage: npx tsx scripts/test-proxy.ts
 *
 * IPRoyal sticky format (critical):
 *   password_country-XX_session-XXXXXXXX_lifetime-30m
 *   session ID MUST be exactly 8 alphanumeric chars
 */
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const PROXY_HOST = process.env.PROXY_HOST || "";
const PROXY_PORT = process.env.PROXY_PORT || "";
const PROXY_USER = process.env.PROXY_USER || "";
const PROXY_PASS = process.env.PROXY_PASS || "";

function stripStickyTags(pass: string): string {
  return pass
    .replace(/_session-[a-zA-Z0-9]+/g, "")
    .replace(/_lifetime-[0-9]+[smhd]/gi, "");
}

function makeSessionId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function stickyPass(sessionId: string): string {
  return `${stripStickyTags(PROXY_PASS)}_session-${sessionId}_lifetime-30m`;
}

async function main() {
  if (!PROXY_HOST || !PROXY_PORT || !PROXY_USER || !PROXY_PASS) {
    console.error("❌ Missing PROXY_HOST/PORT/USER/PASS in .env.local");
    process.exit(1);
  }

  const sessionId = makeSessionId();
  const password = stickyPass(sessionId);

  console.log(`🔌 Proxy: ${PROXY_HOST}:${PROXY_PORT}`);
  console.log(`👤 User:  ${PROXY_USER.slice(0, 4)}…`);
  console.log(`🔑 Sticky session: ${sessionId}`);
  console.log(`🏳️  Country tag in pass: ${/_country-/.test(PROXY_PASS) ? "yes" : "NO — add _country-hr"}`);
  console.log("");

  // Quick billing check via raw HTTP CONNECT-style request
  console.log("💳 Billing check (raw proxy request)...");
  await new Promise<void>((resolve) => {
    const http = require("http");
    const auth =
      "Basic " + Buffer.from(`${PROXY_USER}:${PROXY_PASS}`).toString("base64");
    const req = http.request(
      {
        host: PROXY_HOST,
        port: Number(PROXY_PORT),
        method: "GET",
        path: "http://ipv4.icanhazip.com/",
        headers: { Host: "ipv4.icanhazip.com", "Proxy-Authorization": auth },
      },
      (res: any) => {
        let body = "";
        res.on("data", (c: Buffer) => (body += c));
        res.on("end", () => {
          if (res.statusCode === 402) {
            console.log(
              "   ❌ HTTP 402 Payment Required — top up IPRoyal balance, then re-run.",
            );
          } else {
            console.log(`   status=${res.statusCode} body=${body.trim().slice(0, 40)}`);
          }
          resolve();
        });
      },
    );
    req.on("error", (e: Error) => {
      console.log("   error:", e.message);
      resolve();
    });
    req.setTimeout(15000, () => {
      console.log("   timeout");
      req.destroy();
      resolve();
    });
    req.end();
  });
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
    console.log(`   Native IP: ${directIP}`);
  } catch (err) {
    console.error("   Failed:", (err as Error).message);
  }
  await directCtx.close();

  // --- Test 2: Sticky session — same IP twice ---
  console.log("\n🌐 Test 2: Sticky session (same IP on 2 requests)...");
  const proxyOpts = {
    server: `http://${PROXY_HOST}:${PROXY_PORT}`,
    username: PROXY_USER,
    password,
  };
  const stickyCtx = await browser.newContext({ proxy: proxyOpts });
  const stickyPage = await stickyCtx.newPage();
  let ip1 = "";
  let ip2 = "";
  try {
    await stickyPage.goto("https://ipv4.icanhazip.com", { timeout: 20000 });
    ip1 = ((await stickyPage.textContent("body")) || "").trim();
    console.log(`   Request 1 IP: ${ip1}`);

    await stickyPage.goto("https://ipv4.icanhazip.com", { timeout: 20000 });
    ip2 = ((await stickyPage.textContent("body")) || "").trim();
    console.log(`   Request 2 IP: ${ip2}`);
    console.log(
      ip1 && ip1 === ip2
        ? "   ✅ Sticky session working (same IP)"
        : "   ❌ Sticky BROKEN (IPs differ — session format wrong?)",
    );
  } catch (err) {
    console.error("   Failed:", (err as Error).message);
  }
  await stickyCtx.close();

  // --- Test 3: Shared context cookies + Njuškalo search ---
  console.log("\n🏠 Test 3: Shared context → Njuškalo search page...");
  const njCtx = await browser.newContext({
    locale: "hr-HR",
    timezoneId: "Europe/Zagreb",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    proxy: proxyOpts,
  });
  const searchPage = await njCtx.newPage();
  const detailPage = await njCtx.newPage();
  await detailPage.route("**/*", (route: any) => {
    const type = route.request().resourceType();
    if (["image", "stylesheet", "font", "media"].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    await searchPage.goto("https://www.njuskalo.hr/prodaja-stanova?sort=new", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const title = await searchPage.title();
    const blocked = title.includes("ShieldSquare") || title.includes("Captcha");
    console.log(`   Page title: ${title.substring(0, 60)}`);
    console.log(`   Blocked:    ${blocked ? "❌ YES" : "✅ NO"}`);

    if (!blocked) {
      try {
        await searchPage.waitForSelector('article[class*="entity-body"]', {
          timeout: 20000,
        });
        const count = await searchPage.locator('article[class*="entity-body"]').count();
        console.log(`   Listings:   ✅ ${count} cards rendered`);
      } catch {
        console.log("   Listings:   ⚠️  cards did not render in time");
      }
    }
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
