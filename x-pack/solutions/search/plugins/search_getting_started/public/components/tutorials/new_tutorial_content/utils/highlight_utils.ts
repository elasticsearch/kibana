/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Given a pretty-printed JSON string and a set of dot-bracket paths (from valuesToSave),
 * returns the line numbers where those terminal values reside, formatted for
 * EuiCodeBlock's lineNumbers.highlight (e.g. "3, 7, 12").
 */
export const getResponseHighlightLines = (
  jsonString: string,
  responsePaths: Record<string, string>
): string => {
  const lines = jsonString.split('\n');
  const pathValues = Object.values(responsePaths);
  if (pathValues.length === 0) return '';

  const highlightLineNumbers: number[] = [];

  for (const responsePath of pathValues) {
    const terminalKey = getTerminalKey(responsePath);
    if (!terminalKey) continue;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const keyPattern = new RegExp(`"${escapeRegExp(terminalKey)}"\\s*:`);
      if (keyPattern.test(line)) {
        highlightLineNumbers.push(i + 1);
      }
    }
  }

  const unique = [...new Set(highlightLineNumbers)].sort((a, b) => a - b);
  return unique.join(', ');
};

/**
 * Extracts the terminal key name from a dot-bracket path.
 * e.g. "hits.total.value" -> "value", "hits.hits[0]._source.title" -> "title"
 */
const getTerminalKey = (responsePath: string): string | null => {
  const normalized = responsePath.replace(/\[\d+]/g, '');
  const segments = normalized.split('.');
  return segments[segments.length - 1] || null;
};

/**
 * Given an API snippet string and an array of JSON paths, returns a highlight
 * string for EuiCodeBlock's lineNumbers.highlight.
 *
 * Walks the snippet body (everything after the HTTP method line) and locates
 * the line ranges matching each JSON path. For object/array values, includes
 * all lines from opening to closing brace/bracket.
 */
export const getSnippetHighlightLines = (apiSnippet: string, jsonPaths: string[]): string => {
  if (jsonPaths.length === 0) return '';

  const lines = apiSnippet.split('\n');
  const bodyStartIndex = 1;
  const highlightRanges: number[] = [];

  for (const jsonPath of jsonPaths) {
    const segments = jsonPath.split('.');
    const matchedLines = findJsonPathLines(lines, bodyStartIndex, segments);
    highlightRanges.push(...matchedLines);
  }

  const unique = [...new Set(highlightRanges)].sort((a, b) => a - b);
  return collapseToRanges(unique);
};

/**
 * Walks lines starting from startIdx looking for nested JSON keys matching
 * the given path segments. Returns 1-based line numbers for the matched block.
 */
const findJsonPathLines = (lines: string[], startIdx: number, segments: string[]): number[] => {
  let searchStart = startIdx;

  for (let segIdx = 0; segIdx < segments.length; segIdx++) {
    const segment = segments[segIdx];
    const isLast = segIdx === segments.length - 1;
    let found = false;

    for (let i = searchStart; i < lines.length; i++) {
      const keyPattern = new RegExp(`"${escapeRegExp(segment)}"\\s*:`);
      if (keyPattern.test(lines[i])) {
        if (isLast) {
          return getBlockLines(lines, i);
        }
        searchStart = i + 1;
        found = true;
        break;
      }
    }

    if (!found) return [];
  }

  return [];
};

/**
 * Starting from a matched key line, determines the full block extent.
 * If the value is an object/array, includes lines through the matching
 * closing brace/bracket. Returns 1-based line numbers.
 */
const getBlockLines = (lines: string[], keyLineIdx: number): number[] => {
  const line = lines[keyLineIdx];
  const result: number[] = [keyLineIdx + 1];

  const openBrace = (line.match(/{/g) || []).length;
  const closeBrace = (line.match(/}/g) || []).length;
  const openBracket = (line.match(/\[/g) || []).length;
  const closeBracket = (line.match(/]/g) || []).length;

  let braceDepth = openBrace - closeBrace;
  let bracketDepth = openBracket - closeBracket;

  if (braceDepth <= 0 && bracketDepth <= 0) {
    return result;
  }

  for (let i = keyLineIdx + 1; i < lines.length; i++) {
    result.push(i + 1);
    const l = lines[i];
    braceDepth += (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
    bracketDepth += (l.match(/\[/g) || []).length - (l.match(/]/g) || []).length;

    if (braceDepth <= 0 && bracketDepth <= 0) {
      break;
    }
  }

  return result;
};

/**
 * Collapses sorted line numbers into range strings for EuiCodeBlock.
 * e.g. [1, 2, 3, 5, 7, 8] -> "1-3, 5, 7-8"
 */
const collapseToRanges = (sorted: number[]): string => {
  if (sorted.length === 0) return '';

  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);

  return ranges.join(', ');
};

const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
