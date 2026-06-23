/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { HeaderRow } from './header_row';

interface Foo {
  id: number;
}

describe('HeaderRow', () => {
  const columns = [
    { name: 'ID', render: (item: Foo) => <div>{item.id}</div> },
    { name: 'Whatever', render: () => 'Whatever' },
  ];

  it('renders a table header row from the provided column names', () => {
    const { container } = renderWithKibanaRenderContext(<HeaderRow columns={columns} />);
    const cells = container.querySelectorAll('[role="columnheader"]');

    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent('ID');
    expect(cells[1]).toHaveTextContent('Whatever');
  });

  it('will render an additional cell in the first column if one is provided', () => {
    const { container } = renderWithKibanaRenderContext(
      <HeaderRow columns={columns} leftAction={<div>Left Action</div>} />
    );
    const cells = container.querySelectorAll('[role="columnheader"]');

    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('Left Action');
  });

  it('will add space for row identifiers', () => {
    const { container } = renderWithKibanaRenderContext(
      <HeaderRow columns={columns} spacingForRowIdentifier />
    );
    const cells = container.querySelectorAll('[role="columnheader"]');

    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('Row identifier');
  });
});
