// Browser regression with fake Maps and API responses; no live service calls.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const requests = [];
      const rows = [];
      await page.route('**/api/links**', async route => {
        const req = route.request();
        const url = new URL(req.url());
        if (req.method() === 'POST') {
          const body = req.postDataJSON(); requests.push(body);
          if (requests.length === 1) {
            rows.push({ id: 'one', code: 'CAFE1234', business_name: body.business_name, place_id: body.place_id, target_url: body.target_url, is_active: true, clicks: 0 });
            return route.abort('failed'); // Simulate server commit followed by response loss.
          }
          return route.fulfill({ json: rows[0] });
        }
        return route.fulfill({ json: url.searchParams.has('nextfor') ? { next: 1 } : rows });
      });
      await page.route('https://maps.googleapis.com/**', route => route.fulfill({
        contentType: 'application/javascript', body: `
          window.google = { maps: { importLibrary: async () => ({}), event: { trigger() {} } } };
          customElements.define('gmp-place-autocomplete', class extends HTMLElement {
            connectedCallback() { this.textContent = 'Simulasi pencarian bisnis'; }
          });
        `,
      }));
      async function openForm() {
        await page.goto('http://localhost:3100/admin');
        await page.getByRole('button', { name: '+ Tambah QR', exact: true }).first().click();
        await page.locator('gmp-place-autocomplete').waitFor();
      }
      await openForm();
      await page.evaluate(() => {
        window.choose = (name, deferred) => {
          const event = new Event('gmp-select');
          event.placePrediction = { toPlace: () => ({ displayName: name, id: name,
            fetchFields: () => deferred ? new Promise(r => { window['finish' + name] = r; }) : Promise.resolve() }) };
          document.querySelector('gmp-place-autocomplete').dispatchEvent(event);
        };
        window.choose('BusinessA', true);
        window.choose('BusinessB', true);
        window.finishBusinessB();
      });
      await page.getByText('BusinessB', { exact: true }).waitFor();
      await page.evaluate(() => window.finishBusinessA());
      assert.equal(await page.getByText('BusinessA', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Simpan & buat QR', exact: true }).click();
      await page.getByText(/Failed to fetch|Failed to Fetch|Load failed|NetworkError/).waitFor();
      assert.equal(rows.length, 1);
      const firstId = requests[0].request_id;
      // Reload and select the same business: pending request identity survives.
      await openForm();
      await page.evaluate(() => {
        const event = new Event('gmp-select');
        event.placePrediction = { toPlace: () => ({ displayName: 'BusinessB', id: 'BusinessB', fetchFields: async () => {} }) };
        document.querySelector('gmp-place-autocomplete').dispatchEvent(event);
      });
      await page.getByRole('button', { name: 'Simpan & buat QR', exact: true }).click();
      await page.getByRole('link', { name: 'Download PNG', exact: true }).waitFor();
      assert.equal(requests.length, 2);
      assert.equal(requests[1].request_id, firstId);
      assert.equal(requests[1].place_id, 'BusinessB');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('reviu-pending-cafe')), null);
      const qr = page.getByRole('img', { name: 'QR code review BusinessB' });
      assert.equal(await qr.evaluate(img => img.naturalWidth), 960);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`PASS business ${width}px: late selection, save failure, reload/retry same request, QR 960px`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
