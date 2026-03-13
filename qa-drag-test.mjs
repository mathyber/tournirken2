import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  // Login first
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill('admin123');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2000);

  // Go to custom builder view mode
  await page.goto('http://localhost:5173/tournaments/195/custom-builder');
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForSelector('.react-flow__node', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const nodes = await page.locator('.react-flow__node').all();
  console.log('Node count:', nodes.length);

  for (const n of nodes) {
    const cls = await n.evaluate(el => el.className);
    const cursor = await n.evaluate(el => window.getComputedStyle(el).cursor);
    const isDraggable = cls.includes('draggable');
    console.log('cls:', cls.substring(0, 100), '| cursor:', cursor, '| draggableClass:', isDraggable);
  }

  // Try to drag the first node and check if position changes
  const firstNode = page.locator('.react-flow__node').first();
  const box = await firstNode.boundingBox();
  if (box) {
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    const initialTransform = await firstNode.evaluate(el => el.style.transform);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 100, startY + 100, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const finalTransform = await firstNode.evaluate(el => el.style.transform);
    const moved = initialTransform !== finalTransform;
    console.log('Initial transform:', initialTransform);
    console.log('Final transform:', finalTransform);
    console.log('Node moved after drag attempt:', moved);
    if (moved) {
      console.log('BUG: Node was moved despite nodesDraggable=false!');
    } else {
      console.log('OK: Node did not move — dragging is correctly blocked');
    }
  }

  await browser.close();
})();
