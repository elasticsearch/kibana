/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useMemo } from 'react';
import { KnowledgeIndicatorSelectableFilter } from '../../../stream_detail_significant_events_view/knowledge_indicator_selectable_filter';
import { getKnowledgeIndicatorStreamName } from '../../../stream_detail_significant_events_view/utils/get_knowledge_indicator_stream_name';

interface StreamFilterProps {
  knowledgeIndicators: KnowledgeIndicator[];
  searchTerm: string;
  statusFilter: 'active' | 'excluded';
  selectedTypes: string[];
  hideComputedTypes: boolean;
  selectedStreams: string[];
  onSelectedStreamsChange: (selectedStreams: string[]) => void;
}

export function StreamFilter({
  knowledgeIndicators,
  searchTerm,
  statusFilter,
  selectedTypes,
  hideComputedTypes,
  selectedStreams,
  onSelectedStreamsChange,
}: StreamFilterProps) {
  const filterCriteria = useMemo(
    () => ({ statusFilter, selectedTypes, hideComputedTypes }),
    [statusFilter, selectedTypes, hideComputedTypes]
  );

  return (
    <KnowledgeIndicatorSelectableFilter
      knowledgeIndicators={knowledgeIndicators}
      searchTerm={searchTerm}
      getValue={getKnowledgeIndicatorStreamName}
      selected={selectedStreams}
      onSelectedChange={onSelectedStreamsChange}
      labels={{
        button: i18n.translate('xpack.streams.knowledgeIndicators.streamFilterLabel', {
          defaultMessage: 'Stream',
        }),
        groupLabel: i18n.translate('xpack.streams.knowledgeIndicators.streamFilterGroupLabel', {
          defaultMessage: 'Filter by stream',
        }),
        popoverAriaLabel: i18n.translate(
          'xpack.streams.knowledgeIndicators.streamFilterPopoverLabel',
          { defaultMessage: 'Stream filter' }
        ),
        selectableAriaLabel: i18n.translate(
          'xpack.streams.knowledgeIndicators.streamFilterSelectableAriaLabel',
          { defaultMessage: 'Filter knowledge indicators by stream' }
        ),
      }}
      filterCriteria={filterCriteria}
    />
  );
}
