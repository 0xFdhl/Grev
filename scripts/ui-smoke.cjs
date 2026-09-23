// Local UI verification with mocked API responses; never writes to Supabase.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const output = process.env.UI_SCREENSHOTS || path.join(require('node:os').tmpdir(), 'reviu-ui');
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1440, 768, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 960 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const links = [
        { id: 'one', code: 'SVFXXCCY', business_name: 'Kopi Senja', is_active: true, clicks: 128, target_url: 'https://example.com/review' },
        { id: 'two', code: 'RV0002', business_name: '', is_active: false, clicks: 0, target_url: null },
        { id: 'three', code: 'RV0003', business_name: 'Studio Cerita & Ruang Kreatif Jakarta Selatan', is_active: false, clicks: 42, target_url: 'https://example.com/review' },
      ];
      let failDelete = true;
      let deleteRequests = 0;
      await page.route('**/api/links**', async (route) => {
        const url = new URL(route.request().url());
        let body = links.filter((link) => !link.deleted_at);
        if (url.searchParams.has('nextfor')) body = { next: 4 };
        else if (url.searchParams.has('trash')) body = links.filter((link) => link.deleted_at);
        else if (route.request().method() === 'DELETE') {
          deleteRequests++;
          if (failDelete) {
            failDelete = false;
            return route.fulfill({ status: 503, json: { error: 'Simulasi hapus gagal' } });
          }
          links.find((link) => url.pathname.endsWith(link.id)).deleted_at = new Date().toISOString();
          body = { success: true };
        }
        else if (route.request().method() === 'PUT') {
          const data = route.request().postDataJSON();
          const link = links.find((link) => url.pathname.endsWith(link.id));
          if (data.restore) link.deleted_at = null;
          else Object.assign(link, data);
          body = link;
        }
        await route.fulfill({ json: body });
      });
      await page.route('https://maps.googleapis.com/**', (route) => route.abort());
      await page.goto('http://localhost:3100/admin');
      await page.getByText('Kopi Senja', { exact: true }).first().waitFor();
      const typography = await page.evaluate(async () => {
        await document.fonts.ready;
        const family = getComputedStyle(document.body).fontFamily;
        const faces = await document.fonts.load(`400 16px ${family.split(',')[0]}`);
        return { family, loaded: faces.some((face) => face.status === 'loaded'), inputSize: getComputedStyle(document.querySelector('.input')).fontSize };
      });
      assert.match(typography.family, /creato/i);
      assert.equal(typography.loaded, true, `Creato font failed to load at ${width}px`);
      assert.equal(typography.inputSize, '16px');
      async function noOverflow() {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      }
      await noOverflow();
      await page.screenshot({ path: path.join(output, `dashboard-${width}.png`), fullPage: true });
      const search = page.getByRole('textbox', { name: 'Cari bisnis atau kode QR' });
      await search.fill('no-match');
      await page.getByText('Belum ada hasil yang cocok.').waitFor();
      await page.getByRole('button', { name: 'Reset pencarian' }).click();
      await page.getByRole('button', { name: 'Lihat QR', exact: true }).first().click();
      await page.getByRole('dialog').getByRole('img').waitFor();
      assert.equal(await page.getByRole('link', { name: 'Tes QR' }).getAttribute('href'), 'https://bebetterdevelo.my.id/SVFXXCCY');
      await page.getByRole('button', { name: 'Mode presentasi' }).click();
      await page.screenshot({ path: path.join(output, `presentation-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      await page.getByLabel('Opsi untuk RV0002').click();
      await page.getByRole('button', { name: 'Aktivasi', exact: true }).first().click();
      await page.getByPlaceholder('Nama bisnis', { exact: true }).fill('Bisnis baru');
      await page.getByPlaceholder('https://...', { exact: true }).fill('https://example.com/new');
      await noOverflow();
      await page.getByRole('button', { name: 'Simpan', exact: true }).click();
      await page.getByText('Kode berhasil diaktivasi.').waitFor();
      // Deletion failures retain the visible row. Successful deletion is already
      // persisted before showing Undo and remains deleted across an immediate reload.
      await page.getByLabel('Opsi untuk RV0002').click();
      const businessRow = page.locator('tr').filter({ has: page.locator('code', { hasText: 'RV0002' }) });
      await businessRow.getByRole('button', { name: 'Ke Sampah' }).click();
      await page.getByText('Simulasi hapus gagal', { exact: true }).waitFor();
      assert.equal(await businessRow.count(), 1);
      const deleteStarted = Date.now();
      await businessRow.getByRole('button', { name: 'Ke Sampah' }).click();
      await page.getByRole('button', { name: 'Urungkan' }).waitFor({ timeout: 5000 });
      assert.ok(Date.now() - deleteStarted < 6000);
      assert.equal(deleteRequests, 2);
      assert.ok(links[1].deleted_at);
      await page.reload();
      await page.getByText('Kopi Senja', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('Bisnis baru', { exact: true }).count(), 0);
      await page.getByRole('button', { name: 'Sampah', exact: true }).click();
      await page.getByRole('button', { name: 'Pulihkan' }).click();
      await page.getByText('Sampah kosong.').waitFor();
      await page.getByRole('button', { name: /Daftar QR/ }).click();
      await page.getByText('Bisnis baru', { exact: true }).waitFor();
      await page.getByLabel('Opsi untuk RV0002').click();
      await businessRow.getByRole('button', { name: 'Ke Sampah' }).click();
      await page.getByRole('button', { name: 'Urungkan' }).click();
      await page.getByText('Bisnis baru', { exact: true }).waitFor();
      assert.equal(links[1].deleted_at, null);
      assert.equal(links[1].target_url, 'https://example.com/new');
      assert.equal(links[1].is_active, true);
      await page.getByRole('button', { name: '+ Tambah QR', exact: true }).click();
      await page.getByRole('button', { name: 'Buat stok kode', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Jumlah kode' }).fill('25');
      await noOverflow();
      await page.screenshot({ path: path.join(output, `create-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Tutup form' }).click();
      await page.getByRole('button', { name: 'Sampah', exact: true }).click();
      await page.getByText('Sampah kosong.').waitFor();
      await page.goto('http://localhost:3100/login');
      await page.getByLabel('Password admin', { exact: true }).waitFor();
      await noOverflow();
      await page.screenshot({ path: path.join(output, `login-${width}.png`), fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: layout, production QR link, activation, delete failure, delete/reload/restore, Undo, stock form, login`);
      await page.close();
    }
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
