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
import { getKnowledgeIndicatorSubtype } from '../utils/get_knowledge_indicator_subtype';

interface KnowledgeIndicatorsSubtypeFilterProps {
  knowledgeIndicators: KnowledgeIndicator[];
  searchTerm: string;
  statusFilter: 'active' | 'excluded';
  selectedTypes: string[];
  selectedSubtypes: string[];
  onSelectedSubtypesChange: (subtypes: string[]) => void;
  hideComputedTypes?: boolean;
  selectedStreams?: string[];
}

export function KnowledgeIndicatorsSubtypeFilter({
  knowledgeIndicators,
  searchTerm,
  statusFilter,
  selectedTypes,
  selectedSubtypes,
  onSelectedSubtypesChange,
  hideComputedTypes = false,
  selectedStreams = [],
}: KnowledgeIndicatorsSubtypeFilterProps) {
  const filterCriteria = useMemo(
    () => ({ statusFilter, selectedTypes, selectedStreams, hideComputedTypes }),
    [statusFilter, selectedTypes, selectedStreams, hideComputedTypes]
  );

  return (
    <KnowledgeIndicatorSelectableFilter
      knowledgeIndicators={knowledgeIndicators}
      searchTerm={searchTerm}
      getValue={getKnowledgeIndicatorSubtype}
      selected={selectedSubtypes}
      onSelectedChange={onSelectedSubtypesChange}
      filterCriteria={filterCriteria}
      getLabel={upperFirst}
      disableWhenEmpty
      labels={{
        button: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorSubtypeFilterLabel',
          { defaultMessage: 'Subtype' }
        ),
        groupLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorSubtypeFilterGroupLabel',
          { defaultMessage: 'Filter by field subtype' }
        ),
        popoverAriaLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorSubtypeFilterPopoverLabel',
          { defaultMessage: 'Knowledge indicator subtype filter' }
        ),
        selectableAriaLabel: i18n.translate(
          'xpack.streams.significantEventsTable.knowledgeIndicatorSubtypeFilterSelectableAriaLabel',
          { defaultMessage: 'Filter knowledge indicators by subtype' }
        ),
      }}
    />
  );
}
