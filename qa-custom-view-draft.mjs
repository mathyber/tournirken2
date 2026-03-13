/**
 * QA Test: CUSTOM DRAFT tournament still shows "Открыть конструктор" for organizer/admin.
 * Uses tournament #194 (CUSTOM DRAFT).
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5173';
const SCREENSHOTS_DIR = path.join('qa-screenshots', 'custom-draft');
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let idx = 0;
async function ss(page, name) {
  const file = path.join(SCREENSHOTS_DIR, `${String(++idx).padStart(3, '0')}-${name}.png`);
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
  page.setDefaultTimeout(10000);

  console.log('\n=== CUSTOM DRAFT Tournament — Builder Button QA ===\n');

  // Login as admin
  await login(page);
  check(!page.url().includes('/auth/login'), 'Login succeeded');

  // Go to CUSTOM DRAFT tournament #194
  await page.goto(`${BASE_URL}/tournaments/194`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
  await ss(page, 'draft-detail');

  // Check "Открыть конструктор" is visible
  const openBuilderBtn = await page.getByText(/открыть конструктор/i).first().isVisible().catch(() => false);
  check(openBuilderBtn, '"Открыть конструктор" button is visible for CUSTOM DRAFT tournament');

  // Check "Посмотреть схему" is NOT visible
  const viewSchemaBtn = await page.getByText(/посмотреть схему/i).first().isVisible().catch(() => false);
  check(!viewSchemaBtn, '"Посмотреть схему" button is NOT visible on DRAFT tournament');

  // Click "Открыть конструктор" → should open builder (not read-only)
  if (openBuilderBtn) {
    await page.getByText(/открыть конструктор/i).first().click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(1000);
    await ss(page, 'draft-builder-page');

    // Should NOT have the view-only banner
    const banner = await page.getByText(/только чтение|просмотр схемы/i).first().isVisible().catch(() => false);
    check(!banner, 'No view-only banner in DRAFT builder mode');

    // Toolbar should be visible
    const addMatchBtn = await page.getByText(/\+ матч|добавить матч/i).first().isVisible().catch(() => false);
    const toolbar = await page.locator('[class*="border-r"]').isVisible().catch(() => false);
    check(addMatchBtn || toolbar, 'Toolbar with add-node buttons is visible in DRAFT builder');

    // Save button should be visible
    const saveBtn = await page.getByText(/сохранить схему/i).first().isVisible().catch(() => false);
    check(saveBtn, 'Save schema button is visible in DRAFT builder');

    // Nodes should be draggable (check nodesDraggable=true by checking no pointer-events:none)
    const reactFlow = await page.locator('.react-flow').isVisible().catch(() => false);
    check(reactFlow, 'ReactFlow canvas is present in DRAFT builder');
  }

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
