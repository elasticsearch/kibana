/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React, { useMemo } from 'react';
import classNames from 'classnames';
import { css, Global } from '@emotion/react';
import {
  Diff,
  useSourceExpansion,
  useMinCollapsedLines,
  parseDiff,
  tokenize,
} from 'react-diff-view';
import 'react-diff-view/style/index.css';
import type {
  RenderGutter,
  HunkData,
  TokenizeOptions,
  DiffProps,
  HunkTokens,
} from 'react-diff-view';
import unidiff from 'unidiff';
import { useEuiTheme, COLOR_MODES_STANDARD } from '@elastic/eui';
import { Hunks } from './hunks';
import { markEdits, DiffMethod } from './mark_edits';
import {
  TABLE_CLASS_NAME,
  CODE_CLASS_NAME,
  GUTTER_CLASS_NAME,
  DARK_THEME_CLASS_NAME,
  COLORS,
} from './constants';

interface UseExpandReturn {
  expandRange: (start: number, end: number) => void;
  hunks: HunkData[];
}

/**
 * @param {HunkData[]} hunks - An array of hunk objects representing changes in a section of a string. Sections normally span multiple lines.
 * @param {string} oldSource - Original string, before changes
 * @returns {UseExpandReturn} - "expandRange" is function that triggers expansion, "hunks" is an array of hunks with hidden section expanded.
 *
 * @description
 * Sections of diff without changes are hidden by default, because they are not present in the "hunks" array.
 * "useExpand" allows to show these hidden sections when user clicks on "Expand hidden <number> lines" button.
 * Calling "expandRange" basically merges two adjacent hunks into one:
 * - takes first hunk
 * - appends all the lines between the first hunk and the second hunk
 * - finally appends the second hunk
 * returned "hunks" is the resulting array of hunks with hidden section expanded.
 */
const useExpand = (hunks: HunkData[], oldSource: string): UseExpandReturn => {
  const [hunksWithSourceExpanded, expandRange] = useSourceExpansion(hunks, oldSource);
  // react-diff-view's expandCollapsedBlockBy crashes when hunks is empty but oldSource is non-empty.
  // Passing empty string triggers its early-return guard, avoiding the bug.
  const hunksWithMinLinesCollapsed = useMinCollapsedLines(
    0,
    hunksWithSourceExpanded,
    hunksWithSourceExpanded.length > 0 ? oldSource : ''
  );

  return {
    expandRange,
    hunks: hunksWithMinLinesCollapsed,
  };
};

const useTokens = (
  hunks: HunkData[],
  diffMethod: DiffMethod,
  oldSource: string
): HunkTokens | undefined => {
  if (!hunks) {
    return undefined;
  }

  const options: TokenizeOptions = {
    oldSource,
    highlight: false,
    enhancers: [
      /*
        This custom "markEdits" function is a slightly modified version of "markEdits"
        enhancer from react-diff-view with added support for word-level highlighting.
      */
      markEdits(hunks, diffMethod),
    ],
  };

  try {
    /*
      Synchronously apply all the enhancers to the hunks and return an array of tokens.
    */
    return tokenize(hunks, options);
  } catch (ex) {
    return undefined;
  }
};

const defaultRenderGutter: RenderGutter = ({ change }) => {
  /*
    Custom gutter: rendering "+" or "-" so the diff is readable by colorblind people.
  */
  if (change.type === 'insert') {
    return <span>{'+'}</span>;
  }

  if (change.type === 'delete') {
    return <span>{'-'}</span>;
  }

  return null;
};

/**
 * Converts an array of Change objects into a "unified diff" string.
 *
 * Takes an array of changes (as provided by the jsdiff library) and converts it into a "unified diff" string.
 *
 * @param {Change[]} changes - An array of changes between two strings.
 * @returns {string} A unified diff string representing the changes.
 */
const convertChangesToUnifiedDiffString = (changes: Change[]): string => {
  const unifiedDiff: string = unidiff.formatLines(changes, {
    context: 3,
  });

  return unifiedDiff;
};

const convertToDiffFile = (oldSource: string, newSource: string, zip?: boolean) => {
  /*
    "diffLines" call converts two strings of text into an array of Change objects.
  */
  const changes: Change[] = unidiff.diffLines(oldSource, newSource);

  /*
    "convertChangesToUnifiedDiffString" converts an array of Change objects into a single "unified diff" string.
    More info about the "unified diff" format: https://en.wikipedia.org/wiki/Diff#Unified_format

    Unified diff is a string with change markers added. Looks something like:
    `
      @@ -3,16 +3,15 @@
         "author": ["Elastic"],
      -  "from": "now-540s",
      +  "from": "now-9m",
         "history_window_start": "now-14d",
    `
  */
  const unifiedDiff: string = convertChangesToUnifiedDiffString(changes);

  /*
    "parseDiff" converts a unified diff string into a gitdiff-parser File object.

    File object contains some metadata and the "hunks" property - an array of Hunk objects.
    Hunks represent changed lines of code plus a few unchanged lines above and below for context.
  */
  const [diffFile] = parseDiff(unifiedDiff, {
    nearbySequences: zip ? 'zip' : undefined,
  });

  return diffFile;
};

const CustomStyles: FC<PropsWithChildren<unknown>> = ({ children }) => {
  const { euiTheme } = useEuiTheme();

  const customCss = css`
    .${CODE_CLASS_NAME}.diff-code {
      padding: 0 ${euiTheme.size.l} 0 ${euiTheme.size.m};
    }

    /* Gutter - a narrow column on the left-hand side that displays either a "+" or a "-" */
    .${TABLE_CLASS_NAME} .diff-gutter-col {
      width: ${euiTheme.size.xl};
    }

    /*
      Hide the redundant second gutter column in "unified" view.
      Hiding it with "display: none" would break the layout, so we set its width to 0 and make its content invisible.
    */
    .${TABLE_CLASS_NAME}.diff-unified .diff-gutter-col + .diff-gutter-col {
      width: 0;
    }
    .${TABLE_CLASS_NAME}.diff-unified .diff-gutter + .diff-gutter {
      visibility: hidden;
    }

    /* Vertical line separating two sides of the diff view */
    .${GUTTER_CLASS_NAME}:nth-child(3) {
      border-left: 1px solid ${euiTheme.colors.mediumShade};
    }

    .${GUTTER_CLASS_NAME}.diff-gutter-delete, .${GUTTER_CLASS_NAME}.diff-gutter-insert {
      font-weight: bold;
      text-align: center;
    }

    /* Gutter of a line with deletions */
    .${GUTTER_CLASS_NAME}.diff-gutter-delete {
      background: ${COLORS.light.gutterBackground.deletion};
    }
    .${DARK_THEME_CLASS_NAME} .${GUTTER_CLASS_NAME}.diff-gutter-delete {
      background: ${COLORS.dark.gutterBackground.deletion};
    }

    /* Gutter of a line with insertions */
    .${GUTTER_CLASS_NAME}.diff-gutter-insert {
      background: ${COLORS.light.gutterBackground.insertion};
    }
    .${DARK_THEME_CLASS_NAME} .${GUTTER_CLASS_NAME}.diff-gutter-insert {
      background: ${COLORS.dark.gutterBackground.insertion};
    }

    /* Background of a line with deletions */
    .${CODE_CLASS_NAME}.diff-code-delete {
      background: ${COLORS.light.lineBackground.deletion};
    }
    .${DARK_THEME_CLASS_NAME} .${CODE_CLASS_NAME}.diff-code-delete {
      background: ${COLORS.dark.lineBackground.deletion};
    }

    /* Background of a line with insertions */
    .${CODE_CLASS_NAME}.diff-code-insert {
      background: ${COLORS.light.lineBackground.insertion};
    }
    .${DARK_THEME_CLASS_NAME} .${CODE_CLASS_NAME}.diff-code-insert {
      background: ${COLORS.dark.lineBackground.insertion};
    }

    /* Accented background of removed characters / words */
    .${CODE_CLASS_NAME}.diff-code-delete .diff-code-edit {
      font-weight: 700;
      background: ${COLORS.light.characterBackground.deletion};
    }
    .${DARK_THEME_CLASS_NAME} .${CODE_CLASS_NAME}.diff-code-delete .diff-code-edit {
      background: ${COLORS.dark.characterBackground.deletion};
    }

    /* Accented background of inserted characters / words */
    .${CODE_CLASS_NAME}.diff-code-insert .diff-code-edit {
      font-weight: 700;
      background: ${COLORS.light.characterBackground.insertion};
    }
    .${DARK_THEME_CLASS_NAME} .${CODE_CLASS_NAME}.diff-code-insert .diff-code-edit {
      background: ${COLORS.dark.characterBackground.insertion};
    }
  `;

  return (
    <>
      <Global styles={customCss} />
      {children}
    </>
  );
};

export interface DiffViewProps extends Partial<DiffProps> {
  oldSource: string;
  newSource: string;
  diffMethod?: DiffMethod;
  viewType?: 'split' | 'unified';
  /*
    When "zip" is set to true, the change lines will be rendered in an interlaced style.
    For an example, refer to:
    https://github.com/otakustay/react-diff-view/blob/8a2dbdf97af0890aff6e563ed435e7da13c5e7b1/README.md#parse-diff-text
  */
  zip?: boolean;
  renderGutter?: RenderGutter;
  'data-test-subj'?: string;
}

export const DiffView = ({
  oldSource,
  newSource,
  diffMethod = DiffMethod.WORDS_WITH_SPACE,
  viewType = 'split',
  zip = false,
  'data-test-subj': dataTestSubj,
  renderGutter,
}: DiffViewProps) => {
  /*
    "react-diff-view" components consume diffs not as a strings, but as something they call "hunks".
    So we first need to convert our "before" and "after" strings into these "hunk" objects.
    "hunks" describe changed sections of code plus a few unchanged lines above and below for context.
  */

  /*
    "diffFile" is essentially an object containing an array of hunks plus some metadata.
  */
  const diffFile = useMemo(
    () => convertToDiffFile(oldSource, newSource, zip),
    [oldSource, newSource, zip]
  );

  /*
    Sections of diff without changes are hidden by default, because they are not present in the "hunks" array.
    "useExpand" allows to show these hidden sections when a user clicks on "Expand hidden <number> lines" button.
  */
  const { expandRange, hunks } = useExpand(diffFile.hunks, oldSource);

  /*
    Go over each hunk and extract tokens from it. For example, split strings into words or characters,
    so we can highlight them later.
  */
  const tokens = useTokens(hunks, diffMethod, oldSource);

  const { colorMode } = useEuiTheme();

  const tableClassName = classNames(TABLE_CLASS_NAME, {
    [DARK_THEME_CLASS_NAME]: colorMode === COLOR_MODES_STANDARD.dark,
  });

  return (
    <CustomStyles>
      <div data-test-subj={dataTestSubj}>
        <Diff
          /*
          "diffType": can be either 'add', 'delete', 'modify', 'rename' or 'copy'.
          Passing 'add' or 'delete' would skip rendering one of the sides in split view.
        */
          diffType={diffFile.type}
          viewType={viewType}
          hunks={hunks}
          renderGutter={renderGutter ?? defaultRenderGutter}
          tokens={tokens}
          className={tableClassName}
          gutterClassName={GUTTER_CLASS_NAME}
          codeClassName={CODE_CLASS_NAME}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-shadow */}
          {(hunks) => <Hunks hunks={hunks} oldSource={oldSource} expandRange={expandRange} />}
        </Diff>
      </div>
    </CustomStyles>
  );
};
