/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer, useIsWithinBreakpoints } from '@elastic/eui';
import { css } from '@emotion/react';
import { isDraftGetResponse, Streams } from '@kbn/streams-schema';
import React, { type CSSProperties, type ReactNode, useMemo } from 'react';
import { useStreamDetail } from '../../hooks/use_stream_detail';
import { useStreamsPrivileges } from '../../hooks/use_streams_privileges';
import { AboutPanel } from './about_panel';
import { DataQualityCard } from './data_quality_card';
import { IngestRateChart } from './ingest_rate_chart';
import { ImportExportPanel } from './import_export_panel';

interface OverviewSection {
  id: string;
  node: ReactNode;
  show: boolean;
}

export function StreamOverview() {
  const { definition, refresh } = useStreamDetail();
  const {
    features: { contentPacks },
  } = useStreamsPrivileges();

  const isIngest = Streams.ingest.all.GetResponse.is(definition);
  const isDraft = isDraftGetResponse(definition);
  /** Match EuiFlexGroup responsive `m` max-breakpoint so sidebar stacks above main when narrow. */
  const isStackedOverviewLayout = useIsWithinBreakpoints(['xs', 's', 'm']);
  const isMobileOverviewLayout = useIsWithinBreakpoints(['xs', 's']);

  const mainColumnStyle = useMemo<CSSProperties | undefined>(
    () => (isStackedOverviewLayout ? { width: '100%' } : undefined),
    [isStackedOverviewLayout]
  );

  const sidebarColumnStyle = useMemo<CSSProperties>(
    () => (isStackedOverviewLayout ? { width: '100%' } : { width: 340 }),
    [isStackedOverviewLayout]
  );

  const mainSections: OverviewSection[] = [
    { id: 'ingest-rate-chart', node: <IngestRateChart />, show: true },
    { id: 'dataset-quality', node: <DataQualityCard />, show: isIngest && !isDraft },
  ];

  const sidebarSections: OverviewSection[] = [
    { id: 'about', node: <AboutPanel />, show: true },
    {
      id: 'import-export',
      node: <ImportExportPanel definition={definition} refreshDefinition={refresh} />,
      show: isIngest && contentPacks?.enabled === true,
    },
  ];

  return (
    <EuiFlexGroup
      alignItems="flexStart"
      gutterSize="m"
      direction={isStackedOverviewLayout ? 'column' : 'row'}
      responsive={false}
    >
      <EuiFlexItem grow={false} style={sidebarColumnStyle}>
        <EuiFlexGroup direction={isStackedOverviewLayout ? 'row' : 'column'} gutterSize="m">
          {sidebarSections
            .filter((s) => s.show)
            .map((s) => (
              <EuiFlexItem
                key={s.id}
                grow={isStackedOverviewLayout}
                css={
                  isStackedOverviewLayout &&
                  !isMobileOverviewLayout &&
                  css`
                    max-width: 50%;
                  `
                }
              >
                {s.node}
              </EuiFlexItem>
            ))}
        </EuiFlexGroup>
      </EuiFlexItem>

      <EuiFlexItem grow={!isStackedOverviewLayout} style={mainColumnStyle}>
        <EuiFlexGroup direction="column" gutterSize="m">
          {mainSections
            .filter((s) => s.show)
            .map((s) => (
              <EuiFlexItem key={s.id} grow={false}>
                {s.node}
              </EuiFlexItem>
            ))}
        </EuiFlexGroup>
        <EuiSpacer size="xxl" />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
