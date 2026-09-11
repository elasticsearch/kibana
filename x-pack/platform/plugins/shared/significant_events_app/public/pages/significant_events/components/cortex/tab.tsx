/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { FormattedMessage } from '@kbn/i18n-react';
import { CortexActivity } from './activity';
import { CortexHome } from './home';
import { CortexPageView } from './page_view';
import { CortexSidebar, type CortexSidebarSelection } from './sidebar';
import { useCortexPages } from './use_cortex';
import type { CortexStatusFilter } from './types';

export function CortexTab() {
  const { euiTheme } = useEuiTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<CortexStatusFilter>('all');
  const [selection, setSelection] = useState<CortexSidebarSelection>({ kind: 'home' });
  const { data, isLoading, isError } = useCortexPages();

  if (isLoading) {
    return <EuiLoadingSpinner size="xl" data-test-subj="nightshiftCortexLoading" />;
  }

  if (isError) {
    return (
      <EuiEmptyPrompt
        iconType="alert"
        title={
          <h2>
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.loadErrorTitle"
              defaultMessage="Could not load Cortex"
            />
          </h2>
        }
        body={
          <p>
            <FormattedMessage
              id="xpack.significantEventsApp.cortex.loadErrorDescription"
              defaultMessage="The Cortex wiki could not be loaded. Confirm Nightshift investigations are enabled and refresh the page."
            />
          </p>
        }
      />
    );
  }

  const pages = data?.pages ?? [];
  const stats = data?.stats ?? { total: 0, established: 0, total_corroborations: 0 };

  return (
    <EuiFlexGroup
      gutterSize="l"
      alignItems="stretch"
      className={css`
        min-height: 520px;
        height: calc(100vh - 220px);
      `}
      data-test-subj="nightshiftCortexTab"
    >
      <EuiFlexItem
        grow={false}
        className={css`
          width: 280px;
        `}
      >
        <EuiPanel
          hasBorder
          hasShadow={false}
          paddingSize="m"
          className={css`
            height: 100%;
            min-height: 0;
            overflow: hidden;
          `}
        >
          <CortexSidebar
            pages={pages}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            selection={selection}
            onSelect={setSelection}
          />
        </EuiPanel>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiPanel
          hasBorder
          hasShadow={false}
          paddingSize="none"
          className={css`
            height: 100%;
            min-height: 0;
            overflow: hidden;
          `}
        >
          <div
            className={css`
              height: 100%;
              min-height: 0;
              overflow-y: auto;
              padding: ${euiTheme.size.l};
            `}
          >
            {selection.kind === 'home' && (
              <CortexHome
                pages={pages}
                stats={stats}
                onSelectPage={(id) => setSelection({ kind: 'page', id })}
              />
            )}
            {selection.kind === 'activity' && (
              <CortexActivity
                pages={pages}
                onSelectPage={(id) => setSelection({ kind: 'page', id })}
              />
            )}
            {selection.kind === 'page' && <CortexPageView pageId={selection.id} />}
          </div>
        </EuiPanel>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
