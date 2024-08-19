'use strict';
var f = Object.defineProperty;
var I = Object.getOwnPropertyDescriptor;
var N = Object.getOwnPropertyNames;
var C = Object.prototype.hasOwnProperty;
var G = (e, n) => {
    for (var s in n) f(e, s, { get: n[s], enumerable: !0 });
  },
  j = (e, n, s, i) => {
    if ((n && typeof n == 'object') || typeof n == 'function')
      for (let o of N(n))
        !C.call(e, o) &&
          o !== s &&
          f(e, o, {
            get: () => n[o],
            enumerable: !(i = I(n, o)) || i.enumerable,
          });
    return e;
  };
var M = (e) => j(f({}, '__esModule', { value: !0 }), e);
var J = {};
G(J, {
  NGRAM_DEFAULT_OPTS: () => A,
  arithmeticMean: () => y,
  charIsUpperCase: () => S,
  comb2: () => q,
  fMeasure: () => u,
  fact: () => W,
  intersection: () => h,
  jackKnife: () => F,
  l: () => V,
  lcs: () => x,
  n: () => Z,
  nGram: () => R,
  s: () => H,
  sentenceSegment: () => w,
  skipBigram: () => d,
  strIsTitleCase: () => g,
  treeBankTokenize: () => p,
});
module.exports = M(J);
var b = [
    /\b(can)(not)\b/i,
    /\b(d)('ye)\b/i,
    /\b(gim)(me)\b/i,
    /\b(gon)(na)\b/i,
    /\b(got)(ta)\b/i,
    /\b(lem)(me)\b/i,
    /\b(more)('n)\b/i,
    /\b(wan)(na) /i,
    /\ ('t)(is)\b/i,
    /\ ('t)(was)\b/i,
  ],
  k = [
    'jr',
    'mr',
    'mrs',
    'ms',
    'dr',
    'prof',
    'sr',
    'sen',
    'corp',
    'rep',
    'gov',
    'atty',
    'supt',
    'det',
    'rev',
    'col',
    'gen',
    'lt',
    'cmdr',
    'adm',
    'capt',
    'sgt',
    'cpl',
    'maj',
    'miss',
    'misses',
    'mister',
    'sir',
    'esq',
    'mstr',
    'phd',
    'adj',
    'adv',
    'asst',
    'bldg',
    'brig',
    'comdr',
    'hon',
    'messrs',
    'mlle',
    'mme',
    'op',
    'ord',
    'pvt',
    'reps',
    'res',
    'sens',
    'sfc',
    'surg',
  ],
  _ = [
    'arc',
    'al',
    'exp',
    'rd',
    'st',
    'dist',
    'mt',
    'fy',
    'pd',
    'pl',
    'plz',
    'tce',
    'llb',
    'md',
    'bl',
    'ma',
    'ba',
    'lit',
    'ex',
    'e.g',
    'i.e',
    'circa',
    'ca',
    'cca',
    'v.s',
    'etc',
    'esp',
    'ft',
    'b.c',
    'a.d',
  ],
  U = ['co', 'corp', 'yahoo', 'joomla', 'jeopardy', 'dept', 'univ', 'assn', 'bros', 'inc', 'ltd'],
  P = [
    'ala',
    'ariz',
    'ark',
    'cal',
    'calif',
    'col',
    'colo',
    'conn',
    'del',
    'fed',
    'fla',
    'fl',
    'ga',
    'ida',
    'ind',
    'ia',
    'la',
    'kan',
    'kans',
    'ken',
    'ky',
    'la',
    'md',
    'mich',
    'minn',
    'mont',
    'neb',
    'nebr',
    'nev',
    'okla',
    'penna',
    'penn',
    'pa',
    'dak',
    'tenn',
    'tex',
    'ut',
    'vt',
    'va',
    'wash',
    'wis',
    'wisc',
    'wy',
    'wyo',
    'usafa',
    'alta',
    'ont',
    'que',
    'sask',
    'yuk',
    'ave',
    'blvd',
    'cl',
    'ct',
    'cres',
    'hwy',
    'U.S',
    'U.S.A',
    'E.U',
    'N\xB0',
  ],
  L = ['a.m', 'p.m'],
  D = ['jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'sept', 'sep'],
  E = ['ex', 'e.g', 'i.e', 'circa', 'ca', 'cca', 'v.s', 'esp', 'ft', 'st', 'mt', ...k],
  T = [..._, ...D, ...U, ...P, ...L, ...k];
function p(e) {
  if (e.length === 0) return [];
  let n = e
    .replace(/^\"/, ' `` ')
    .replace(/([ (\[{<])"/g, '$1 `` ')
    .replace(/\.\.\.*/g, ' ... ')
    .replace(/[;@#$%&]/g, ' $& ')
    .replace(/([^\.])(\.)([\]\)}>"\']*)\s*$/g, '$1 $2$3 ')
    .replace(/[,?!]/g, ' $& ')
    .replace(/[\]\[\(\)\{\}<>]/g, ' $& ')
    .replace(/---*/g, ' -- ');
  (n = ` ${n} `),
    (n = n
      .replace(/"/g, " '' ")
      .replace(/([^'])' /g, "$1 ' ")
      .replace(/'([sSmMdD]) /g, " '$1 ")
      .replace(/('ll|'LL|'re|'RE|'ve|'VE|n't|N'T) /g, ' $1 '));
  let s = -1;
  for (; s++ < b.length; ) n = n.replace(b[s], ' $1 $2 ');
  return (n = n.replace(/\ \ +/g, ' ').replace(/^\ |\ $/g, '')), n.split(' ');
}
function w(e) {
  if (e.length === 0) return [];
  let n = new RegExp('\\b(' + T.join('|') + ')[.!?] ?$', 'i'),
    s = new RegExp(/[ |.][A-Z].?$/, 'i'),
    i = new RegExp(/[\r\n]+/, 'g'),
    o = new RegExp(/\.\.\.*$/),
    a = new RegExp('\\b(' + E.join('|') + ')[.!?] ?$', 'i'),
    t = e.split(/(\S.+?[.?!])(?=\s+|$|")/g),
    l = [];
  for (let r = 0; r < t.length; r++)
    if (t[r])
      if (((t[r] = t[r].replace(/(^ +| +$)/g, '')), i.test(t[r])))
        t[r + 1] && g(t[r])
          ? (t[r + 1] = (t[r].trim() || '') + ' ' + (t[r + 1] || '').replace(/ +/g, ' '))
          : l.push(
              ...t[r].trim().split(`
`)
            );
      else if (t[r + 1] && n.test(t[r])) {
        let c = t[r + 1];
        c.trim() && g(c) && !a.test(t[r])
          ? (l.push(t[r]), (t[r] = ''))
          : (t[r + 1] = (t[r] || '') + ' ' + (c || '').replace(/ +/g, ' '));
      } else if (t[r].length > 1 && t[r + 1] && s.test(t[r])) {
        let c = t[r].split(' '),
          m = c[c.length - 1];
        m === m.toLowerCase()
          ? (t[r + 1] = t[r + 1] = (t[r] || '') + ' ' + (t[r + 1] || '').replace(/ +/g, ' '))
          : t[r + 2] &&
            (g(c[c.length - 2]) && g(t[r + 2])
              ? (t[r + 2] = (t[r] || '') + (t[r + 1] || '').replace(/ +/g, ' ') + (t[r + 2] || ''))
              : (l.push(t[r]), (t[r] = '')));
      } else
        t[r + 1] && o.test(t[r])
          ? (t[r + 1] = (t[r] || '') + (t[r + 1] || '').replace(/ +/g, ' '))
          : t[r] && t[r].length > 0 && (l.push(t[r]), (t[r] = ''));
  return l.length === 0 ? [e] : l;
}
function g(e) {
  let n = e.trim().slice(0, 1);
  return S(n);
}
function S(e) {
  if (e.length !== 1) throw new RangeError('Input should be a single character');
  let n = e.charCodeAt(0);
  return n >= 65 && n <= 90;
}
function K(e, n = Map) {
  return (() => {
    let s = new n();
    return (i) => {
      if (s.has(i)) return s.get(i);
      {
        let o = e(i);
        return s.set(i, o), o;
      }
    };
  })();
}
function v(e, n = 1) {
  if (e < 0) throw RangeError('Input must be a positive number');
  return e < 2 ? n : v(e - 1, e * n);
}
var W = K(v);
function d(e) {
  if (e.length < 2) throw new RangeError('Input must have at least two words');
  let n = [];
  for (let s = 0; s < e.length - 1; s++)
    for (let i = s + 1; i < e.length; i++) n.push(`${e[s]} ${e[i]}`);
  return n;
}
var A = { start: !1, end: !1, val: '<S>' };
function R(e, n = 2, s = {}) {
  if (n < 1) throw new RangeError('ngram size cannot be smaller than 1');
  if (e.length < n)
    throw new RangeError('ngram size cannot be larger than the number of tokens available');
  if (Object.keys(s).length !== 0) {
    let o = { ...A, ...s },
      a = e.slice(0);
    if (o.start) for (let t = 0; t < n - 1; t++) a.unshift(o.val);
    if (o.end) for (let t = 0; t < n - 1; t++) a.push(o.val);
    e = a;
  }
  let i = [];
  for (let o = 0; o < e.length - n + 1; o++) i.push(e.slice(o, o + n).join(' '));
  return i;
}
function q(e) {
  if (e < 2) throw new RangeError('Input must be greater than 2');
  return 0.5 * e * (e - 1);
}
function y(e) {
  if (e.length < 1) throw new RangeError('Input array must have at least 1 element');
  return e.reduce((n, s) => n + s) / e.length;
}
function F(e, n, s, i = y) {
  if (e.length < 2) throw new RangeError('Candidate array must contain more than one element');
  let o = e.map((t) => s(t, n)),
    a = [];
  for (let t = 0; t < o.length; t++) {
    let l = o.slice(0);
    l.splice(t, 1), a.push(Math.max(...l));
  }
  return i(a);
}
function u(e, n, s = 0.5) {
  if (e < 0 || e > 1)
    throw new RangeError('Precision value p must have bounds 0 \u2264 p \u2264 1');
  if (n < 0 || n > 1) throw new RangeError('Recall value r must have bounds 0 \u2264 r \u2264 1');
  if (s < 0) throw new RangeError('beta value must be greater than 0');
  return 0 <= s && s <= 1 ? ((1 + s * s) * n * e) / (n + s * s * e) : n;
}
function h(e, n) {
  let s = new Set(e),
    i = new Set(n);
  return Array.from(s).filter((o) => i.has(o));
}
function x(e, n) {
  if (e.length === 0 || n.length === 0) return [];
  let s = Array(e.length + 1)
    .fill(0)
    .map(() => Array(n.length + 1).fill(0));
  for (let t = 1; t <= e.length; t++)
    for (let l = 1; l <= n.length; l++)
      e[t - 1] === n[l - 1]
        ? (s[t][l] = s[t - 1][l - 1] + 1)
        : (s[t][l] = Math.max(s[t - 1][l], s[t][l - 1]));
  let i = [],
    o = e.length,
    a = n.length;
  for (; o > 0 && a > 0; )
    e[o - 1] === n[a - 1] ? (i.unshift(e[o - 1]), o--, a--) : s[o - 1][a] > s[o][a - 1] ? o-- : a--;
  return i;
}
function Z(e, n, s) {
  if (e.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (n.length === 0) throw new RangeError('Reference cannot be an empty string');
  let i = Object.assign({ n: 1, nGram: R, tokenizer: p }, s),
    o = i.nGram(i.tokenizer(e), i.n),
    a = i.nGram(i.tokenizer(n), i.n);
  return h(o, a).length / a.length;
}
function H(e, n, s) {
  if (e.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (n.length === 0) throw new RangeError('Reference cannot be an empty string');
  let i = Object.assign({ beta: 0.5, skipBigram: d, tokenizer: p }, s),
    o = i.skipBigram(i.tokenizer(e)),
    a = i.skipBigram(i.tokenizer(n)),
    t = h(o, a).length;
  if (t === 0) return 0;
  {
    let l = t / a.length,
      r = t / o.length;
    return u(r, l, i.beta);
  }
}
function V(e, n, s) {
  if (e.length === 0) throw new RangeError('Candidate cannot be an empty string');
  if (n.length === 0) throw new RangeError('Reference cannot be an empty string');
  let i = Object.assign({ beta: 0.5, lcs: x, segmenter: w, tokenizer: p }, s),
    o = i.segmenter(e),
    a = i.segmenter(n),
    t = i.tokenizer(e),
    l = i.tokenizer(n),
    r = a.map((B) => {
      let O = i.tokenizer(B);
      return new Set(...o.map(($) => i.lcs(i.tokenizer($), O))).size;
    }),
    c = 0;
  for (; r.length; ) c += r.pop() || 0;
  let m = c / t.length,
    z = c / l.length;
  return u(z, m, i.beta);
}
0 &&
  (module.exports = {
    NGRAM_DEFAULT_OPTS,
    arithmeticMean,
    charIsUpperCase,
    comb2,
    fMeasure,
    fact,
    intersection,
    jackKnife,
    l,
    lcs,
    n,
    nGram,
    s,
    sentenceSegment,
    skipBigram,
    strIsTitleCase,
    treeBankTokenize,
  });
/**
 * @license
 * @Author: Lim Mingjie, Kenneth
 * @Date:   2016-01-20T18:56:22-05:00
 * @Email:  me@kenlimmj.com
 * @Last modified by:   Astrianna
 * @Last modified time: 2016-02-27T21:34:23-05:00
 */
/**
 * @license
 * @Author: Lim Mingjie, Kenneth
 * @Date:   2016-01-20T18:56:14-05:00
 * @Email:  me@kenlimmj.com
 * @Last modified by:   Astrianna
 * @Last modified time: 2016-02-27T19:50:25-05:00
 */
//# sourceMappingURL=rouge.js.map
