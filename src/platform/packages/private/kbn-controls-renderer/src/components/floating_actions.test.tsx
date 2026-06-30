/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

import type { Action } from '@kbn/ui-actions-plugin/public';
import { render, waitFor } from '@testing-library/react';

import { FloatingActions } from './floating_actions';

const clearAction = {
  id: 'clearControl',
  isCompatible: jest.fn().mockResolvedValue(true),
  getDisplayName: () => 'Clear control',
  getIconType: () => 'eraser',
  execute: jest.fn(),
} as unknown as Action;

const mockServices = {
  services: {
    uiActions: {
      getTriggerCompatibleActions: jest.fn().mockResolvedValue([clearAction]),
      getFrequentlyChangingActionsForTrigger: jest.fn().mockResolvedValue([]),
      getTrigger: jest.fn().mockReturnValue({}),
    },
  },
};

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: jest.fn().mockImplementation(() => mockServices),
}));

describe('FloatingActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders a floating action button with a stable aria-label and no duplicate screen reader output', async () => {
    const prependWrapperRef = React.createRef<HTMLDivElement>();
    const { getByTestId } = render(
      <FloatingActions
        api={{ uuid: 'control1' }}
        uuid="control1"
        prependWrapperRef={prependWrapperRef}
      >
        <div data-test-subj="controlContents">Control</div>
      </FloatingActions>
    );

    await waitFor(() => {
      const button = getByTestId('embeddablePanelAction-clearControl');
      // The accessible name comes from a stable aria-label, not from the (transient) tooltip element.
      expect(button.getAttribute('aria-label')).toBe('Clear control');
      expect(button.getAttribute('aria-labelledby')).toBeNull();
      // The tooltip should not add a duplicate screen reader announcement.
      expect(button.getAttribute('aria-describedby')).toBeNull();
    });
  });
});
