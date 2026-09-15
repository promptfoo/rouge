const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
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
const { dirname, isAbsolute, join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const selectedRoot = process.env.JS_ROUGE_SOURCE_ROOT;
const repositoryRoot = selectedRoot ? resolve(selectedRoot) : resolve(__dirname, '..');
const allowLegacy = process.env.JS_ROUGE_ALLOW_LEGACY_PACKAGE === 'true';
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
  assert.ok(
    !allowLegacy || (process.argv[2] && selectedRoot && isAbsolute(selectedRoot)),
    'Legacy validation requires a supplied archive and explicit source root',
  );
  let tarball = process.argv[2];
  if (tarball === undefined) {
    run(process.execPath, [npmCli, 'pack', '--pack-destination', temporaryRoot], repositoryRoot);
    const tarballs = readdirSync(temporaryRoot).filter((file) => file.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'npm pack should create exactly one tarball');
    tarball = join(temporaryRoot, tarballs[0]);
  } else {
    tarball = resolve(tarball);
  }

  const archiveHash = () => createHash('sha256').update(readFileSync(tarball)).digest('hex');
  const beforeHash = archiveHash();
  const sourcePackage = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'));
  const archivePackage = JSON.parse(
    execFileSync('tar', ['-xOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
  );
  const contractFields = ['name', 'version', 'main', 'module', 'types', 'exports', 'files'];
  for (const field of contractFields) {
    assert.deepEqual(
      archivePackage[field],
      sourcePackage[field],
      `Archive ${field} differs from source`,
    );
  }
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.equal(archivePackage[field], undefined, `The package must not declare ${field}`);
  }
  const entry = sourcePackage.exports?.['.'];
  const legacy =
    allowLegacy && (sourcePackage.exports === undefined || typeof entry?.import === 'string');
  if (legacy) {
    assert.ok(
      ['3.0.0', '3.1.0', '3.1.5', '3.2.0', '3.2.1'].includes(sourcePackage.version),
      'The historical package version requires an explicit consumer contract',
    );
    assert.equal(sourcePackage.main, 'dist/rouge.js');
    assert.equal(sourcePackage.module, 'dist/rouge.mjs');
    assert.equal(sourcePackage.types, 'dist/rouge.d.ts');
    if (sourcePackage.exports !== undefined) {
      assert.deepEqual(sourcePackage.exports, {
        '.': { types: './dist/rouge.d.ts', import: './dist/rouge.mjs', require: './dist/rouge.js' },
      });
    }
  } else {
    assert.equal(
      typeof entry?.import,
      'object',
      'Modern packages require separate ESM declarations',
    );
    assert.equal(
      typeof entry?.require,
      'object',
      'Modern packages require separate CJS declarations',
    );
  }
  const esmModule =
    legacy && sourcePackage.exports === undefined
      ? JSON.stringify(
          pathToFileURL(join(consumerRoot, 'node_modules', 'js-rouge', sourcePackage.module)).href,
        )
      : "'js-rouge'";
  const requiredOptions = legacy && !sourcePackage.version.startsWith('3.2.');
  const legacyTypes = requiredOptions
    ? `const nScore: number = rouge.n('a b c d', 'a b c d', { n: 2 });
const sScore: number = rouge.s('a b c d', 'a b c d', {});
const lScore: number = rouge.l('a b c d', 'a b c d', {});
void nScore;
void sScore;
void lScore;
`
    : `const options: rouge.RougeNOptions = { n: 2, caseSensitive: false };
const score: number = rouge.n('a b', 'A B', options);
const sScore: number = rouge.s('a b', 'a b');
const lScore: number = rouge.l('a b', 'a b');
void score;
void sScore;
void lScore;
`;

  mkdirSync(consumerRoot);
  writeConsumerJson('package.json', { name: 'js-rouge-smoke', private: true, type: 'module' });
  const runtimeAssertions = requiredOptions
    ? `assert.equal(n('a b c d', 'a b c d', { n: 2 }), 1);
assert.equal(l('a b c d', 'a b c d', {}), 1);
assert.equal(s('a b c d', 'a b c d', {}), 1);
`
    : `assert.equal(n('a b', 'a b', { n: 2 }), 1);
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
import { l, n, s } from ${esmModule};
import * as rouge from ${esmModule};
assert.equal(Object.hasOwn(rouge, 'default'), false);
${runtimeAssertions}`,
  );
  writeConsumerFile(
    'types.ts',
    legacy
      ? `import * as rouge from 'js-rouge';\n${legacyTypes}`
      : `import { n, type RougeNOptions } from 'js-rouge';
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
    legacy
      ? `import rouge = require('js-rouge');\n${legacyTypes}`
      : `import rouge = require('js-rouge');
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

  if (!legacy) {
    const productionRoot = join(temporaryRoot, 'production');
    mkdirSync(join(productionRoot, 'scripts'), { recursive: true });
    for (const file of ['package.json', 'package-lock.json', 'scripts/prepare.js']) {
      copyFileSync(join(repositoryRoot, file), join(productionRoot, file));
    }
    run(process.execPath, [npmCli, 'ci', '--omit=dev', '--no-audit', '--no-fund'], productionRoot);
  }

  const declarationMaps = readdirSync(join(installedRoot, 'dist')).filter((file) =>
    file.endsWith('.d.ts.map'),
  );
  assert.ok(declarationMaps.length > 0, 'The package should contain declaration maps');
  const includesSources =
    !legacy || sourcePackage.files === undefined || sourcePackage.files.includes('src');
  for (const declarationMap of declarationMaps) {
    const mapPath = join(installedRoot, 'dist', declarationMap);
    const map = JSON.parse(readFileSync(mapPath, 'utf8'));
    for (const source of includesSources ? map.sources : []) {
      const sourcePath = resolve(dirname(mapPath), map.sourceRoot ?? '', source);
      assert.ok(existsSync(sourcePath), `${declarationMap} should resolve ${source}`);
      assert.ok(readFileSync(sourcePath, 'utf8').length > 0, `${source} should not be empty`);
    }
  }
  assert.equal(archiveHash(), beforeHash, 'The validated archive must remain unchanged');
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
