// claim.js
// Simple auto-claim runner using puppeteer.
// It will try a list of sites and attempt to submit your LTC address.
// Keep in mind sites may change layout, so this script uses heuristic selectors.

// Requirements: node, puppeteer
const puppeteer = require('puppeteer');

const WALLET = process.env.LTC_ADDRESS;
if (!WALLET) {
  console.error("ERROR: LTC_ADDRESS env var not set. Add it as a GitHub Secret.");
  process.exit(1);
}

// List of faucet sites to try (you can edit/extend)
const SITES = [
  { name: "FaucetRun", url: "https://faucet.run/" },
  { name: "AutoClaim.in", url: "https://autoclaim.in/" },
  { name: "LiteFaucet", url: "https://litefaucet.net/" },
  { name: "FaucetCrypto", url: "https://faucetcrypto.com/" }
];

// Helpers to click button by visible text
async function clickByText(page, tag, text) {
  const elements = await page.$$(tag);
  for (const el of elements) {
    try {
      const v = await page.evaluate(el => el.innerText || el.value || '', el);
      if (v && v.toLowerCase().includes(text.toLowerCase())) {
        await el.click().catch(()=>{});
        return true;
      }
    } catch(e){}
  }
  return false;
}

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  for (const site of SITES) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    console.log(`\n--- Trying ${site.name} — ${site.url}`);
    try {
      await page.goto(site.url, { waitUntil: 'domcontentloaded' });

      // Heuristic: find input whose placeholder or name contains 'wallet' or 'address'
      const inputHandle = await page.evaluateHandle(() => {
        const els = Array.from(document.querySelectorAll('input,textarea'));
        for (const e of els) {
          const p = (e.getAttribute('placeholder')||'').toLowerCase();
          const n = (e.getAttribute('name')||'').toLowerCase();
          const id = (e.id||'').toLowerCase();
          const label = (e.closest('label')?.innerText||'').toLowerCase();
          if (p.includes('wallet') || p.includes('address') || n.includes('wallet') || n.includes('address') || id.includes('wallet') || id.includes('address') || label.includes('wallet') || label.includes('address')) {
            return e;
          }
        }
        // fallback: first input with long text type
        for (const e of els) {
          if ((e.type || '').toLowerCase() === 'text' && (e.maxLength === 0 || e.maxLength > 20 || e.value.length === 0)) return e;
        }
        return null;
      });

      const inputElem = inputHandle.asElement();
      if (inputElem) {
        await inputElem.focus();
        await page.evaluate((el,val)=>{ el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); }, inputElem, WALLET);
        console.log("-> Wallet pasted into input.");
      } else {
        console.log("-> No obvious wallet input found (will try click-based flows).");
      }

      // Try clicking common buttons: Claim, Start, Submit, Roll
      const clicked =
        await clickByText(page, 'button', 'claim') ||
        await clickByText(page, 'button', 'start') ||
        await clickByText(page, 'button', 'submit') ||
        await clickByText(page, 'a', 'claim') ||
        await clickByText(page, 'a', 'start');

      if (clicked) {
        console.log("-> Clicked a likely claim button. Waiting for response...");
        await page.waitForTimeout(7000);
      } else {
        console.log("-> No claim button auto-clicked; trying to submit forms programmatically.");
        // try to submit first form
        await page.evaluate(() => {
          const f = document.querySelector('form');
          if (f) f.submit();
        }).catch(()=>{});
        await page.waitForTimeout(5000);
      }

      // Optionally capture some page text to verify success
      const content = await page.evaluate(()=>document.body.innerText.slice(0,2000));
      console.log("Page snippet:", content.replace(/\s+/g,' ').slice(0,500));

      // close page
      await page.close();
    } catch (err) {
      console.log(`-> Error while processing ${site.name}:`, err.message);
      try { await page.close(); } catch(e){}
    }
  }

  await browser.close();
  console.log("\nAuto-claim run finished.");
  process.exit(0);
})();
