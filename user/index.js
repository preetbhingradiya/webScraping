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

async function scrapePendingOrders(email, password) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
  );

  await loadCookiesIfAvailable(page);
  await page.goto(PENDING_ORDER_URL, { waitUntil: "networkidle2" });

  // Login if needed
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

    const scrollSelector = ".MuiTableContainer-root";
    const orderSelector = "tbody.MuiTableBody-root tr.MuiTableRow-root";
    const ordersMap = new Map();

    // Check scroll container exists
    const scrollContainerExists = await page.$(scrollSelector);
    if (!scrollContainerExists) {
      throw new Error(`Scroll container "${scrollSelector}" not found`);
    }

    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    // Initial wait to ensure full load before scrolling
    await new Promise((r) => setTimeout(r, 2000));
    while (scrollAttempts < maxScrollAttempts) {
      scrollAttempts++;

      // Extract all visible rows top-to-bottom and add new unique orders to the map
      const newOrders = await page.$$eval(
        "tbody.MuiTableBody-root tr.MuiTableRow-root",
        (rows) => {
          return rows.map((row) => {
            const cells = row.querySelectorAll("td");
            const getCellText = (i, sel = null) => {
              if (!cells[i]) return null;
              if (sel) {
                const el = cells[i].querySelector(sel);
                return el ? el.innerText.trim() : null;
              }
              return cells[i].innerText.trim();
            };

            return {
              orderId: getCellText(1, "p.css-h01pe0")
                ?.replace("Order ID: ", "")
                .trim(),
              productDetails: getCellText(1, "p.css-af4iif"),
              subOrderId: getCellText(2),
              skuId: getCellText(3),
              meeshoId: getCellText(4),
              quantity: getCellText(5),
              size: getCellText(6),
              dispatchDate: getCellText(7, "p.css-1bdm8tg"),
            };
          });
        }
      );

      // Save only new orders to your map
      let newCount = 0;
      for (const order of newOrders) {
        if (order.orderId && !ordersMap.has(order.orderId)) {
          ordersMap.set(order.orderId, order);
          newCount++;
        }
      }

      console.log(
        `📦 Captured ${newCount} new orders (total: ${ordersMap.size})`
      );

      // Scroll container vertically by 800px
      const scrolled = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return false;

        const beforeScrollTop = el.scrollTop;
        el.scrollBy(0, 800);
        return el.scrollTop !== beforeScrollTop; // true if scrolled, false if at bottom
      }, scrollSelector);

      if (!scrolled) {
        console.log("🛑 No more scroll possible. Stopping.");
        break;
      }

      // Wait for rows to load after scrolling
      await new Promise((r) => setTimeout(r, 2500));
    }

    // Save data to JSON file
    const orders = Array.from(ordersMap.values()).map((order, index) => ({
      index: index + 1,
      ...order,
    }));

    const dataToWrite = JSON.stringify(orders, null, 2);
    const outputFile = path.join(__dirname, "pending-orders.json");
    await fs.writeFile(outputFile, dataToWrite);

    console.log(`✅ Scraped total ${orders.length} orders.`);
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
