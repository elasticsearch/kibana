/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { BodyRows } from './body_rows';

describe('BodyRows', () => {
  it('renders a row for each provided item', () => {
    const renderItem = jest.fn((_item, itemIndex) => (
      <div key={itemIndex} data-test-subj={`row-${itemIndex}`} />
    ));

    renderWithKibanaRenderContext(
      <BodyRows items={[{ id: 1 }, { id: 2 }]} renderItem={renderItem} />
    );

    expect(renderItem).toHaveBeenCalledTimes(2);
    expect(renderItem.mock.calls[0][0]).toEqual({ id: 1 });
    expect(renderItem.mock.calls[0][1]).toBe(0);
    expect(renderItem.mock.calls[1][0]).toEqual({ id: 2 });
    expect(renderItem.mock.calls[1][1]).toBe(1);
  });
});
