import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(__dirname);

const listTypeScriptFiles = (dir: string): string[] => {
  const entries = readdirSync(dir);

  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) return listTypeScriptFiles(path);
    if (!path.endsWith('.ts') || path.endsWith('.spec.ts')) return [];

    return [path];
  });
};

const forbiddenCorePatterns = [
  /from ['"]@nestjs\//,
  /from ['"]express['"]/,
  /from ['"]@prisma\/client['"]/,
  /from ['"]jsonwebtoken['"]/,
  /from ['"]bcryptjs['"]/,
  /from ['"]ioredis['"]/,
  /from ['"]bullmq['"]/,
  /from ['"]class-validator['"]/,
  /from ['"]class-transformer['"]/,
  /from ['"].*\/dto(?:\/|['"])/,
  /from ['"].*\/infrastructure(?:\/|['"])/,
  /from ['"].*common\/services(?:\/|['"])/,
  /from ['"].*common\/config(?:\/|['"])/,
  /from ['"].*auth\/config(?:\/|['"])/,
  /@Injectable\(/,
  /@Inject\(/,
  /process\.env/,
];

describe('architecture boundaries', () => {
  it('keeps auth/job domain and application layers framework agnostic', () => {
    const files = [
      ...listTypeScriptFiles(join(root, 'auth/application')),
      ...listTypeScriptFiles(join(root, 'auth/domain')),
      ...listTypeScriptFiles(join(root, 'job/application')),
      ...listTypeScriptFiles(join(root, 'job/domain')),
      ...listTypeScriptFiles(join(root, 'common/domain')),
    ];

    const violations = files.flatMap((file) => {
      const source = readFileSync(file, 'utf8');

      return forbiddenCorePatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(root, file)} violates ${pattern}`);
    });

    expect(violations).toEqual([]);
  });
});
