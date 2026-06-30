/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/** Parse and merge `| EVAL` snippets from integration evaluation constants. */

export interface CaseBranch {
  readonly condition: string;
  readonly value: string;
}

export interface ParsedAssignment {
  readonly column: string;
  readonly hasPreserve: boolean;
  readonly branches: readonly CaseBranch[];
  readonly defaultValue: string;
}

const PRESERVE_RE = /^\S+\s+IS NOT NULL$/;

export function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: '"' | "'" | null = null;
  let start = 0;

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
    } else if (c === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail.length > 0) {
    parts.push(tail);
  }
  return parts;
}

function findMatchingParen(input: string, openIdx: number): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;

  for (let i = openIdx; i < input.length; i++) {
    const c = input[i]!;
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inString = c;
      continue;
    }
    if (c === '(') {
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }

  throw new Error(`Unbalanced parentheses near: ${input.slice(openIdx, openIdx + 40)}`);
}

export function splitEvalAssignments(evalBody: string): { column: string; caseExpr: string }[] {
  const body = evalBody.replace(/^\|\s*EVAL\s*\n?/, '').trim();
  const assignments: { column: string; caseExpr: string }[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    while (cursor < body.length && /[\s,]/.test(body[cursor]!)) {
      cursor++;
    }
    if (cursor >= body.length) {
      break;
    }

    const caseMarker = body.indexOf(' = CASE(', cursor);
    if (caseMarker === -1) {
      break;
    }

    const column = body.slice(cursor, caseMarker).trim();
    const openParen = caseMarker + ' = CASE('.length - 1;
    const closeParen = findMatchingParen(body, openParen);
    const caseExpr = body.slice(caseMarker + ' = '.length, closeParen + 1).trim();
    assignments.push({ column, caseExpr });
    cursor = closeParen + 1;
  }

  return assignments;
}

export function parseCaseExpression(column: string, caseExpr: string): ParsedAssignment {
  if (!caseExpr.startsWith('CASE(') || !caseExpr.endsWith(')')) {
    throw new Error(`Expected CASE(...) for column ${column}`);
  }

  const args = splitTopLevel(caseExpr.slice(5, -1));
  let index = 0;
  let hasPreserve = false;

  if (args.length >= 2 && PRESERVE_RE.test(args[0]!) && args[1]!.trim() === column) {
    hasPreserve = true;
    index = 2;
  }

  const tail = args.slice(index);
  let defaultValue = 'null';
  let branchArgs = tail;

  if (tail.length % 2 === 1) {
    defaultValue = tail[tail.length - 1]!.trim();
    branchArgs = tail.slice(0, -1);
  }

  const branches: CaseBranch[] = [];
  for (let i = 0; i < branchArgs.length; i += 2) {
    branches.push({
      condition: branchArgs[i]!.trim(),
      value: branchArgs[i + 1]!.trim(),
    });
  }

  return { column, hasPreserve, branches, defaultValue };
}

export function parseEvalSnippet(esql: string): ParsedAssignment[] {
  return splitEvalAssignments(esql).map(({ column, caseExpr }) =>
    parseCaseExpression(column, caseExpr)
  );
}

export function mergeAssignments(
  left: ParsedAssignment,
  right: ParsedAssignment
): ParsedAssignment {
  if (left.column !== right.column) {
    throw new Error(`Column mismatch: ${left.column} vs ${right.column}`);
  }

  const seen = new Set<string>();
  const branches: CaseBranch[] = [];

  for (const branch of [...left.branches, ...right.branches]) {
    const key = `${branch.condition}\0${branch.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    branches.push(branch);
  }

  return {
    column: left.column,
    hasPreserve: left.hasPreserve || right.hasPreserve,
    branches,
    defaultValue: left.defaultValue || right.defaultValue || 'null',
  };
}

export function formatCaseAssignment(assignment: ParsedAssignment): string {
  const parts: string[] = [];

  if (assignment.hasPreserve) {
    parts.push(`${assignment.column} IS NOT NULL`, assignment.column);
  }

  for (const branch of assignment.branches) {
    parts.push(branch.condition, branch.value);
  }

  parts.push(assignment.defaultValue);

  const lines = parts.map((part, idx) => {
    const suffix = idx < parts.length - 1 ? ',' : '';
    return `    ${part}${suffix}`;
  });

  return `  ${assignment.column} = CASE(\n${lines.join('\n')}\n  )`;
}
