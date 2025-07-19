import puppeteer from "puppeteer";
import fs from "fs";

//Fine the title of the page
// (async () => {
//   const browser = await puppeteer.launch({ headless: false, slowMo: 100 });
//   const page = await browser.newPage();

//   await page.goto('https://www.youtube.com/');
//   await page.setViewport({ width: 1080, height: 1024 });

//   console.log('Typing search query...');
//   await page.type('input[aria-label="Search"]', 'automate beyond recorder');

//   console.log('Pressing Enter and waiting for navigation...');
//   await Promise.all([
//     page.keyboard.press('Enter'),
//     page.waitForNavigation({ waitUntil: 'networkidle2' })
//   ]);

//   console.log('Waiting for search result link...');
//   const link = await page.waitForSelector('.devsite-result-item-link', { timeout: 10000 });

//   if (link) {
//     console.log('Scrolling into view...');
//     await link.evaluate(el => el.scrollIntoView());
//     // await page.waitForTimeout(500); // Optional: let layout settle

//     console.log('Clicking link via JS...');
//     await page.evaluate(el => el.click(), link);
//   } else {
//     console.error('❌ No link found.');
//     await browser.close();
//     return;
//   }

//   await page.waitForSelector('h1');
//   const fullTitle = await page.$eval('h1', el => el.textContent.trim().replace(/\s+/g, ' '));

//   console.log('✅ The title of this blog post is "%s".', fullTitle);

//   await browser.close();
// })();

//go youtube search for puppeteer tutorial and give some video link with screenshot

// (async () => {
//   const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
//   const page = await browser.newPage();

//   console.log('Navigating to YouTube...');
//   await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });

//   // Optional: Screenshot YouTube home to check if it loaded
//   await page.screenshot({ path: 'youtube-home-debug.png' });

//   console.log('Waiting for search bar...');
//   await page.waitForSelector('input#search', { timeout: 15000 });

//   console.log('Typing search query...');
//   await page.type('input#search', 'puppeteer tutorial');
//   await page.keyboard.press('Enter');

//   console.log('Waiting for search results...');
//   await page.waitForSelector('ytd-video-renderer', { timeout: 15000 });

//   console.log('Taking screenshot of search results...');
//   await page.screenshot({ path: 'youtube-search-results.png', fullPage: true });

//   console.log('Extracting top 5 video links...');
//   const videos = await page.$$eval('ytd-video-renderer', nodes => {
//     return nodes.slice(0, 5).map(node => {
//       const title = node.querySelector('#video-title')?.textContent.trim();
//       const href = node.querySelector('#video-title')?.getAttribute('href');
//       const link = href ? `https://www.youtube.com${href}` : null;
//       return { title, link };
//     });
//   });

//   // Print and save results
//   console.log('\n🎥 Top 5 Videos:');
//   videos.forEach((video, index) => {
//     console.log(`${index + 1}. ${video.title}`);
//     console.log(`   ${video.link}`);
//   });

//   fs.writeFileSync('youtube-results.json', JSON.stringify(videos, null, 2));
//   console.log('\n✅ Results saved to youtube-results.json and screenshot saved as youtube-search-results.png');

//   await browser.close();
// })();

(async () => {
  const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
  const page = await browser.newPage();

  console.log("🌐 Navigating to YouTube...");
  await page.goto("https://www.youtube.com", {
    waitUntil: "networkidle2",
    timeout: 60000,
  });

  console.log("📸 Taking screenshot of homepage...");
  await page.screenshot({ path: "youtube-home-debug.png", fullPage: true });

  // Accept cookie consent if shown
  try {
    const consentButton = await page.waitForSelector(
      'button[aria-label="Accept all"]',
      { timeout: 5000 }
    );
    if (consentButton) {
      console.log("📝 Accepting cookie consent...");
      await consentButton.click();
      await page.waitForTimeout(3000);
    }
  } catch {
    console.log("ℹ️ No consent popup detected, continuing...");
  }

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
      await page.type(selector, "puppeteer tutorial");
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

  // // Wait for results to appear
  // console.log('⏳ Waiting for results...');
  // await page.waitForSelector('ytd-video-renderer', { timeout: 15000 });

  // console.log('📸 Taking screenshot of search results...');
  // await page.screenshot({ path: 'youtube-search-results.png', fullPage: true });

  // Wait for search results
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
