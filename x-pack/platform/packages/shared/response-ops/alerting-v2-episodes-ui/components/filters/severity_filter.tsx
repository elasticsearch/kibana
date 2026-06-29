/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { EuiFilterButton, EuiPopover } from '@elastic/eui';
import {
  EPISODE_SEVERITIES,
  EPISODE_SEVERITY_FILTER_NONE,
  getEpisodeSeverityLabel,
} from '../severity/severity_utils';
import { InlineFilterPopover } from './inline_filter_popover';
import * as i18n from './translations';

const SEVERITY_FILTER_OPTIONS: Array<{ label: string; value: string }> = [
  ...EPISODE_SEVERITIES.map((severity) => ({
    label: getEpisodeSeverityLabel(severity),
    value: severity,
  })),
  {
    label: i18n.SEVERITY_FILTER_NONE_LABEL,
    value: EPISODE_SEVERITY_FILTER_NONE,
  },
];

interface AlertEpisodesSeverityFilterProps {
  selectedSeverities?: string[] | null;
  onSeveritiesChange: (severities: string[] | undefined) => void;
  'data-test-subj'?: string;
}

export function AlertEpisodesSeverityFilter({
  selectedSeverities,
  onSeveritiesChange,
  'data-test-subj': dataTestSubj = 'severityFilter',
}: AlertEpisodesSeverityFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const options = SEVERITY_FILTER_OPTIONS;

  const handleSelectionChange = useCallback(
    (values: string[]) => {
      onSeveritiesChange(values.length > 0 ? values : undefined);
    },
    [onSeveritiesChange]
  );

  const selectedValues = selectedSeverities ?? [];
  const activeCount = selectedValues.length;

  return (
    <EuiPopover
      aria-label={i18n.SEVERITY_FILTER_ARIA_LABEL}
      button={
        <EuiFilterButton
          iconType="arrowDown"
          iconSide="right"
          onClick={() => setIsOpen(!isOpen)}
          isSelected={isOpen}
          hasActiveFilters={activeCount > 0}
          numFilters={options.length}
          numActiveFilters={activeCount > 0 ? activeCount : undefined}
          data-test-subj={`${dataTestSubj}-button`}
        >
          {i18n.SEVERITY_FILTER_LABEL}
        </EuiFilterButton>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="downLeft"
      panelPaddingSize="none"
    >
      <InlineFilterPopover
        options={options}
        selectedValues={selectedValues}
        singleSelect={false}
        onSelectionChange={handleSelectionChange}
        emptyMessage={i18n.SEVERITY_FILTER_NO_MATCH}
        data-test-subj={`${dataTestSubj}-popover`}
      />
    </EuiPopover>
  );
}
