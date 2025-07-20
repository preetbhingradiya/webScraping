import puppeteer from "puppeteer"

(async () => {
    const searchTerm = process.argv.slice(2).join(" ");
  if (!searchTerm) {
    console.error("❌ Please provide a search query as command line argument.");
    process.exit(1);
  }
  
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  console.log("🌐 Navigating to YouTube...");
  await page.goto("https://www.youtube.com", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  // console.log("📸 Taking screenshot of homepage...");
  // await page.screenshot({ path: "youtube-home-debug.png", fullPage: true });

  // Accept cookie consent if shown
  // try {
  //   const consentButton = await page.waitForSelector(
  //     'button[aria-label="Accept all"]',
  //     { timeout: 5000 }
  //   );
  //   if (consentButton) {
  //     console.log("📝 Accepting cookie consent...");
  //     await consentButton.click();
  //     await page.waitForTimeout(3000);
  //   }
  // } catch {
  //   console.log("ℹ️ No consent popup detected, continuing...");
  // }

  // Try multiple selectors for search input
  const searchSelectors = [
    "input#search", // most common
    'input[placeholder="Search"]', // localized or fallback
    'input[name="search_query"]', // older or alternative version
  ];

  let searchInputFound = false;

  for (const selector of searchSelectors) {
    try {
      console.log(`🔍 Trying selector: ${selector}`);
      await page.waitForSelector(selector, { timeout: 5000 });
      console.log(`✅ Found search input using: ${selector}`);
      await page.type(selector, searchTerm);
      await page.keyboard.press("Enter");
      searchInputFound = true;
      break;
    } catch (e) {
      console.log(`❌ Selector failed: ${selector}`);
    }
  }

  if (!searchInputFound) {
    console.error(
      "🚫 Failed to locate search input. Taking diagnostic screenshot..."
    );
    await page.screenshot({ path: "search-input-error.png", fullPage: true });
    await browser.close();
    return;
  }

  console.log("⏳ Waiting for results...");
  await page.waitForSelector("ytd-video-renderer", { timeout: 15000 });

  // Wait for thumbnails to load
  const videoCards = await page.$$("ytd-video-renderer");
  const firstFive = videoCards.slice(0, 5);

  // Scroll each video into view and wait for thumbnails
  console.log("🖼 Scrolling and loading thumbnails...");
  const boundingBoxes = [];

  for (const video of firstFive) {
    await video.evaluate((el) =>
      el.scrollIntoView({ behavior: "instant", block: "center" })
    );
    await new Promise(resolve => setTimeout(resolve, 500)); // give time to load

    const img = await video.$("img");
    if (img) {
      await page.waitForFunction(
        (el) => el.complete && el.naturalHeight > 0,
        {},
        img
      );
    }

    const box = await video.boundingBox();
    if (box) boundingBoxes.push(box);
  }

  if (boundingBoxes.length < 5) {
    console.warn("⚠️ Some bounding boxes were null — skipping screenshot.");
  } else {
    // Calculate bounding box that wraps all 5
    const top = Math.min(...boundingBoxes.map((b) => b.y));
    const bottom = Math.max(...boundingBoxes.map((b) => b.y + b.height));
    const left = Math.min(...boundingBoxes.map((b) => b.x));
    const right = Math.max(...boundingBoxes.map((b) => b.x + b.width));

    const clip = {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };

    console.log("📸 Taking screenshot of visible first 5 videos...");
    await page.screenshot({ path: "youtube-top-5.png", clip });
  }

  // Scrape video titles and links
  const videos = await page.$$eval("ytd-video-renderer", (nodes) =>
    nodes.slice(0, 5).map((node) => {
      const title = node.querySelector("#video-title")?.textContent.trim();
      const href = node.querySelector("#video-title")?.getAttribute("href");
      return {
        title,
        link: href ? `https://www.youtube.com${href}` : null,
      };
    })
  );

  console.log("\n🎥 Top 5 videos:");
  videos.forEach((v, i) => {
    console.log(`${i + 1}. ${v.title}`);
    console.log(`   ${v.link}`);
  });

  console.log("\n✅ Done. Screenshots and video list saved.");
  await browser.close();
})();
