import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';
const env = { ...process.env, CLIPKEEP_TEST_MODE: '1', CLIPKEEP_TEST_ROOT: resolve('evidence/runtime-ui') };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  page.on('pageerror', error => console.log('PAGE ERROR', error.message));
  page.on('console', message => console.log('CONSOLE', message.type(), message.text()));
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: '拾片Clipkeep' }).waitFor();
  console.log(await page.locator('body').innerText());
  await page.screenshot({ path: 'evidence/initial-ui.png', fullPage: true });
} finally { await app.close(); }
