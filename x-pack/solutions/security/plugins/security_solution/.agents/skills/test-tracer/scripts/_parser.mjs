/*
 * Shared parser for the test-tracer skill.
 *
 * Goals:
 * - Zero npm dependencies. The skill ships scripts that must run anywhere a
 *   Node 18+ install exists; adding deps adds install friction and lock-file
 *   maintenance the skill cannot guarantee.
 * - Deterministic. Same input file → same catalog. No timestamps, no
 *   non-stable iteration.
 * - String-aware brace counting. Naively counting `{`/`}` breaks on
 *   `'}'`, template literals, and `// }` comments. The tokenizer below
 *   tracks string and comment state so the brace counter only sees real braces.
 *
 * Non-goals (documented blind spots):
 * - This is NOT a TypeScript parser. It does not understand types, generics, or
 *   JSX. It assumes test-call shapes that match `(describe|it|test|apiTest|spaceTest|cy\.it)('name', fn)`.
 * - Computed test names (e.g. `it(\`scenario ${variant}\`, …)`) are recorded
 *   verbatim with the template syntax — the catalog quote-validation gate in
 *   SKILL.md Phase 6 handles this correctly because the model must quote the
 *   same verbatim string.
 * - Dynamic `describe.each(...)` is not expanded — only the literal first arg
 *   is captured.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const TEST_KINDS = ['describe', 'it', 'test', 'apiTest', 'spaceTest'];

// Files that are unambiguously test files by filename convention (Jest, Scout,
// Cypress, RTL component tests).
const TEST_FILE_PATTERN = /\.(test|spec|cy)\.(ts|tsx|js|jsx|mjs)$/;

// Kibana FTR / API-integration suites use plain `.ts` filenames with `describe`
// inside a default-exported factory. They are NOT picked up by TEST_FILE_PATTERN,
// so we recognize them by their containing directory: any `.ts`/`.tsx`/`.js` file
// nested under one of these directory names is treated as a test file.
//
// This is a heuristic — fixtures/utils under the same tree will parse to zero
// blocks (harmless), and the conventional `index.ts` / `ftr_provider_context.ts`
// files will be opened but contribute nothing.
const TEST_SUITE_DIR_MARKERS = ['test_suites', 'tests'];
const FTR_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs)$/;

// Directory names we never descend into. Conservative: explicit allowlist of
// excludes rather than including hidden dirs by accident.
const SKIP_DIRS = new Set([
  'node_modules', 'target', 'build', 'dist', '.git',
  '__fixtures__', '__snapshots__', '.cache', 'coverage',
  'cypress/screenshots', 'cypress/videos',
]);

/**
 * Decide whether a given path looks like a test file the catalog should
 * include. Centralized so the walker (`walkTestFiles`) and the validator
 * (`build_describe_catalog.mjs`) agree on what "test file" means.
 *
 * A file is considered a test file if EITHER:
 *  - its basename matches TEST_FILE_PATTERN (`*.test.ts`, `*.spec.ts`,
 *    `*.cy.ts`, …), or
 *  - any of its ancestor directory names is in TEST_SUITE_DIR_MARKERS
 *    (`test_suites/`, `tests/`) AND its basename matches FTR_FILE_PATTERN —
 *    these are typically FTR / API-integration suites that export a default
 *    factory containing `describe(...)`.
 *
 * The `inTestSuite` parameter is an optimization: when the walker already
 * knows the ancestor is a test-suite root it passes `true` to skip the
 * per-call `containsTestSuiteMarker` scan. Callers without that context
 * (e.g. the catalog builder validating a single-file scope) can omit it.
 */
export function isTestFile(filePath, inTestSuite) {
  const base = path.basename(filePath);
  if (TEST_FILE_PATTERN.test(base)) return true;
  const underSuite = inTestSuite ?? containsTestSuiteMarker(path.resolve(filePath));
  return underSuite && FTR_FILE_PATTERN.test(base);
}

/**
 * Yield every test file path under `scope`. Stable order: lexicographic by
 * full path. Skips known-noise directories.
 *
 * `scope` may be EITHER a directory (walked recursively) OR a single file
 * (yielded directly if it passes `isTestFile`, otherwise silently ignored).
 * The single-file form lets callers narrow a scope to one test without
 * having to provide its parent directory and drag in siblings.
 *
 * If `scope` cannot be stat'd, the generator yields nothing — the catalog
 * builder's validation step is responsible for surfacing the path error to
 * the user; here we just refuse to walk what isn't there.
 */
export async function* walkTestFiles(scope) {
  const resolved = path.resolve(scope);
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return;
  }

  if (stat.isFile()) {
    if (isTestFile(resolved)) yield resolved;
    return;
  }

  const stack = [{ dir: resolved, inTestSuite: containsTestSuiteMarker(resolved) }];

  while (stack.length > 0) {
    const { dir, inTestSuite } = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const childInTestSuite = inTestSuite || TEST_SUITE_DIR_MARKERS.includes(entry.name);
        stack.push({ dir: full, inTestSuite: childInTestSuite });
      } else if (entry.isFile() && isTestFile(entry.name, inTestSuite)) {
        yield full;
      }
    }
  }
}

function containsTestSuiteMarker(absPath) {
  const parts = absPath.split(path.sep);
  return parts.some((p) => TEST_SUITE_DIR_MARKERS.includes(p));
}

/**
 * Detect which test framework a file uses. The classification order matches
 * the test-file detection rule: Cypress by extension, Scout by imports, FTR
 * by directory convention (`test_suites/` / `tests/` without a Jest-style
 * `.test.*` / `.spec.*` name), and finally Jest as the safest fallback.
 *
 * Historically this function returned 'jest' for every non-Cypress, non-Scout
 * file — including FTR / API-integration suites under `test_suites/`. That
 * produced spurious "test-layer drift" findings in Phase 6 when a plan
 * described integration coverage and the catalog labelled the matching block
 * as jest. The FTR branch below fixes that at the source. See PR review on
 * `_parser.mjs:L153`.
 */
export function detectFramework(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');

  if (/\.cy\.(ts|tsx|js|jsx|mjs)$/.test(normalized)) {
    return 'cypress';
  }
  if (/from\s+['"]@kbn\/scout(-[^'"]+)?['"]/.test(content)) {
    if (/\bapiTest\s*\(/.test(content)) return 'scout-api';
    if (/\bspaceTest\s*\(/.test(content)) return 'scout-space';
    return 'scout-ui';
  }

  // FTR / API-integration: file lives under a `test_suites/` or `tests/`
  // ancestor AND does NOT carry a Jest-style `.test.*` / `.spec.*` filename.
  // Files that do carry the Jest naming stay classified as jest even inside
  // those directories (some plugins colocate unit tests there).
  const isJestNamed = /\.(test|spec)\.(ts|tsx|js|jsx|mjs)$/.test(normalized);
  const isUnderSuiteMarker = /\/(test_suites|tests)\//.test(normalized);
  if (isUnderSuiteMarker && !isJestNamed) {
    return 'ftr';
  }

  return 'jest';
}

/**
 * Tokenize a source string into a sequence of significant brace events,
 * skipping braces that appear inside line comments, block comments, single-
 * quoted strings, double-quoted strings, template literals, and regex literals.
 *
 * Yields `{ kind: 'open' | 'close', offset }` for each real brace.
 *
 * This is NOT a full JavaScript parser. It misses corner cases like JSX
 * fragments containing `}` characters in expression containers. For Kibana
 * test files the residual error rate is low; PR-checked by smoke-running the
 * catalog builder against a known plugin and confirming the count matches a
 * hand-eyeball of `rg -c 'describe\\('`.
 */
function* tokenizeBraces(content) {
  let i = 0;
  const n = content.length;

  // State machine. Only one state is active at a time.
  // 'code' — normal source
  // 'line-comment' — inside `// ...` to end of line
  // 'block-comment' — inside /* ... */
  // 'single' / 'double' — inside `'...'` / `"..."`
  // 'template' — inside `` `...` ``, tracking ${...} nesting depth
  // 'regex' — inside /.../flags

  // We track template-expression depth as a stack of brace-counts so a `{`
  // inside `${...}` is balanced before the template re-engages.

  let state = 'code';
  let templateExprStack = []; // stack of brace depths inside ${...}

  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');

    switch (state) {
      case 'code': {
        if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
        if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
        if (c === "'") { state = 'single'; i++; continue; }
        if (c === '"') { state = 'double'; i++; continue; }
        if (c === '`') { state = 'template'; i++; continue; }
        if (c === '/' && isRegexStart(content, i)) { state = 'regex'; i++; continue; }
        if (c === '{') {
          if (templateExprStack.length > 0) {
            templateExprStack[templateExprStack.length - 1]++;
          }
          yield { kind: 'open', offset: i };
          i++;
          continue;
        }
        if (c === '}') {
          if (templateExprStack.length > 0) {
            const depth = templateExprStack[templateExprStack.length - 1];
            if (depth === 0) {
              // Closes the `${ … }` interpolation itself, not a real code brace.
              templateExprStack.pop();
              state = 'template';
              i++;
              continue;
            }
            templateExprStack[templateExprStack.length - 1]--;
          }
          yield { kind: 'close', offset: i };
          i++;
          continue;
        }
        i++;
        continue;
      }
      case 'line-comment': {
        if (c === '\n') state = 'code';
        i++;
        continue;
      }
      case 'block-comment': {
        if (c2 === '*/') { state = 'code'; i += 2; continue; }
        i++;
        continue;
      }
      case 'single':
      case 'double': {
        if (c === '\\') { i += 2; continue; }
        if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) {
          state = 'code';
          i++;
          continue;
        }
        i++;
        continue;
      }
      case 'template': {
        if (c === '\\') { i += 2; continue; }
        if (c === '`') { state = 'code'; i++; continue; }
        if (c2 === '${') {
          templateExprStack.push(0);
          state = 'code';
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      case 'regex': {
        if (c === '\\') { i += 2; continue; }
        if (c === '\n') { state = 'code'; i++; continue; }
        if (c === '/') {
          // consume regex flags
          i++;
          while (i < n && /[a-z]/i.test(content[i])) i++;
          state = 'code';
          continue;
        }
        if (c === '[') {
          // character class — `/` inside doesn't terminate
          while (i < n && content[i] !== ']') {
            if (content[i] === '\\') i++;
            i++;
          }
        }
        i++;
        continue;
      }
    }
  }
}

/**
 * Approximate regex-start detector. A `/` starts a regex only when the
 * preceding non-whitespace token cannot be the end of an expression.
 *
 * This is a heuristic — `a /b/` could be division or regex, ambiguous without
 * a full parser. For test source the false-positive rate is acceptable
 * because regex-literal `}` inside a `describe` body is rare; a misclassified
 * `/` would at worst leak a `}` count by one for that block, which the
 * catalog's quote-validation gate will surface during Phase 6.
 */
function isRegexStart(content, i) {
  let j = i - 1;
  while (j >= 0 && /\s/.test(content[j])) j--;
  if (j < 0) return true;
  const prev = content[j];
  // Operators/keywords that cannot end an expression.
  // We deliberately exclude `<` and `>` here: in TSX files those are JSX
  // delimiters far more often than they are arithmetic operators, and treating
  // `<` as a regex precursor causes `</a>` to be consumed as a regex literal
  // (eating `a>` until newline). The `a < /b/` arithmetic-vs-regex ambiguity
  // is rare in test code and we'd rather drop a real regex than corrupt every
  // JSX-bearing component test.
  if ('([{,;=:!&|?+-*~^%'.includes(prev)) return true;
  // Word-boundary check for keywords like `return`, `typeof`, `in`, `of`
  const wordEnd = j;
  while (j >= 0 && /[a-z]/i.test(content[j])) j--;
  const word = content.slice(j + 1, wordEnd + 1);
  return new Set(['return', 'typeof', 'in', 'of', 'instanceof', 'void', 'delete', 'new', 'throw']).has(word);
}

/**
 * Compute 1-indexed line numbers for an array of offsets, in one linear scan.
 * Stable order: offsets must be ascending.
 */
function offsetsToLines(content, offsets) {
  const lines = new Array(offsets.length);
  let lineNo = 1;
  let cursor = 0;
  let oIdx = 0;

  while (oIdx < offsets.length && cursor <= content.length) {
    if (cursor === offsets[oIdx]) {
      lines[oIdx] = lineNo;
      oIdx++;
      continue;
    }
    if (content[cursor] === '\n') lineNo++;
    cursor++;
  }
  // Any remaining offsets are past EOF; mark as last line.
  for (; oIdx < offsets.length; oIdx++) lines[oIdx] = lineNo;
  return lines;
}

/**
 * Parse a single file's content and return its list of test blocks with
 * computed parent chains. The catalog format mirrors the SKILL.md contract:
 *   { path, line, blockName, framework, parentChain }
 *
 * `path` is filled by the caller (this function returns relative-to-content
 * data only) so the parser stays pure.
 */
export function parseFileContent(content, framework) {
  // Step 1: find every test-call candidate by its source offset.
  //
  // The regex matches `<kind>` optionally followed by a modifier chain
  // (`.skip`, `.only`, `.each`, `.for`, `.describe`, …), then the FIRST
  // open-paren of the call. The loop then inspects what comes inside that
  // paren:
  //
  //   • Non-table calls (`describe.only('name', () => {})`, `apiTest(...)`) —
  //     the name-quote lives directly inside the first paren.
  //   • Table calls (`it.each([...])('name', () => {})`) — the first paren
  //     holds the table array; the SECOND paren holds the name.
  //
  // This is a widening of the earlier rule (bare kind followed by `(`), which
  // silently dropped every `.skip` / `.only` / `.each` block and orphaned
  // their children in the parent chain. See PR review on `_parser.mjs:L351`.

  const callPattern = new RegExp(
    `\\b(${TEST_KINDS.join('|')}|cy\\.it)` +
      `((?:\\.[A-Za-z_$][A-Za-z0-9_$]*)*)` +
      `\\s*\\(`,
    'g'
  );

  const candidates = [];
  // Brace-aware filter: only accept matches whose opening `(` is inside code,
  // not a comment or string. We do this by re-scanning with the tokenizer's
  // state machine restricted to recording code-region spans, then filtering.

  const codeRegions = computeCodeRegions(content);

  let m;
  while ((m = callPattern.exec(content)) !== null) {
    const start = m.index;
    if (!isInCodeRegion(codeRegions, start)) continue;

    const kind = m[1];
    const modifiers = m[2] || '';
    const firstParenIdx = m.index + m[0].length - 1;

    // `.each([...])` / `.for([...])` invokes the test kind TWICE — first with
    // the table, then with (name, callback). We detect this by the trailing
    // modifier and, when present, hop over the table paren to reach the
    // name-bearing paren.
    const lastMod = modifiers ? modifiers.split('.').pop() : '';
    const hasTableModifier = lastMod === 'each' || lastMod === 'for';

    let nameParenOpen;
    if (hasTableModifier) {
      const tableParenClose = skipBalancedParen(content, firstParenIdx);
      if (tableParenClose < 0) continue;
      const secondParen = findNextOpenParen(content, tableParenClose + 1);
      if (secondParen < 0) continue;
      nameParenOpen = secondParen;
    } else {
      nameParenOpen = firstParenIdx;
    }

    // Locate the name quote inside `nameParenOpen`. The first non-whitespace
    // character must be `'`, `"`, or `` ` ``; anything else means this call
    // shape doesn't carry a literal name and we skip it.
    let q = nameParenOpen + 1;
    while (q < content.length && /\s/.test(content[q])) q++;
    const quote = content[q];
    if (quote !== "'" && quote !== '"' && quote !== '`') continue;

    const nameStart = q + 1;
    const nameEnd = findStringEnd(content, nameStart, quote);
    if (nameEnd < 0) continue;

    // Template-literal names with `${…}` interpolation are dynamic — the
    // static substring alone violates the verbatim-name contract Phase 6
    // relies on. We reconstruct the full template source (`${x} creates a
    // rule`) as the canonical name and flag the block `dynamic: true` so
    // the matching phase can treat it as a fuzzy candidate rather than
    // demanding a byte-exact quote. See PR review on `_parser.mjs:L581`.
    const isDynamic =
      quote === '`' &&
      content[nameEnd] === '$' &&
      content[nameEnd + 1] === '{';

    let name;
    let nameCloseOffset;
    if (isDynamic) {
      const templateEnd = findTemplateLiteralEnd(content, nameStart);
      if (templateEnd < 0) continue;
      name = content.slice(nameStart, templateEnd);
      nameCloseOffset = templateEnd + 1;
    } else {
      name = unescapeJsString(content.slice(nameStart, nameEnd), quote);
      nameCloseOffset = nameEnd + 1;
    }

    // Find the callback body brace. Callers historically used the first `{`
    // between the call's open- and close-paren, but that lands on
    // destructuring patterns (`({ apiClient }) => {}`) and options objects
    // (`.describe('n', { tag }, () => {})`) — the first `{` in code is NOT
    // the body in either shape. `findCallbackBodyBrace` walks the call args
    // tracking paren depth and only accepts a `{` that appears AFTER the
    // `=>` (or `function(...)`) marker at paren-depth 0. See PR review on
    // `_parser.mjs:L597`.
    //
    // Expression-body arrows (`it('name', () => foo({...}))`) have no block
    // body brace at all — the callback's whole body is an expression. We
    // still want to catalog these tests (they're valid leaves), so we fall
    // back to using the arrow's offset as a pseudo-openBrace and the call's
    // closing paren as a pseudo-closeBrace. Expression-body blocks can
    // never contain nested tests, so no children get misparented.
    const nameParenClose = findCallCloseParen(content, nameParenOpen);
    if (nameParenClose < 0) continue;
    const { bodyBrace, arrowOffset } = findCallbackBody(content, nameCloseOffset, nameParenClose);

    let openBrace;
    let precomputedCloseBrace = null;
    let expressionBody = false;
    if (bodyBrace >= 0) {
      openBrace = bodyBrace;
    } else if (arrowOffset >= 0) {
      openBrace = arrowOffset;
      precomputedCloseBrace = nameParenClose;
      expressionBody = true;
    } else {
      continue;
    }

    candidates.push({
      kind,
      modifiers,
      name,
      dynamic: isDynamic,
      callOffset: m.index,
      openBrace,
      precomputedCloseBrace,
      expressionBody,
    });
  }

  // Step 2: match each `{` to its closing `}` using the tokenizer.
  const events = [...tokenizeBraces(content)];
  const closeFor = new Map();
  const stack = [];
  for (const e of events) {
    if (e.kind === 'open') stack.push(e.offset);
    else {
      const open = stack.pop();
      if (open !== undefined) closeFor.set(open, e.offset);
    }
  }

  for (const c of candidates) {
    // Expression-body blocks (arrow with no block body) bypass the tokenizer
    // lookup — their span is the whole call, not a `{…}` pair.
    if (c.precomputedCloseBrace != null) c.closeBrace = c.precomputedCloseBrace;
    else c.closeBrace = closeFor.get(c.openBrace) ?? -1;
  }

  // Drop candidates with no matching close (malformed source).
  const blocks = candidates.filter((c) => c.closeBrace > 0);

  // Step 3: compute parent chain. A block's parent chain is the list of
  // enclosing describe-style container blocks, outermost first. We sort by
  // `openBrace` ascending and use a simple stack.
  //
  // A block is a "container" if its identifier chain contains `describe`
  // anywhere — that covers bare `describe(...)`, modifier variants
  // (`describe.only`, `describe.skip`, `describe.each`), and Scout-style
  // namespaced describes (`apiTest.describe`, `spaceTest.describe`,
  // `apiTest.describe.only`, …). Leaf-only kinds (`it`, `test`, `apiTest`,
  // `spaceTest`, `cy.it`) are still walked but never appear as parents.
  const sorted = [...blocks].sort((a, b) => a.openBrace - b.openBrace);
  const enclosingStack = []; // {name, kind, modifiers, closeBrace}
  for (const b of sorted) {
    while (enclosingStack.length > 0 && enclosingStack[enclosingStack.length - 1].closeBrace < b.openBrace) {
      enclosingStack.pop();
    }
    b.parentChain = enclosingStack
      .filter((p) => isContainerBlock(p.kind, p.modifiers))
      .map((p) => p.name);
    enclosingStack.push(b);
  }

  // Step 4: attach line numbers in one pass.
  const offsetsSorted = blocks.map((b) => b.openBrace).slice().sort((a, b) => a - b);
  const lineByOffset = new Map();
  const lines = offsetsToLines(content, offsetsSorted);
  for (let i = 0; i < offsetsSorted.length; i++) lineByOffset.set(offsetsSorted[i], lines[i]);

  return blocks.map((b) => ({
    line: lineByOffset.get(b.openBrace),
    blockName: b.name,
    framework,
    parentChain: b.parentChain,
    // `dynamic` is true when the block name came from a template literal with
    // `${…}` interpolation. Phase 6 matching should treat these as fuzzy
    // candidates (the `blockName` here is the raw template source, not the
    // runtime-resolved string) rather than demanding a byte-exact quote.
    dynamic: b.dynamic === true,
    // Internal fields useful to extract_test_block.mjs; the catalog builder
    // strips these before emitting JSON.
    _openBrace: b.openBrace,
    _closeBrace: b.closeBrace,
    _kind: b.kind,
  }));
}

/**
 * Build a sorted list of [start, end) code regions — offsets where the source
 * is real code, not string/comment/regex. Used to filter test-call matches
 * that landed inside a comment or string literal.
 */
function computeCodeRegions(content) {
  // We piggy-back on the tokenizer by recording state transitions ourselves.
  // The tokenizer above only yields brace events; here we walk the source
  // again with the same state rules and record code spans.
  //
  // Template-interpolation depth MUST be tracked here too — otherwise after
  // the first `${ … }` we never re-enter 'template' state and every later
  // backtick toggles us between code/template incorrectly, which corrupts the
  // code-region map for the whole file (and silently drops every test call
  // that follows). See the unit test for `${id}` inside a `jest.mock` JSX
  // factory.

  const regions = [];
  let codeStart = 0;
  let state = 'code';
  const templateExprStack = [];
  let i = 0;
  const n = content.length;

  const enterNonCode = (offset) => {
    if (codeStart < offset) regions.push([codeStart, offset]);
  };
  const leaveToCode = (offset) => { codeStart = offset; };

  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');

    switch (state) {
      case 'code':
        if (c2 === '//') { enterNonCode(i); state = 'line-comment'; i += 2; continue; }
        if (c2 === '/*') { enterNonCode(i); state = 'block-comment'; i += 2; continue; }
        if (c === "'") { enterNonCode(i); state = 'single'; i++; continue; }
        if (c === '"') { enterNonCode(i); state = 'double'; i++; continue; }
        if (c === '`') { enterNonCode(i); state = 'template'; i++; continue; }
        if (c === '/' && isRegexStart(content, i)) { enterNonCode(i); state = 'regex'; i++; continue; }
        if (c === '{' && templateExprStack.length > 0) {
          templateExprStack[templateExprStack.length - 1]++;
          i++;
          continue;
        }
        if (c === '}' && templateExprStack.length > 0) {
          const depth = templateExprStack[templateExprStack.length - 1];
          if (depth === 0) {
            // Closes the `${ … }` interpolation; we re-enter template state.
            templateExprStack.pop();
            enterNonCode(i);
            state = 'template';
            i++;
            continue;
          }
          templateExprStack[templateExprStack.length - 1]--;
        }
        i++;
        continue;
      case 'line-comment':
        if (c === '\n') { state = 'code'; leaveToCode(i); }
        i++;
        continue;
      case 'block-comment':
        if (c2 === '*/') { state = 'code'; i += 2; leaveToCode(i); continue; }
        i++;
        continue;
      case 'single':
      case 'double':
        if (c === '\\') { i += 2; continue; }
        if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) {
          state = 'code';
          i++;
          leaveToCode(i);
          continue;
        }
        i++;
        continue;
      case 'template':
        if (c === '\\') { i += 2; continue; }
        if (c === '`') { state = 'code'; i++; leaveToCode(i); continue; }
        if (c2 === '${') {
          templateExprStack.push(0);
          state = 'code';
          i += 2;
          leaveToCode(i);
          continue;
        }
        i++;
        continue;
      case 'regex':
        if (c === '\\') { i += 2; continue; }
        if (c === '\n') { state = 'code'; leaveToCode(i); i++; continue; }
        if (c === '/') {
          i++;
          while (i < n && /[a-z]/i.test(content[i])) i++;
          state = 'code';
          leaveToCode(i);
          continue;
        }
        if (c === '[') {
          while (i < n && content[i] !== ']') {
            if (content[i] === '\\') i++;
            i++;
          }
        }
        i++;
        continue;
    }
  }
  if (codeStart < n) regions.push([codeStart, n]);
  return regions;
}

function isInCodeRegion(regions, offset) {
  // Binary search.
  let lo = 0, hi = regions.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = regions[mid];
    if (offset < a) hi = mid - 1;
    else if (offset >= b) lo = mid + 1;
    else return true;
  }
  return false;
}

function findStringEnd(content, start, quote) {
  let i = start;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === '\\') { i += 2; continue; }
    if (c === quote) return i;
    if (quote === '`' && c === '$' && content[i + 1] === '{') {
      // Template literal with interpolation — we record up to the start of
      // interpolation as the "name". Callers should treat this as best-effort.
      return i;
    }
    i++;
  }
  return -1;
}

/**
 * Locate the callback body inside a test call's argument list, returning
 * both the body-brace offset (if any) and the arrow offset (if any).
 *
 * `fromOffset` is expected to be just past the name string's closing quote,
 * still inside the call's parens; `toOffset` is the call's matching close-
 * paren offset.
 *
 * The naive "first `{` in code state" approach is wrong for at least three
 * common shapes:
 *
 *   apiTest('n', async ({ apiClient }) => { body })   // destructuring first
 *   apiTest.describe('n', { tag: '@smoke' }, () => {})// options object first
 *   describe('n', someArg, () => { body })            // arg with method call
 *
 * In each case the first depth-0 `{` is NOT the body. The correct body
 * brace is the first `{` at paren-depth 0 that appears AFTER the callback
 * marker — `=>` (arrow) or `function(...)` (function expression) — at
 * paren-depth 0.
 *
 * Depth-0 `{` seen before the marker is an options object; we skip past
 * its matching `}` and continue. Braces inside `(...)` (paren-depth > 0)
 * are destructuring parameters and never match here.
 *
 * Expression-body arrows like `it('name', () => foo({...}))` have no body
 * brace at all — the function returns `{ bodyBrace: -1, arrowOffset: N }`
 * so the caller can decide to catalog the block using a pseudo-span
 * bounded by the call's parens.
 *
 * Returns `{ bodyBrace: -1, arrowOffset: -1 }` when no callback marker
 * is present at all (malformed source).
 */
function findCallbackBody(content, fromOffset, toOffset) {
  let i = fromOffset;
  let state = 'code';
  let parenDepth = 0;
  let arrowOffset = -1;
  let functionParamsEnd = -1;
  let pastMarker = false;

  while (i < toOffset) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');

    if (state === 'code') {
      if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
      if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '(') { parenDepth++; i++; continue; }
      if (c === ')') { parenDepth--; i++; continue; }

      if (parenDepth === 0) {
        if (!pastMarker) {
          if (c2 === '=>') { arrowOffset = i; pastMarker = true; i += 2; continue; }
          if (c === 'f' && isFunctionKeywordAt(content, i)) {
            const paramsEnd = skipFunctionSignatureParams(content, i, toOffset);
            if (paramsEnd < 0) return { bodyBrace: -1, arrowOffset: -1 };
            functionParamsEnd = paramsEnd;
            pastMarker = true;
            i = paramsEnd + 1;
            continue;
          }
          if (c === '{') {
            const closeBrace = findMatchingCloseBrace(content, i);
            if (closeBrace < 0) return { bodyBrace: -1, arrowOffset: -1 };
            i = closeBrace + 1;
            continue;
          }
        } else if (c === '{') {
          return { bodyBrace: i, arrowOffset };
        }
      }
      i++;
      continue;
    }
    if (state === 'line-comment') {
      if (c === '\n') state = 'code';
      i++;
      continue;
    }
    if (state === 'block-comment') {
      if (c2 === '*/') { state = 'code'; i += 2; continue; }
      i++;
      continue;
    }
    if (state === 'single' || state === 'double') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'code';
      i++;
      continue;
    }
    if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
      i++;
      continue;
    }
  }
  // Reached end without finding a body brace. Report whichever marker (if
  // any) we saw — an arrow signals expression body; a `function()` past-
  // marker signals a malformed body (rare) and yields no arrow to fall
  // back on.
  return { bodyBrace: -1, arrowOffset: arrowOffset >= 0 ? arrowOffset : functionParamsEnd };
}

/**
 * Return true when the block's identifier chain (`kind` + `modifiers`)
 * describes a container — i.e. a describe-like block that may hold nested
 * `it` / `test` / `apiTest` children.
 *
 * Any occurrence of `describe` in the chain qualifies, so all of the
 * following are containers:
 *
 *   describe                    describe.only          describe.each
 *   apiTest.describe            apiTest.describe.only
 *   spaceTest.describe          spaceTest.describe.skip
 *
 * Bare `it`, `test`, `apiTest`, `spaceTest`, and `cy.it` (with or without
 * `.only` / `.skip` / `.each` modifiers) are leaves.
 */
function isContainerBlock(kind, modifiers) {
  if (kind === 'describe') return true;
  if (!modifiers) return false;
  return modifiers.split('.').filter(Boolean).includes('describe');
}

function isFunctionKeywordAt(content, i) {
  if (i > 0 && /[A-Za-z0-9_$]/.test(content[i - 1])) return false;
  if (content.substr(i, 8) !== 'function') return false;
  const after = content[i + 8];
  if (after !== undefined && /[A-Za-z0-9_$]/.test(after)) return false;
  return true;
}

function skipFunctionSignatureParams(content, funcStart, toOffset) {
  // From the 'f' of 'function', skip optional name and reach the params
  // open-paren, then return the offset of its matching close-paren.
  let i = funcStart + 8;
  while (i < toOffset && /\s/.test(content[i])) i++;
  while (i < toOffset && /[A-Za-z0-9_$]/.test(content[i])) i++;
  while (i < toOffset && /\s/.test(content[i])) i++;
  if (content[i] !== '(') return -1;
  return skipBalancedParen(content, i);
}

/**
 * Given the offset of an opening `(`, return the offset of its matching
 * closing `)` — string-aware, so parens inside strings / comments / template
 * literals don't affect the count. Returns -1 if unbalanced.
 *
 * Used to hop over the table paren in `.each([...])(name, ...)` and to bound
 * a function-expression parameter list.
 */
function skipBalancedParen(content, openParenIdx) {
  if (content[openParenIdx] !== '(') return -1;
  let depth = 0;
  let i = openParenIdx;
  let state = 'code';
  const n = content.length;
  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');
    if (state === 'code') {
      if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
      if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return i;
      }
    } else if (state === 'line-comment') {
      if (c === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (c2 === '*/') { state = 'code'; i += 2; continue; }
    } else if (state === 'single' || state === 'double') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'code';
    } else if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
    }
    i++;
  }
  return -1;
}

/**
 * Given the offset of an opening `{`, return the offset of its matching
 * closing `}` — string-aware. Used to skip over an options-object argument
 * that appears before the callback marker.
 */
function findMatchingCloseBrace(content, openBraceIdx) {
  if (content[openBraceIdx] !== '{') return -1;
  let depth = 0;
  let i = openBraceIdx;
  let state = 'code';
  const n = content.length;
  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');
    if (state === 'code') {
      if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
      if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    } else if (state === 'line-comment') {
      if (c === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (c2 === '*/') { state = 'code'; i += 2; continue; }
    } else if (state === 'single' || state === 'double') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'code';
    } else if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
    }
    i++;
  }
  return -1;
}

/**
 * Given an offset immediately AFTER a template literal's opening backtick,
 * return the offset of the matching closing backtick — walking past any
 * `${…}` interpolations. Returns -1 if unclosed.
 *
 * Used to reconstruct dynamic block names like `${x} creates a rule` as
 * their full template source (the static substring alone is empty or
 * misleading; see the `findStringEnd` early-return on `${`).
 */
function findTemplateLiteralEnd(content, startAfterOpenBacktick) {
  let i = startAfterOpenBacktick;
  const n = content.length;
  while (i < n) {
    const c = content[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i;
    if (c === '$' && content[i + 1] === '{') {
      const closeInterp = findMatchingCloseBrace(content, i + 1);
      if (closeInterp < 0) return -1;
      i = closeInterp + 1;
      continue;
    }
    i++;
  }
  return -1;
}

/**
 * Scan forward from `fromOffset` for the first `(` in code state. Used to
 * locate the second paren of `.each([...])(name, …)`.
 */
function findNextOpenParen(content, fromOffset) {
  let i = fromOffset;
  let state = 'code';
  const n = content.length;
  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');
    if (state === 'code') {
      if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
      if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '(') return i;
    } else if (state === 'line-comment') {
      if (c === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (c2 === '*/') { state = 'code'; i += 2; continue; }
    } else if (state === 'single' || state === 'double') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'code';
    } else if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
    }
    i++;
  }
  return -1;
}

function findCallCloseParen(content, callOffset) {
  // From the first `(` after the test-kind keyword, count parens with
  // string-awareness until the matching close.
  const openIdx = content.indexOf('(', callOffset);
  if (openIdx < 0) return -1;
  let depth = 0;
  let i = openIdx;
  let state = 'code';
  const n = content.length;
  while (i < n) {
    const c = content[i];
    const c2 = c + (content[i + 1] || '');
    if (state === 'code') {
      if (c2 === '//') { state = 'line-comment'; i += 2; continue; }
      if (c2 === '/*') { state = 'block-comment'; i += 2; continue; }
      if (c === "'") { state = 'single'; i++; continue; }
      if (c === '"') { state = 'double'; i++; continue; }
      if (c === '`') { state = 'template'; i++; continue; }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) return i;
      }
    } else if (state === 'line-comment') {
      if (c === '\n') state = 'code';
    } else if (state === 'block-comment') {
      if (c2 === '*/') { state = 'code'; i += 2; continue; }
    } else if (state === 'single' || state === 'double') {
      if (c === '\\') { i += 2; continue; }
      if ((state === 'single' && c === "'") || (state === 'double' && c === '"')) state = 'code';
    } else if (state === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') state = 'code';
    }
    i++;
  }
  return -1;
}

function unescapeJsString(raw, quote) {
  return raw.replace(/\\(.)/g, (_, c) => {
    if (c === quote) return quote;
    if (c === '\\') return '\\';
    if (c === 'n') return '\n';
    if (c === 't') return '\t';
    return c;
  });
}
