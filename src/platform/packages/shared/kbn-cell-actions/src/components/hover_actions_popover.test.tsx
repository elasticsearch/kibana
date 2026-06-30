/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { CellActionsProvider } from '../context';
import { makeAction } from '../mocks/helpers';
import type { CellActionExecutionContext } from '../types';
import { HoverActionsPopover } from './hover_actions_popover';

const defaultProps = {
  anchorPosition: 'rightCenter' as const,
  disabledActionTypes: [],
  visibleCellActions: 4,
  actionContext: {
    trigger: { id: 'triggerId' },
    data: [
      {
        field: { name: 'fieldName' },
      },
    ],
  } as CellActionExecutionContext,
  showActionTooltips: false,
};
describe('HoverActionsPopover', () => {
  const TestComponent = () => <span data-test-subj="test-component" />;
  jest.useFakeTimers();

  it('renders the children', () => {
    const getActions = () => Promise.resolve([]);
    const { getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );
    expect(getByTestId('test-component')).toBeInTheDocument();
  });

  it('renders actions when hovered', async () => {
    const action = makeAction('test-action');
    const getActionsPromise = Promise.resolve([action]);
    const getActions = () => getActionsPromise;

    const { queryByTestId, getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    expect(queryByTestId('actionItem-test-action')).toBeInTheDocument();
  });

  it('hide actions when mouse stops hovering', async () => {
    const action = makeAction('test-action');
    const getActionsPromise = Promise.resolve([action]);
    const getActions = () => getActionsPromise;

    const { queryByTestId, getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    // Mouse leaves hover state
    await act(async () => {
      fireEvent.mouseLeave(getByTestId('test-component'));
    });

    expect(queryByTestId('actionItem-test-action')).not.toBeInTheDocument();
  });

  it('renders extra actions button', async () => {
    const actions = [makeAction('test-action-1'), makeAction('test-action-2')];
    const getActionsPromise = Promise.resolve(actions);
    const getActions = () => getActionsPromise;

    const { getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps} visibleCellActions={1}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    expect(getByTestId('showExtraActionsButton')).toBeInTheDocument();
  });

  it('shows extra actions when extra actions button is clicked', async () => {
    const actions = [makeAction('test-action-1'), makeAction('test-action-2')];
    const getActionsPromise = Promise.resolve(actions);
    const getActions = () => getActionsPromise;

    const { getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps} visibleCellActions={1}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    act(() => {
      fireEvent.click(getByTestId('showExtraActionsButton'));
    });

    expect(getByTestId('actionItem-test-action-2')).toBeInTheDocument();
  });

  it('does not render visible actions if extra actions are already rendered', async () => {
    const actions = [
      makeAction('test-action-1'),
      // extra actions
      makeAction('test-action-2'),
      makeAction('test-action-3'),
    ];
    const getActionsPromise = Promise.resolve(actions);
    const getActions = () => getActionsPromise;

    const { getByTestId, queryByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps} visibleCellActions={2}>
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    act(() => {
      fireEvent.click(getByTestId('showExtraActionsButton'));
    });

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    expect(queryByTestId('actionItem-test-action-1')).not.toBeInTheDocument();
    expect(queryByTestId('actionItem-test-action-2')).toBeInTheDocument();
    expect(queryByTestId('actionItem-test-action-3')).toBeInTheDocument();
  });
  it('does not add css positioning when anchorPosition = downCenter', async () => {
    const getActionsPromise = Promise.resolve([makeAction('test-action')]);
    const getActions = () => getActionsPromise;

    const { getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps} anchorPosition="downCenter">
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    expect(Object.values(getByTestId('hoverActionsPopover').style).includes('margin-top')).toEqual(
      false
    );
  });
  it('adds css positioning when anchorPosition = rightCenter', async () => {
    const getActionsPromise = Promise.resolve([makeAction('test-action')]);
    const getActions = () => getActionsPromise;

    const { getByTestId } = render(
      <CellActionsProvider getTriggerCompatibleActions={getActions}>
        <HoverActionsPopover {...defaultProps} anchorPosition="rightCenter">
          <TestComponent />
        </HoverActionsPopover>
      </CellActionsProvider>
    );

    await hoverElement(getByTestId('test-component'), async () => {
      await getActionsPromise;
      jest.runAllTimers();
    });

    expect(Object.values(getByTestId('hoverActionsPopover').style).includes('margin-top')).toEqual(
      true
    );
  });
});

const hoverElement = async (element: Element, waitForChange: () => Promise<unknown>) => {
  await act(async () => {
    fireEvent.mouseEnter(element);
    await waitForChange();
  });
};
