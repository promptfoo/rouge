/** Return LCS lengths for every prefix of b using linear auxiliary memory. */
function prefixLengths(
  a: readonly string[],
  aStart: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
): Uint32Array {
  const width = bEnd - bStart;
  let previous = new Uint32Array(width + 1);
  let current = new Uint32Array(width + 1);

  for (let i = aStart; i < aEnd; i++) {
    for (let j = 1; j <= width; j++) {
      current[j] =
        a[i] === b[bStart + j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    [previous, current] = [current, previous];
  }
  return previous;
}

/**
 * Find where the legacy backtracking path first reaches the middle row.
 * Origins are propagated with the same diagonal/up/left choices as the full
 * matrix, so duplicate-token tie choices remain observable-identical.
 */
function findSplit(
  a: readonly string[],
  aStart: number,
  aMiddle: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
): number {
  const width = bEnd - bStart;
  let previousLengths = prefixLengths(a, aStart, aMiddle, b, bStart, bEnd);
  let currentLengths: Uint32Array = new Uint32Array(width + 1);
  let previousOrigins = new Uint32Array(width + 1);
  let currentOrigins = new Uint32Array(width + 1);
  for (let j = 0; j <= width; j++) {
    previousOrigins[j] = j;
  }

  for (let i = aMiddle; i < aEnd; i++) {
    for (let j = 1; j <= width; j++) {
      if (a[i] === b[bStart + j - 1]) {
        currentLengths[j] = previousLengths[j - 1] + 1;
        currentOrigins[j] = previousOrigins[j - 1];
      } else if (previousLengths[j] > currentLengths[j - 1]) {
        currentLengths[j] = previousLengths[j];
        currentOrigins[j] = previousOrigins[j];
      } else {
        currentLengths[j] = currentLengths[j - 1];
        currentOrigins[j] = currentOrigins[j - 1];
      }
    }
    [previousLengths, currentLengths] = [currentLengths, previousLengths];
    [previousOrigins, currentOrigins] = [currentOrigins, previousOrigins];
  }
  return previousOrigins[width];
}

/**
 * Divide-and-conquer reconstruction with the same tie preference as the former
 * full-matrix backtracking and linear auxiliary memory.
 */
function collectLcsIndices(
  a: readonly string[],
  aStart: number,
  aEnd: number,
  b: readonly string[],
  bStart: number,
  bEnd: number,
  indices: number[],
): void {
  if (aStart === aEnd || bStart === bEnd) {
    return;
  }
  if (aEnd - aStart === 1) {
    for (let j = bEnd - 1; j >= bStart; j--) {
      if (a[aStart] === b[j]) {
        indices.push(j);
        return;
      }
    }
    return;
  }

  const aMiddle = aStart + Math.floor((aEnd - aStart) / 2);
  const bMiddle = bStart + findSplit(a, aStart, aMiddle, aEnd, b, bStart, bEnd);
  collectLcsIndices(a, aStart, aMiddle, b, bStart, bMiddle, indices);
  collectLcsIndices(a, aMiddle, aEnd, b, bMiddle, bEnd, indices);
}

/** Returns the positions in b matched by a longest common subsequence of a and b. */
export function lcsIndices(a: readonly string[], b: readonly string[]): number[] {
  const indices: number[] = [];
  collectLcsIndices(a, 0, a.length, b, 0, b.length, indices);
  return indices;
}
