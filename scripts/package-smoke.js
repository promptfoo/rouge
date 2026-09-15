const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join, resolve } = require('node:path');

const repositoryRoot = resolve(__dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'js-rouge-package-'));
const consumerRoot = join(temporaryRoot, 'consumer');
const npmCli = process.env.npm_execpath;

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function writeConsumerFile(file, contents) {
  writeFileSync(join(consumerRoot, file), contents);
}

function writeConsumerJson(file, value) {
  writeConsumerFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

try {
  assert.ok(npmCli, 'Run the package smoke test through npm');
  rmSync(join(repositoryRoot, 'dist'), { force: true, recursive: true });
  run(process.execPath, [npmCli, 'pack', '--pack-destination', temporaryRoot], repositoryRoot);

  const tarballs = readdirSync(temporaryRoot).filter((file) => file.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, 'npm pack should create exactly one tarball');
  const tarball = join(temporaryRoot, tarballs[0]);

  mkdirSync(consumerRoot);
  writeConsumerJson('package.json', { name: 'js-rouge-smoke', private: true, type: 'module' });
  const runtimeAssertions = `assert.equal(n('a b', 'a b', { n: 2 }), 1);
assert.equal(l('a b', 'a b'), 1);
assert.equal(s('a b', 'a b'), 1);
`;
  writeConsumerFile(
    'commonjs.cjs',
    `const assert = require('node:assert/strict');
const rouge = require('js-rouge');
const { l, n, s } = rouge;
assert.equal(Object.hasOwn(rouge, 'default'), false);
${runtimeAssertions}`,
  );
  writeConsumerFile(
    'module.mjs',
    `import assert from 'node:assert/strict';
import { l, n, s } from 'js-rouge';
import * as rouge from 'js-rouge';
assert.equal(Object.hasOwn(rouge, 'default'), false);
${runtimeAssertions}`,
  );
  writeConsumerFile(
    'types.ts',
    `import { n, type RougeNOptions } from 'js-rouge';
// @ts-expect-error The ESM entry point does not export a default.
import missingDefault from 'js-rouge';
const options: RougeNOptions = { n: 2, caseSensitive: false };
const score: number = n('a b', 'A B', options);
void score;
void missingDefault;
`,
  );
  writeConsumerFile(
    'types.cts',
    `import rouge = require('js-rouge');
const options: rouge.RougeNOptions = { n: 2, caseSensitive: false };
const score: number = rouge.n('a b', 'A B', options);
const tokens: string[] = rouge.treeBankTokenize('A sentence.');
// @ts-expect-error Scores are numbers, not strings.
const invalid: string = rouge.l('a b', 'a b');
void score;
void tokens;
void invalid;
`,
  );
  writeConsumerJson('tsconfig.json', {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      strict: true,
      target: 'ES2022',
    },
    include: ['types.ts', 'types.cts'],
  });

  run(
    process.execPath,
    [
      npmCli,
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarball,
    ],
    consumerRoot,
  );
  run(process.execPath, ['commonjs.cjs'], consumerRoot);
  run(process.execPath, ['module.mjs'], consumerRoot);
  run(
    process.execPath,
    [join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', consumerRoot],
    repositoryRoot,
  );

  const installedRoot = join(consumerRoot, 'node_modules', 'js-rouge');
  const installedPackage = JSON.parse(readFileSync(join(installedRoot, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(installedPackage[field], undefined, `The package must not declare ${field}`);
  }

  const productionRoot = join(temporaryRoot, 'production');
  mkdirSync(join(productionRoot, 'scripts'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'scripts/prepare.js']) {
    copyFileSync(join(repositoryRoot, file), join(productionRoot, file));
  }
  run(process.execPath, [npmCli, 'ci', '--omit=dev', '--no-audit', '--no-fund'], productionRoot);

  const declarationMaps = readdirSync(join(installedRoot, 'dist')).filter((file) =>
    file.endsWith('.d.ts.map'),
  );
  assert.ok(declarationMaps.length > 0, 'The package should contain declaration maps');
  for (const declarationMap of declarationMaps) {
    const mapPath = join(installedRoot, 'dist', declarationMap);
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    for (const source of map.sources) {
      const sourcePath = resolve(dirname(mapPath), map.sourceRoot ?? '', source);
      assert.ok(existsSync(sourcePath), `${declarationMap} should resolve ${source}`);
      assert.ok(readFileSync(sourcePath, 'utf8').length > 0, `${source} should not be empty`);
    }
  }
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
