// import puppeteer from 'puppeteer-extra';
// import StealthPlugin from 'puppeteer-extra-plugin-stealth';
// import fs from 'fs/promises';

// puppeteer.use(StealthPlugin());

// function delay(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// async function scrapePendingOrders() {
//   console.log('🚀 Starting scraper...');

//   const browser = await puppeteer.launch({
//     headless: false, // headless: 'new' or false is better to bypass bot protection
//     defaultViewport: null,
//     args: [
//       '--no-sandbox',
//       '--disable-setuid-sandbox',
//     ],
//   });

//   const page = await browser.newPage();

//   try {
//     // Set user-agent like a real browser
//     await page.setUserAgent(
//       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
//       "(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
//     );

//     const cookies = JSON.parse(await fs.readFile('meesho-cookies.json', 'utf-8'));
//     await page.setCookie(...cookies);

//     console.log('🌐 Navigating to Pending Orders...');
//     await page.goto(
//       'https://supplier.meesho.com/panel/v3/new/fulfillment/xrgs8/orders/pending',
//       { waitUntil: 'domcontentloaded', timeout: 60000 }
//     );

//     console.log('⏳ Waiting for order table...');
//     await page.waitForSelector('tbody.MuiTableBody-root tr.MuiTableRow-root', { timeout: 30000 });
//     await delay(2000);

//     const data = await page.evaluate(() => {
//       const rows = document.querySelectorAll('tbody.MuiTableBody-root tr.MuiTableRow-root');
//       const products = [];

//       rows.forEach(row => {
//         const cells = row.querySelectorAll('td');
//         if (cells.length >= 7) {
//           const productName = cells[1]?.querySelector('p:first-of-type')?.innerText.trim() || '';
//           const subOrderId = cells[2]?.innerText.trim() || '';
//           const skuId = cells[3]?.innerText.trim() || '';
//           const meeshoId = cells[4]?.innerText.trim() || '';
//           const quantity = cells[5]?.innerText.trim() || '';
//           const size = cells[6]?.innerText.trim() || '';

//           products.push({ productName, subOrderId, skuId, meeshoId, quantity, size });
//         }
//       });

//       return products;
//     });

//     console.log(`✅ Scraped ${data.length} orders.`);
//     await fs.writeFile('pending-orders.json', JSON.stringify(data, null, 2));
//     console.log('📁 Data saved to pending-orders.json');

//   } catch (err) {
//     console.error("❌ Error:", err.message);
//     await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });
//     const html = await page.content();
//     await fs.writeFile('debug_page.html', html);
//   } finally {
//     await browser.close();
//     console.log("🔒 Browser closed.");
//   }
// }

// scrapePendingOrders();

import puppeteer from "puppeteer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path  from "path";
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

async function autoScrollUntilEnd(page, rowSelector) {
  await page.evaluate(async (rowSelector) => {
    const scrollContainer = document.querySelector(".MuiTableContainer-root");
    if (!scrollContainer) {
      console.error("❌ Scroll container not found!");
      return;
    }

    let previousHeight = 0;
    let sameCountLimit = 5;
    let retry = 0;

    while (retry < sameCountLimit) {
      scrollContainer.scrollBy(0, 300);
      await new Promise((r) => setTimeout(r, 1000));

      const currentHeight = scrollContainer.scrollHeight;

      // Detect no more new rows
      if (currentHeight === previousHeight) {
        retry++;
      } else {
        retry = 0;
        previousHeight = currentHeight;
      }
    }
  }, rowSelector);
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

  // Check if still on login page
  if (page.url().includes("login")) {
    await loginAndSaveCookies(page, email, password);
    await page.goto(PENDING_ORDER_URL, { waitUntil: "networkidle2" });
  }

  console.log("🌐 Navigated to Pending Orders page.");

  try {
    await page.waitForSelector("tbody.MuiTableBody-root tr.MuiTableRow-root", {
      timeout: 20000,
    });

    console.log("⏳ Waiting for order table...");
    await page.waitForSelector("tbody.MuiTableBody-root tr.MuiTableRow-root");

    // 👉 Scroll to load all orders
    // await autoScrollUntilEnd(page, "MuiTableBody-root css-1xnox0e");
    // await new Promise((resolve) => setTimeout(resolve, 2000));


    const orders = await page.$$eval(
      "tbody.MuiTableBody-root tr.MuiTableRow-root",
      (rows) => {
        let index = 1;
        return rows.map((row) => {
          const cells = row.querySelectorAll("td");
          console.log("INDEX ," + index, cells);

          return {
            index: index++,
            // subOrderId: cells[0]?.innerText.trim() || null,
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
  console.error(
    "❌ Please set USER_EMAIL and USER_PASSWORD in your .env file."
  );
  process.exit(1);
}

scrapePendingOrders(email, password);
