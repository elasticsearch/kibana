#!/usr/bin/env node
/*
 * test-tracer / build_describe_catalog.mjs
 *
 * Walks one or more scope paths, finds every test file, and emits a JSON
 * catalog of every `describe` / `it` / `test` / `apiTest` / `spaceTest` /
 * `cy.it` block found inside.
 *
 * A scope path may be either a directory (walked recursively) or a single
 * test file (yielded directly). The latter form is useful when the caller
 * wants to include exactly one file from a noisy parent directory without
 * dragging in its siblings.
 *
 * Contract is defined in:
 *   x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer/SKILL.md  §Phase 5
 *   x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer/scripts/_parser.mjs  (parser semantics)
 *
 * Output (stdout, JSON):
 *   [
 *     { path, line, blockName, framework, parentChain }
 *   ]
 *
 * Paths are emitted relative to `--cwd` (defaults to the current working dir).
 * This keeps catalogs portable across machines and stable in PR diffs.
 *
 * Errors are written to stderr; the process exits 1 on usage errors and 2 on
 * I/O errors. Per-file parse failures are logged to stderr and the file is
 * skipped (the catalog is best-effort: a single broken file should not poison
 * an entire run).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

import { walkTestFiles, parseFileContent, detectFramework, isTestFile } from './_parser.mjs';

function parseArgs(argv) {
  const scopes = [];
  let cwd = process.cwd();
  let pretty = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') {
      const v = argv[++i];
      if (!v) usageError('--scope requires a path');
      scopes.push(v);
    } else if (a === '--cwd') {
      const v = argv[++i];
      if (!v) usageError('--cwd requires a path');
      cwd = path.resolve(v);
    } else if (a === '--pretty') {
      pretty = true;
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      usageError(`Unknown argument: ${a}`);
    }
  }

  if (scopes.length === 0) usageError('At least one --scope is required.');
  return { scopes, cwd, pretty };
}

function usageError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  process.stderr.write(`
build_describe_catalog.mjs — walk test files in scope, emit a JSON catalog

USAGE:
  node build_describe_catalog.mjs --scope <path> [--scope <path>...] [--cwd <path>] [--pretty]

OPTIONS:
  --scope <path>   Directory to walk OR a single test file (repeatable). Required.
                   A file scope must look like a test file:
                     *.test.{ts,tsx,js,jsx,mjs} / *.spec.* / *.cy.*
                     OR a .ts file under a 'test_suites/' or 'tests/' ancestor.
                   Mixed directory + file scopes are allowed in one invocation.
  --cwd <path>     Path to resolve output paths against (default: process.cwd()).
  --pretty         Pretty-print JSON. Default: dense single-line per element.

OUTPUT:
  JSON array on stdout:
    [{ path, line, blockName, framework, parentChain }]

EXIT CODES:
  0  success
  1  usage error
  2  I/O error reading scope
`);
}

async function main() {
  const { scopes, cwd, pretty } = parseArgs(process.argv.slice(2));

  // Validate scopes exist before doing any work. A scope is valid if it is
  // either a directory (walked recursively) or a single file that
  // `isTestFile` recognizes (yielded directly). Anything else — a non-test
  // file, a missing path — fails the run with a clear message rather than
  // silently producing an empty catalog.
  for (const s of scopes) {
    let st;
    try {
      st = await fs.stat(s);
    } catch (e) {
      process.stderr.write(`error: cannot stat scope: ${s} — ${e.message}\n`);
      process.exit(2);
    }
    if (st.isDirectory()) continue;
    if (st.isFile()) {
      if (!isTestFile(s)) {
        process.stderr.write(
          `error: scope file is not recognized as a test file: ${s}\n` +
            `       expected basename to match *.test.* / *.spec.* / *.cy.*,\n` +
            `       or to live under a 'test_suites/' or 'tests/' ancestor.\n`
        );
        process.exit(2);
      }
      continue;
    }
    process.stderr.write(`error: scope is neither a directory nor a regular file: ${s}\n`);
    process.exit(2);
  }

  const catalog = [];
  const seenFiles = new Set();
  let fileCount = 0;
  let skippedCount = 0;

  for (const scope of scopes) {
    for await (const filePath of walkTestFiles(scope)) {
      // Dedupe across overlapping scopes (a file under both `--scope` flags
      // would otherwise appear twice).
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      fileCount++;

      let content;
      try {
        content = await fs.readFile(filePath, 'utf8');
      } catch (e) {
        skippedCount++;
        process.stderr.write(`skip: cannot read ${filePath} — ${e.message}\n`);
        continue;
      }

      let blocks;
      try {
        const framework = detectFramework(filePath, content);
        blocks = parseFileContent(content, framework);
      } catch (e) {
        skippedCount++;
        process.stderr.write(`skip: parse failed for ${filePath} — ${e.message}\n`);
        continue;
      }

      const relPath = path.relative(cwd, filePath);
      for (const b of blocks) {
        catalog.push({
          path: relPath,
          line: b.line,
          blockName: b.blockName,
          framework: b.framework,
          parentChain: b.parentChain,
        });
      }
    }
  }

  // Stable order: by path, then by line. Critical for deterministic output —
  // the catalog is consumed by an LLM, and stable input avoids non-deterministic
  // prompt drift between runs of the same skill on the same repo state.
  catalog.sort((a, b) => {
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.line - b.line;
  });

  // Emit JSON. Pretty-print on request for human inspection; default is dense
  // for token efficiency when piped into a prompt.
  const json = pretty
    ? JSON.stringify(catalog, null, 2)
    : '[\n' + catalog.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]';

  process.stdout.write(json + '\n');

  process.stderr.write(
    `catalog: ${catalog.length} blocks in ${fileCount - skippedCount} files` +
      (skippedCount > 0 ? ` (${skippedCount} skipped)` : '') +
      `\n`
  );
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n${e.stack || ''}\n`);
  process.exit(2);
});
