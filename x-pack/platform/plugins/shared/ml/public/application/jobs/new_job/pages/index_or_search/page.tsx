/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useState } from 'react';
import { EuiFlexGroup, EuiFormRow, EuiPageBody, EuiPanel, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ProjectRouting } from '@kbn/es-query';
import { useFetchProjects } from '@kbn/cps-utils';
import { MlProjectPickerPanel } from '@kbn/ml-cps';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import type { FinderAttributes, SavedObjectCommon } from '@kbn/saved-objects-finder-plugin/common';
import { isEsqlSavedSearch, type DiscoverSessionFinderAttributes } from '@kbn/discover-utils';
import { PageTitle } from '../../../../components/page_title';
import { CreateDataViewButton } from '../../../../components/create_data_view_button';
import {
  useMlKibana,
  useNavigateToPath,
  useMlManagementLocator,
} from '../../../../contexts/kibana';
import { MlPageHeader } from '../../../../components/page_header';

export interface PageProps {
  nextStepPath: string;
  extraButtons?: React.ReactNode;
}

const RESULTS_PER_PAGE = 20;

type SavedObject = SavedObjectCommon<FinderAttributes & DiscoverSessionFinderAttributes>;

function buildSourceSelectionPath(
  nextStepPath: string,
  id: string,
  type: 'index-pattern' | 'search',
  projectRouting: string | undefined
): string {
  const params = new URLSearchParams();
  if (type === 'index-pattern') {
    params.set('index', id);
  } else {
    params.set('savedSearchId', id);
  }
  if (projectRouting !== undefined && projectRouting !== '') {
    params.set('project_routing', projectRouting);
  }
  return `${nextStepPath}?${params.toString()}`;
}

export const Page: FC<PageProps> = ({ nextStepPath, extraButtons }) => {
  const { contentManagement, uiSettings, cps } = useMlKibana().services;
  const mlLocator = useMlManagementLocator();
  const navigateToPath = useNavigateToPath();
  const cpsManager = cps?.cpsManager;
  const totalProjectCount = cpsManager?.getTotalProjectCount() ?? 0;
  const [projectRouting, setProjectRouting] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (cpsManager) {
      setProjectRouting((prev) =>
        prev === undefined ? cpsManager.getDefaultProjectRouting() ?? undefined : prev
      );
    }
  }, [cpsManager]);

  const fetchProjects = useCallback(
    (routing?: ProjectRouting) => {
      return cpsManager?.fetchProjects(routing) ?? Promise.resolve(null);
    },
    [cpsManager]
  );

  const projects = useFetchProjects(fetchProjects, projectRouting);

  const onProjectRoutingChange = useCallback((newProjectRouting: ProjectRouting) => {
    setProjectRouting(newProjectRouting as string);
  }, []);

  const onObjectSelection = async (id: string, type: string, _name?: string) => {
    const savedObjectType: 'index-pattern' | 'search' =
      type === 'index-pattern' ? 'index-pattern' : 'search';
    const pathWithQuery = buildSourceSelectionPath(
      nextStepPath,
      id,
      savedObjectType,
      projectRouting
    );
    const urlPath = window.location.pathname;
    if (urlPath.includes('management')) {
      await mlLocator?.navigate({
        sectionId: 'ml',
        appId: `anomaly_detection/${pathWithQuery}`,
      });
    } else {
      navigateToPath(pathWithQuery);
    }
  };

  return (
    <div data-test-subj="mlPageSourceSelection">
      <EuiPageBody>
        <MlPageHeader>
          <PageTitle
            title={
              <FormattedMessage
                id="xpack.ml.newJob.wizard.selectDataViewOrSavedSearch"
                defaultMessage="Select data view or saved Discover session"
              />
            }
          />
        </MlPageHeader>
        <EuiPanel hasShadow={false}>
          {totalProjectCount > 1 && projects ? (
            <>
              <EuiFormRow
                fullWidth
                label={
                  <FormattedMessage
                    id="xpack.ml.newJob.wizard.indexOrSearch.projectRoutingLabel"
                    defaultMessage="Project scope"
                  />
                }
              >
                <MlProjectPickerPanel
                  projectRouting={projectRouting}
                  onProjectRoutingChange={onProjectRoutingChange}
                  projects={projects}
                  totalProjectCount={totalProjectCount}
                  projectRoutingValueTestSubj="mlIndexOrSearchProjectRoutingValue"
                />
              </EuiFormRow>
              <EuiSpacer size="m" />
            </>
          ) : null}
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
