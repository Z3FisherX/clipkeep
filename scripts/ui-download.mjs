export async function startDownload(page) {
  await page.getByRole('button', { name: '开始下载', exact: true }).click({ trial: true });
  const quality = page.getByLabel('清晰度', { exact: true });
  if (await quality.isEnabled() && await quality.inputValue() === '') {
    const value = await quality.locator('option').evaluateAll(options => options.find(option => option.value)?.value);
    if (value) await quality.selectOption(value);
  }
  const original = page.getByRole('checkbox', { name: /确认使用原始画质/ });
  if (await quality.isEnabled() && (await quality.locator('option:checked').innerText()).includes('原始画质')) await original.check();
  const before = await page.evaluate(async () => (await window.desktop.snapshot()).value.job?.id);
  await page.getByRole('button', { name: '开始下载', exact: true }).click();
  for (let attempt = 0; attempt < 100; attempt++) {
    const duplicate = page.getByRole('button', { name: '仍然添加', exact: true });
    if (await duplicate.isVisible()) {
      await duplicate.click();
      await page.getByRole('button', { name: '继续队列', exact: true }).click();
    }
    const job = await page.evaluate(async () => (await window.desktop.snapshot()).value.job);
    if (job && job.id !== before && ['running', 'done', 'failed', 'awaitingInput'].includes(job.status)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Download start did not produce a new task');
}
