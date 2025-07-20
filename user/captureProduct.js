import puppeteer from "puppeteer";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const COOKIE_PATH = "./meesho-cookies.json";
const OUTPUT_PATH = "./pending-orders.json";

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // ✅ Load cookies
  const cookies = JSON.parse(await fs.readFile(COOKIE_PATH, "utf-8"));
  await page.setCookie(...cookies);
  console.log("🍪 Cookies loaded.");

  // 🌐 Navigate to Meesho Pending Orders
  await page.goto("https://supplier.meesho.com/panel/v3/new/fulfillment/xrgs8/orders/pending", {
    waitUntil: "networkidle2",
  });

  // ⏳ Wait for the order table
  await page.waitForSelector("tbody.MuiTableBody-root");
  console.log("⏳ Waiting for order table...");

  const ordersMap = new Map();
  let previousHeight = 0;
  const MAX_ATTEMPTS = 40;

let previousRowCount = 0;

for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  // ⬇️ Extract all visible rows
  const newOrders = await page.$$eval("tbody.MuiTableBody-root tr.MuiTableRow-root", (rows) => {
    return rows.map((row) => {
      const cells = row.querySelectorAll("td");
      const getText = (i, sel = null) => {
        if (!cells[i]) return null;
        return sel ? cells[i].querySelector(sel)?.innerText.trim() : cells[i].innerText.trim();
      };
      return {
        orderId: getText(1, "p.css-h01pe0")?.replace("Order ID: ", "").trim(),
        productDetails: getText(1, "p.css-af4iif"),
        subOrderId: getText(2),
        skuId: getText(3),
        meeshoId: getText(4),
        quantity: getText(5),
        size: getText(6),
        dispatchDate: getText(7, "p.css-1bdm8tg"),
      };
    });
  });

  // Add unique orders to the map
  let newCount = 0;
  for (const order of newOrders) {
    if (order.orderId && !ordersMap.has(order.orderId)) {
      ordersMap.set(order.orderId, order);
      newCount++;
    }
  }

  console.log(`📦 Captured ${newCount} new orders (total: ${ordersMap.size})`);

  // Scroll the table container
  await page.evaluate(() => {
    const container = document.querySelector(".MuiTableContainer-root");
    if (container) container.scrollTop = container.scrollHeight;
  });

  await new Promise((resolve) => setTimeout(resolve, 2000));

  const currentRowCount = ordersMap.size;

  if (currentRowCount === previousRowCount) {
    console.log("🛑 No more new rows detected.");
    break;
  }

  previousRowCount = currentRowCount;
}


  const finalOrders = Array.from(ordersMap.values());
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(finalOrders, null, 2));
  console.log(`✅ Scraped total ${finalOrders.length} orders.`);
  console.log(`📄 Saved to ${OUTPUT_PATH}`);

  await browser.close();
})();
