import puppeteer from "puppeteer";
import dotenv from "dotenv";
import fs from "fs/promises";

dotenv.config();

async function fetchMeeshoData(emailOrPhone, password) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Correct login page URL
  await page.goto("https://supplier.meesho.com/panel/v3/new/root/login", {
    waitUntil: "networkidle2",
  });

  // Wait for the correct input field
  await page.waitForSelector('input[name="emailOrPhone"]', { timeout: 15000 });

  // Fill in email or phone
  await page.type('input[name="emailOrPhone"]', emailOrPhone);

  // Wait and type password
  await page.waitForSelector('input[name="password"]', { timeout: 15000 });
  await page.type('input[name="password"]', password);

  // Click Login button (you might need to update the selector here if login fails)
  await page.waitForSelector('button[type="submit"]');
  await page.click('button[type="submit"]');

  // Wait for dashboard to load
  await page.waitForNavigation({ waitUntil: "networkidle2" });

  console.log("✅ Logged in successfully.");

  const cookies = await page.cookies();
  await fs.writeFile("meesho-cookies.json", JSON.stringify(cookies, null, 2));
  // Go to reports page
  // await page.goto("https://supplier.meesho.com/reports", {
  //   waitUntil: "networkidle2",
  // });

  // // Wait for a download button or data element
  // await page.waitForSelector(".download-report-button", { timeout: 15000 });

  // console.log("✅ Report page loaded. Ready to scrape or download.");

  await browser.close();
}

const meeshoUserEmail = process.env.USER_EMAIL;
const meeshoUserPassword = process.env.USER_PASSWORD;

console.log(meeshoUserEmail);
console.log(meeshoUserPassword);

fetchMeeshoData(meeshoUserEmail, meeshoUserPassword);
