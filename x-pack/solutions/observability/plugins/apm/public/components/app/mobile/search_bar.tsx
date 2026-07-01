/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiFlexGroupProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { css } from '@emotion/react';
import { useBreakpoints } from '../../../hooks/use_breakpoints';
import { ApmEnvironmentFilter } from '../../shared/environment_filter';
import { TimeComparison } from '../../shared/time_comparison';
import { MobileFilters } from './service_overview/filters';
import { UnifiedSearchBar } from '../../shared/unified_search_bar';
import { AnomalyThresholdSelect } from '../../shared/anomaly_threshold_select';

interface Props {
  hidden?: boolean;
  showUnifiedSearchBar?: boolean;
  showFilterBar?: boolean;
  showTimeComparison?: boolean;
  showEnvironmentFilter?: boolean;
  showQueryInput?: boolean;
  showMobileFilters?: boolean;
  showAnomalyThresholdSelector?: boolean;
  searchBarPlaceholder?: string;
}

export function MobileSearchBar({
  hidden = false,
  showUnifiedSearchBar = true,
  showFilterBar = false,
  showTimeComparison = false,
  showEnvironmentFilter = false,
  showQueryInput = true,
  showMobileFilters = false,
  showAnomalyThresholdSelector = false,
  searchBarPlaceholder,
}: Props) {
  const { isSmall, isMedium, isLarge, isXl, isXXXL } = useBreakpoints();

  if (hidden) {
    return null;
  }

  const searchBarDirection: EuiFlexGroupProps['direction'] =
    isXXXL || (!isXl && !showTimeComparison) ? 'row' : 'column';

  const filterControlCss = css`
    width: ${isSmall ? '100%' : '225px'};
  `;

  return (
    <>
      <EuiFlexGroup gutterSize="s" responsive={false} direction={searchBarDirection}>
        <EuiFlexGroup
          direction={isLarge ? 'columnReverse' : 'row'}
          gutterSize="s"
          responsive={false}
        >
          {showUnifiedSearchBar && (
            <EuiFlexItem>
              <UnifiedSearchBar
                placeholder={searchBarPlaceholder}
                showQueryInput={showQueryInput}
                showFilterBar={showFilterBar}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup
        gutterSize={isMedium ? 's' : 'm'}
        direction={isLarge || isMedium ? 'column' : 'row'}
      >
        {showEnvironmentFilter && (
          <EuiFlexItem grow={isSmall}>
            <ApmEnvironmentFilter
              fullWidth
              compressed
              cssOverride={isLarge ? {} : filterControlCss}
            />
          </EuiFlexItem>
        )}
        {showTimeComparison && (
          <EuiFlexItem grow={isSmall} css={filterControlCss}>
            <TimeComparison fullWidth compressed />
          </EuiFlexItem>
        )}
        {showAnomalyThresholdSelector && (
          <EuiFlexItem grow={isSmall} css={filterControlCss}>
            <AnomalyThresholdSelect compressed fullWidth />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {showMobileFilters && (
        <>
          <EuiSpacer size="s" />
          <MobileFilters />
        </>
      )}
    </>
  );
}
