import { run } from '../electron/process';
import { resolve } from 'node:path';
const text = await run(resolve('vendor/yt-dlp'), ['--ignore-config', '--no-cache-dir', '--no-playlist', '--dump-single-json', '--skip-download', '--', 'https://player.vimeo.com/video/76979871']);
const data = JSON.parse(text) as {formats: {format_id: string; protocol?: string; has_drm?: boolean; height?: number; vcodec?: string; acodec?: string}[]};
console.log(JSON.stringify(data.formats.map(({format_id, protocol, has_drm, height, vcodec, acodec}) => ({format_id, protocol, has_drm, height, vcodec, acodec})), null, 2));
