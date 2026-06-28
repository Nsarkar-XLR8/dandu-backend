const { existsSync, readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const requiredRoute = "sync/linnworks/historical-sales";
const compiledController = join(
  __dirname,
  '..',
  'dist',
  'modules',
  'sku-dashboard',
  'adapters',
  'inbound',
  'rest',
  'sku-dashboard.controller.js',
);

function compiledRouteExists() {
  if (!existsSync(compiledController)) {
    return false;
  }

  return readFileSync(compiledController, 'utf8').includes(requiredRoute);
}

if (compiledRouteExists()) {
  process.exit(0);
}

console.warn(
  `Production build is missing ${requiredRoute}; rebuilding dist before startup.`,
);

const result = spawnSync('npm', ['run', 'build'], {
  cwd: join(__dirname, '..'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0 || !compiledRouteExists()) {
  console.error(
    [
      `Production build still does not include ${requiredRoute}.`,
      'Set Render Build Command to: npm install && npm run build',
      'Then redeploy the backend from the branch that contains the historical sales commits.',
    ].join('\n'),
  );
  process.exit(result.status || 1);
}
