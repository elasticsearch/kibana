/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  SearchEmbeddableToolbarProvider,
  useSearchEmbeddableToolbar,
} from './search_embeddable_toolbar_context';

const SlotProbe = () => {
  const { leftSide, saveToDashboardButton } = useSearchEmbeddableToolbar();
  return (
    <div data-test-subj="toolbarSlot">
      {leftSide ?? 'empty'}
      {saveToDashboardButton}
    </div>
  );
};

describe('search embeddable toolbar context', () => {
  it('returns an empty slot without a provider', () => {
    render(<SlotProbe />);

    expect(screen.getByTestId('toolbarSlot')).toHaveTextContent('empty');
  });

  it('exposes the provided left side', () => {
    render(
      <SearchEmbeddableToolbarProvider value={{ leftSide: <span>picker</span> }}>
        <SlotProbe />
      </SearchEmbeddableToolbarProvider>
    );

    expect(screen.getByTestId('toolbarSlot')).toHaveTextContent('picker');
  });

  it('exposes the visible columns callback', () => {
    const onVisibleColumnsChange = jest.fn();
    const Probe = () => {
      const toolbar = useSearchEmbeddableToolbar();
      toolbar.onVisibleColumnsChange?.(['message']);
      return null;
    };

    render(
      <SearchEmbeddableToolbarProvider value={{ onVisibleColumnsChange }}>
        <Probe />
      </SearchEmbeddableToolbarProvider>
    );

    expect(onVisibleColumnsChange).toHaveBeenCalledWith(['message']);
  });

  it('exposes the save-to-dashboard control', () => {
    render(
      <SearchEmbeddableToolbarProvider
        value={{ saveToDashboardButton: <button type="button">save</button> }}
      >
        <SlotProbe />
      </SearchEmbeddableToolbarProvider>
    );

    expect(screen.getByRole('button', { name: 'save' })).toBeInTheDocument();
  });
});
