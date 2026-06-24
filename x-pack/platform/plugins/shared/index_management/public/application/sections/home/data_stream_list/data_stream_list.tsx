/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiPageSection,
  EuiEmptyPrompt,
  EuiCallOut,
  EuiButton,
  EuiLink,
  EuiScreenReaderLive,
} from '@elastic/eui';
import type { ScopedHistory } from '@kbn/core/public';

import type { Error } from '../../../../shared_imports';
import {
  PageLoading,
  PageError,
  reactRouterNavigate,
  extractQueryParams,
  attemptToURIDecode,
  APP_WRAPPER_CLASS,
  useExecutionContext,
} from '../../../../shared_imports';
import { Section } from '../../../../../common/constants';
import { useAppContext } from '../../../app_context';
import { useLoadDataStreams } from '../../../services/api';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../../services/breadcrumbs';
import { documentationService } from '../../../services/documentation';
import { DataStreamTable } from './data_stream_table';
import { DataStreamDetailPanel } from './data_stream_detail_panel';
import { filterDataStreams, isSelectedDataStreamHidden } from '../../../lib/data_streams';
import type { Filters } from '../components';
import { useStateWithLocalStorage } from '../../../hooks/use_state_with_localstorage';

const SHOW_PROJECT_LEVEL_RETENTION = 'showProjectLevelRetention';
export type DataStreamFilterName = 'managed' | 'hidden';
interface MatchParams {
  dataStreamName?: string;
}

export const DataStreamList: React.FunctionComponent<RouteComponentProps<MatchParams>> = ({
  match: {
    params: { dataStreamName },
  },
  location: { search },
  history,
}) => {
  const { isDeepLink, includeHidden } = extractQueryParams(search);
  const decodedDataStreamName = attemptToURIDecode(dataStreamName);

  const {
    config: { enableProjectLevelRetentionChecks },
    core: { getUrlForApp, executionContext },
    plugins: { isFleetEnabled, cloud },
  } = useAppContext();

  useExecutionContext(executionContext, {
    type: 'application',
    page: 'indexManagementDataStreamsTab',
  });

  useEffect(() => {
    breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.dataStreams);
  }, []);

  const [isIncludeStatsChecked, setIsIncludeStatsChecked] = useState(false);
  const [includeStatsAnnouncement, setIncludeStatsAnnouncement] = useState('');

  const handleIncludeStatsChange = (nextChecked: boolean) => {
    setIsIncludeStatsChecked(nextChecked);
    setIncludeStatsAnnouncement(
      nextChecked
        ? i18n.translate('xpack.idxMgmt.dataStreamListControls.includeStatsSwitchOn', {
            defaultMessage: 'Include stats on',
          })
        : i18n.translate('xpack.idxMgmt.dataStreamListControls.includeStatsSwitchOff', {
            defaultMessage: 'Include stats off',
          })
    );
  };

  const {
    error,
    isInitialRequest,
    isLoading,
    data: dataStreams,
    resendRequest: reload,
  } = useLoadDataStreams({
    includeStats: isIncludeStatsChecked,
  });

  const [projectLevelRetentionCallout, setprojectLevelRetentionCallout] =
    useStateWithLocalStorage<boolean>(SHOW_PROJECT_LEVEL_RETENTION, true);

  const [filters, setFilters] = useState<Filters<DataStreamFilterName>>({
    managed: {
      name: i18n.translate('xpack.idxMgmt.dataStreamList.viewManagedLabel', {
        defaultMessage: 'Managed data streams',
      }),
      checked: 'on',
    },
    hidden: {
      name: i18n.translate('xpack.idxMgmt.dataStreamList.viewHiddenLabel', {
        defaultMessage: 'Hidden data streams',
      }),
      checked: includeHidden ? 'on' : 'off',
    },
  });

  const activateHiddenFilter = (shouldBeActive: boolean) => {
    if (shouldBeActive && filters.hidden.checked === 'off') {
      setFilters({
        ...filters,
        hidden: {
          ...filters.hidden,
          checked: 'on',
        },
      });
    }
  };

  const filteredDataStreams = useMemo(() => {
    if (!dataStreams) {
      // If dataStreams are not fetched, return empty array.
      return [];
    }

    const visibleTypes = Object.entries(filters)
      .filter(([name, _filter]) => _filter.checked === 'on')
      .map(([name]) => name);

    return filterDataStreams(dataStreams, visibleTypes);
  }, [dataStreams, filters]);

  const renderHeader = () => {
    return (
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiText color="subdued" css={{ maxWidth: '80%' }}>
            <FormattedMessage
              id="xpack.idxMgmt.dataStreamList.dataStreamsDescription"
              defaultMessage="Data streams store time-series data across multiple indices and can be created from index templates. {learnMoreLink}"
              values={{
                learnMoreLink: (
                  <EuiLink
                    href={documentationService.getDataStreamsDocumentationLink()}
                    target="_blank"
                    external
                  >
                    {i18n.translate('xpack.idxMgmt.dataStreamListDescription.learnMoreLinkText', {
                      defaultMessage: 'Learn more.',
                    })}
                  </EuiLink>
                ),
              }}
            />
          </EuiText>
        </EuiFlexItem>

        {enableProjectLevelRetentionChecks && (
          <EuiFlexItem grow={false}>
            <EuiLink
              href={cloud?.deploymentUrl}
              target="_blank"
              data-test-subj="projectLevelRetentionLink"
            >
              <FormattedMessage
                id="xpack.idxMgmt.dataStreamList.projectlevelRetention.linkText"
                defaultMessage="Project data retention"
              />
            </EuiLink>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  };

  let content;

  if (isLoading && isInitialRequest) {
    content = (
      <PageLoading>
        <FormattedMessage
          id="xpack.idxMgmt.dataStreamList.loadingDataStreamsDescription"
          defaultMessage="Loading data streams…"
        />
      </PageLoading>
    );
  } else if (error) {
    content = (
      <PageError
        title={
          <FormattedMessage
            id="xpack.idxMgmt.dataStreamList.loadingDataStreamsErrorMessage"
            defaultMessage="Error loading data streams"
          />
        }
        error={error as Error}
      />
    );
  } else if (Array.isArray(dataStreams) && dataStreams.length === 0) {
    content = (
      <EuiEmptyPrompt
        iconType="managementApp"
        title={
          <h1 data-test-subj="title">
            <FormattedMessage
              id="xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsTitle"
              defaultMessage="You don't have any data streams yet"
            />
          </h1>
        }
        body={
          <p>
            <FormattedMessage
              id="xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsDescription"
              defaultMessage="Data streams store time-series data across multiple indices."
            />
            {' ' /* We need this space to separate these two sentences. */}
            {isFleetEnabled ? (
              <FormattedMessage
                id="xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsCtaFleetMessage"
                defaultMessage="Get started with data streams in {link}."
                values={{
                  link: (
                    <EuiLink
                      data-test-subj="dataStreamsEmptyPromptTemplateLink"
                      href={getUrlForApp('fleet')}
                    >
                      {i18n.translate(
                        'xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsCtaFleetLink',
                        {
                          defaultMessage: 'Fleet',
                        }
                      )}
                    </EuiLink>
                  ),
                }}
              />
            ) : (
              <FormattedMessage
                id="xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsCtaIndexTemplateMessage"
                defaultMessage="Get started with data streams by creating a {link}."
                values={{
                  link: (
                    <EuiLink
                      data-test-subj="dataStreamsEmptyPromptTemplateLink"
                      {...reactRouterNavigate(history, {
                        pathname: '/templates',
                      })}
                    >
                      {i18n.translate(
                        'xpack.idxMgmt.dataStreamList.emptyPrompt.noDataStreamsCtaIndexTemplateLink',
                        {
                          defaultMessage: 'composable index template',
                        }
                      )}
                    </EuiLink>
                  ),
                }}
              />
            )}
          </p>
        }
        data-test-subj="emptyPrompt"
      />
    );
  } else {
    activateHiddenFilter(isSelectedDataStreamHidden(dataStreams!, decodedDataStreamName));
    content = (
      <EuiPageSection paddingSize="none" data-test-subj="dataStreamList">
        {enableProjectLevelRetentionChecks && projectLevelRetentionCallout && (
          <>
            <EuiCallOut
              announceOnMount
              onDismiss={() => setprojectLevelRetentionCallout(false)}
              data-test-subj="projectLevelRetentionCallout"
              title={i18n.translate(
                'xpack.idxMgmt.dataStreamList.projectLevelRetentionCallout.titleText',
                {
                  defaultMessage:
                    'You can now configure data stream retention settings for your entire project',
                }
              )}
            >
              <p>
                <FormattedMessage
                  id="xpack.idxMgmt.dataStreamList.projectLevelRetentionCallout.descriptionText"
                  defaultMessage="Optionally define a maximum and default retention period to manage your compliance and storage size needs."
                />
              </p>

              <EuiButton href={cloud?.deploymentUrl} fill data-test-subj="cloudLinkButton">
                <FormattedMessage
                  id="xpack.idxMgmt.dataStreamList.projectLevelRetentionCallout.buttonText"
                  defaultMessage="Get started"
                />
              </EuiButton>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        )}

        {renderHeader()}
        <EuiSpacer size="l" />

        <DataStreamTable
          filters={isDeepLink && decodedDataStreamName !== undefined ? decodedDataStreamName : ''}
          dataStreams={filteredDataStreams}
          isLoading={isLoading}
          reload={reload}
          viewFilters={filters}
          onViewFilterChange={setFilters}
          history={history as ScopedHistory}
          includeStats={isIncludeStatsChecked}
          setIncludeStats={handleIncludeStatsChange}
        />
      </EuiPageSection>
    );
  }

  return (
    <div className={APP_WRAPPER_CLASS}>
      <EuiScreenReaderLive>{includeStatsAnnouncement}</EuiScreenReaderLive>
      {content}

      {/*
        If the user has been deep-linked, they'll expect to see the detail panel because it reflects
        the URL state, even if there are no data streams or if there was an error loading them.
      */}
      {decodedDataStreamName && (
        <DataStreamDetailPanel
          dataStreamName={decodedDataStreamName}
          onClose={(shouldReload?: boolean) => {
            history.push(`/${Section.DataStreams}`);

            // If the data stream was deleted, we need to refresh the list.
            if (shouldReload) {
              reload();
            }
          }}
        />
      )}
    </div>
  );
};
