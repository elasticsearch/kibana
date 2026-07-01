/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { PureComponent } from 'react';
import type { History } from 'history';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiButton, EuiText, EuiSpacer, EuiPageTemplate } from '@elastic/eui';

import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import { extractQueryParams, PageLoading, PageError } from '../../../../shared_imports';
import { trackUiMetric, METRIC_TYPE } from '../../../services/track_ui_metric';
import type { CcrApiError } from '../../../services/http_error';
import { getErrorBody } from '../../../services/http_error';
import { API_STATUS, UIM_FOLLOWER_INDEX_LIST_LOAD } from '../../../constants';
import type { ApiStatus, FollowerIndexWithPausedStatus } from '../../../../../common/types';
import { FollowerIndicesTable, DetailPanel } from './components';

const REFRESH_RATE_MS = 30000;

const getQueryParamName = (history: History) => {
  const { name } = extractQueryParams(history.location.search);
  if (!name) {
    return null;
  }
  const nameStr = Array.isArray(name) ? name[0] : name;
  return decodeURIComponent(String(nameStr));
};

export interface FollowerIndicesListProps extends RouteComponentProps {
  loadFollowerIndices: (inBackground?: boolean) => void;
  selectFollowerIndex: (id: string | null) => void;
  followerIndices: FollowerIndexWithPausedStatus[];
  followerIndexId: string | null;
  apiStatus: ApiStatus;
  apiError: CcrApiError | null;
  isAuthorized: boolean;
}

interface FollowerIndicesListState {
  lastFollowerIndexId: string | null;
  isDetailPanelOpen: boolean;
  selectedItems: FollowerIndexWithPausedStatus[];
}

export class FollowerIndicesList extends PureComponent<
  FollowerIndicesListProps,
  FollowerIndicesListState
> {
  private interval?: ReturnType<typeof setInterval>;

  static getDerivedStateFromProps(
    { followerIndexId }: Pick<FollowerIndicesListProps, 'followerIndexId'>,
    { lastFollowerIndexId }: FollowerIndicesListState
  ): Partial<FollowerIndicesListState> | null {
    if (followerIndexId !== lastFollowerIndexId) {
      return {
        lastFollowerIndexId: followerIndexId,
        isDetailPanelOpen: !!followerIndexId,
      };
    }
    return null;
  }

  state: FollowerIndicesListState = {
    lastFollowerIndexId: null,
    isDetailPanelOpen: false,
    selectedItems: [],
  };

  onSelectionChange = (selectedItems: FollowerIndexWithPausedStatus[]) => {
    this.setState({ selectedItems });
  };

  resetSelection = () => {
    this.setState({ selectedItems: [] });
  };

  componentDidMount() {
    const { loadFollowerIndices, selectFollowerIndex, history } = this.props;

    trackUiMetric(METRIC_TYPE.LOADED, UIM_FOLLOWER_INDEX_LIST_LOAD);
    loadFollowerIndices();

    // Select the pattern in the URL query params
    selectFollowerIndex(getQueryParamName(history));

    // Interval to load follower indices in the background passing "true" to the fetch method
    this.interval = setInterval(() => loadFollowerIndices(true), REFRESH_RATE_MS);
  }

  componentDidUpdate(prevProps: FollowerIndicesListProps, prevState: FollowerIndicesListState) {
    const { history } = this.props;
    const { lastFollowerIndexId } = this.state;

    /**
     * Each time our state is updated (through getDerivedStateFromProps())
     * we persist the follower index id to query params for deep linking
     */
    if (lastFollowerIndexId !== prevState.lastFollowerIndexId) {
      if (!lastFollowerIndexId) {
        history.replace({
          search: '',
        });
      } else {
        // Preserve existing query params (e.g., waitForActive)
        const searchParams = new URLSearchParams(history.location.search);
        searchParams.set('name', lastFollowerIndexId);
        history.replace({
          search: `?${searchParams.toString()}`,
        });
      }
    }
  }

  componentWillUnmount() {
    if (this.interval !== undefined) {
      clearInterval(this.interval);
    }
  }

  renderEmpty() {
    return (
      <EuiPageTemplate.EmptyPrompt
        iconType="managementApp"
        data-test-subj="emptyPrompt"
        title={
          <h1>
            <FormattedMessage
              id="xpack.crossClusterReplication.followerIndexList.emptyPromptTitle"
              defaultMessage="Create your first follower index"
            />
          </h1>
        }
        body={
          <p>
            <FormattedMessage
              id="xpack.crossClusterReplication.followerIndexList.emptyPromptDescription"
              defaultMessage="Use a follower index to replicate a leader index on a remote cluster."
            />
          </p>
        }
        actions={
          <EuiButton
            {...reactRouterNavigate(this.props.history, `/follower_indices/add`)}
            fill
            iconType="plusCircle"
            data-test-subj="createFollowerIndexButton"
          >
            <FormattedMessage
              id="xpack.crossClusterReplication.addFollowerButtonLabel"
              defaultMessage="Create a follower index"
            />
          </EuiButton>
        }
      />
    );
  }

  renderLoading() {
    return (
      <PageLoading>
        <FormattedMessage
          id="xpack.crossClusterReplication.followerIndexList.loadingTitle"
          defaultMessage="Loading follower indices..."
        />
      </PageLoading>
    );
  }

  renderList() {
    const { selectFollowerIndex, followerIndices } = this.props;

    const { isDetailPanelOpen, selectedItems } = this.state;

    return (
      <>
        <EuiText>
          <p>
            <FormattedMessage
              id="xpack.crossClusterReplication.followerIndexList.followerIndicesDescription"
              defaultMessage="A follower index replicates a leader index on a remote cluster."
            />
          </p>
        </EuiText>

        <EuiSpacer size="l" />

        <FollowerIndicesTable
          followerIndices={followerIndices}
          selectedItems={selectedItems}
          onSelectionChange={this.onSelectionChange}
          resetSelection={this.resetSelection}
        />

        {isDetailPanelOpen && (
          <DetailPanel
            closeDetailPanel={() => selectFollowerIndex(null)}
            onActionComplete={this.resetSelection}
          />
        )}
      </>
    );
  }

  render() {
    const { followerIndices, apiError, isAuthorized, apiStatus } = this.props;
    const isEmpty = apiStatus === API_STATUS.IDLE && !followerIndices.length;

    if (!isAuthorized) {
      return (
        <PageError
          title={i18n.translate(
            'xpack.crossClusterReplication.followerIndexList.permissionErrorTitle',
            {
              defaultMessage: 'Permission error',
            }
          )}
          error={{
            error: i18n.translate(
              'xpack.crossClusterReplication.followerIndexList.noPermissionText',
              {
                defaultMessage: 'You do not have permission to view or add follower indices.',
              }
            ),
          }}
        />
      );
    }

    if (apiError) {
      const title = i18n.translate(
        'xpack.crossClusterReplication.followerIndexList.loadingErrorTitle',
        {
          defaultMessage: 'Error loading follower indices',
        }
      );

      const body = getErrorBody(apiError);
      const error = { error: body?.message ?? apiError.message, statusCode: body?.statusCode };
      return <PageError title={title} error={error} />;
    }

    if (isEmpty) {
      return this.renderEmpty();
    }

    if (apiStatus === API_STATUS.LOADING) {
      return this.renderLoading();
    }

    return this.renderList();
  }
}
