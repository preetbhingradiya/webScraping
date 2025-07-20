import puppeteer from "puppeteer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const COOKIE_PATH = "./meesho-cookies.json";
const PENDING_ORDER_URL =
  "https://supplier.meesho.com/panel/v3/new/fulfillment/xrgs8/orders/pending";

async function loginAndSaveCookies(page, email, password) {
  console.log("🔐 Logging in...");
  await page.goto("https://supplier.meesho.com/panel/v3/new/root/login", {
    waitUntil: "networkidle2",
  });

  await page.waitForSelector('input[name="emailOrPhone"]');
  await page.type('input[name="emailOrPhone"]', email);
  await page.type('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2" });

  const cookies = await page.cookies();
  await fs.writeFile(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  console.log("✅ Login successful. Cookies saved.");
}

async function loadCookiesIfAvailable(page) {
  try {
    const cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
    await page.setCookie(...cookies);
    console.log("🍪 Cookies loaded.");
  } catch (err) {
    console.log("⚠️ No cookies found. Will log in fresh.");
  }
}

async function scrollTableToLoadAllRows(page) {
  const maxRetries = 10;
  let previousRowCount = 0;

  for (let i = 0; i < maxRetries; i++) {
    const rows = await page.$$(
      "tbody.MuiTableBody-root tr.MuiTableRow-root"
    );
    const currentRowCount = rows.length;

    console.log(`📊 Current rows: ${currentRowCount}`);

    if (currentRowCount === previousRowCount) {
      console.log("✅ All rows loaded.");
      break;
    }

    previousRowCount = currentRowCount;

    await page.evaluate(() => {
      const container = document.querySelector(".MuiTableContainer-root");
      container?.scrollBy({ top: 500, behavior: "smooth" });
    });

    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function scrapePendingOrders(email, password) {
  const browser = await puppeteer.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  await loadCookiesIfAvailable(page);
  await page.goto(PENDING_ORDER_URL, { waitUntil: "networkidle2" });

  if (page.url().includes("login")) {
    await loginAndSaveCookies(page, email, password);
    await page.goto(PENDING_ORDER_URL, { waitUntil: "networkidle2" });
  }

  console.log("🌐 Navigated to Pending Orders page.");

  try {
    await page.waitForSelector("tbody.MuiTableBody-root tr.MuiTableRow-root", {
      timeout: 20000,
    });

    console.log("⏳ Scrolling to load all rows...");
    await scrollTableToLoadAllRows(page);

    const orders = await page.$$eval(
      "tbody.MuiTableBody-root tr.MuiTableRow-root",
      (rows) => {
        let index = 1;
        return rows.map((row) => {
          const cells = row.querySelectorAll("td");
          return {
            index: index++,
            productDetails: cells[1]?.innerText.trim() || null,
            subOrderId: cells[2]?.innerText.trim() || null,
            skuId: cells[3]?.innerText.trim() || null,
            meeshoId: cells[4]?.innerText.trim() || null,
            quantity: cells[5]?.innerText.trim() || null,
            size: cells[6]?.innerText.trim() || null,
            DispatchDate: cells[7]?.innerHTML.trim() || null,
            debugInfo: Array.from(cells).map((td) => td.innerText.trim()),
          };
        });
      }
    );

    const outputFile = path.join("pending-orders.json");
    await fs.writeFile(outputFile, JSON.stringify(orders, null, 2));

    console.log(`✅ Scraped ${orders.length} pending orders.`);
    console.log(`📄 Saved to ${outputFile}`);
  } catch (err) {
    console.error("❌ Error during scraping:", err);
    await page.screenshot({ path: "error_screenshot.png", fullPage: true });
  } finally {
    await browser.close();
  }
}

const email = process.env.USER_EMAIL;
const password = process.env.USER_PASSWORD;

if (!email || !password) {
  console.error("❌ Please set USER_EMAIL and USER_PASSWORD in your .env file.");
  process.exit(1);
}

scrapePendingOrders(email, password);
