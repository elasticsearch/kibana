/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { Query } from '@elastic/eui';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SelectableFilterPopover } from './selectable_filter_popover';

const options = [
  { key: 'prod', label: 'Production', value: 'Production', count: 3 },
  { key: 'arch', label: 'Archived', value: 'Archived', count: 1 },
];

describe('SelectableFilterPopover', () => {
  it('counts only active values that match an available option once options have loaded', () => {
    const query = Query.parse('')
      .addOrFieldValue('tag', 'Production', true, 'eq')
      .addOrFieldValue('tag', 'Missing', true, 'eq');

    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={query}
        options={options}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('treats option keys as active query aliases', async () => {
    const onChange = jest.fn();

    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={Query.parse('').addOrFieldValue('tag', 'prod', true, 'eq')}
        onChange={onChange}
        options={options}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Tags'));
    fireEvent.click(await screen.findByText('Production'));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
    expect(onChange.mock.calls[0][0].text).not.toContain('prod');
  });

  it('shows the raw active-clause count before options load (URL hydration)', () => {
    // Facets are typically fetched lazily on first popover open, so `options`
    // can be empty when the page hydrates from a URL with filter clauses. The
    // badge must reflect the active count immediately rather than waiting for
    // the user to open the popover.
    const query = Query.parse('')
      .addOrFieldValue('tag', 'Alerting', true, 'eq')
      .addOrFieldValue('tag', 'Flights', true, 'eq')
      .addOrFieldValue('tag', 'Compliance', false, 'eq');

    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={query}
        options={[]}
        isLoading
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('switches from raw count to validated count when options resolve', () => {
    const query = Query.parse('')
      .addOrFieldValue('tag', 'Production', true, 'eq')
      .addOrFieldValue('tag', 'Missing', true, 'eq');

    const { rerender } = render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={query}
        options={[]}
        isLoading
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    expect(screen.getByText('2')).toBeInTheDocument();

    rerender(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={query}
        options={options}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('hides the modifier tip and active badge in single-selection mode', async () => {
    render(
      <SelectableFilterPopover
        fieldName="sort"
        title="Sort by"
        query={Query.parse('').addOrFieldValue('sort', 'Production', true, 'eq')}
        options={options}
        singleSelection
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByText('Sort by'));

    await waitFor(() => {
      expect(screen.queryByText(/\+ click exclude/)).not.toBeInTheDocument();
    });
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('uses the captured modifier key to add an exclude filter', async () => {
    const onChange = jest.fn();

    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={Query.parse('')}
        onChange={onChange}
        options={options}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByText('Tags'));

    const productionOption = await screen.findByText('Production');

    fireEvent.mouseDown(productionOption, { ctrlKey: true });
    fireEvent.click(productionOption, { ctrlKey: true });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    expect(onChange.mock.calls[0][0].text).toContain('-tag:(Production)');
  });

  it('uses Shift to add a match-all (bare scalar) filter', async () => {
    const onChange = jest.fn();

    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={Query.parse('')}
        onChange={onChange}
        options={options}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByText('Tags'));

    const productionOption = await screen.findByText('Production');

    fireEvent.mouseDown(productionOption, { shiftKey: true });
    fireEvent.click(productionOption, { shiftKey: true });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    // Match-all is written as a bare scalar clause, not an OR-group.
    expect(onChange.mock.calls[0][0].text).toBe('tag:Production');
  });

  it('falls back to match-any when Shift is used but allowMatchAll is false', async () => {
    const onChange = jest.fn();

    render(
      <SelectableFilterPopover
        fieldName="createdBy"
        title="Creators"
        query={Query.parse('')}
        onChange={onChange}
        options={options}
        allowMatchAll={false}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByText('Creators'));

    const productionOption = await screen.findByText('Production');

    fireEvent.mouseDown(productionOption, { shiftKey: true });
    fireEvent.click(productionOption, { shiftKey: true });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });

    expect(onChange.mock.calls[0][0].text).toBe('createdBy:(Production)');
  });

  it('renders a lone match-all value as a plain include (no green plus)', async () => {
    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={Query.parse('tag:Production')}
        options={options}
        renderOption={(option, { state }) => <span>{`${option.label}=${state ?? 'none'}`}</span>}
      />
    );

    fireEvent.click(screen.getByText('Tags'));

    // A single required value is indistinguishable from match-any, so it shows
    // as `include` rather than `includeAll`.
    expect(await screen.findByText('Production=include')).toBeInTheDocument();
    expect(screen.getByText('Archived=none')).toBeInTheDocument();
  });

  it('renders match-all values as includeAll once a field has two or more', async () => {
    render(
      <SelectableFilterPopover
        fieldName="tag"
        title="Tags"
        query={Query.parse('tag:Production tag:Archived')}
        options={options}
        renderOption={(option, { state }) => <span>{`${option.label}=${state ?? 'none'}`}</span>}
      />
    );

    fireEvent.click(screen.getByText('Tags'));

    expect(await screen.findByText('Production=includeAll')).toBeInTheDocument();
    expect(screen.getByText('Archived=includeAll')).toBeInTheDocument();
  });

  it('omits the match-all hint when allowMatchAll is false', async () => {
    render(
      <SelectableFilterPopover
        fieldName="createdBy"
        title="Creators"
        query={Query.parse('')}
        options={options}
        allowMatchAll={false}
        renderOption={(option) => <span>{option.label}</span>}
      />
    );

    fireEvent.click(screen.getByText('Creators'));

    await waitFor(() => {
      expect(screen.getByText(/\+ click exclude/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/\+ click match all/)).not.toBeInTheDocument();
  });
});
