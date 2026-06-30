#!/usr/bin/env node
/*
 * test-tracer / extract_test_block.mjs
 *
 * Given a file path + a verbatim block name (and optional line for
 * disambiguation), print the slice of the source from the opening `{` of the
 * block to its matching `}`, inclusive of both braces.
 *
 * Contract is defined in:
 *   x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer/SKILL.md  §Phase 7 (v2)
 *   x-pack/solutions/security/plugins/security_solution/.agents/skills/test-tracer/scripts/_parser.mjs  (parser semantics)
 *
 * This script is consumed by Phase 7 quality-judgment prompts. It exists
 * specifically so the LLM never has to Read a whole test file — bounded slice
 * is the only way to keep token cost in check on large Scout/FTR test files.
 *
 * Output (stdout):
 *   The exact source slice, including leading whitespace on the opening line.
 *   A trailing newline is added.
 *
 * Errors:
 *   1  usage error
 *   2  I/O error reading the file
 *   3  block name not found
 *   4  ambiguous match (multiple blocks share the name and no --line was given)
 */

import { promises as fs } from 'node:fs';

import { parseFileContent, detectFramework } from './_parser.mjs';

function parseArgs(argv) {
  let file = null;
  let block = null;
  let line = null;
  let withHeader = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') file = argv[++i];
    else if (a === '--block') block = argv[++i];
    else if (a === '--line') line = parseInt(argv[++i], 10);
    else if (a === '--no-header') withHeader = false;
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      usageError(`Unknown argument: ${a}`);
    }
  }

  if (!file) usageError('--file is required');
  if (!block) usageError('--block is required (verbatim block name from catalog)');
  if (line !== null && (!Number.isInteger(line) || line < 1)) {
    usageError('--line must be a positive integer');
  }
  return { file, block, line, withHeader };
}

function usageError(msg) {
  process.stderr.write(`error: ${msg}\n`);
  printHelp();
  process.exit(1);
}

function printHelp() {
  process.stderr.write(`
extract_test_block.mjs — slice a single test block's source from a file

USAGE:
  node extract_test_block.mjs --file <path> --block <name> [--line <n>] [--no-header]

OPTIONS:
  --file <path>     Path to the test file. Required.
  --block <name>    Verbatim block name (must match catalog output exactly). Required.
  --line <n>        Disambiguate when --block appears multiple times in the file. Optional.
  --no-header       Suppress the leading comment showing path:line. Default: header on.

OUTPUT:
  The source slice from the opening { of the matched block to its matching }.
  A header comment '// <path>:<line>  <kind>("<blockName>")' is prepended by default.

EXIT CODES:
  0  success
  1  usage error
  2  I/O error
  3  block name not found
  4  ambiguous match (multiple blocks share the name; pass --line to resolve)
`);
}

async function main() {
  const { file, block, line, withHeader } = parseArgs(process.argv.slice(2));

  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (e) {
    process.stderr.write(`error: cannot read file: ${file} — ${e.message}\n`);
    process.exit(2);
  }

  let blocks;
  try {
    const framework = detectFramework(file, content);
    blocks = parseFileContent(content, framework);
  } catch (e) {
    process.stderr.write(`error: parse failed for ${file} — ${e.message}\n`);
    process.exit(2);
  }

  // Exact-match the requested block name. The contract in SKILL.md is that
  // the model must quote the catalog's `blockName` verbatim, so we do
  // strict equality. No fuzzy match, no case folding, no whitespace
  // normalization — that would defeat the anti-hallucination gate.
  let candidates = blocks.filter((b) => b.blockName === block);

  if (candidates.length === 0) {
    process.stderr.write(
      `error: block name not found in ${file}\n` +
        `       requested: ${JSON.stringify(block)}\n` +
        `       (this is the anti-hallucination gate firing — the model claimed a block that does not exist)\n`
    );
    process.exit(3);
  }

  if (candidates.length > 1) {
    if (line === null) {
      process.stderr.write(
        `error: ambiguous match: ${candidates.length} blocks named ${JSON.stringify(block)} in ${file}\n` +
          `       lines: ${candidates.map((c) => c.line).join(', ')}\n` +
          `       pass --line <n> to disambiguate\n`
      );
      process.exit(4);
    }
    candidates = candidates.filter((b) => b.line === line);
    if (candidates.length === 0) {
      process.stderr.write(
        `error: no block named ${JSON.stringify(block)} at line ${line} in ${file}\n`
      );
      process.exit(3);
    }
  }

  const b = candidates[0];
  const slice = content.slice(b._openBrace, b._closeBrace + 1);

  if (withHeader) {
    process.stdout.write(
      `// ${file}:${b.line}  ${b._kind}(${JSON.stringify(b.blockName)})\n`
    );
  }
  process.stdout.write(slice);
  if (!slice.endsWith('\n')) process.stdout.write('\n');
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e.message}\n${e.stack || ''}\n`);
  process.exit(2);
});
