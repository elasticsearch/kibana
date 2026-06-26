/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataDriftSpec } from '@kbn/data-visualizer-plugin/public';

import { MlDataSourcePicker } from '@kbn/aiops-components';
import { DataViewPicker } from '@kbn/unified-search-plugin/public';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import { i18n } from '@kbn/i18n';
import { useMlKibana } from '../../contexts/kibana';
import { useDataSource } from '../../contexts/ml';
import { MlAppHeader } from '../../components/ml_app_header';

export const DataDriftPage: FC = () => {
  const { services } = useMlKibana();
  const { dataVisualizer } = services;

  const [DataDriftView, setDataDriftView] = useState<DataDriftSpec | null>(null);

  useEffect(() => {
    if (dataVisualizer !== undefined) {
      const { getDataDriftComponent } = dataVisualizer;
      getDataDriftComponent().then(setDataDriftView);
    }
  }, [dataVisualizer]);

  const { selectedDataView: dataView, selectedSavedSearch: savedSearch } = useDataSource();

  const dataSourcePicker = (
    <MlDataSourcePicker
      currentDataView={dataView ?? null}
      services={services}
      DataViewPickerComponent={DataViewPicker}
      SavedObjectFinderComponent={SavedObjectFinder}
    />
  );

  return (
    <>
      <MlAppHeader
        title={i18n.translate('xpack.ml.dataDrift.pageHeader', {
          defaultMessage: 'Data drift',
        })}
      />
      {dataView && DataDriftView ? (
        <DataDriftView
          key={savedSearch?.id ?? dataView.id ?? dataView.getIndexPattern()}
          dataView={dataView}
          savedSearch={savedSearch}
        />
      ) : dataView ? null : (
        <>
          {dataSourcePicker}
          <EuiEmptyPrompt
            title={
              <h2>
                <FormattedMessage
                  id="xpack.ml.common.noDataViewTitle"
                  defaultMessage="No data view selected"
                />
              </h2>
            }
            body={
              <p>
                <FormattedMessage
                  id="xpack.ml.common.noDataViewBody"
                  defaultMessage="Select a data view or Discover session to get started."
                />
              </p>
            }
          />
        </>
      )}
    </>
  );
};
