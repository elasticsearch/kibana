/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render } from '@testing-library/react';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import React from 'react';

import { DEFAULT_STACK_BY_FIELD, DEFAULT_STACK_BY_FIELD1 } from '../../common/config';
import { TestProviders } from '../../../../../common/mock';
import { ChartContextMenu } from '.';

describe('ChartContextMenu', () => {
  const queryId = 'abcd';
  beforeEach(() => jest.clearAllMocks());

  test('it renders the chart context menu button', () => {
    const { getByTestId } = render(
      <TestProviders>
        <ChartContextMenu
          defaultStackByField={DEFAULT_STACK_BY_FIELD}
          defaultStackByField1={DEFAULT_STACK_BY_FIELD1}
          queryId={queryId}
          setStackBy={jest.fn()}
          setStackByField1={jest.fn()}
        />
      </TestProviders>
    );

    expect(getByTestId('chart-settings-popover-button')).toBeInTheDocument();
  });

  test('it renders the Inspect menu item', async () => {
    const { getByTestId } = render(
      <TestProviders>
        <ChartContextMenu
          defaultStackByField={DEFAULT_STACK_BY_FIELD}
          defaultStackByField1={DEFAULT_STACK_BY_FIELD1}
          queryId={queryId}
          setStackBy={jest.fn()}
          setStackByField1={jest.fn()}
        />
      </TestProviders>
    );

    const menuButton = getByTestId('chart-settings-popover-button');
    fireEvent.click(menuButton);
    await waitForEuiPopoverOpen();

    expect(getByTestId('inspect')).toBeInTheDocument();
  });

  test('it invokes `setStackBy` and `setStackByField1` when the Reset group by fields menu item selected', async () => {
    const setStackBy = jest.fn();
    const setStackByField1 = jest.fn();

    const { getByTestId } = render(
      <TestProviders>
        <ChartContextMenu
          defaultStackByField={DEFAULT_STACK_BY_FIELD}
          defaultStackByField1={DEFAULT_STACK_BY_FIELD1}
          queryId={queryId}
          setStackBy={setStackBy}
          setStackByField1={setStackByField1}
        />
      </TestProviders>
    );

    const menuButton = getByTestId('chart-settings-popover-button');
    fireEvent.click(menuButton);
    await waitForEuiPopoverOpen();

    const resetMenuItem = getByTestId('reset-group-by');
    fireEvent.click(resetMenuItem);

    expect(setStackBy).toBeCalledWith('kibana.alert.rule.name');
    expect(setStackByField1).toBeCalledWith('host.name');
  });

  test('it invokes `onReset` when the `Reset group by fields` menu item clicked', async () => {
    const onReset = jest.fn();

    const { getByTestId } = render(
      <TestProviders>
        <ChartContextMenu
          defaultStackByField={DEFAULT_STACK_BY_FIELD}
          defaultStackByField1={DEFAULT_STACK_BY_FIELD1}
          queryId={queryId}
          onReset={onReset}
          setStackBy={jest.fn()}
          setStackByField1={jest.fn()}
        />
      </TestProviders>
    );

    const menuButton = getByTestId('chart-settings-popover-button');
    fireEvent.click(menuButton);
    await waitForEuiPopoverOpen();

    const resetMenuItem = getByTestId('reset-group-by');
    fireEvent.click(resetMenuItem);

    expect(onReset).toBeCalled();
  });
});
