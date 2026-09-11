/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useFlyoutWidth } from './use_flyout_width';

const STORAGE_KEY = 'test:flyoutWidth';
const DEFAULT_WIDTH = 400;
const USER_WIDTH = 700;
const CONTAINER_WIDTH = 550;

/**
 * Kibana's Jest environment swaps `EuiFlyout` for a stub that renders neither a resize handle nor
 * the resize callbacks, so this reproduces the DOM a resizable `EuiFlyout` produces in the browser:
 * the flyout's own resize handle is a direct child of the flyout element, handles belonging to
 * resizable containers nested in the flyout content are not.
 */
const Flyout = () => {
  const { initialWidth, onKeyDownCapture, onPointerCancel, onPointerDown, onResize } =
    useFlyoutWidth({ localStorageKey: STORAGE_KEY, defaultWidth: DEFAULT_WIDTH });

  return (
    <div
      data-test-subj="flyout"
      data-initial-width={initialWidth}
      onKeyDownCapture={onKeyDownCapture}
      onPointerCancel={onPointerCancel}
      onPointerDown={onPointerDown}
    >
      <button data-test-subj="euiResizableButton">Flyout resize handle</button>
      <div>
        <button data-test-subj="euiResizableButton">Nested resize handle</button>
      </div>
      <input data-test-subj="search" />
      <button data-test-subj="reportUserResize" onClick={() => onResize(USER_WIDTH)}>
        Report user resize
      </button>
      <button data-test-subj="reportContainerResize" onClick={() => onResize(CONTAINER_WIDTH)}>
        Report container resize
      </button>
    </div>
  );
};

const renderFlyout = () => {
  render(<Flyout />);

  const [handle, nestedHandle] = screen.getAllByTestId('euiResizableButton');

  return {
    handle,
    nestedHandle,
    search: screen.getByTestId('search'),
    // Both replay the `onResize` callback EUI fires once a width change has settled — the hook
    // can only tell them apart by the interaction that preceded them.
    reportUserResize: () => fireEvent.click(screen.getByTestId('reportUserResize')),
    reportContainerResize: () => fireEvent.click(screen.getByTestId('reportContainerResize')),
    persistedWidth: () => localStorage.getItem(STORAGE_KEY),
  };
};

describe('useFlyoutWidth', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initialWidth', () => {
    it('falls back to the default width when nothing is persisted', () => {
      renderFlyout();

      expect(screen.getByTestId('flyout')).toHaveAttribute(
        'data-initial-width',
        String(DEFAULT_WIDTH)
      );
    });

    it('reads the persisted width', () => {
      localStorage.setItem(STORAGE_KEY, String(USER_WIDTH));
      renderFlyout();

      expect(screen.getByTestId('flyout')).toHaveAttribute(
        'data-initial-width',
        String(USER_WIDTH)
      );
    });
  });

  // Mounting seeds local storage with the default width, so an ignored resize leaves it there.
  describe('persistence', () => {
    it('persists a pointer resize of the flyout handle', () => {
      const { handle, reportUserResize, persistedWidth } = renderFlyout();

      fireEvent.pointerDown(handle);
      reportUserResize();

      expect(persistedWidth()).toBe(String(USER_WIDTH));
    });

    it('persists an arrow key resize of the flyout handle', () => {
      const { handle, reportUserResize, persistedWidth } = renderFlyout();

      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      reportUserResize();

      expect(persistedWidth()).toBe(String(USER_WIDTH));
    });

    it('ignores a resize that no interaction preceded', () => {
      const { reportContainerResize, persistedWidth } = renderFlyout();

      reportContainerResize();

      expect(persistedWidth()).toBe(String(DEFAULT_WIDTH));
    });

    it('keeps the user width when the container resizes afterwards', () => {
      const { handle, reportUserResize, reportContainerResize, persistedWidth } = renderFlyout();

      fireEvent.pointerDown(handle);
      reportUserResize();
      reportContainerResize();

      expect(persistedWidth()).toBe(String(USER_WIDTH));
    });

    it('ignores a resize driven by a nested resize handle', () => {
      const { nestedHandle, reportContainerResize, persistedWidth } = renderFlyout();

      fireEvent.pointerDown(nestedHandle);
      fireEvent.keyDown(nestedHandle, { key: 'ArrowLeft' });
      reportContainerResize();

      expect(persistedWidth()).toBe(String(DEFAULT_WIDTH));
    });

    it('ignores a resize after a cancelled pointer interaction', () => {
      const { handle, reportContainerResize, persistedWidth } = renderFlyout();

      fireEvent.pointerDown(handle);
      fireEvent.pointerCancel(handle);
      reportContainerResize();

      expect(persistedWidth()).toBe(String(DEFAULT_WIDTH));
    });

    it('does not stay armed when an arrow key resizes nothing', () => {
      const { handle, search, reportContainerResize, persistedWidth } = renderFlyout();

      // e.g. pressing the key at the minimum width, where EUI's width does not change and no
      // `onResize` follows to consume the interaction.
      fireEvent.keyDown(handle, { key: 'ArrowLeft' });
      fireEvent.keyDown(search, { key: 'a' });
      reportContainerResize();

      expect(persistedWidth()).toBe(String(DEFAULT_WIDTH));
    });

    it('does not treat non-resize keys on the handle as a resize', () => {
      const { handle, reportContainerResize, persistedWidth } = renderFlyout();

      fireEvent.keyDown(handle, { key: 'Enter' });
      reportContainerResize();

      expect(persistedWidth()).toBe(String(DEFAULT_WIDTH));
    });
  });
});
