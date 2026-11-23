/**
 * 生成 src/generated/testCount.ts：把 vitest list 的真实测试条数写进应用，
 * 首页数据卡直接引用，避免手写数字随测试演进过期。
 * npm 的 predev / prebuild 会自动执行；失败（数出 0 条）就退出码 1，拒绝生成假数字。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = join(root, 'src', 'generated');
const outFile = join(outDir, 'testCount.ts');

// 直接 node 起 vitest 入口，绕开 Windows 下 spawn npx.cmd 需要 shell 的问题
const vitestBin = join(root, 'node_modules', 'vitest', 'vitest.mjs');
const stdout = execFileSync(process.execPath, [vitestBin, 'list'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
});

const count = stdout.split('\n').filter((line) => line.includes(' > ')).length;
if (count === 0) {
  console.error('testcount: vitest list 没数出任何测试，拒绝生成');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outFile,
  `// 由 scripts/testcount.mjs 生成（npm predev/prebuild 自动执行），勿手改。\nexport const TEST_COUNT = ${count};\n`,
);
console.log(`testcount: ${count} 条测试 → src/generated/testCount.ts`);
