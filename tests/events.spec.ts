import { test, expect, type Page } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

/** Returns an ISO-8601 datetime string (YYYY-MM-DDTHH:MM) offset from now. */
function futureISO(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString().slice(0, 16)
}

/**
 * Clicks "add-event-btn", fills the form, submits, then waits for the event
 * count on the given page to increase by 1 before returning.
 */
async function addEvent(page: Page, title: string, datetime: string): Promise<void> {
  const countBefore = await page.getByTestId('event-item').count()
  await page.getByTestId('add-event-btn').click()
  await page.getByTestId('event-title-input').fill(title)
  await page.getByTestId('event-datetime-input').fill(datetime)
  await page.getByTestId('add-event-submit').click()
  await expect(page.getByTestId('event-item')).toHaveCount(countBefore + 1)
}

/**
 * Before each test: open a dedicated context, delete every event via the UI,
 * then close the context so it leaves no extra WebSocket connections.
 */
test.beforeEach(async ({ browser }) => {
  const ctx = await browser.newContext()
  const pg = await ctx.newPage()
  await pg.goto(BASE)
  let count = await pg.getByTestId('event-item').count()
  while (count > 0) {
    await pg.getByTestId('delete-event-btn').first().click()
    count--
    await expect(pg.getByTestId('event-item')).toHaveCount(count)
  }
  await ctx.close()
})

// ---------------------------------------------------------------------------
// TC-01: Empty state on first load
// ---------------------------------------------------------------------------
test('TC-01: empty-state is visible and event list is empty when no events exist', async ({ page }) => {
  await page.goto(BASE)
  await expect(page.getByTestId('empty-state')).toBeVisible()
  await expect(page.getByTestId('event-list').getByTestId('event-item')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// TC-02: Add a single event
// ---------------------------------------------------------------------------
test('TC-02: adding an event makes it appear in the list and hides empty-state', async ({ page }) => {
  await page.goto(BASE)
  await addEvent(page, 'Product Launch', futureISO(3_600_000))

  const items = page.getByTestId('event-item')
  await expect(items).toHaveCount(1)
  await expect(items.first().getByTestId('event-title')).toContainText('Product Launch')
  await expect(page.getByTestId('empty-state')).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// TC-03: Delete an event
// ---------------------------------------------------------------------------
test('TC-03: deleting the only event removes it from the list and shows empty-state', async ({ page }) => {
  await page.goto(BASE)
  await addEvent(page, 'Team Standup', futureISO(3_600_000))

  await expect(page.getByTestId('event-item')).toHaveCount(1)
  await page.getByTestId('delete-event-btn').first().click()
  await expect(page.getByTestId('event-item')).toHaveCount(0)
  await expect(page.getByTestId('empty-state')).toBeVisible()
})

// ---------------------------------------------------------------------------
// TC-04: Events are sorted by date/time ascending
// ---------------------------------------------------------------------------
test('TC-04: event list is always ordered soonest-first regardless of insertion order', async ({ page }) => {
  await page.goto(BASE)

  const T_far  = futureISO(30 * 24 * 3_600_000) // 30 days from now
  const T_near = futureISO(         3_600_000)   //  1 hour from now
  const T_mid  = futureISO( 7 * 24 * 3_600_000) //  7 days from now

  await addEvent(page, 'Far Future',  T_far)
  await addEvent(page, 'Near Future', T_near)
  await addEvent(page, 'Mid Future',  T_mid)

  await expect(page.getByTestId('event-item')).toHaveCount(3)

  const titles = page.getByTestId('event-item').getByTestId('event-title')
  await expect(titles.nth(0)).toContainText('Near Future')
  await expect(titles.nth(1)).toContainText('Mid Future')
  await expect(titles.nth(2)).toContainText('Far Future')
})

// ---------------------------------------------------------------------------
// TC-05: Multi-client sync — additions propagate to all clients
// ---------------------------------------------------------------------------
test('TC-05: events added by one client appear on all other connected clients without a refresh', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const ctxC = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()
  const pageC = await ctxC.newPage()

  try {
    await Promise.all([pageA.goto(BASE), pageB.goto(BASE), pageC.goto(BASE)])

    const T1 = futureISO(1 * 3_600_000)
    const T2 = futureISO(2 * 3_600_000)
    const T3 = futureISO(3 * 3_600_000)
    const T4 = futureISO(4 * 3_600_000)
    const T5 = futureISO(5 * 3_600_000)
    const T6 = futureISO(6 * 3_600_000)

    // Tab A adds "Alpha" — verify B and C receive it automatically
    await addEvent(pageA, 'Alpha', T1)
    await expect(pageB.getByTestId('event-item')).toHaveCount(1, { timeout: 10_000 })
    await expect(pageC.getByTestId('event-item')).toHaveCount(1, { timeout: 10_000 })

    // Tab B adds "Beta" — A and C should sync
    await addEvent(pageB, 'Beta', T2)
    await expect(pageA.getByTestId('event-item')).toHaveCount(2, { timeout: 10_000 })
    await expect(pageC.getByTestId('event-item')).toHaveCount(2, { timeout: 10_000 })

    // Remaining additions across tabs
    await addEvent(pageB, 'Gamma',   T3)
    await addEvent(pageC, 'Delta',   T4)
    await addEvent(pageC, 'Epsilon', T5)
    await addEvent(pageA, 'Zeta',    T6)

    // All three tabs should show exactly 6 items
    await expect(pageA.getByTestId('event-item')).toHaveCount(6, { timeout: 10_000 })
    await expect(pageB.getByTestId('event-item')).toHaveCount(6, { timeout: 10_000 })
    await expect(pageC.getByTestId('event-item')).toHaveCount(6, { timeout: 10_000 })

    // All three tabs should display events in ascending datetime order
    const expectedOrder = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta']
    for (const pg of [pageA, pageB, pageC]) {
      const titles = pg.getByTestId('event-item').getByTestId('event-title')
      for (let i = 0; i < expectedOrder.length; i++) {
        await expect(titles.nth(i)).toContainText(expectedOrder[i])
      }
    }
  } finally {
    await ctxA.close()
    await ctxB.close()
    await ctxC.close()
  }
})

// ---------------------------------------------------------------------------
// TC-06: Multi-client sync — deletion propagates to all clients
// ---------------------------------------------------------------------------
test('TC-06: event deleted by one client disappears from all other connected clients', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  try {
    await Promise.all([pageA.goto(BASE), pageB.goto(BASE)])

    // Tab A creates the event
    await addEvent(pageA, 'Sync Delete Test', futureISO(3_600_000))
    // Tab B should receive it without refreshing
    await expect(pageB.getByTestId('event-item')).toHaveCount(1, { timeout: 10_000 })
    await expect(
      pageB.getByTestId('event-item').first().getByTestId('event-title'),
    ).toContainText('Sync Delete Test')

    // Tab B deletes the event
    await pageB.getByTestId('delete-event-btn').first().click()
    await expect(pageB.getByTestId('event-item')).toHaveCount(0)

    // Tab A should also lose the event without refreshing
    await expect(pageA.getByTestId('event-item')).toHaveCount(0, { timeout: 10_000 })
    await expect(pageA.getByTestId('empty-state')).toBeVisible({ timeout: 10_000 })
    await expect(pageB.getByTestId('empty-state')).toBeVisible()
  } finally {
    await ctxA.close()
    await ctxB.close()
  }
})

// ---------------------------------------------------------------------------
// TC-07: Connected client counter updates in real time
// ---------------------------------------------------------------------------
test('TC-07: client-counter reflects the current number of live WebSocket connections', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()

  try {
    await pageA.goto(BASE)
    await expect(pageA.getByTestId('client-counter')).toContainText('1', { timeout: 10_000 })

    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await pageB.goto(BASE)

    await expect(pageA.getByTestId('client-counter')).toContainText('2', { timeout: 10_000 })
    await expect(pageB.getByTestId('client-counter')).toContainText('2', { timeout: 10_000 })

    const ctxC = await browser.newContext()
    const pageC = await ctxC.newPage()
    await pageC.goto(BASE)

    await expect(pageA.getByTestId('client-counter')).toContainText('3', { timeout: 10_000 })
    await expect(pageB.getByTestId('client-counter')).toContainText('3', { timeout: 10_000 })
    await expect(pageC.getByTestId('client-counter')).toContainText('3', { timeout: 10_000 })

    // Close tab C — counter should decrement to 2 on remaining tabs
    await ctxC.close()
    await expect(pageA.getByTestId('client-counter')).toContainText('2', { timeout: 10_000 })
    await expect(pageB.getByTestId('client-counter')).toContainText('2', { timeout: 10_000 })

    await ctxB.close()
  } finally {
    await ctxA.close()
  }
})

// ---------------------------------------------------------------------------
// TC-08: Data persists across page reloads
// ---------------------------------------------------------------------------
test('TC-08: events survive a full page reload and remain correctly sorted', async ({ page }) => {
  await page.goto(BASE)

  const T1 = futureISO(2 * 3_600_000) // 2 hours from now (appears first)
  const T2 = futureISO(4 * 3_600_000) // 4 hours from now (appears second)

  await addEvent(page, 'Persisted Alpha', T1)
  await addEvent(page, 'Persisted Beta',  T2)
  await expect(page.getByTestId('event-item')).toHaveCount(2)

  // Hard reload
  await page.reload()

  await expect(page.getByTestId('event-item')).toHaveCount(2)

  const titles = page.getByTestId('event-item').getByTestId('event-title')
  await expect(titles.nth(0)).toContainText('Persisted Alpha')
  await expect(titles.nth(1)).toContainText('Persisted Beta')
})
