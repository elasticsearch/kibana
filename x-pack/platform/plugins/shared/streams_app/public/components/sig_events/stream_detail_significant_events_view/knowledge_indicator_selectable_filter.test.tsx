/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import type { Feature, StreamQuery } from '@kbn/streams-schema';
import { KnowledgeIndicatorSelectableFilter } from './knowledge_indicator_selectable_filter';
import type { KnowledgeIndicatorFilterCriteria } from './utils/matches_knowledge_indicator_filters';

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: 'feature-id',
    uuid: 'feature-uuid',
    stream_name: 'logs.test',
    type: 'entity',
    description: 'A feature',
    properties: {},
    confidence: 90,
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFeatureKI(overrides: Partial<Feature> = {}): KnowledgeIndicator {
  return { kind: 'feature', feature: makeFeature(overrides) };
}

function makeQueryKI(
  queryOverrides: Partial<StreamQuery> = {},
  extra: { stream_name?: string; backed?: boolean } = {}
): KnowledgeIndicator {
  return {
    kind: 'query',
    query: {
      id: 'query-id',
      type: 'match',
      title: 'Query title',
      description: 'A query',
      esql: { query: 'FROM logs-*' },
      ...queryOverrides,
    },
    rule: { backed: extra.backed ?? false, id: 'rule-1' },
    stream_name: extra.stream_name ?? 'logs.test',
  };
}

const DEFAULT_LABELS = {
  button: 'Test Filter',
  groupLabel: 'Filter by value',
  popoverAriaLabel: 'Test filter popover',
  selectableAriaLabel: 'Filter items by value',
};

const EMPTY_CRITERIA: KnowledgeIndicatorFilterCriteria = {};

async function renderFilter(
  props: Partial<React.ComponentProps<typeof KnowledgeIndicatorSelectableFilter>> = {}
) {
  const defaultProps: React.ComponentProps<typeof KnowledgeIndicatorSelectableFilter> = {
    knowledgeIndicators: [],
    searchTerm: '',
    getValue: (ki) => (ki.kind === 'feature' ? ki.feature.type : undefined),
    selected: [],
    onSelectedChange: jest.fn(),
    filterCriteria: EMPTY_CRITERIA,
    labels: DEFAULT_LABELS,
    ...props,
  };
  return render(
    <I18nProvider>
      <KnowledgeIndicatorSelectableFilter {...defaultProps} />
    </I18nProvider>
  );
}

describe('KnowledgeIndicatorSelectableFilter', () => {
  describe('rendering', () => {
    it('renders button with label and correct filter counts', async () => {
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1' }),
        makeFeatureKI({ type: 'entity', id: 'f2' }),
        makeFeatureKI({ type: 'infrastructure', id: 'f3' }),
      ];

      await renderFilter({ knowledgeIndicators: kis });

      const button = screen.getByRole('button', { name: /Test Filter/ });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('2');
    });

    it('renders a disabled button when disableWhenEmpty is true and no values are available', async () => {
      await renderFilter({
        knowledgeIndicators: [],
        disableWhenEmpty: true,
      });

      const button = screen.getByRole('button', { name: /Test Filter/ });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('renders an enabled button when disableWhenEmpty is false and no values are available', async () => {
      await renderFilter({
        knowledgeIndicators: [],
        disableWhenEmpty: false,
      });

      expect(screen.getByRole('button', { name: /Test Filter/ })).toBeInTheDocument();
    });

    it('shows active filter badge when items are selected', async () => {
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1' }),
        makeFeatureKI({ type: 'infrastructure', id: 'f2' }),
      ];

      await renderFilter({
        knowledgeIndicators: kis,
        selected: ['entity'],
      });

      const button = screen.getByRole('button', { name: /Test Filter/ });
      expect(button).toHaveTextContent('1');
    });
  });

  describe('popover interaction', () => {
    it('shows popover with selectable options on click', async () => {
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1' }),
        makeFeatureKI({ type: 'infrastructure', id: 'f2' }),
      ];

      await renderFilter({ knowledgeIndicators: kis });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('entity')).toBeInTheDocument();
        expect(screen.getByText('infrastructure')).toBeInTheDocument();
      });
    });

    it('calls onSelectedChange with toggled selections', async () => {
      const onSelectedChange = jest.fn();
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1' }),
        makeFeatureKI({ type: 'infrastructure', id: 'f2' }),
      ];

      await renderFilter({ knowledgeIndicators: kis, onSelectedChange });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));
      await waitFor(() => {
        expect(screen.getByText('entity')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('entity'));

      await waitFor(() => {
        expect(onSelectedChange).toHaveBeenCalledWith(['entity']);
      });
    });
  });

  describe('filtering logic', () => {
    it('computes available values using filterCriteria', async () => {
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1' }),
        makeFeatureKI({ type: 'infrastructure', id: 'f2', excluded: true }),
      ];

      await renderFilter({
        knowledgeIndicators: kis,
        filterCriteria: { statusFilter: 'active' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('entity')).toBeInTheDocument();
      });
      expect(screen.queryByText('infrastructure')).not.toBeInTheDocument();
    });

    it('computes counts using filterCriteria plus searchTerm', async () => {
      const kis = [
        makeFeatureKI({ type: 'entity', id: 'f1', title: 'Alpha service' }),
        makeFeatureKI({ type: 'entity', id: 'f2', title: 'Beta service' }),
        makeFeatureKI({ type: 'entity', id: 'f3', title: 'Gamma processor' }),
      ];

      await renderFilter({
        knowledgeIndicators: kis,
        searchTerm: 'service',
      });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        const badges = screen.getAllByText('2');
        expect(badges.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('excludes KIs where getValue returns undefined', async () => {
      const kis = [makeFeatureKI({ type: 'entity', id: 'f1' }), makeQueryKI({ id: 'q1' })];

      await renderFilter({ knowledgeIndicators: kis });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('entity')).toBeInTheDocument();
      });
      expect(screen.queryByText('match_query')).not.toBeInTheDocument();
    });
  });

  describe('getLabel', () => {
    it('uses identity by default', async () => {
      const kis = [makeFeatureKI({ type: 'my_type', id: 'f1' })];

      await renderFilter({ knowledgeIndicators: kis });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('my_type')).toBeInTheDocument();
      });
    });

    it('applies custom getLabel to option labels', async () => {
      const kis = [makeFeatureKI({ type: 'my_type', id: 'f1' })];

      await renderFilter({
        knowledgeIndicators: kis,
        getLabel: (value) => value.toUpperCase(),
      });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('MY_TYPE')).toBeInTheDocument();
      });
      expect(screen.queryByText('my_type')).not.toBeInTheDocument();
    });
  });

  describe('labels', () => {
    it('uses provided group label in the popover', async () => {
      const kis = [makeFeatureKI({ type: 'entity', id: 'f1' })];

      await renderFilter({
        knowledgeIndicators: kis,
        labels: { ...DEFAULT_LABELS, groupLabel: 'Custom group' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Test Filter/ }));

      await waitFor(() => {
        expect(screen.getByText('Custom group')).toBeInTheDocument();
      });
    });
  });
});
