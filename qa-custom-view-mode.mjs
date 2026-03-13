/**
 * QA Test: Custom tournament view-only mode after launch
 * Verifies that tournament #195 (ACTIVE CUSTOM) shows read-only builder.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join('qa-screenshots', 'custom-view');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let screenshotIndex = 0;
async function ss(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(++screenshotIndex).padStart(3, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return path.resolve(file);
}

const results = [];
function check(passed, title, details = '') {
  results.push({ passed, title, details });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${title}${details ? ': ' + details : ''}`);
}

async function login(page) {
  await page.goto(`${BASE_URL}/`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('#login-username').fill('admin');
  await page.locator('#login-password').fill('admin123');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);

  console.log('\n=== Custom Tournament View-Only Mode QA ===\n');

  // 1. Login as admin
  await login(page);
  await ss(page, 'after-login');
  check(page.url().includes('/auth/login') === false, 'Login succeeded');

  // 2. Navigate to tournament #195 detail page
  await page.goto(`${BASE_URL}/tournaments/195`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await ss(page, 'tournament-detail');

  // Check that "Посмотреть схему" button appears (not the builder button for draft)
  const viewSchemaBtn = await page.getByText(/посмотреть схему/i).first().isVisible().catch(() => false);
  check(viewSchemaBtn, '"Посмотреть схему" button visible on detail page for ACTIVE CUSTOM tournament');

  // Check that the generic "bracket" button is NOT shown for CUSTOM format
  const bracketBtn = await page.getByText(/сетку/i).first().isVisible().catch(() => false);
  // "Посмотреть схему" might overlap with "сетку" text — use a more specific check
  const openBuilderBtn = await page.getByText(/открыть конструктор/i).first().isVisible().catch(() => false);
  check(!openBuilderBtn, '"Открыть конструктор" button hidden for ACTIVE tournament');

  // 3. Click the "View schema" button
  await page.getByText(/посмотреть схему/i).first().click().catch(async () => {
    // If the button isn't there, navigate directly
    await page.goto(`${BASE_URL}/tournaments/195/custom-builder`);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await ss(page, 'custom-builder-view-mode');

  // 4. Check view-only banner is present
  const banner = await page.getByText(/только чтение|просмотр схемы/i).first().isVisible().catch(() => false);
  check(banner, 'View-only banner is visible');

  // 5. Check that toolbar (add node buttons) is hidden
  const addMatchBtn = await page.getByText(/\+ матч/i).first().isVisible().catch(() => false);
  check(!addMatchBtn, 'Toolbar "Add Match" button is hidden in view mode');

  const addGroupBtn = await page.getByText(/\+ группа/i).first().isVisible().catch(() => false);
  check(!addGroupBtn, 'Toolbar "Add Group" button is hidden in view mode');

  // 6. Check that save/finalize buttons are hidden
  const saveBtn = await page.getByText(/сохранить схему/i).first().isVisible().catch(() => false);
  check(!saveBtn, 'Save schema button is hidden in view mode');

  const launchBtn = await page.getByText(/запустить турнир|запуск/i).first().isVisible().catch(() => false);
  check(!launchBtn, 'Launch button is hidden in view mode');

  // 7. Check that ReactFlow canvas is visible (nodes rendered)
  await page.waitForSelector('.react-flow', { timeout: 5000 }).catch(() => {});
  const reactFlowVisible = await page.locator('.react-flow').isVisible().catch(() => false);
  check(reactFlowVisible, 'ReactFlow canvas is visible');

  // 8. Check that nodes are rendered (schema loaded)
  await page.waitForSelector('.react-flow__node', { timeout: 6000 }).catch(() => {});
  const nodeCount = await page.locator('.react-flow__node').count().catch(() => 0);
  check(nodeCount > 0, `Schema nodes rendered (${nodeCount} nodes)`);

  await ss(page, 'final-view');

  // 9. Try navigating as a non-logged-in user (should also be able to view)
  const page2 = await browser.newPage();
  await page2.goto(`${BASE_URL}/tournaments/195/custom-builder`);
  await page2.waitForLoadState('networkidle').catch(() => {});
  await page2.waitForSelector('.react-flow, .flex.items-center.justify-center', { timeout: 5000 }).catch(() => {});

  const anonymousBanner = await page2.getByText(/только чтение|просмотр схемы/i).first().isVisible().catch(() => false);
  const anonymousCanvas = await page2.locator('.react-flow').isVisible().catch(() => false);
  check(anonymousBanner || anonymousCanvas, 'Anonymous user can view the schema in read-only mode');
  await page2.screenshot({ path: path.join(SCREENSHOTS_DIR, `${String(++screenshotIndex).padStart(3, '0')}-anonymous-view.png`) });
  await page2.close();

  // Summary
  console.log('\n=== Results ===');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log('Failed:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.title}`));
  }

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
})();
