/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { monaco } from '@kbn/monaco';
import YAML, { LineCounter } from 'yaml';
import { createRuleDataSchema } from '@kbn/alerting-v2-schemas';
import type { CompletionContext } from './types';
import { findYamlQueryContext } from './query_context';

/**
 * Get existing keys from YAML text at a given indent level
 */
export const getExistingYamlKeys = (text: string, parentPath: string[]): Set<string> => {
  const keys = new Set<string>();
  const lines = text.split('\n');

  if (parentPath.length === 0) {
    for (const line of lines) {
      const match = /^([A-Za-z0-9_]+)\s*:/.exec(line);
      if (match) {
        keys.add(match[1]);
      }
    }
  } else {
    let parentIndent = -1;
    let inParent = false;

    for (const line of lines) {
      const keyMatch = /^(\s*)([A-Za-z0-9_]+)\s*:/.exec(line);

      if (keyMatch) {
        const key = keyMatch[2];
        const keyIndent = keyMatch[1].length;

        if (!inParent && key === parentPath[parentPath.length - 1] && keyIndent === 0) {
          inParent = true;
          parentIndent = keyIndent;
          continue;
        }

        if (inParent) {
          if (keyIndent <= parentIndent && line.trim() !== '') {
            break;
          }
          if (keyIndent === parentIndent + 2) {
            keys.add(key);
          }
        }
      }
    }
  }

  return keys;
};

/**
 * Get completion context for YAML editing at a given position
 */
export const getCompletionContext = (
  text: string,
  position: monaco.Position
): CompletionContext | null => {
  const lines = text.split('\n');
  const lineIndex = Math.max(0, position.lineNumber - 1);
  const line = lines[lineIndex] ?? '';
  const indent = line.match(/^\s*/)?.[0].length ?? 0;
  const keyMatch = /^(\s*)([A-Za-z0-9_]+)\s*:(.*)$/.exec(line);

  if (keyMatch) {
    const keyIndent = keyMatch[1].length;
    const key = keyMatch[2];
    const hasValue = keyMatch[3].trim().length > 0;
    const isValuePosition = hasValue || position.column > keyMatch[0].indexOf(':') + 1;
    const parentPath = keyIndent === 0 ? [] : getYamlPathAtPosition(text, position)?.slice(0, -1);
    return {
      parentPath: parentPath ?? [],
      currentKey: key,
      isValuePosition,
    };
  }

  if (indent === 0) {
    return { parentPath: [], currentKey: null, isValuePosition: false };
  }

  for (let i = lineIndex - 1; i >= 0; i--) {
    const match = /^(\s*)([A-Za-z0-9_]+)\s*:/.exec(lines[i]);
    if (!match) {
      continue;
    }
    const parentIndent = match[1].length;
    if (parentIndent < indent) {
      return { parentPath: [match[2]], currentKey: null, isValuePosition: false };
    }
  }

  return { parentPath: [], currentKey: null, isValuePosition: false };
};

/**
 * Find a YAML node for a given path in a parsed YAML document
 */
export const findYamlNodeForPath = (doc: YAML.Document, path: Array<string | number>) => {
  let node: YAML.Node | null | undefined = doc.contents;
  let lastPair: YAML.Pair<YAML.Node, YAML.Node> | null = null;

  for (const segment of path) {
    if (YAML.isMap(node)) {
      const pair = node.items.find(
        (item) => YAML.isScalar(item.key) && item.key.value === segment
      ) as YAML.Pair<YAML.Node, YAML.Node> | undefined;
      if (!pair) {
        return { node: null, pair: null };
      }
      lastPair = pair;
      node = pair.value;
      continue;
    }

    if (YAML.isSeq(node) && typeof segment === 'number') {
      const nextNode = node.items[segment] as YAML.Node | undefined;
      if (!nextNode) {
        return { node: null, pair: null };
      }
      node = nextNode;
      continue;
    }

    return { node: null, pair: null };
  }

  return { node, pair: lastPair };
};

/**
 * Convert YAML line position to Monaco position
 */
export const toMonacoPosition = (linePos: { line: number; col: number }) => {
  return {
    lineNumber: linePos.line > 0 ? linePos.line : 1,
    column: linePos.col > 0 ? linePos.col : 1,
  };
};

/**
 * Get Monaco range from YAML offsets
 */
export const getRangeFromOffsets = (lineCounter: LineCounter, start: number, end: number) => {
  const startPos = toMonacoPosition(lineCounter.linePos(start));
  const endPos = toMonacoPosition(lineCounter.linePos(end));
  return new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);
};

/**
 * Build validation markers for YAML content in Monaco editor
 */
export const buildYamlValidationMarkers = (model: monaco.editor.ITextModel): number => {
  const text = model.getValue();
  const lineCounter = new LineCounter();
  const doc = YAML.parseDocument(text, { lineCounter });
  const markers: monaco.editor.IMarkerData[] = [];

  for (const error of doc.errors) {
    const [start, end] = error.pos ?? [0, 0];
    const range = getRangeFromOffsets(lineCounter, start, Math.max(end, start + 1));
    markers.push({
      message: error.message,
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: range.startLineNumber,
      startColumn: range.startColumn,
      endLineNumber: range.endLineNumber,
      endColumn: range.endColumn,
    });
  }

  if (doc.errors.length === 0) {
    const parsed = createRuleDataSchema.safeParse(doc.toJS());
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path as Array<string | number>;
        const { node, pair } = findYamlNodeForPath(doc, path);
        const rangeSource = pair?.key ?? node;
        const range = rangeSource?.range
          ? getRangeFromOffsets(lineCounter, rangeSource.range[0], rangeSource.range[1])
          : getRangeFromOffsets(lineCounter, 0, 1);
        markers.push({
          message: issue.message,
          severity: monaco.MarkerSeverity.Error,
          startLineNumber: range.startLineNumber,
          startColumn: range.startColumn,
          endLineNumber: range.endLineNumber,
          endColumn: range.endColumn,
        });
      }
    }
  }

  monaco.editor.setModelMarkers(model, 'alertingV2YamlSchema', markers);
  return markers.length;
};

/**
 * Get the YAML path at a given position in the text
 *
 * @param text - The full YAML text
 * @param position - The Monaco position
 * @param esqlPropertyNames - Property names that should be treated as ES|QL queries
 */
export const getYamlPathAtPosition = (
  text: string,
  position: monaco.Position,
  esqlPropertyNames?: string[]
): string[] | null => {
  const lines = text.split('\n');
  const lineIndex = Math.max(0, position.lineNumber - 1);
  const line = lines[lineIndex] ?? '';
  const indent = line.match(/^\s*/)?.[0].length ?? 0;
  const keyMatch = /^\s*([A-Za-z0-9_]+)\s*:/.exec(line);

  if (keyMatch) {
    const key = keyMatch[1];
    if (indent === 0) {
      return [key];
    }
    for (let i = lineIndex - 1; i >= 0; i--) {
      const parentLine = lines[i];
      const parentMatch = /^(\s*)([A-Za-z0-9_]+)\s*:/.exec(parentLine);
      if (!parentMatch) {
        continue;
      }
      const parentIndent = parentMatch[1].length;
      if (parentIndent < indent) {
        return [parentMatch[2], key];
      }
    }
    return [key];
  }

  const cursorOffset = lines.slice(0, lineIndex).reduce((acc, curr) => acc + curr.length + 1, 0);
  const queryContext = findYamlQueryContext(
    text,
    cursorOffset + position.column - 1,
    esqlPropertyNames
  );
  if (queryContext) {
    return [queryContext.propertyName];
  }

  for (let i = lineIndex - 1; i >= 0; i--) {
    const parentLine = lines[i];
    const parentMatch = /^(\s*)([A-Za-z0-9_]+)\s*:/.exec(parentLine);
    if (!parentMatch) {
      continue;
    }
    const parentIndent = parentMatch[1].length;
    if (parentIndent < indent) {
      return [parentMatch[2]];
    }
  }

  return null;
};
