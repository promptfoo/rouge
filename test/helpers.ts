import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { buildSync } from 'esbuild';

export const bracketPairs = [
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
  ['<', '>'],
] as const;

export const geographicAcronyms = ['U.S.', 'U.S.A.', 'E.U.'];

export const nonFiniteNumbers = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

export const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;

export const invalidNGramSizes = [...nonFiniteNumbers, -1, 0, 1.5, unsafeInteger];

export const invalidMaxSkips = [Number.NaN, Number.NEGATIVE_INFINITY, -1, 0.5, 1.5];

export const invalidBetas = [Number.NaN, Number.NEGATIVE_INFINITY, -1];

export function legacyLcsIndices(a: string[], b: string[]): number[] {
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      lengths[i][j] =
        a[i - 1] === b[j - 1]
          ? lengths[i - 1][j - 1] + 1
          : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
    }
  }

  const indices: number[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      indices.push(j - 1);
      i--;
      j--;
    } else if (lengths[i - 1][j] > lengths[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return indices.reverse();
}

export function expectBundledScriptToPass(
  script: string,
  timeout: number,
  nodeArgs: string[] = [],
): void {
  const bundled = buildSync({
    entryPoints: [join(__dirname, '../src/rouge.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    write: false,
  }).outputFiles[0].text;
  const child = spawnSync(process.execPath, nodeArgs, {
    input: `${bundled}\n${script}`,
    encoding: 'utf8',
    timeout,
  });
  if (child.error) {
    throw child.error;
  }
  if (child.status !== 0 || child.stderr !== '' || child.stdout !== 'ok') {
    throw new Error(
      `Bundled script failed: ${JSON.stringify({ status: child.status, stderr: child.stderr, stdout: child.stdout })}`,
    );
  }
}
