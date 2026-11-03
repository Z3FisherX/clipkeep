import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const application = resolve(process.argv[2]);
const output = process.argv[3];
function check(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', shell: false });
  return { exitCode: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}
const checks = {
  signature: check('/usr/bin/codesign', ['--verify', '--deep', '--strict', application]),
  identity: check('/usr/bin/codesign', ['-dv', '--verbose=4', application]),
  stapledTicket: check('/usr/bin/xcrun', ['stapler', 'validate', application]),
  gatekeeper: check('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', application]),
};
const result = { at: new Date().toISOString(), application, checks,
  developerId: /Authority=Developer ID Application:/.test(checks.identity.output),
  notarized: checks.stapledTicket.exitCode === 0 && checks.gatekeeper.exitCode === 0 };
if (output) await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ signature: checks.signature.exitCode, developerId: result.developerId, notarized: result.notarized }));
if (checks.signature.exitCode || process.env.CLIPKEEP_RELEASE_MODE === 'developer-id' && (!result.developerId || !result.notarized)) process.exitCode = 1;
