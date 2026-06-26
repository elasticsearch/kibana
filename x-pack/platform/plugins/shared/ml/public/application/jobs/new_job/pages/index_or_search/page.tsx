/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiFlexGroup, EuiPageBody, EuiPanel } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import type { FinderAttributes, SavedObjectCommon } from '@kbn/saved-objects-finder-plugin/common';
import { isEsqlSavedSearch, type DiscoverSessionFinderAttributes } from '@kbn/discover-utils';
import { MlAppHeader } from '../../../../components/ml_app_header';
import { CreateDataViewButton } from '../../../../components/create_data_view_button';
import {
  useMlKibana,
  useNavigateToPath,
  useMlManagementLocator,
} from '../../../../contexts/kibana';

export interface PageProps {
  nextStepPath: string;
  extraButtons?: React.ReactNode;
}

const RESULTS_PER_PAGE = 20;

type SavedObject = SavedObjectCommon<FinderAttributes & DiscoverSessionFinderAttributes>;

export const Page: FC<PageProps> = ({ nextStepPath, extraButtons }) => {
  const { contentManagement, uiSettings } = useMlKibana().services;
  const mlLocator = useMlManagementLocator();
  const navigateToPath = useNavigateToPath();

  const onObjectSelection = async (id: string, type: string, name?: string) => {
    const urlPath = window.location.pathname;
    if (urlPath.includes('management')) {
      await mlLocator?.navigate({
        sectionId: 'ml',
        appId: `anomaly_detection/${nextStepPath}?${
          type === 'index-pattern' ? 'index' : 'savedSearchId'
        }=${encodeURIComponent(id)}`,
      });
    } else {
      navigateToPath(
        `${nextStepPath}?${
          type === 'index-pattern' ? 'index' : 'savedSearchId'
        }=${encodeURIComponent(id)}`
      );
    }
  };

  return (
    <div data-test-subj="mlPageSourceSelection">
      <EuiPageBody restrictWidth={1200}>
        <MlAppHeader
          title={i18n.translate('xpack.ml.newJob.wizard.selectDataViewOrSavedSearch', {
            defaultMessage: 'Select data view or saved Discover session',
          })}
        />
        <EuiPanel hasShadow={false} hasBorder>
          <SavedObjectFinder
            id="mlJobsDatafeedDataView"
            key="searchSavedObjectFinder"
            onChoose={onObjectSelection}
            showFilter
            noItemsMessage={i18n.translate('xpack.ml.newJob.wizard.searchSelection.notFoundLabel', {
              defaultMessage: 'No matching data views or saved Discover sessions found.',
            })}
            savedObjectMetaData={[
              {
                type: 'search',
                getIconForSavedObject: () => 'discoverApp',
                name: i18n.translate(
                  'xpack.ml.newJob.wizard.searchSelection.savedObjectType.discoverSession',
                  {
                    defaultMessage: 'Discover session',
                  }
                ),
                showSavedObject: (savedObject: SavedObject) =>
                  // ES|QL Based saved searches are not supported across ML, filter them out
                  !isEsqlSavedSearch(savedObject),
              },
              {
                type: 'index-pattern',
                getIconForSavedObject: () => 'indexPatternApp',
                name: i18n.translate(
                  'xpack.ml.newJob.wizard.searchSelection.savedObjectType.dataView',
                  {
                    defaultMessage: 'Data view',
                  }
                ),
              },
            ]}
            fixedPageSize={RESULTS_PER_PAGE}
            services={{
              contentClient: contentManagement.client,
              uiSettings,
            }}
          >
            <EuiFlexGroup direction="row" gutterSize="s">
              <CreateDataViewButton
                onDataViewCreated={(dataView) => {
                  onObjectSelection(dataView.id!, 'index-pattern', dataView.getIndexPattern());
                }}
                allowAdHocDataView={true}
              />
              {extraButtons ? extraButtons : null}
            </EuiFlexGroup>
          </SavedObjectFinder>
        </EuiPanel>
      </EuiPageBody>
    </div>
  );
};
