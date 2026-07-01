/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { css } from '@emotion/react';
import { EuiFlexGrid, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React from 'react';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { useBreakpoints } from '../../../hooks/use_breakpoints';
import { ApmEnvironmentFilter } from '../environment_filter';
import { TimeComparison } from '../time_comparison';
import { TransactionTypeSelect } from '../transaction_type_select';
import { UnifiedSearchBar } from '../unified_search_bar';
import { useSecondaryFiltersWidthStyle } from './use_secondary_filters_width_style';
import { AnomalyThresholdSelect } from '../anomaly_threshold_select';

interface Props {
  hidden?: boolean;
  showUnifiedSearchBar?: boolean;
  showFilterBar?: boolean;
  showTimeComparison?: boolean;
  showEnvironmentFilter?: boolean;
  showQueryInput?: boolean;
  showTransactionTypeSelector?: boolean;
  showAnomalyThresholdSelector?: boolean;
  searchBarPlaceholder?: string;
  searchBarBoolFilter?: QueryDslQueryContainer[];
}

export function SearchBar({
  hidden = false,
  showUnifiedSearchBar = true,
  showFilterBar = false,
  showTimeComparison = false,
  showEnvironmentFilter = false,
  showTransactionTypeSelector = false,
  showAnomalyThresholdSelector = false,
  showQueryInput = true,
  searchBarPlaceholder,
  searchBarBoolFilter,
}: Props) {
  const { isMedium } = useBreakpoints();
  const hasSecondaryFilters =
    showTransactionTypeSelector ||
    showEnvironmentFilter ||
    showTimeComparison ||
    showAnomalyThresholdSelector;

  const { secondaryFiltersWidthStyle, setSearchBarContainerRef } = useSecondaryFiltersWidthStyle({
    isMedium,
    enabled: showUnifiedSearchBar && showQueryInput,
  });

  if (hidden) {
    return null;
  }

  return (
    <div ref={setSearchBarContainerRef}>
      {showUnifiedSearchBar && (
        <EuiFlexItem>
          <UnifiedSearchBar
            placeholder={searchBarPlaceholder}
            boolFilter={searchBarBoolFilter}
            showQueryInput={showQueryInput}
            showFilterBar={showFilterBar}
            showDatePicker
            showSubmitButton
          />
        </EuiFlexItem>
      )}
      {showUnifiedSearchBar && hasSecondaryFilters && <EuiSpacer size="s" />}
      {showUnifiedSearchBar && hasSecondaryFilters && (
        <EuiFlexGroup gutterSize="none" justifyContent="flexStart" responsive={false}>
          <EuiFlexItem grow={false} style={secondaryFiltersWidthStyle}>
            <EuiFlexGrid
              columns={!isMedium ? 3 : 1}
              gutterSize="s"
              css={css`
                width: 100%;
                max-width: 100%;
              `}
            >
              {showTransactionTypeSelector && (
                <EuiFlexItem>
                  <TransactionTypeSelect compressed fullWidth />
                </EuiFlexItem>
              )}

              {showEnvironmentFilter && (
                <EuiFlexItem>
                  <ApmEnvironmentFilter compressed fullWidth />
                </EuiFlexItem>
              )}

              {showTimeComparison && (
                <EuiFlexItem>
                  <TimeComparison compressed fullWidth />
                </EuiFlexItem>
              )}

              {showAnomalyThresholdSelector && (
                <EuiFlexItem>
                  <AnomalyThresholdSelect compressed fullWidth />
                </EuiFlexItem>
              )}
            </EuiFlexGrid>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
      {!showUnifiedSearchBar && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGrid columns={!isMedium ? 3 : 1} gutterSize="s">
            {showTransactionTypeSelector && (
              <EuiFlexItem>
                <TransactionTypeSelect compressed fullWidth />
              </EuiFlexItem>
            )}

            {showEnvironmentFilter && (
              <EuiFlexItem>
                <ApmEnvironmentFilter compressed fullWidth />
              </EuiFlexItem>
            )}

            {showTimeComparison && (
              <EuiFlexItem>
                <TimeComparison compressed fullWidth />
              </EuiFlexItem>
            )}

            {showAnomalyThresholdSelector && (
              <EuiFlexItem>
                <AnomalyThresholdSelect compressed fullWidth />
              </EuiFlexItem>
            )}
          </EuiFlexGrid>
        </>
      )}
    </div>
  );
}
