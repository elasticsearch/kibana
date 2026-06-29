/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import { upperFirst } from 'lodash';
import React, { useMemo } from 'react';
import { KnowledgeIndicatorSelectableFilter } from '../knowledge_indicator_selectable_filter';
import {
  getKnowledgeIndicatorType,
  MATCH_QUERY_TYPE,
  STATS_QUERY_TYPE,
} from '../utils/get_knowledge_indicator_type';

interface KnowledgeIndicatorTypeFilterProps {
  knowledgeIndicators: KnowledgeIndicator[];
  searchTerm: string;
  statusFilter: 'active' | 'excluded';
  selectedTypes: string[];
  onSelectedTypesChange: (selectedTypes: string[]) => void;
  hideComputedTypes?: boolean;
  selectedStreams?: string[];
}

export function KnowledgeIndicatorsTypeFilter({
  knowledgeIndicators,
  searchTerm,
  statusFilter,
  selectedTypes,
  onSelectedTypesChange,
  hideComputedTypes = false,
  selectedStreams = [],
}: KnowledgeIndicatorTypeFilterProps) {
  const filterCriteria = useMemo(
    () => ({ statusFilter, selectedStreams, hideComputedTypes }),
    [statusFilter, selectedStreams, hideComputedTypes]
  );

  return (
    <KnowledgeIndicatorSelectableFilter
      knowledgeIndicators={knowledgeIndicators}
      searchTerm={searchTerm}
      getValue={getKnowledgeIndicatorType}
      selected={selectedTypes}
      onSelectedChange={onSelectedTypesChange}
      filterCriteria={filterCriteria}
      getLabel={getTypeLabel}
      labels={{
        button: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorTypeFilterLabel',
          { defaultMessage: 'Type' }
        ),
        groupLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorTypeFilterGroupLabel',
          { defaultMessage: 'Filter by field type' }
        ),
        popoverAriaLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorTypeFilterPopoverLabel',
          { defaultMessage: 'Knowledge indicator type filter' }
        ),
        selectableAriaLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorTypeFilterSelectableAriaLabel',
          { defaultMessage: 'Filter knowledge indicators by type' }
        ),
      }}
    />
  );
}

function getTypeLabel(type: string): string {
  if (type === MATCH_QUERY_TYPE) {
    return i18n.translate(
      'xpack.streams.significantEventsTable.knowledgeIndicatorType.matchQuery',
      { defaultMessage: 'Match query' }
    );
  }
  if (type === STATS_QUERY_TYPE) {
    return i18n.translate(
      'xpack.streams.significantEventsTable.knowledgeIndicatorType.statsQuery',
      { defaultMessage: 'Stats query' }
    );
  }
  return upperFirst(type);
}
