/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, render } from '@testing-library/react';
import React from 'react';
import { makeAction } from '../mocks/helpers';
import { InlineActions } from './inline_actions';
import type { CellActionExecutionContext } from '../types';
import { CellActionsProvider } from '../context';

const defaultProps = {
  anchorPosition: 'rightCenter' as const,
  disabledActionTypes: [],
  visibleCellActions: 5,
  actionContext: { trigger: { id: 'triggerId' } } as CellActionExecutionContext,
  showActionTooltips: false,
};
describe('InlineActions', () => {
  it('renders', async () => {
    const getActionsPromise = Promise.resolve([]);
    const getActions = () => getActionsPromise;
    const { queryByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <InlineActions {...defaultProps} />
      </CellActionsProvider>
    );

    await act(async () => {
      await getActionsPromise;
    });

    expect(queryByTestId('inlineActions')).toBeInTheDocument();
  });

  it('renders all actions', async () => {
    const getActionsPromise = Promise.resolve([
      makeAction('action-1'),
      makeAction('action-2'),
      makeAction('action-3'),
      makeAction('action-4'),
      makeAction('action-5'),
    ]);
    const getActions = () => getActionsPromise;
    const { getAllByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <InlineActions {...defaultProps} />
      </CellActionsProvider>
    );

    await act(async () => {
      await getActionsPromise;
    });

    expect(getAllByTestId(/actionItem-action-/).length).toBe(5);
  });
});
