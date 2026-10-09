import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

const baseUrl = process.env.BIDDING_WAR_BASE_URL ?? 'http://127.0.0.1:5102';
const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://auction:auction@localhost:55432/auction_part_2';
const holdOpenMilliseconds = Number(process.env.BIDDING_WAR_HOLD_OPEN_MS ?? 0);

const players = [
  { label: 'SELLER · AVERY', userId: 1, color: '#405cf5', x: 0, y: 0 },
  { label: 'BIDDER · MAYA', userId: 2, color: '#d946ef', x: 748, y: 0 },
  { label: 'BIDDER · THEO', userId: 3, color: '#f97316', x: 0, y: 384 },
  { label: 'BIDDER · PRIYA', userId: 4, color: '#10b981', x: 748, y: 384 },
] as const;

async function launchWindow(player: (typeof players)[number], profileRoot: string) {
  const context = await chromium.launchPersistentContext(
    path.join(profileRoot, String(player.userId)),
    {
      channel: 'msedge',
      headless: false,
      viewport: null,
      args: [
        `--window-position=${player.x},${player.y}`,
        '--window-size=750,400',
        '--no-first-run',
      ],
    },
  );
  const page = context.pages()[0] ?? (await context.newPage());
  return { context, page };
}

async function decorate(page: Page, label: string, color: string) {
  await page.addStyleTag({
    content: `
      header, .breadcrumbs, .item-gallery, .seller-card, .item-details-grid, footer { display: none !important; }
      body { background: #080b16 !important; }
      .item-page { max-width: none !important; padding: 74px 24px 20px !important; }
      .item-layout { display: block !important; }
      .item-summary { max-width: none !important; }
      .item-summary h1 { margin: 4px 0 2px !important; font-size: 27px !important; color: #f8fafc !important; }
      .item-kicker, .product-category { margin: 2px 0 8px !important; color: #94a3b8 !important; }
      .auction-panel, .bid-history-section { margin-top: 10px !important; padding: 14px !important; }
      .bid-history-section { max-height: 190px; overflow: auto; }
      .bid-history-list article { padding: 7px 0 !important; }
      #war-banner { position: fixed; z-index: 99999; inset: 0 0 auto 0; height: 58px;
        display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
        background: ${color}; color: white; font: 900 18px/1.1 system-ui; letter-spacing: .08em;
        box-shadow: 0 4px 24px #0008; }
      #war-log { font-size: 12px; letter-spacing: 0; font-weight: 700; text-align: right; }
    `,
  });
  await page.evaluate(
    ({ role }) => {
      const banner = document.createElement('div');
      banner.id = 'war-banner';
      banner.innerHTML = `<span>${role}</span><span id="war-log">ENTERING THE ARENA…</span>`;
      document.body.appendChild(banner);
    },
    { role: label },
  );
}

async function announce(pages: Page[], message: string) {
  await Promise.all(
    pages.map((page) =>
      page.evaluate((text) => {
        const log = document.querySelector('#war-log');
        if (log) log.textContent = text;
      }, message),
    ),
  );
}

async function submitBid(page: Page, dollars: string) {
  const form = page.locator('.bid-form');
  await form.locator('input').fill(dollars);
  await form.locator('button').click();
  await expect(form.locator('.bid-message')).toBeVisible();
  return (await form.locator('.bid-message').textContent()) ?? '';
}

async function collideBids(database: pg.Client, bids: Array<{ page: Page; dollars: string }>) {
  await database.query('BEGIN');
  await database.query('LOCK TABLE bids IN SHARE MODE');
  const pendingBids = bids.map(({ page, dollars }) => submitBid(page, dollars));
  await bids[0].page.waitForTimeout(750);
  await database.query('COMMIT');
  return Promise.all(pendingBids);
}

test('Bidding War: simultaneous and deadline-crossing bids stay visible in four windows', async () => {
  test.setTimeout(holdOpenMilliseconds > 0 ? holdOpenMilliseconds + 90_000 : 90_000);
  const profileRoot = await mkdtemp(path.join(tmpdir(), 'auction-bidding-war-'));
  const windows: Array<{ context: BrowserContext; page: Page }> = [];
  const database = new pg.Client({ connectionString: databaseUrl });

  try {
    for (const player of players) windows.push(await launchWindow(player, profileRoot));
    const pages = windows.map(({ page }) => page);
    const [seller, maya, theo, priya] = pages;

    await seller.goto(`${baseUrl}/auctions/new`);
    await seller.locator('#active-user').selectOption('1');
    await seller.getByLabel('Title').fill(`Bidding War GPU ${Date.now()}`);
    await seller
      .getByLabel('Description')
      .fill('A chaos-tested accelerator sold during a twenty-second bidding war.');
    await seller.getByLabel('Starting price').fill('100.00');
    await seller.getByLabel('Item location').fill('The Arena, CA');
    const validClosingTime = new Date(Date.now() + 180_000);
    const localClosingTime = new Date(
      validClosingTime.getTime() - validClosingTime.getTimezoneOffset() * 60_000,
    )
      .toISOString()
      .slice(0, 16);
    await seller.getByLabel('Closing time').fill(localClosingTime);
    await seller.getByRole('button', { name: 'Post auction' }).click();
    await expect(seller).toHaveURL(/\/items\//);
    const slug = decodeURIComponent(new URL(seller.url()).pathname.split('/').pop() ?? '');

    for (const [index, page] of pages.entries()) {
      if (index > 0) await page.goto(`${baseUrl}/items/${slug}`);
      await page.locator('#active-user').selectOption(String(players[index].userId));
    }

    await database.connect();
    await database.query(
      `UPDATE auctions SET ends_at = clock_timestamp() + interval '20 seconds' WHERE slug = $1`,
      [slug],
    );
    await Promise.all(pages.map((page) => page.reload()));
    await Promise.all(
      pages.map((page, index) => decorate(page, players[index].label, players[index].color)),
    );

    await announce(pages, 'ROUND 1 · THREE IDENTICAL $100 BIDS');
    const openingResults = await collideBids(database, [
      { page: maya, dollars: '100.00' },
      { page: theo, dollars: '100.00' },
      { page: priya, dollars: '100.00' },
    ]);
    expect(openingResults.every((result) => result.includes('accepted'))).toBe(true);

    await seller.waitForTimeout(2_500);
    await announce(pages, 'ROUND 2 · $101 / $101 / $105 COLLISION');
    await collideBids(database, [
      { page: maya, dollars: '101.00' },
      { page: theo, dollars: '101.00' },
      { page: priya, dollars: '105.00' },
    ]);

    await seller.waitForTimeout(2_500);
    await announce(pages, 'FINAL SPRINT · $106 / $110 / $108');
    await collideBids(database, [
      { page: maya, dollars: '106.00' },
      { page: theo, dollars: '110.00' },
      { page: priya, dollars: '108.00' },
    ]);

    await expect(seller.locator('.ending strong')).toHaveText('Ended', { timeout: 20_000 });
    await announce(pages, 'TIME! ALL THREE TRY ONE LAST $200 BID…');
    const afterDeadline = await Promise.all(
      [maya, theo, priya].map((page, index) =>
        page.evaluate(
          async ({ auctionSlug, userId }) => {
            const response = await fetch(`/api/auctions/${auctionSlug}/bids`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ userId, amountCents: 20_000 }),
            });
            return response.status;
          },
          { auctionSlug: slug, userId: players[index + 1].userId },
        ),
      ),
    );
    expect(afterDeadline).toEqual([409, 409, 409]);
    await announce(pages, 'BUG REPRODUCED · DUPLICATE BIDS ACCEPTED · LATE BIDS REJECTED');

    const detail = await seller.evaluate(async (auctionSlug) => {
      const response = await fetch(`/api/auctions/${auctionSlug}`);
      return response.json();
    }, slug);
    expect(
      detail.bidHistory.filter((bid: { amountCents: number }) => bid.amountCents === 10_000),
    ).toHaveLength(3);

    for (const page of pages) await page.bringToFront();
    if (holdOpenMilliseconds > 0) await seller.waitForTimeout(holdOpenMilliseconds);
  } finally {
    await database.end().catch(() => undefined);
    if (holdOpenMilliseconds === 0) {
      await Promise.all(windows.map(({ context }) => context.close()));
    }
  }
});
