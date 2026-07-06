// Pure-TypeScript statistical helpers.
// Data sizes here are small (< 200 days), so naive loop-based log-factorial
// is fast enough without any approximation.

function logFactorial(n: number): number {
  let sum = 0
  for (let i = 2; i <= n; i++) sum += Math.log(i)
  return sum
}

function logC(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k)
}

// One-tailed (upper) Fisher's exact test for a 2x2 table:
//
//          outcome+  outcome-
// input+     a         b
// input-     c         d
//
// Returns P(X >= a) under independence with fixed marginals.
export function fisherExactPValue(a: number, b: number, c: number, d: number): number {
  const N = a + b + c + d
  const K = a + c  // column 1 total (outcome+)
  const n = a + b  // row 1 total (input+)

  if (N === 0 || K === 0 || n === 0) return 1

  const kMax = Math.min(K, n)
  const logDenom = logC(N, n)

  let p = 0
  for (let k = a; k <= kMax; k++) {
    const logProb = logC(K, k) + logC(N - K, n - k) - logDenom
    p += Math.exp(logProb)
  }

  return Math.min(1, Math.max(0, p))
}

// Benjamini-Hochberg FDR correction.
// Returns a parallel array of adjusted p-values preserving the original order.
export function benjaminiHochberg(pValues: number[]): number[] {
  const n = pValues.length
  if (n === 0) return []

  const indexed = pValues.map((p, i) => ({ p, i }))
  indexed.sort((a, b) => a.p - b.p)

  const adjusted = indexed.map(({ p, i }, rank) => ({
    i,
    adj: Math.min(1, (p * n) / (rank + 1)),
  }))

  // Step-down: enforce monotonicity right to left
  for (let j = adjusted.length - 2; j >= 0; j--) {
    if (adjusted[j].adj > adjusted[j + 1].adj) {
      adjusted[j].adj = adjusted[j + 1].adj
    }
  }

  const result = new Array<number>(n)
  for (const { i, adj } of adjusted) result[i] = adj
  return result
}
