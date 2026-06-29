/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiSelectableOption } from '@elastic/eui';
import {
  EuiBadge,
  EuiFilterButton,
  EuiFilterGroup,
  EuiPanel,
  EuiPopover,
  EuiSelectable,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { KnowledgeIndicator } from '@kbn/streams-ai';
import React, { useMemo, useState } from 'react';
import {
  matchesKnowledgeIndicatorFilters,
  type KnowledgeIndicatorFilterCriteria,
} from './utils/matches_knowledge_indicator_filters';

export interface KnowledgeIndicatorSelectableFilterProps {
  knowledgeIndicators: KnowledgeIndicator[];
  searchTerm: string;
  getValue: (ki: KnowledgeIndicator) => string | undefined;
  selected: string[];
  onSelectedChange: (values: string[]) => void;
  filterCriteria: KnowledgeIndicatorFilterCriteria;
  labels: {
    button: string;
    groupLabel: string;
    popoverAriaLabel: string;
    selectableAriaLabel: string;
  };
  getLabel?: (value: string) => string;
  disableWhenEmpty?: boolean;
}

export function KnowledgeIndicatorSelectableFilter({
  knowledgeIndicators,
  searchTerm,
  getValue,
  selected,
  onSelectedChange,
  filterCriteria,
  labels,
  getLabel = identity,
  disableWhenEmpty = false,
}: KnowledgeIndicatorSelectableFilterProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverId = useGeneratedHtmlId({
    prefix: 'knowledgeIndicatorSelectableFilter',
  });

  const availableValues = useMemo(() => {
    const values = new Set<string>();
    for (const ki of knowledgeIndicators) {
      if (!matchesKnowledgeIndicatorFilters(ki, filterCriteria)) continue;
      const value = getValue(ki);
      if (value) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [knowledgeIndicators, filterCriteria, getValue]);

  const valueCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const criteriaWithSearch = searchTerm ? { ...filterCriteria, searchTerm } : filterCriteria;
    for (const ki of knowledgeIndicators) {
      if (!matchesKnowledgeIndicatorFilters(ki, criteriaWithSearch)) continue;
      const value = getValue(ki);
      if (value) counts[value] = (counts[value] ?? 0) + 1;
    }
    return counts;
  }, [knowledgeIndicators, filterCriteria, searchTerm, getValue]);

  const options = useMemo<EuiSelectableOption[]>(
    () => [
      { label: labels.groupLabel, isGroupLabel: true },
      ...availableValues.map((value) => ({
        key: value,
        checked: selected.includes(value) ? ('on' as const) : undefined,
        label: getLabel(value),
        append: <EuiBadge>{valueCounts[value] ?? 0}</EuiBadge>,
      })),
    ],
    [availableValues, selected, valueCounts, getLabel, labels.groupLabel]
  );

  const isEmpty = availableValues.length === 0;
  const isDisabled = disableWhenEmpty && isEmpty;

  return (
    <EuiFilterGroup>
      <EuiPopover
        id={popoverId}
        aria-label={labels.popoverAriaLabel}
        button={
          <EuiFilterButton
            iconType="arrowDown"
            iconSide="right"
            isSelected={isPopoverOpen}
            hasActiveFilters={selected.length > 0}
            numFilters={availableValues.length}
            numActiveFilters={selected.length}
            isDisabled={isDisabled}
            onClick={() => setIsPopoverOpen((open) => !open)}
          >
            {labels.button}
          </EuiFilterButton>
        }
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="s"
      >
        <EuiSelectable
          aria-label={labels.selectableAriaLabel}
          options={options}
          onChange={(nextOptions) => {
            onSelectedChange(
              nextOptions
                .filter((opt) => opt.checked === 'on')
                .map((opt) => String(opt.key ?? opt.label))
            );
          }}
        >
          {(list) => (
            <EuiPanel
              hasShadow={false}
              hasBorder={false}
              paddingSize="none"
              css={css`
                min-width: 260px;
              `}
            >
              {list}
            </EuiPanel>
          )}
        </EuiSelectable>
      </EuiPopover>
    </EuiFilterGroup>
  );
}

const identity = (value: string) => value;
