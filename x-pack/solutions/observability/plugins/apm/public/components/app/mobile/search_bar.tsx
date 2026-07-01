/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { css } from '@emotion/react';
import { EuiFlexGrid, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { useBreakpoints } from '../../../hooks/use_breakpoints';
import { ApmEnvironmentFilter } from '../../shared/environment_filter';
import { TimeComparison } from '../../shared/time_comparison';
import { useSecondaryFiltersWidthStyle } from '../../shared/search_bar/use_secondary_filters_width_style';
import { MobileFilters } from './service_overview/filters';
import { UnifiedSearchBar } from '../../shared/unified_search_bar';

interface Props {
  hidden?: boolean;
  showUnifiedSearchBar?: boolean;
  showFilterBar?: boolean;
  showTimeComparison?: boolean;
  showEnvironmentFilter?: boolean;
  showTransactionTypeSelector?: boolean;
  showQueryInput?: boolean;
  showMobileFilters?: boolean;
  searchBarPlaceholder?: string;
}

export function MobileSearchBar({
  hidden = false,
  showUnifiedSearchBar = true,
  showFilterBar = false,
  showTimeComparison = false,
  showEnvironmentFilter = false,
  showTransactionTypeSelector = false,
  showQueryInput = true,
  showMobileFilters = false,
  searchBarPlaceholder,
}: Props) {
  const { isMedium } = useBreakpoints();
  const hasSecondaryFilters = showEnvironmentFilter || showTimeComparison || showMobileFilters;

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
            showQueryInput={showQueryInput}
            showFilterBar={showFilterBar}
          />
        </EuiFlexItem>
      )}
      {hasSecondaryFilters && <EuiSpacer size="s" />}
      {hasSecondaryFilters && (
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

              {showMobileFilters && <MobileFilters />}
            </EuiFlexGrid>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </div>
  );
}
