/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFilterButton, EuiFilterGroup } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useMemo } from 'react';
import { matchesKnowledgeIndicatorFilters } from '../utils/matches_knowledge_indicator_filters';

interface KnowledgeIndicatorStatusFilterProps {
  knowledgeIndicators: KnowledgeIndicator[];
  searchTerm: string;
  selectedTypes: string[];
  selectedStreams?: string[];
  hideComputedTypes?: boolean;
  statusFilter: 'active' | 'excluded';
  onStatusFilterChange: (filter: 'active' | 'excluded') => void;
}

export function KnowledgeIndicatorsStatusFilter({
  knowledgeIndicators,
  searchTerm,
  selectedTypes,
  selectedStreams = [],
  hideComputedTypes = false,
  statusFilter,
  onStatusFilterChange,
}: KnowledgeIndicatorStatusFilterProps) {
  const statusFilterCounts = useMemo(() => {
    return knowledgeIndicators.reduce(
      (accumulator, ki) => {
        const matchesOtherFilters = matchesKnowledgeIndicatorFilters(ki, {
          selectedTypes,
          selectedStreams,
          hideComputedTypes,
          searchTerm,
        });

        if (!matchesOtherFilters) {
          return accumulator;
        }

        if (ki.kind === 'feature' && ki.feature.excluded) {
          accumulator.excluded += 1;
        } else {
          accumulator.active += 1;
        }

        return accumulator;
      },
      { active: 0, excluded: 0 }
    );
  }, [knowledgeIndicators, searchTerm, selectedTypes, selectedStreams, hideComputedTypes]);

  return (
    <EuiFilterGroup>
      <EuiFilterButton
        numFilters={statusFilterCounts.active}
        numActiveFilters={statusFilter === 'active' ? statusFilterCounts.active : 0}
        hasActiveFilters={statusFilter === 'active'}
        isSelected={statusFilter === 'active'}
        onClick={() => onStatusFilterChange('active')}
      >
        {KNOWLEDGE_INDICATOR_STATUS_FILTER_ACTIVE_LABEL}
      </EuiFilterButton>
      <EuiFilterButton
        numFilters={statusFilterCounts.excluded}
        numActiveFilters={statusFilter === 'excluded' ? statusFilterCounts.excluded : 0}
        hasActiveFilters={statusFilter === 'excluded'}
        isSelected={statusFilter === 'excluded'}
        onClick={() => onStatusFilterChange('excluded')}
      >
        {KNOWLEDGE_INDICATOR_STATUS_FILTER_EXCLUDED_LABEL}
      </EuiFilterButton>
    </EuiFilterGroup>
  );
}

const KNOWLEDGE_INDICATOR_STATUS_FILTER_ACTIVE_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.knowledgeIndicatorStatusFilterActiveLabel',
  {
    defaultMessage: 'Active',
  }
);

const KNOWLEDGE_INDICATOR_STATUS_FILTER_EXCLUDED_LABEL = i18n.translate(
  'xpack.streams.significantEventsTable.knowledgeIndicatorStatusFilterExcludedLabel',
  {
    defaultMessage: 'Excluded',
  }
);
