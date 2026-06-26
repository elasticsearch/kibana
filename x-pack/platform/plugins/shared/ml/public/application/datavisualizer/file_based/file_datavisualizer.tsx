/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useMemo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { useTimefilter } from '@kbn/ml-date-picker';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';

import { FileDataVisualizerWrapper } from '@kbn/file-upload/src/file_upload_component/wrapper';

import type { GetAdditionalLinks, GetAdditionalLinksParams } from '@kbn/file-upload-common';
import { getFieldsStatsGrid } from '@kbn/data-visualizer-plugin/public';
import { HelpMenu } from '../../components/help_menu';
import {
  useMlApi,
  useMlKibana,
  useMlLocator,
  useMlManagementLocatorInternal,
} from '../../contexts/kibana';

import { isFullLicense } from '../../license';
import { mlNodesAvailable, getMlNodeCount } from '../../ml_nodes_check/check_ml_nodes';
import { checkPermission } from '../../capabilities/check_capabilities';
import { MlAppHeader } from '../../components/ml_app_header';
import { buildDependencies } from './util';

export const FileDataVisualizerPage: FC = () => {
  useTimefilter({ timeRangeSelector: false, autoRefreshSelector: false });
  const { services } = useMlKibana();
  const {
    docLinks,
    data: {
      dataViews: { get: getDataView },
    },
  } = services;
  const mlApi = useMlApi();
  const mlLocator = useMlLocator()!;
  const mlManagementLocator = useMlManagementLocatorInternal();

  useEffect(() => {
    getMlNodeCount(mlApi);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDependencies = useCallback(async () => buildDependencies(services), [services]);

  const getAdditionalLinks: GetAdditionalLinks = useMemo(
    () => [
      async ({ dataViewId, globalState }: GetAdditionalLinksParams) => [
        {
          id: 'create_ml_job',
          title: i18n.translate('xpack.ml.fileDatavisualizer.actionsPanel.anomalyDetectionTitle', {
            defaultMessage: 'Create ML job',
          }),
          description: '',
          icon: 'machineLearningApp',
          type: 'file',
          getUrl: async () => {
            return (
              await mlManagementLocator.getUrl({
                page: ML_PAGES.ANOMALY_DETECTION_CREATE_JOB_SELECT_TYPE,
                pageState: {
                  index: dataViewId,
                  globalState,
                },
              })
            ).url!;
          },
          canDisplay: async () => {
            try {
              const { timeFieldName } = await getDataView(dataViewId);
              return (
                isFullLicense() &&
                timeFieldName !== undefined &&
                checkPermission('canCreateJob') &&
                mlNodesAvailable()
              );
            } catch (error) {
              return false;
            }
          },
        },
        {
          id: 'open_in_data_viz',
          title: i18n.translate('xpack.ml.fileDatavisualizer.actionsPanel.dataframeTitle', {
            defaultMessage: 'Open in Data Visualizer',
          }),
          description: '',
          icon: 'dataVisualizer',
          type: 'file',
          getUrl: async () => {
            return await mlLocator.getUrl({
              page: ML_PAGES.DATA_VISUALIZER_INDEX_VIEWER,
              pageState: {
                index: dataViewId,
                globalState,
              },
            });
          },
          canDisplay: async () => dataViewId !== '',
        },
      ],
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mlLocator]
  );

  return (
    <>
      <>
        <MlAppHeader
          title={i18n.translate('xpack.ml.dataVisualizer.pageHeader', {
            defaultMessage: 'Data Visualizer',
          })}
        />
        <FileDataVisualizerWrapper
          getDependencies={getDependencies}
          location={'ml-file-data-visualizer'}
          getAdditionalLinks={getAdditionalLinks}
          getFieldsStatsGrid={getFieldsStatsGrid}
        />
      </>

      <HelpMenu docLink={docLinks.links.ml.guide} />
    </>
  );
};
