/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { hardlineWithoutBreakParent } from './builders';
import { propagateBreaks } from './prepare';
import type { Doc, FillNode } from './types';

enum Mode {
  Flat,
  Break,
}

class Indent {
  constructor(
    /** Total number of characters this indent occupies. */
    public readonly length: number,
    /** The actual whitespace string to emit. */
    public readonly value: string,
    /** Root indent level saved by `markAsRoot`, used by `literalline`. */
    public readonly root?: Indent
  ) {}
}

const makeIndent = (current: Indent, options: { tabWidth: number; useTabs: boolean }): Indent => {
  const added = options.useTabs ? '\t' : ' '.repeat(options.tabWidth);
  return new Indent(current.length + options.tabWidth, current.value + added, current.root);
};

const makeAlign = (current: Indent, n: number | { type: 'root' }): Indent => {
  if (typeof n === 'object' && n.type === 'root') {
    return new Indent(current.length, current.value, current);
  }

  if (n === Number.NEGATIVE_INFINITY) {
    return current.root ?? new Indent(0, '');
  }

  if (typeof n === 'number' && n < 0) {
    return new Indent(
      Math.max(0, current.length + n),
      current.value.slice(0, Math.max(0, current.value.length + n)),
      current.root
    );
  }

  return new Indent(
    current.length + (n as number),
    current.value + ' '.repeat(n as number),
    current.root
  );
};

interface Command {
  readonly indent: Indent;
  readonly mode: Mode;
  readonly doc: Doc;
}

const cmd = (indent: Indent, mode: Mode, doc: Doc): Command => ({ indent, mode, doc });

/**
 * Simulates flat-mode rendering to check whether a group's contents fit
 * within the remaining line width. Does not produce output — only measures.
 */
const fits = (
  next: Command,
  restCommands: readonly Command[],
  remainingWidth: number,
  hasLineSuffix: boolean,
  groupModeMap: Record<symbol, Mode>
): boolean => {
  if (remainingWidth === Infinity) return true;

  let restIdx = restCommands.length;
  let width = remainingWidth;
  const stack: Command[] = [next];

  while (width >= 0) {
    if (stack.length === 0) {
      if (restIdx === 0) return true;
      stack.push(restCommands[--restIdx]);
      continue;
    }

    const { indent, mode, doc } = stack.pop()!;

    if (typeof doc === 'string') {
      if (doc) width -= stringWidth(doc);
      continue;
    }

    if (Array.isArray(doc)) {
      for (let i = doc.length - 1; i >= 0; i--) {
        stack.push(cmd(indent, mode, doc[i]));
      }
      continue;
    }

    switch (doc.type) {
      case 'indent':
      case 'align':
      case 'label':
        stack.push(cmd(indent, mode, doc.contents));
        break;

      case 'group': {
        const groupMode = doc.shouldBreak ? Mode.Break : mode;
        stack.push(cmd(indent, groupMode, doc.contents));
        break;
      }

      case 'fill':
        for (let i = doc.parts.length - 1; i >= 0; i--) {
          stack.push(cmd(indent, mode, doc.parts[i]));
        }
        break;

      case 'if-break': {
        const groupMode = doc.groupId ? groupModeMap[doc.groupId] ?? Mode.Flat : mode;
        const contents = groupMode === Mode.Break ? doc.breakContents : doc.flatContents;
        if (contents) stack.push(cmd(indent, mode, contents));
        break;
      }

      case 'indent-if-break':
        stack.push(cmd(indent, mode, doc.contents));
        break;

      case 'line':
        if (mode === Mode.Break || doc.hard) return true;
        if (!doc.soft) width -= 1;
        break;

      case 'line-suffix':
        hasLineSuffix = true;
        break;

      case 'line-suffix-boundary':
        if (hasLineSuffix) return false;
        break;

      case 'trim':
      case 'cursor':
      case 'break-parent':
        break;
    }
  }

  return false;
};

const layoutFill = (
  parts: Doc[],
  indentVal: Indent,
  mode: Mode,
  commands: Command[],
  printWidth: number,
  position: number,
  lineSuffixBuffer: Command[],
  groupModeMap: Record<symbol, Mode>
): void => {
  const length = parts.length;
  if (length === 0) return;

  const content = parts[0];
  const whitespace = parts[1];

  const contentFlatCmd = cmd(indentVal, Mode.Flat, content);
  const contentBreakCmd = cmd(indentVal, Mode.Break, content);
  const remaining = printWidth - position;
  const hasLS = lineSuffixBuffer.length > 0;

  const contentFits = fits(contentFlatCmd, [], remaining, hasLS, groupModeMap);

  if (length === 1) {
    commands.push(contentFits ? contentFlatCmd : contentBreakCmd);
    return;
  }

  const whitespaceFlatCmd = cmd(indentVal, Mode.Flat, whitespace);
  const whitespaceBreakCmd = cmd(indentVal, Mode.Break, whitespace);

  if (length === 2) {
    commands.push(
      contentFits ? whitespaceFlatCmd : whitespaceBreakCmd,
      contentFits ? contentFlatCmd : contentBreakCmd
    );
    return;
  }

  const restCmd = cmd(indentVal, mode, { type: 'fill', parts: parts.slice(2) } as FillNode);

  const secondContent = parts[2];
  const bothFitFlat = fits(
    cmd(indentVal, Mode.Flat, [content, whitespace, secondContent]),
    [],
    remaining,
    hasLS,
    groupModeMap
  );

  commands.push(restCmd);

  if (bothFitFlat) {
    commands.push(whitespaceFlatCmd, contentFlatCmd);
  } else if (contentFits) {
    commands.push(whitespaceBreakCmd, contentFlatCmd);
  } else {
    commands.push(whitespaceBreakCmd, contentBreakCmd);
  }
};

const CURSOR_PLACEHOLDER = Symbol.for('cursor');

interface LayoutInternalOpts {
  readonly printWidth: number;
  readonly tabWidth: number;
  readonly useTabs: boolean;
  readonly endOfLine: string;
}

const resolveOptions = (opts?: LayoutOpts): LayoutInternalOpts => ({
  printWidth: opts?.printWidth ?? 80,
  tabWidth: opts?.tabWidth ?? 2,
  useTabs: opts?.useTabs ?? false,
  endOfLine: opts?.endOfLine ?? '\n',
});

const stringWidth = (s: string): number => s.length;

// ----------------------------------------------------------------- Public API

/**
 * Options accepted by the public API. All fields are optional with defaults.
 */
export interface LayoutOpts {
  /**
   * Maximum line width before the engine attempts to break groups.
   * @default 80
   */
  printWidth?: number;

  /**
   * Number of spaces per indentation level.
   * @default 2
   */
  tabWidth?: number;

  /**
   * Use tab characters for indentation instead of spaces.
   * @default false
   */
  useTabs?: boolean;

  /**
   * End-of-line character(s).
   * @default '\n'
   */
  endOfLine?: '\n' | '\r\n' | '\r';
}

/**
 * The layout algorithm. Takes a pretty-print doc tree and options, and produces
 * a concrete string with optimal line breaks.
 */
export const layout = (doc: Doc, opts?: LayoutOpts): string => {
  const options = resolveOptions(opts);
  const { printWidth, endOfLine } = options;
  const rootIndent = new Indent(0, '');

  const groupModeMap: Record<symbol, Mode> = Object.create(null);

  let output = '';
  let position = 0;
  let shouldRemeasure = false;

  const commands: Command[] = [cmd(rootIndent, Mode.Break, doc)];
  const lineSuffixBuffer: Command[] = [];

  propagateBreaks(doc);

  while (commands.length > 0) {
    const { indent: indentVal, mode, doc: currentDoc } = commands.pop()!;

    if (typeof currentDoc === 'string') {
      if (currentDoc) {
        output += currentDoc;
        position += stringWidth(currentDoc);
      }
      continue;
    }

    if (Array.isArray(currentDoc)) {
      for (let i = currentDoc.length - 1; i >= 0; i--) {
        commands.push(cmd(indentVal, mode, currentDoc[i]));
      }
      continue;
    }

    switch (currentDoc.type) {
      case 'indent':
        commands.push(cmd(makeIndent(indentVal, options), mode, currentDoc.contents));
        break;

      case 'align':
        commands.push(cmd(makeAlign(indentVal, currentDoc.n), mode, currentDoc.contents));
        break;

      case 'group': {
        if (mode === Mode.Flat && !shouldRemeasure) {
          commands.push(
            cmd(indentVal, currentDoc.shouldBreak ? Mode.Break : Mode.Flat, currentDoc.contents)
          );
        } else if (!currentDoc.expandedStates) {
          shouldRemeasure = false;
          const groupMode =
            currentDoc.shouldBreak ||
            !fits(
              cmd(indentVal, Mode.Flat, currentDoc.contents),
              commands,
              printWidth - position,
              lineSuffixBuffer.length > 0,
              groupModeMap
            )
              ? Mode.Break
              : Mode.Flat;

          commands.push(cmd(indentVal, groupMode, currentDoc.contents));

          if (currentDoc.id) {
            groupModeMap[currentDoc.id] = groupMode;
          }
        } else {
          shouldRemeasure = false;
          const remaining = printWidth - position;
          const hasLS = lineSuffixBuffer.length > 0;

          if (
            fits(
              cmd(indentVal, Mode.Flat, currentDoc.contents),
              commands,
              remaining,
              hasLS,
              groupModeMap
            )
          ) {
            commands.push(cmd(indentVal, Mode.Flat, currentDoc.contents));
          } else {
            let matched = false;
            for (const state of currentDoc.expandedStates) {
              if (state === currentDoc.expandedStates[currentDoc.expandedStates.length - 1]) {
                commands.push(cmd(indentVal, Mode.Break, state));
                matched = true;
                break;
              }
              if (
                fits(cmd(indentVal, Mode.Flat, state), commands, remaining, hasLS, groupModeMap)
              ) {
                commands.push(cmd(indentVal, Mode.Flat, state));
                matched = true;
                break;
              }
            }
            if (!matched) {
              commands.push(cmd(indentVal, Mode.Break, currentDoc.contents));
            }
          }

          if (currentDoc.id) {
            groupModeMap[currentDoc.id] = commands[commands.length - 1].mode;
          }
        }
        break;
      }

      case 'fill':
        layoutFill(
          currentDoc.parts,
          indentVal,
          mode,
          commands,
          printWidth,
          position,
          lineSuffixBuffer,
          groupModeMap
        );
        break;

      case 'if-break': {
        const groupMode = currentDoc.groupId ? groupModeMap[currentDoc.groupId] ?? Mode.Flat : mode;
        const contents =
          groupMode === Mode.Break ? currentDoc.breakContents : currentDoc.flatContents;
        if (contents) {
          commands.push(cmd(indentVal, mode, contents));
        }
        break;
      }

      case 'indent-if-break': {
        const refMode = groupModeMap[currentDoc.groupId] ?? Mode.Flat;
        const shouldApplyIndent = currentDoc.negate
          ? refMode === Mode.Flat
          : refMode === Mode.Break;
        commands.push(
          cmd(
            shouldApplyIndent ? makeIndent(indentVal, options) : indentVal,
            mode,
            currentDoc.contents
          )
        );
        break;
      }

      case 'cursor':
        output += CURSOR_PLACEHOLDER.toString();
        break;

      case 'line-suffix':
        lineSuffixBuffer.push(cmd(indentVal, mode, currentDoc.contents));
        break;

      case 'line-suffix-boundary':
        if (lineSuffixBuffer.length > 0) {
          commands.push(cmd(indentVal, mode, hardlineWithoutBreakParent));
        }
        break;

      case 'line':
        switch (mode) {
          case Mode.Flat:
            if (currentDoc.hard) {
              shouldRemeasure = true;
            } else {
              if (!currentDoc.soft) {
                output += ' ';
                position += 1;
              }
              break;
            }
          // falls through (hardline in flat mode)

          case Mode.Break:
            if (lineSuffixBuffer.length > 0) {
              commands.push(cmd(indentVal, mode, currentDoc));
              commands.push(...lineSuffixBuffer.reverse());
              lineSuffixBuffer.length = 0;
              break;
            }
            if (currentDoc.literal) {
              output += endOfLine;
              if (indentVal.root) {
                output += indentVal.root.value;
                position = indentVal.root.length;
              } else {
                position = 0;
              }
            } else {
              output += endOfLine + indentVal.value;
              position = indentVal.length;
            }
            break;
        }
        break;

      case 'label':
        commands.push(cmd(indentVal, mode, currentDoc.contents));
        break;

      case 'trim': {
        let trimmed = 0;
        while (output.length > 0 && output[output.length - 1] === ' ') {
          output = output.slice(0, -1);
          trimmed++;
        }
        position -= trimmed;
        break;
      }

      case 'break-parent':
        break;
    }

    if (commands.length === 0 && lineSuffixBuffer.length > 0) {
      commands.push(...lineSuffixBuffer.reverse());
      lineSuffixBuffer.length = 0;
    }
  }

  return output;
};
