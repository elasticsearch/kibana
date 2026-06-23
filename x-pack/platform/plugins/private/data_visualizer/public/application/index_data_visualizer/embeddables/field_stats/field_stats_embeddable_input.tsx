/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { CoreStart } from '@kbn/core/public';
import React from 'react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { isDefined } from '@kbn/ml-is-defined';
import { FieldStatisticsInitializer } from './field_stats_initializer';
import type { DataVisualizerStartDependencies } from '../../../common/types/data_visualizer_plugin';
import type { FieldStatsInitialState } from '../../../../../common/embeddables/types';
import type { FieldStatsControlsApi } from './types';
import { getOrCreateDataViewByIndexPattern } from '../../search_strategy/requests/get_data_view_by_index_pattern';

export function EmbeddableFieldStatsUserInput({
  coreStart,
  pluginStart,
  isNewPanel,
  initialState,
  fieldStatsControlsApi,
  closeFlyout,
  onUpdate,
}: {
  coreStart: CoreStart;
  pluginStart: DataVisualizerStartDependencies;
  isNewPanel: boolean;
  initialState?: FieldStatsInitialState;
  fieldStatsControlsApi?: FieldStatsControlsApi;
  closeFlyout: () => void;
  onUpdate: (newUpdate: FieldStatsInitialState) => void;
}) {
  const hasChanged = React.useRef(false);
  const cancelChanges = () => {
    // Reset to initialState in case user has changed the preview state
    if (hasChanged.current && fieldStatsControlsApi && initialState) {
      fieldStatsControlsApi.updateUserInput(initialState);
    }
    closeFlyout();
  };

  const update = async (nextUpdate: FieldStatsInitialState) => {
    const esqlQuery = nextUpdate?.query?.esql;
    if (isDefined(esqlQuery)) {
      const dv = await getOrCreateDataViewByIndexPattern(
        pluginStart.data.dataViews,
        esqlQuery,
        undefined,
        coreStart.http
      );
      if (dv?.id && nextUpdate.data_view_id !== dv.id) {
        nextUpdate.data_view_id = dv.id;
      }
    }
    onUpdate(nextUpdate);
    closeFlyout();
  };

  return (
    <KibanaContextProvider
      services={{
        ...coreStart,
        ...pluginStart,
      }}
    >
      <FieldStatisticsInitializer
        initialInput={initialState}
        onPreview={async (nextUpdate) => {
          if (fieldStatsControlsApi) {
            fieldStatsControlsApi.updateUserInput(nextUpdate);
            hasChanged.current = true;
          }
        }}
        onCreate={update}
        onCancel={cancelChanges}
        isNewPanel={isNewPanel}
      />
    </KibanaContextProvider>
  );
}
