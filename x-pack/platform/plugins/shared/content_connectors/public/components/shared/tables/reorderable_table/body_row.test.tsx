/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { BodyRow } from './body_row';

interface Foo {
  id: number;
}

describe('BodyRow', () => {
  const columns = [
    {
      name: 'ID',
      flexBasis: 'foo',
      flexGrow: 0,
      alignItems: 'bar',
      render: (item: Foo) => item.id,
    },
    {
      name: 'Whatever',
      render: () => 'Whatever',
    },
  ];

  const item = { id: 1 };

  it('renders a table row from the provided item and columns', () => {
    const { container } = renderWithKibanaRenderContext(<BodyRow columns={columns} item={item} />);
    const cells = container.querySelectorAll('[role="cell"]');

    expect(cells).toHaveLength(2);

    expect(cells[0]).toHaveTextContent('1');
    expect(cells[0]).toHaveStyle({ flexBasis: 'foo', flexGrow: 0, alignItems: 'bar' });
    expect(cells[0]).toHaveAttribute('aria-colindex', '1');

    expect(cells[1]).toHaveTextContent('Whatever');
    expect(cells[1]).toHaveAttribute('aria-colindex', '2');
  });

  it('will accept additional properties to apply to this row', () => {
    renderWithKibanaRenderContext(
      <BodyRow columns={columns} item={item} additionalProps={{ className: 'some_class_name' }} />
    );
    expect(screen.getByTestId('row')).toHaveClass('some_class_name');
  });

  it('will render an additional cell in the first column if one is provided', () => {
    const { container } = renderWithKibanaRenderContext(
      <BodyRow columns={columns} item={item} leftAction={<div>Left Action</div>} />
    );
    const cells = container.querySelectorAll('[role="cell"]');

    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('Left Action');
  });

  it('will render a row identifier if one is provided', () => {
    const { container } = renderWithKibanaRenderContext(
      <BodyRow columns={columns} item={item} rowIdentifier="21" />
    );
    const cells = container.querySelectorAll('[role="cell"]');

    expect(cells).toHaveLength(3);
    expect(cells[0].querySelector('.euiToken')).not.toBeNull();
  });

  it('will render row errors', () => {
    renderWithKibanaRenderContext(
      <BodyRow columns={columns} item={item} errors={['first error', 'second error']} />
    );
    const alerts = screen.getAllByRole('alert');

    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toHaveTextContent('first error');
    expect(alerts[1]).toHaveTextContent('second error');
  });
});
