/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { renderCustomToolbar, getRenderCustomToolbarWithElements } from './render_custom_toolbar';

describe('renderCustomToolbar', () => {
  it('should render successfully', () => {
    expect(
      renderCustomToolbar({
        toolbarProps: {
          hasRoomForGridControls: true,
          columnControl: 'column',
          columnSortingControl: 'columnSorting',
          displayControl: 'display',
          fullScreenControl: 'fullScreen',
          keyboardShortcutsControl: 'keyboard',
        },
        gridProps: { additionalControls: 'additional' },
      })
    ).toMatchSnapshot();
  });

  it('should render correctly for smaller screens', () => {
    expect(
      renderCustomToolbar({
        toolbarProps: {
          hasRoomForGridControls: false,
          columnControl: 'column',
          columnSortingControl: 'columnSorting',
          displayControl: 'display',
          fullScreenControl: 'fullScreen',
          keyboardShortcutsControl: 'keyboard',
        },
        gridProps: { additionalControls: 'additional' },
      })
    ).toMatchSnapshot();
  });

  it('should render correctly with an element', () => {
    expect(
      getRenderCustomToolbarWithElements({
        leftSide: <div>left</div>,
        bottomSection: <div>bottom</div>,
      })({
        toolbarProps: {
          hasRoomForGridControls: true,
          columnControl: 'column',
          columnSortingControl: 'columnSorting',
          displayControl: 'display',
          fullScreenControl: 'fullScreen',
          keyboardShortcutsControl: 'keyboard',
        },
        gridProps: { additionalControls: 'additional' },
      })
    ).toMatchSnapshot();
  });

  it('should keep controls on one line when wrap is false', () => {
    expect(
      getRenderCustomToolbarWithElements({
        leftSide: <div>left</div>,
        wrap: false,
      })({
        toolbarProps: {
          hasRoomForGridControls: true,
          columnControl: 'column',
          columnSortingControl: 'columnSorting',
          displayControl: 'display',
          fullScreenControl: 'fullScreen',
          keyboardShortcutsControl: 'keyboard',
        },
        gridProps: {},
      })
    ).toMatchSnapshot();
  });
});
