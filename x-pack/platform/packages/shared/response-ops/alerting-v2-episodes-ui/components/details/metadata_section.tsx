/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import { EuiLoadingSpinner, EuiText } from '@elastic/eui';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { getRootEsqlQuery } from '@kbn/alerting-v2-schemas';
import { useFetchEpisodeQuery } from '../../hooks/use_fetch_episode_query';
import { useFetchEpisodeEventDataQuery } from '../../hooks/use_fetch_episode_event_data_query';
import { useFetchRule } from '../../hooks/use_fetch_rule';
import { isRuleLoaded, isRuleLoading } from '../../types/rule_state';
import { useAlertingEpisodeSourceDataView } from '../../hooks/use_alerting_episode_source_data_view';
import { AlertEpisodeMetadataTable } from './metadata_table';
import type { AlertEpisodeMetadataTableProps } from './metadata_table';
import type { AlertEpisodeDetailsServices } from './types';
import * as i18n from './translations';

export interface AlertEpisodeMetadataSectionProps {
  episodeId: string;
  services: Pick<
    AlertEpisodeDetailsServices,
    'data' | 'http' | 'spaces' | 'dataViews' | 'uiSettings' | 'unifiedDocViewer'
  >;
  /**
   * Pixels to subtract from the table's available-height calculation. Use this
   * when rendering inside a container that has a footer/sibling element below
   * the table (e.g. an `EuiFlyoutFooter`) — without this, the doc-viewer
   * table's internal scroll measures against `window.innerHeight` and would
   * extend past the visible area. Defaults to the unified-doc-viewer's own
   * `DEFAULT_MARGIN_BOTTOM` (16px).
   */
  decreaseAvailableHeightBy?: number;
}

export const AlertEpisodeMetadataSection = ({
  episodeId,
  services,
  decreaseAvailableHeightBy,
}: AlertEpisodeMetadataSectionProps) => {
  const { data: episode, isLoading: isLoadingEpisode } = useFetchEpisodeQuery({
    episodeId,
    services,
  });
  const ruleId = episode?.['rule.id'];

  const { ruleState } = useFetchRule({ id: ruleId, http: services.http });

  const {
    data: eventData,
    isLoading: isEventDataLoading,
    isError,
  } = useFetchEpisodeEventDataQuery({
    episodeId,
    services,
  });

  const { value: dataView, loading: isDataViewLoading } = useAlertingEpisodeSourceDataView({
    query: isRuleLoaded(ruleState) ? getRootEsqlQuery(ruleState.rule.query) : undefined,
    dataViews: services.dataViews,
    http: services.http,
  });

  const tableDocView = useMemo(
    () => services.unifiedDocViewer.registry.getAll().find((dv) => dv.id === 'doc_view_table'),
    [services.unifiedDocViewer.registry]
  );

  const hit = useMemo(() => {
    if (!eventData || !dataView) return undefined;
    return buildDataTableRecord({ _source: eventData.data }, dataView);
  }, [eventData, dataView]);

  const renderTable = useCallback<AlertEpisodeMetadataTableProps['renderTable']>(
    ({ hit: h, dataView: dv }) =>
      tableDocView?.render?.({ hit: h, dataView: dv, decreaseAvailableHeightBy }) ?? null,
    [decreaseAvailableHeightBy, tableDocView]
  );

  if (isError) {
    return (
      <EuiText size="s" color="subdued" data-test-subj="alertingV2EpisodeMetadataSectionError">
        {i18n.METADATA_SECTION_ERROR}
      </EuiText>
    );
  }

  if (
    isLoadingEpisode ||
    isEventDataLoading ||
    (ruleId && isRuleLoading(ruleState)) ||
    isDataViewLoading
  ) {
    return <EuiLoadingSpinner size="m" data-test-subj="alertingV2EpisodeMetadataSectionLoading" />;
  }

  if (!isRuleLoaded(ruleState)) {
    return null;
  }

  if (!hit || !dataView || !eventData) {
    return (
      <EuiText size="s" color="subdued" data-test-subj="alertingV2EpisodeMetadataTabEmpty">
        {i18n.METADATA_SECTION_EMPTY}
      </EuiText>
    );
  }

  return (
    <AlertEpisodeMetadataTable
      hit={hit}
      dataView={dataView}
      renderTable={renderTable}
      isStale={Boolean(eventData.isStale)}
      dataTimestamp={eventData.dataTimestamp}
      dateFormat={services.uiSettings.get('dateFormat') ?? undefined}
    />
  );
};
