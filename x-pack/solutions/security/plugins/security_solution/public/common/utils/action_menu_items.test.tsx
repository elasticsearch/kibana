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
  });

  describe('withStatusDotIcons', () => {
    it('selects colors by action id instead of test subject', () => {
      const result = withStatusDotIcons(
        [firstAction, secondAction],
        {
          'first-action': 'success',
          'second-action': 'danger',
        },
        'subdued'
      );

      expectStatusDot(result[0], 'success');
      expectStatusDot(result[1], 'danger');
    });

    it('uses the default color for an action without a configured color', () => {
      const result = withStatusDotIcons([firstAction], {});

      expectStatusDot(result[0], 'subdued');
    });

    it('leaves separators unchanged', () => {
      const result = withStatusDotIcons([separator], {});

      expect(result[0]).toBe(separator);
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
