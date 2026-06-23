/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiDragDropContext: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  EuiDroppable: jest.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
}));

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { EuiDragDropContext } from '@elastic/eui';

import { DraggableBodyRows } from './draggable_body_rows';

describe('DraggableBodyRows', () => {
  const items = [{ id: 1 }, { id: 2 }];
  const onReorder = jest.fn();

  const MockEuiDragDropContext = jest.mocked(EuiDragDropContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('wraps BodyRows in a EuiDragDropContext', () => {
    renderWithKibanaRenderContext(
      <DraggableBodyRows items={items} onReorder={onReorder} renderItem={jest.fn()} />
    );

    expect(MockEuiDragDropContext).toHaveBeenCalled();
    expect(screen.getByRole('rowgroup')).toBeInTheDocument();
  });

  it('will call the provided onReorder function whenever items are reordered', () => {
    renderWithKibanaRenderContext(
      <DraggableBodyRows items={items} onReorder={onReorder} renderItem={jest.fn()} />
    );

    const { onDragEnd } = MockEuiDragDropContext.mock.calls[0][0] as { onDragEnd: Function };
    onDragEnd({ source: { index: 1 }, destination: { index: 0 } });

    expect(onReorder).toHaveBeenCalledWith([{ id: 2 }, { id: 1 }], items);
  });

  it('will not call the provided onReorder function if there are not a source AND destination provided', () => {
    renderWithKibanaRenderContext(
      <DraggableBodyRows items={items} onReorder={onReorder} renderItem={jest.fn()} />
    );

    const { onDragEnd } = MockEuiDragDropContext.mock.calls[0][0] as { onDragEnd: Function };
    onDragEnd({ source: { index: 1 } });

    expect(onReorder).not.toHaveBeenCalled();
  });
});
