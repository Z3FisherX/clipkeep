import { packager } from '@electron/packager';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLicenses } from './release/collect-licenses.mjs';
await collectLicenses();
const result = await packager({ dir: '.', out: process.env.CLIPKEEP_PACKAGE_OUT || 'release', name: '拾片',
  icon: 'assets/brand/Clipkeep-v2.icns',
  download: { cacheRoot: join(tmpdir(), 'clipkeep-electron-cache') },
  appBundleId: 'local.clipkeep.mac', platform: 'darwin', arch: 'arm64',
  asar: true, overwrite: true, prune: true, extraResource: ['vendor/yt-dlp', 'dist/third-party'],
  // Local development signature only: no certificate/keychain access or notarization.
  osxSign: { identity: '-', identityValidation: false, preAutoEntitlements: false,
    preEmbedProvisioningProfile: false, strictVerify: true,
    // Keep the verified upstream executable byte-for-byte intact.
    ignore: [/\/Contents\/Resources\/yt-dlp$/],
    // Ad-hoc code has no Team ID; hardened library validation rejects Electron's framework.
    // Keep this local-only build on Electron's default runtime policy; no system setting changes.
    optionsForFile: () => ({ hardenedRuntime: false, timestamp: 'none',
      entitlements: 'assets/entitlements.plist' }),
  },
  // Only runtime files go to friends; exclude local reports, paths and development scripts.
  ignore: [/^\/(?!(dist|dist-electron|node_modules)(\/|$)|package\.json$).+/],
  // Keep Electron's actual minimum macOS version instead of overriding it.
  extendInfo: { NSHumanReadableCopyright: 'Personal local utility' },
});
console.log(result.join('\n'));
