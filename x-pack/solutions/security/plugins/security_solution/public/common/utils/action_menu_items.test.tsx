/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import React from 'react';

import {
  ACTION_MENU_GROUP_SEPARATOR_TEST_ID,
  getActionMenuGroupSeparator,
  isActionMenuItem,
  withActionIcon,
  withActionIcons,
  withGroupSeparators,
  withStatusDotIcons,
} from './action_menu_items';

const firstAction: EuiContextMenuPanelItemDescriptor = {
  key: 'first-action',
  name: 'First action',
  'data-test-subj': 'shared-test-subject',
};
const secondAction: EuiContextMenuPanelItemDescriptor = {
  key: 'second-action',
  name: 'Second action',
  'data-test-subj': 'shared-test-subject',
};
const separator: EuiContextMenuPanelItemDescriptor = {
  key: 'separator',
  isSeparator: true,
};

const expectStatusDot = (
  item: EuiContextMenuPanelItemDescriptor,
  color: 'success' | 'danger' | 'subdued'
) => {
  if (!isActionMenuItem(item) || !React.isValidElement(item.icon)) {
    throw new Error('Expected an action menu item with a status dot icon');
  }

  expect(item.icon.props).toMatchObject({
    type: 'dot',
    color,
    'aria-hidden': true,
  });
};

describe('action menu item utilities', () => {
  describe('isActionMenuItem', () => {
    it('identifies action items and excludes separators', () => {
      expect(isActionMenuItem(firstAction)).toBe(true);
      expect(isActionMenuItem(separator)).toBe(false);
    });
  });

  describe('withActionIcon', () => {
    it('adds the icon to action items without changing separators', () => {
      const result = withActionIcon([firstAction, separator], 'bell');

      expect(result[0]).toMatchObject({ icon: 'bell' });
      expect(result[1]).toBe(separator);
    });
  });

  describe('withActionIcons', () => {
    it('adds icons by action id and leaves unmatched items unchanged', () => {
      const result = withActionIcons([firstAction, secondAction, separator], {
        'first-action': 'bell',
      });

      expect(result[0]).toMatchObject({ icon: 'bell' });
      expect(result[1]).toBe(secondAction);
      expect(result[2]).toBe(separator);
    });

    it('does not overwrite an icon that was already set by the producer', () => {
      const itemWithIcon: EuiContextMenuPanelItemDescriptor = {
        ...firstAction,
        icon: 'workflow',
      };
      const result = withActionIcons([itemWithIcon], { 'first-action': 'bell' });

      // 'workflow' must be preserved; 'bell' must not clobber it
      expect(result[0]).toMatchObject({ icon: 'workflow' });
    });
  });

  describe('withStatusDotIcons', () => {
    it('selects colors by action id', () => {
      const result = withStatusDotIcons([firstAction, secondAction], {
        'first-action': 'success',
        'second-action': 'danger',
      });

      expectStatusDot(result[0], 'success');
      expectStatusDot(result[1], 'danger');
    });

    it('leaves an unmapped item unchanged (no default color)', () => {
      // With no entry for 'first-action', the item should pass through as-is
      const result = withStatusDotIcons([firstAction], {});

      expect(result[0]).toBe(firstAction);
    });

    it('leaves separators unchanged', () => {
      const result = withStatusDotIcons([separator], {});

      expect(result[0]).toBe(separator);
    });
  });

  describe('withGroupSeparators', () => {
    it('inserts separators between non-empty groups', () => {
      const result = withGroupSeparators([[firstAction], [secondAction]]);

      expect(result).toHaveLength(3); // item + separator + item
      expect(result[0]).toBe(firstAction);
      expect(result[1]).toMatchObject({
        isSeparator: true,
        'data-test-subj': ACTION_MENU_GROUP_SEPARATOR_TEST_ID,
      });
      expect(result[2]).toBe(secondAction);
    });

    it('skips empty groups so no orphan separators appear', () => {
      const result = withGroupSeparators([[firstAction], [], [secondAction]]);

      expect(result).toHaveLength(3); // item + separator + item (middle empty group skipped)
      expect(result[0]).toBe(firstAction);
      expect(result[1]).toMatchObject({ isSeparator: true });
      expect(result[2]).toBe(secondAction);
    });

    it('returns a flat array when only one group is non-empty', () => {
      const result = withGroupSeparators([[], [firstAction, secondAction], []]);

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(firstAction);
      expect(result[1]).toBe(secondAction);
    });

    it('returns an empty array when all groups are empty', () => {
      expect(withGroupSeparators([[], []])).toHaveLength(0);
    });
  });

  describe('getActionMenuGroupSeparator', () => {
    it('creates a testable separator with the supplied key', () => {
      expect(getActionMenuGroupSeparator('group-separator')).toEqual({
        key: 'group-separator',
        isSeparator: true,
        'data-test-subj': ACTION_MENU_GROUP_SEPARATOR_TEST_ID,
      });
    });
  });
});
