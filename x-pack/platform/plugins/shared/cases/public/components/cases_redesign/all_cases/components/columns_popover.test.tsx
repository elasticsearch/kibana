/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';

import { renderWithTestingProviders } from '../../../../common/mock';
import { ColumnsPopover } from './columns_popover';

describe('ColumnsPopover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const selectedColumns = [
    { field: 'title', name: 'Title', isChecked: true },
    { field: 'category', name: 'Category', isChecked: false },
    { field: 'tags', name: 'Tags', isChecked: false },
  ];

  it('renders correctly a list of selected columns', async () => {
    renderWithTestingProviders(
      <ColumnsPopover selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));

    await waitForEuiPopoverOpen();

    expect(await screen.findByTestId('column-selection-popover')).toBeInTheDocument();

    selectedColumns.forEach(({ field, name, isChecked }) => {
      expect(screen.getByTestId(`column-selection-switch-${field}`)).toHaveAttribute(
        'aria-checked',
        isChecked.toString()
      );
      expect(screen.getByText(name)).toBeInTheDocument();
    });
  });

  it('clicking a switch calls onSelectedColumnsChange with the right params', async () => {
    const onSelectedColumnsChange = jest.fn();

    renderWithTestingProviders(
      <ColumnsPopover
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await userEvent.click(
      await screen.findByTestId(`column-selection-switch-${selectedColumns[0].field}`),
      { pointerEventsCheck: 0 }
    );

    await waitFor(() => {
      expect(onSelectedColumnsChange).toHaveBeenCalledWith([
        { ...selectedColumns[0], isChecked: false },
        selectedColumns[1],
        selectedColumns[2],
      ]);
    });
  });

  it('clicking Show All calls onSelectedColumnsChange with the right params', async () => {
    const onSelectedColumnsChange = jest.fn();

    renderWithTestingProviders(
      <ColumnsPopover
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await userEvent.click(await screen.findByTestId('column-selection-popover-show-all-button'), {
      pointerEventsCheck: 0,
    });

    const onSelectedColumnsChangeCallParams = selectedColumns.map((column) => ({
      ...column,
      isChecked: true,
    }));

    await waitFor(() => {
      expect(onSelectedColumnsChange).toHaveBeenCalledWith(onSelectedColumnsChangeCallParams);
    });
  });

  it('clicking Hide All calls onSelectedColumnsChange with the right params', async () => {
    const onSelectedColumnsChange = jest.fn();

    renderWithTestingProviders(
      <ColumnsPopover
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await userEvent.click(await screen.findByTestId('column-selection-popover-hide-all-button'), {
      pointerEventsCheck: 0,
    });

    await waitFor(() => {
      expect(onSelectedColumnsChange).toHaveBeenCalledWith(
        selectedColumns.map((column) => ({ ...column, isChecked: false }))
      );
    });
  });

  it('searching for text changes the column list correctly', async () => {
    renderWithTestingProviders(
      <ColumnsPopover selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('column-selection-popover-search'));
    await userEvent.paste('Title');

    expect(await screen.findByTestId('column-selection-switch-title')).toBeInTheDocument();
    expect(screen.queryByTestId('column-selection-switch-category')).not.toBeInTheDocument();
    expect(screen.queryByTestId('column-selection-switch-tags')).not.toBeInTheDocument();
  });

  it('searching for text does not change the list of selected columns', async () => {
    const onSelectedColumnsChange = jest.fn();

    renderWithTestingProviders(
      <ColumnsPopover
        selectedColumns={selectedColumns}
        onSelectedColumnsChange={onSelectedColumnsChange}
      />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await waitForEuiPopoverOpen();
    await userEvent.click(await screen.findByTestId('column-selection-popover-search'));
    await userEvent.paste('Category');

    await waitFor(() => {
      expect(onSelectedColumnsChange).not.toHaveBeenCalled();
    });
  });

  it('searching for text hides the drag and drop icons', async () => {
    renderWithTestingProviders(
      <ColumnsPopover selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));
    await waitForEuiPopoverOpen();

    expect(await screen.findAllByTestId('column-selection-popover-draggable-icon')).toHaveLength(3);

    await userEvent.click(await screen.findByTestId('column-selection-popover-search'));
    await userEvent.paste('Foobar');

    expect(screen.queryByTestId('column-selection-popover-draggable-icon')).not.toBeInTheDocument();
  });

  it('searching for text disables hideAll and showAll buttons', async () => {
    renderWithTestingProviders(
      <ColumnsPopover selectedColumns={selectedColumns} onSelectedColumnsChange={() => {}} />
    );

    await userEvent.click(await screen.findByTestId('column-selection-popover-button'));

    await waitForEuiPopoverOpen();

    await userEvent.click(await screen.findByTestId('column-selection-popover-search'));
    await userEvent.paste('Foobar');

    expect(await screen.findByTestId('column-selection-popover-show-all-button')).toBeDisabled();
    expect(await screen.findByTestId('column-selection-popover-hide-all-button')).toBeDisabled();
  });
});
