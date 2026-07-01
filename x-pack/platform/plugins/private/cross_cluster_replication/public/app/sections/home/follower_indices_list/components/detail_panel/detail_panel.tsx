/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useEffect, useCallback, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCodeBlock,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiHealth,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';

import { getIndexListUri } from '@kbn/index-management-plugin/public';
import type { ApiStatus, FollowerIndexWithPausedStatus } from '../../../../../../../common/types';
import { routing } from '../../../../../services/routing';
import { API_STATUS } from '../../../../../constants';
import { ContextMenu } from '../context_menu';
import { usePolling } from '../../../../../hooks';

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 5000;

interface FollowerIndexDetailsProps {
  followerIndex: FollowerIndexWithPausedStatus;
  isPollingStatus: boolean;
}

const FollowerIndexDetails = ({ followerIndex, isPollingStatus }: FollowerIndexDetailsProps) => {
  const {
    remoteCluster,
    leaderIndex,
    isPaused,
    shards,
    maxReadRequestOperationCount,
    maxOutstandingReadRequests,
    maxReadRequestSize,
    maxWriteRequestOperationCount,
    maxWriteRequestSize,
    maxOutstandingWriteRequests,
    maxWriteBufferCount,
    maxWriteBufferSize,
    maxRetryDelay,
    readPollTimeout,
  } = followerIndex;

  return (
    <Fragment>
      <EuiFlyoutBody>
        <section>
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiDescriptionList>
                <EuiDescriptionListTitle>
                  <EuiTitle size="xs">
                    <FormattedMessage
                      id="xpack.crossClusterReplication.followerIndexDetailPanel.statusLabel"
                      defaultMessage="Status"
                    />
                  </EuiTitle>
                </EuiDescriptionListTitle>

                <EuiDescriptionListDescription data-test-subj="status">
                  {isPaused ? (
                    isPollingStatus ? (
                      <EuiFlexGroup gutterSize="xs" alignItems="center">
                        <EuiLoadingSpinner size="s" />
                        <EuiText size="s" color="subdued">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexDetailPanel.checkingStatus"
                            defaultMessage="Checking status..."
                          />
                        </EuiText>
                      </EuiFlexGroup>
                    ) : (
                      <EuiHealth color="subdued">
                        <FormattedMessage
                          id="xpack.crossClusterReplication.followerIndexDetailPanel.pausedStatus"
                          defaultMessage="Paused"
                        />
                      </EuiHealth>
                    )
                  ) : (
                    <EuiHealth color="success">
                      <FormattedMessage
                        id="xpack.crossClusterReplication.followerIndexDetailPanel.activeStatus"
                        defaultMessage="Active"
                      />
                    </EuiHealth>
                  )}
                </EuiDescriptionListDescription>
              </EuiDescriptionList>
            </EuiFlexItem>
          </EuiFlexGroup>

          <EuiSpacer size="s" />

          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiDescriptionList>
                <EuiDescriptionListTitle>
                  <EuiTitle size="xs">
                    <FormattedMessage
                      id="xpack.crossClusterReplication.followerIndexDetailPanel.remoteClusterLabel"
                      defaultMessage="Remote cluster"
                    />
                  </EuiTitle>
                </EuiDescriptionListTitle>

                <EuiDescriptionListDescription data-test-subj="remoteCluster">
                  {remoteCluster}
                </EuiDescriptionListDescription>
              </EuiDescriptionList>
            </EuiFlexItem>

            <EuiFlexItem>
              <EuiDescriptionList>
                <EuiDescriptionListTitle>
                  <EuiTitle size="xs">
                    <FormattedMessage
                      id="xpack.crossClusterReplication.followerIndexDetailPanel.leaderIndexLabel"
                      defaultMessage="Leader index"
                    />
                  </EuiTitle>
                </EuiDescriptionListTitle>

                <EuiDescriptionListDescription data-test-subj="leaderIndex">
                  {leaderIndex}
                </EuiDescriptionListDescription>
              </EuiDescriptionList>
            </EuiFlexItem>
          </EuiFlexGroup>
        </section>

        <EuiSpacer size="l" />

        {!isPollingStatus && (
          <section
            aria-labelledby="ccrFollowerIndexDetailSettingsTitle"
            data-test-subj="settingsSection"
          >
            <EuiTitle size="s">
              <h3 id="ccrFollowerIndexDetailSettingsTitle">
                <FormattedMessage
                  id="xpack.crossClusterReplication.followerIndexDetailPanel.settingsTitle"
                  defaultMessage="Settings"
                />
              </h3>
            </EuiTitle>

            <EuiSpacer size="s" />

            {isPaused ? (
              <EuiCallOut
                size="s"
                title={
                  <FormattedMessage
                    id="xpack.crossClusterReplication.followerIndexDetailPanel.pausedFollowerCalloutTitle"
                    defaultMessage="A paused follower index does not have settings or shard statistics."
                  />
                }
              />
            ) : (
              <>
                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxReadRequestOperationCountTitle"
                            defaultMessage="Max read request operation count"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxReadReqOpCount">
                        {maxReadRequestOperationCount}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>

                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxOutstandingReadRequestsTitle"
                            defaultMessage="Max outstanding read requests"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxOutstandingReadReq">
                        {maxOutstandingReadRequests}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="s" />

                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxReadRequestSizeTitle"
                            defaultMessage="Max read request size"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxReadReqSize">
                        {maxReadRequestSize}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>

                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxWriteRequestOperationCountTitle"
                            defaultMessage="Max write request operation count"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxWriteReqOpCount">
                        {maxWriteRequestOperationCount}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="s" />

                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxWriteRequestSizeTitle"
                            defaultMessage="Max write request size"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxWriteReqSize">
                        {maxWriteRequestSize}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>

                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxOutstandingWriteRequestsTitle"
                            defaultMessage="Max outstanding write requests"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxOutstandingWriteReq">
                        {maxOutstandingWriteRequests}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="s" />

                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxWriteBufferCountTitle"
                            defaultMessage="Max write buffer count"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxWriteBufferCount">
                        {maxWriteBufferCount}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>

                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxWriteBufferSizeTitle"
                            defaultMessage="Max write buffer size"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxWriteBufferSize">
                        {maxWriteBufferSize}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>
                </EuiFlexGroup>

                <EuiSpacer size="s" />

                <EuiFlexGroup>
                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.maxRetryDelayTitle"
                            defaultMessage="Max retry delay"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="maxRetryDelay">
                        {maxRetryDelay}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>

                  <EuiFlexItem>
                    <EuiDescriptionList data-test-subj="settingsValues">
                      <EuiDescriptionListTitle>
                        <EuiTitle size="xs">
                          <FormattedMessage
                            id="xpack.crossClusterReplication.followerIndexForm.advancedSettings.readPollTimeoutTitle"
                            defaultMessage="Read poll timeout"
                          />
                        </EuiTitle>
                      </EuiDescriptionListTitle>

                      <EuiDescriptionListDescription data-test-subj="readPollTimeout">
                        {readPollTimeout}
                      </EuiDescriptionListDescription>
                    </EuiDescriptionList>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
          </section>
        )}

        <EuiSpacer size="l" />

        <section data-test-subj="shardsStatsSection">
          {shards &&
            shards.map((shard, i) => (
              <Fragment key={i}>
                <EuiSpacer size="m" />
                <EuiTitle size="xs">
                  <h3>
                    <FormattedMessage
                      id="xpack.crossClusterReplication.followerIndexDetailPanel.shardStatsTitle"
                      defaultMessage="Shard {id} stats"
                      values={{
                        id: shard.id,
                      }}
                    />
                  </h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <EuiCodeBlock language="json" data-test-subj="shardsStats">
                  {JSON.stringify(shard, null, 2)}
                </EuiCodeBlock>
              </Fragment>
            ))}
        </section>
      </EuiFlyoutBody>
    </Fragment>
  );
};

export interface DetailPanelProps {
  apiStatus?: ApiStatus;
  followerIndexId?: string | null;
  followerIndex?: FollowerIndexWithPausedStatus | null;
  closeDetailPanel: () => void;
  getFollowerIndex: (id: string) => void;
  onActionComplete?: () => void;
}

export const DetailPanel = ({
  followerIndexId,
  closeDetailPanel,
  followerIndex,
  apiStatus,
  getFollowerIndex,
  onActionComplete,
}: DetailPanelProps) => {
  const [isInitialLoad, setInitialLoad] = useState(true);
  const { isPolling, startPolling, stopPolling } = usePolling();

  const shouldPollStatus = useCallback((): boolean => {
    const params = new URLSearchParams(window.location.search);
    return !isPolling && params.get('waitForActive') === 'true';
  }, [isPolling]);

  const clearWaitForActiveParam = useCallback(() => {
    if (followerIndexId) {
      routing.navigate(`/follower_indices`, {
        name: encodeURIComponent(followerIndexId),
      });
    }
  }, [followerIndexId]);

  // Start polling once data is loaded
  useEffect(() => {
    const shouldPoll =
      isInitialLoad &&
      followerIndexId &&
      followerIndex &&
      !!followerIndex?.isPaused &&
      shouldPollStatus();

    if (shouldPoll) {
      const onPoll = () => {
        getFollowerIndex(followerIndexId);
      };

      const onTimeout = () => {
        stopPolling();
        clearWaitForActiveParam();
      };

      startPolling(POLL_INTERVAL_MS, onPoll, POLL_TIMEOUT_MS, onTimeout);
      setInitialLoad(false);
    }
  }, [
    clearWaitForActiveParam,
    followerIndex,
    followerIndexId,
    getFollowerIndex,
    isInitialLoad,
    isPolling,
    shouldPollStatus,
    startPolling,
    stopPolling,
  ]);

  // Stop polling when status becomes active
  useEffect(() => {
    const shouldStopPolling = isPolling && followerIndex && !followerIndex.isPaused;

    if (shouldStopPolling) {
      stopPolling();
      clearWaitForActiveParam();
    }
  }, [followerIndex, isPolling, stopPolling, clearWaitForActiveParam]);

  const renderContent = () => {
    if (apiStatus === API_STATUS.LOADING) {
      return (
        <EuiFlyoutBody>
          <EuiFlexGroup justifyContent="flexStart" alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="m" />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText>
                <EuiTextColor color="subdued">
                  <FormattedMessage
                    id="xpack.crossClusterReplication.followerIndexDetailPanel.loadingLabel"
                    defaultMessage="Loading follower index…"
                  />
                </EuiTextColor>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
      );
    }

    if (!followerIndex) {
      return (
        <EuiFlyoutBody>
          <EuiFlexGroup justifyContent="flexStart" alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <EuiIcon size="m" type="warning" color="danger" aria-hidden={true} />
            </EuiFlexItem>

            <EuiFlexItem grow={false}>
              <EuiText>
                <EuiTextColor color="subdued">
                  <FormattedMessage
                    id="xpack.crossClusterReplication.followerIndexDetailPanel.notFoundLabel"
                    defaultMessage="Follower index not found"
                  />
                </EuiTextColor>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
      );
    }

    return <FollowerIndexDetails followerIndex={followerIndex} isPollingStatus={isPolling} />;
  };

  const renderFooter = () => {
    // Use ID instead of followerIndex, because followerIndex may not be loaded yet.
    const indexManagementUri = getIndexListUri(`name:${followerIndexId}`);

    return (
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="cross"
              flush="left"
              onClick={closeDetailPanel}
              data-test-subj="closeFlyoutButton"
            >
              <FormattedMessage
                id="xpack.crossClusterReplication.followerIndexDetailPanel.closeButtonLabel"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiButton
                  href={routing.reactRouter?.getUrlForApp('management', {
                    path: `data/index_management${indexManagementUri}`,
                  })}
                  data-test-subj="viewIndexManagementButton"
                >
                  <FormattedMessage
                    id="xpack.crossClusterReplication.followerIndexDetailPanel.viewIndexLink"
                    defaultMessage="View in Index Management"
                  />
                </EuiButton>
              </EuiFlexItem>

              {followerIndex && (
                <EuiFlexItem grow={false}>
                  <ContextMenu
                    iconSide="left"
                    iconType="chevronSingleUp"
                    anchorPosition="upRight"
                    label={
                      <FormattedMessage
                        id="xpack.crossClusterReplication.followerIndexDetailPanel.manageButtonLabel"
                        defaultMessage="Manage"
                      />
                    }
                    followerIndices={[followerIndex]}
                    testSubj="manageButton"
                    isPollingStatus={isPolling}
                    onActionComplete={onActionComplete}
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    );
  };

  return (
    <EuiFlyout
      data-test-subj="followerIndexDetail"
      onClose={closeDetailPanel}
      aria-labelledby="followerIndexDetailsFlyoutTitle"
      size="m"
      maxWidth={600}
    >
      <EuiFlyoutHeader>
        <EuiTitle size="m" id="followerIndexDetailsFlyoutTitle" data-test-subj="title">
          <h2>{followerIndexId}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      {renderContent()}
      {renderFooter()}
    </EuiFlyout>
  );
};
