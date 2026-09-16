import { spawnSync } from 'node:child_process';

// Dedicated full-stack build; the static-only build remains usable without an API.
const result = spawnSync(process.execPath, ['node_modules/astro/astro.js', 'build'], {
  stdio: 'inherit', env: {...process.env, PUBLIC_API_BASE_URL: '/api/v1'},
});
if(result.status !== 0) process.exit(result.status ?? 1);
const search = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec','pagefind','--site','dist'], {
  stdio:'inherit', shell: process.platform === 'win32',
});
process.exit(search.status ?? 1);
