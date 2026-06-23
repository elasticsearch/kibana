/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import type { ESQLColumn } from '@kbn/es-types';
import { ChooseColumnPopover } from './choose_column_popover';

const columns: ESQLColumn[] = [
  { name: 'col1', type: 'keyword' },
  { name: 'col2', type: 'keyword' },
];

describe('ChooseColumnPopover', () => {
  it('should render a search input and a list', async () => {
    const user = userEvent.setup();
    const { findByTestId } = render(
      <I18nProvider>
        <ChooseColumnPopover columns={columns} updateQuery={jest.fn()} />
      </I18nProvider>
    );
    // open the popover
    await user.click(await findByTestId('chooseColumnBtn'));

    expect(await findByTestId('selectableColumnSearch')).toBeInTheDocument();
    expect(await findByTestId('selectableColumnList')).toBeInTheDocument();
  });

  it('should update the list when there is a text in the input', async () => {
    const user = userEvent.setup();
    const { findByTestId } = render(
      <I18nProvider>
        <ChooseColumnPopover columns={columns} updateQuery={jest.fn()} />
      </I18nProvider>
    );
    // open the popover (findBy waits for the popover's positioning to settle)
    await user.click(await findByTestId('chooseColumnBtn'));
    const input = await findByTestId('selectableColumnSearch');

    // type in the search input
    fireEvent.change(input, { target: { value: 'col2' } });

    // get the list
    const list = await findByTestId('selectableColumnList');
    const listItems = list.querySelector('li');
    expect(listItems).toHaveTextContent('col2');
  });

  it('should call the updateQuery prop if a list item is clicked', async () => {
    const updateQuery = jest.fn();
    const { getByTestId, getByText } = render(
      <I18nProvider>
        <ChooseColumnPopover columns={columns} updateQuery={updateQuery} />
      </I18nProvider>
    );

    await act(async () => {
      fireEvent.click(getByTestId('chooseColumnBtn'));
    });
    await act(async () => {
      fireEvent.click(getByText('col2'));
    });

    expect(updateQuery).toHaveBeenCalledWith('col2');
  });
});
