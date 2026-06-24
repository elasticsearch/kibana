/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CELL_MATCH_INDEX_ATTRIBUTE, HIGHLIGHT_CLASS_NAME } from './constants';
import { getActiveMatchCss } from './get_active_match_css';

describe('getActiveMatchCss', () => {
  it('styles only the active in-table search match', () => {
    const activeMatchCss = getActiveMatchCss({
      activeMatch: {
        rowIndex: 2,
        columnId: 'message',
        matchIndexWithinCell: 3,
        matchPosition: 4,
      },
      colors: {
        highlightColor: 'regular-color',
        highlightBackgroundColor: 'regular-background',
        activeHighlightColor: 'active-color',
        activeHighlightBackgroundColor: 'active-background',
        activeHighlightBorderColor: 'active-border',
      },
    });

    expect(activeMatchCss.styles).toContain(
      ".euiDataGridRowCell[data-gridcell-row-index='2'][data-gridcell-column-id='message']"
    );
    expect(activeMatchCss.styles).toContain(
      `.${HIGHLIGHT_CLASS_NAME}[${CELL_MATCH_INDEX_ATTRIBUTE}='3']`
    );
    expect(activeMatchCss.styles).toContain('color:active-color!important');
    expect(activeMatchCss.styles).toContain('background-color:active-background!important');
    expect(activeMatchCss.styles).toContain('border:2px solid active-border!important');
    expect(activeMatchCss.styles).not.toContain('regular-color');
    expect(activeMatchCss.styles).not.toContain('regular-background');
  });
});
