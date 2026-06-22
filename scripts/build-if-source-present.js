const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { join } = require('node:path');

const projectRoot = join(__dirname, '..');
const hasSource = existsSync(join(projectRoot, 'src', 'main.ts'));
const hasTsConfig = existsSync(join(projectRoot, 'tsconfig.build.json'));

if (!hasSource || !hasTsConfig) {
  console.log('Skipping postinstall build because source files are not present.');
  process.exit(0);
}

const result = spawnSync('npm', ['run', 'build'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status || 0);
