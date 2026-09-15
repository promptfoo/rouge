# Changelog

## [3.2.2](https://github.com/promptfoo/js-rouge/compare/js-rouge-v3.2.1...js-rouge-v3.2.2) (2026-09-15)

### Bug Fixes

- align conditional ESM declarations with runtime exports ([#152](https://github.com/promptfoo/js-rouge/issues/152)) ([26535ce](https://github.com/promptfoo/js-rouge/commit/26535ce8e7b0f4ae9d3c6d701ff8ec6f25c53a5d))
- align question lookahead with attached bracket boundaries ([#180](https://github.com/promptfoo/js-rouge/issues/180)) ([fe67cc9](https://github.com/promptfoo/js-rouge/commit/fe67cc9ce5576aefeda1a167db222b5ec97229f7))
- avoid overflow when averaging finite numbers ([#163](https://github.com/promptfoo/js-rouge/issues/163)) ([b42b4f7](https://github.com/promptfoo/js-rouge/commit/b42b4f77b4dae1665765c7452b89de9a1747e725))
- avoid repeated email lookahead during segmentation ([#166](https://github.com/promptfoo/js-rouge/issues/166)) ([613b9ac](https://github.com/promptfoo/js-rouge/commit/613b9acb104600e0f7e8ee6b1e6816bdc3281a0e))
- bind publication to the selected release commit ([#171](https://github.com/promptfoo/js-rouge/issues/171)) ([6128639](https://github.com/promptfoo/js-rouge/commit/61286398351ac81e5a7e8c0167032e473e4d8aa1))
- bound public skip-bigram materialization ([#147](https://github.com/promptfoo/js-rouge/issues/147)) ([117f232](https://github.com/promptfoo/js-rouge/commit/117f232e39ce3d9d86ca7f7d8f4f62902b74eab1))
- bound raw n-gram materialization before encoding ([#143](https://github.com/promptfoo/js-rouge/issues/143)) ([a854ccc](https://github.com/promptfoo/js-rouge/commit/a854ccce60e897a9e60807925c85e527aac4312a))
- bound unpadded n-gram materialization ([#135](https://github.com/promptfoo/js-rouge/issues/135)) ([f7ef6bc](https://github.com/promptfoo/js-rouge/commit/f7ef6bcab466297ea86b3cad44b8bd33d4b04b02))
- build clean packages and tolerate omitted dev dependencies ([#142](https://github.com/promptfoo/js-rouge/issues/142)) ([77e0bf3](https://github.com/promptfoo/js-rouge/commit/77e0bf31d68a4795e4145fc46903271807fccf17))
- close upstream sentence segmentation golden rule gaps ([#153](https://github.com/promptfoo/js-rouge/issues/153)) ([3b4dad4](https://github.com/promptfoo/js-rouge/commit/3b4dad42af04f35bae451c1cbd8628578a710617))
- gate releases on exact-head CI and support retries ([#139](https://github.com/promptfoo/js-rouge/issues/139)) ([f788aac](https://github.com/promptfoo/js-rouge/commit/f788aac35900ded69e8fcf88f92f548daf1d0985))
- isolate reusable metric callback results ([#144](https://github.com/promptfoo/js-rouge/issues/144)) ([f9a1da9](https://github.com/promptfoo/js-rouge/commit/f9a1da97f9b16c274e95212fc7eedc95a5492e62))
- normalize next-line separators before detecting lists ([#177](https://github.com/promptfoo/js-rouge/issues/177)) ([1a49479](https://github.com/promptfoo/js-rouge/commit/1a494793334fe19da0c8b9f542c7cfa1ededb4c1))
- preserve abbreviation boundaries across whitespace ([#148](https://github.com/promptfoo/js-rouge/issues/148)) ([665adf8](https://github.com/promptfoo/js-rouge/commit/665adf8c216b7e4faa3e351dd31d78da66e08b81))
- preserve case context during summary preparation ([#173](https://github.com/promptfoo/js-rouge/issues/173)) ([3943edb](https://github.com/promptfoo/js-rouge/commit/3943edbc259e0cde9c2a1520749d2fb3c7fd5243))
- preserve common abbreviation continuations ([#155](https://github.com/promptfoo/js-rouge/issues/155)) ([af16ea7](https://github.com/promptfoo/js-rouge/commit/af16ea701fc1ccac8d1a6bb6428dae074485fc4f))
- preserve lowercase continuations in neutral segmentation ([#145](https://github.com/promptfoo/js-rouge/issues/145)) ([9888f0f](https://github.com/promptfoo/js-rouge/commit/9888f0f2864fa472f95a515c352da44f0869808c))
- preserve quotation boundaries and dialogue continuations ([#157](https://github.com/promptfoo/js-rouge/issues/157)) ([e0909dc](https://github.com/promptfoo/js-rouge/commit/e0909dc941dec6c50b393a956a235322057b6141))
- preserve quoted numeric and Treebank boundaries ([#150](https://github.com/promptfoo/js-rouge/issues/150)) ([807e219](https://github.com/promptfoo/js-rouge/commit/807e219d6fae1a2674752ab2493f4756647a6211))
- preserve Treebank quote and punctuation tokens ([#136](https://github.com/promptfoo/js-rouge/issues/136)) ([0354388](https://github.com/promptfoo/js-rouge/commit/03543884d3fbe698af638c4f733647ecad264465))
- preserve Unicode case expansion in dotted identifiers ([#154](https://github.com/promptfoo/js-rouge/issues/154)) ([63fbc81](https://github.com/promptfoo/js-rouge/commit/63fbc814237a45ee4a9a6f10a4ff983b0ee0b486))
- recognize terminal three-dot ellipses ([#159](https://github.com/promptfoo/js-rouge/issues/159)) ([daddea0](https://github.com/promptfoo/js-rouge/commit/daddea0d8971c62b5d9dc7dbe895cc40c3ef9ff8))
- recognize typographic quotation boundaries ([#170](https://github.com/promptfoo/js-rouge/issues/170)) ([2d2a628](https://github.com/promptfoo/js-rouge/commit/2d2a628252284656588af482023113f6c9b34221))
- retain combining marks in dotted identifiers ([#169](https://github.com/promptfoo/js-rouge/issues/169)) ([dd575e9](https://github.com/promptfoo/js-rouge/commit/dd575e9975c1ad79d8b34387542401dc7aab2ddf))
- retain numeric citation sentence boundaries ([#158](https://github.com/promptfoo/js-rouge/issues/158)) ([a30f2c4](https://github.com/promptfoo/js-rouge/commit/a30f2c46f00e82984031c0c6bf9595c91171684f))
- segment embedded and parenthesized lists ([#156](https://github.com/promptfoo/js-rouge/issues/156)) ([529539f](https://github.com/promptfoo/js-rouge/commit/529539fa6acf85567cddca8c7292b47044d4a3b7))
- split quoted sentences before numeric starts ([#137](https://github.com/promptfoo/js-rouge/issues/137)) ([cef6f8c](https://github.com/promptfoo/js-rouge/commit/cef6f8c08c4d4ad40df7916e2c40964798beebd9))
- tokenize Unicode boundaries and decimal separators ([#146](https://github.com/promptfoo/js-rouge/issues/146)) ([d0ddc34](https://github.com/promptfoo/js-rouge/commit/d0ddc34c52c0058c8b5ae8e9a2489a002ab83303))

### Performance

- fast path equivalent and full-window ROUGE-S inputs ([#149](https://github.com/promptfoo/js-rouge/issues/149)) ([0360488](https://github.com/promptfoo/js-rouge/commit/03604883ba466f24f33e6b806f2d1d3ea58f285a))
- stop ROUGE-L once candidate tokens are exhausted ([#151](https://github.com/promptfoo/js-rouge/issues/151)) ([bb03fd2](https://github.com/promptfoo/js-rouge/commit/bb03fd2187be3d2cb1d890c3c8601370e2b3383f))

## [3.2.1](https://github.com/promptfoo/js-rouge/compare/js-rouge-v3.2.0...js-rouge-v3.2.1) (2026-08-23)

### Bug Fixes

- bound built-in ROUGE-S memory ([#130](https://github.com/promptfoo/js-rouge/issues/130)) ([49e0605](https://github.com/promptfoo/js-rouge/commit/49e060535107936ab93be2b2c9fed59c0ee00408))
- bound LCS auxiliary memory ([#129](https://github.com/promptfoo/js-rouge/issues/129)) ([f7cc3c2](https://github.com/promptfoo/js-rouge/commit/f7cc3c2b02d7bdefcd863c2a963164aa3f8b3ce4))
- correct summary-level ROUGE-L scoring ([#117](https://github.com/promptfoo/js-rouge/issues/117)) ([c67bf3e](https://github.com/promptfoo/js-rouge/commit/c67bf3ef4b5fc3e6ad2423d494e3d8b06146e0e6))
- correct tokenization and sentence preprocessing ([#118](https://github.com/promptfoo/js-rouge/issues/118)) ([972cf08](https://github.com/promptfoo/js-rouge/commit/972cf08362a33dc2f34238d67b2a550bd8f2d1b4))
- harden utility contracts and resampling ([#133](https://github.com/promptfoo/js-rouge/issues/133)) ([aae788c](https://github.com/promptfoo/js-rouge/commit/aae788c7706c3139e93220f0f4b7e3dcf8395860))
- make case-insensitive segmentation casing-neutral ([#132](https://github.com/promptfoo/js-rouge/issues/132)) ([9c08900](https://github.com/promptfoo/js-rouge/commit/9c08900b302c0a36bf761189604d7ff404ebcfd0))
- make custom ROUGE-L matching position-aware ([#128](https://github.com/promptfoo/js-rouge/issues/128)) ([fd96156](https://github.com/promptfoo/js-rouge/commit/fd961565e088d2a80919b702718f0ab1a6a3ba49))
- preserve repeated matches in ROUGE-N and ROUGE-S ([#116](https://github.com/promptfoo/js-rouge/issues/116)) ([39996a9](https://github.com/promptfoo/js-rouge/commit/39996a9aa508a02adfc79ecab2d06f02eea4e45d))
- preserve token boundaries in internal gram keys ([#125](https://github.com/promptfoo/js-rouge/issues/125)) ([f660f77](https://github.com/promptfoo/js-rouge/commit/f660f7733cf25a957ee08f27d4aceacf560a8947))
- prevent sentence segmentation heap exhaustion ([#122](https://github.com/promptfoo/js-rouge/issues/122)) ([1a720fd](https://github.com/promptfoo/js-rouge/commit/1a720fdba366d7c37fe8d299342c25317bcebdef))
- return zero when summaries yield no grams ([#131](https://github.com/promptfoo/js-rouge/issues/131)) ([32d8d92](https://github.com/promptfoo/js-rouge/commit/32d8d9239ccc235d8b4eefd886c53d2d705bec7b))
- scan sentence boundaries in one pass ([#119](https://github.com/promptfoo/js-rouge/issues/119)) ([1d5aad2](https://github.com/promptfoo/js-rouge/commit/1d5aad25ee109a3f467208a582ef1dc3cd8555ce))
- tokenize summaries consistently and preserve punctuation boundaries ([#123](https://github.com/promptfoo/js-rouge/issues/123)) ([fb5cb45](https://github.com/promptfoo/js-rouge/commit/fb5cb45dabcc9b9340a1621f8bf6d571898a895a))
- validate factorial inputs ([#127](https://github.com/promptfoo/js-rouge/issues/127)) ([973f8aa](https://github.com/promptfoo/js-rouge/commit/973f8aa139f9da49c39a3a50ed72e03bf42d8d0c))
- validate metric options and stabilize F-beta arithmetic ([#124](https://github.com/promptfoo/js-rouge/issues/124)) ([f745365](https://github.com/promptfoo/js-rouge/commit/f74536511ffc466a42d6103ed7dfa6cf5d1cb858))

## [3.2.0](https://github.com/promptfoo/js-rouge/compare/js-rouge-v3.1.5...js-rouge-v3.2.0) (2026-01-05)

### Features

- export TypeScript option types for ROUGE functions ([#63](https://github.com/promptfoo/js-rouge/issues/63)) ([cf203c9](https://github.com/promptfoo/js-rouge/commit/cf203c9bcf50dedcd25fa3b99528b19aa3db12fa))

### Bug Fixes

- apply F-beta formula for all non-negative beta values ([#51](https://github.com/promptfoo/js-rouge/issues/51)) ([44f2bf5](https://github.com/promptfoo/js-rouge/commit/44f2bf51e468420d7e50fc28fb25e34d7ffb8fa6))
- correct off-by-one error in treeBankTokenize loop ([#50](https://github.com/promptfoo/js-rouge/issues/50)) ([1f74053](https://github.com/promptfoo/js-rouge/commit/1f74053a56259d687228dfb3f377285e7dd8f4c6))
- correct ROUGE-L precision and recall calculation ([#52](https://github.com/promptfoo/js-rouge/issues/52)) ([0c91f4c](https://github.com/promptfoo/js-rouge/commit/0c91f4ccd9b44524f148bf747798c0e68e47961c))
- remove duplicate 'sep' entry in ABBR_DATES ([#53](https://github.com/promptfoo/js-rouge/issues/53)) ([433a4b5](https://github.com/promptfoo/js-rouge/commit/433a4b5cccea38552e8322104615443cb818a589))
- resolve CodeQL security alerts for ReDoS and workflow permissions ([#48](https://github.com/promptfoo/js-rouge/issues/48)) ([972808d](https://github.com/promptfoo/js-rouge/commit/972808d4b6f45e5f3cba99526d6c4423937c3c45))
- resolve CodeQL security alerts for ReDoS vulnerabilities ([#59](https://github.com/promptfoo/js-rouge/issues/59)) ([ad6a930](https://github.com/promptfoo/js-rouge/commit/ad6a93044c2f40900a49cf2888f8e9d8fb1c7c38))
- **security:** harden CI/CD pipeline and add security tooling ([#68](https://github.com/promptfoo/js-rouge/issues/68)) ([545044a](https://github.com/promptfoo/js-rouge/commit/545044ad14deb270421e65000a3061c0890b9084))

## [3.1.5](https://github.com/promptfoo/js-rouge/compare/js-rouge-v3.1.0...js-rouge-v3.1.5) (2025-12-17)

### Bug Fixes

- update repository URLs to match actual repo name ([#44](https://github.com/promptfoo/js-rouge/issues/44)) ([80d6210](https://github.com/promptfoo/js-rouge/commit/80d621059f53db48cc5d3c3dc256abda4a18820d))

### Internal

- 3.1.1–3.1.4 were internal releases fixing npm OIDC publishing and were not published to npm

## [3.1.0](https://github.com/promptfoo/js-rouge/compare/3.0.0...js-rouge-v3.1.0) (2025-12-17)

### ⚠ BREAKING CHANGES

- ROUGE-N now returns F-score instead of recall-only. If you were relying on recall-only behavior, you'll need to adjust your code.
- Default `beta` changed from `Infinity` to `1.0` for balanced F1 score. Pass `beta: Infinity` explicitly to restore recall-only behavior.

### Features

- add `caseSensitive` option to all ROUGE functions ([#33](https://github.com/promptfoo/js-rouge/issues/33)) ([996ffbd](https://github.com/promptfoo/js-rouge/commit/996ffbd31b6b30985c64f6a0e1b9671acf41ee82))
- add `maxSkip` parameter to ROUGE-S for controlling skip distance ([#20](https://github.com/promptfoo/js-rouge/issues/20)) ([05d1f3a](https://github.com/promptfoo/js-rouge/commit/05d1f3a39d9ebd2869790573defa44895e245dc2))
- change default beta to 1.0 for balanced F1 ([#19](https://github.com/promptfoo/js-rouge/issues/19)) ([ccc6615](https://github.com/promptfoo/js-rouge/commit/ccc66159cd50477210fd3c11a6fabab8d73cb1ee))
- make ROUGE-N return F-score instead of recall ([#18](https://github.com/promptfoo/js-rouge/issues/18)) ([034f52c](https://github.com/promptfoo/js-rouge/commit/034f52cd88e2a5934b8406b72bd238183c177cec))

### Bug Fixes

- add `exports` field to package.json for ESM/CJS support ([#22](https://github.com/promptfoo/js-rouge/issues/22)) ([5f7f3f8](https://github.com/promptfoo/js-rouge/commit/5f7f3f84cf2b127a01d83566dd7f2180bd38d19a))
- add `files` field and fix directories in package.json ([#23](https://github.com/promptfoo/js-rouge/issues/23)) ([b18ff71](https://github.com/promptfoo/js-rouge/commit/b18ff716dae0e54a3b18dc0dc6406ec9a0e7621b))
- correct ROUGE-L union LCS calculation ([#17](https://github.com/promptfoo/js-rouge/issues/17)) ([29a77b6](https://github.com/promptfoo/js-rouge/commit/29a77b62891288514be37d8c4e50bb453f8a4e39))
- enable ESLint to lint test files ([#25](https://github.com/promptfoo/js-rouge/issues/25)) ([943d185](https://github.com/promptfoo/js-rouge/commit/943d185884028869d69e1ad9a98a94b313afe4b5))
- make `charIsUpperCase` i18n-compatible ([#31](https://github.com/promptfoo/js-rouge/issues/31)) ([eca0020](https://github.com/promptfoo/js-rouge/commit/eca0020f0be8e25a442fd2e3e926808af1922316))

## [3.0.0](https://github.com/promptfoo/js-rouge/releases/tag/3.0.0) (2024-08-19)

This release represents a major modernization of the original [`rouge`](https://www.npmjs.com/package/rouge) package by [Kenneth Lim](https://github.com/kenlimmj). The package has been forked and is now maintained by [promptfoo](https://github.com/promptfoo).

### ⚠ BREAKING CHANGES

- Package renamed from `rouge` to `js-rouge`
- Rewritten in TypeScript with strict mode
- Minimum Node.js version: 18.0.0
- Build output changed from Babel to esbuild

### Features

- Full TypeScript support with bundled type definitions
- ESM module support alongside CommonJS
- Dual CJS/ESM package exports
- Automated CI/CD with GitHub Actions
- 100% test coverage

### Migration from 2.x

```javascript
// Before (rouge 2.x)
const rouge = require("rouge");
rouge.n(candidate, reference);

// After (js-rouge 3.x)
const { n, l, s } = require("js-rouge");
// or
import { n, l, s } from "js-rouge";
n(candidate, reference);
```

## 2.x and Earlier

Versions 2.0.0, 2.0.1, and earlier were published by the original author [Kenneth Lim](https://github.com/kenlimmj) under the package name `rouge`. See the [original repository](https://github.com/kenlimmj/rouge) for historical changelog.

Key milestones in the original package:

- **2.0.0** – ES6 rewrite with Babel transpilation
- **1.x** – Initial implementation
