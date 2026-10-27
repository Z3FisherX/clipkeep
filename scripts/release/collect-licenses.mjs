import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';

export async function collectLicenses() {
  const directory = 'dist/third-party';
  await mkdir(`${directory}/vendor`, { recursive: true });
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(name, `${directory}/${name}`);
  for (const name of ['react', 'react-dom', 'scheduler', 'zod']) await copyFile(`node_modules/${name}/LICENSE`, `${directory}/${name}-LICENSE.txt`);
  await copyFile('node_modules/vite/LICENSE.md', `${directory}/vite-LICENSE.md`);
  const components = {};
  for (const name of ['react', 'react-dom', 'scheduler', 'zod', 'vite', 'electron']) {
    const { version, license } = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    components[name] = { version, license };
  }
  await writeFile(`${directory}/COMPONENTS.json`, `${JSON.stringify(components, null, 2)}\n`);
  await cp('vendor/licenses', `${directory}/vendor/licenses`, { recursive: true });
  await copyFile('vendor/yt-dlp.json', `${directory}/vendor/yt-dlp.json`);
}
