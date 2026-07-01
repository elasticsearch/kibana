/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { PureComponent } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type {
  DefaultItemAction,
  EuiInMemoryTableProps,
  EuiSearchBarOnChangeArgs,
} from '@elastic/eui';
import {
  EuiHealth,
  EuiButton,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingLogo,
  EuiOverlayMask,
} from '@elastic/eui';

import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import { API_STATUS, UIM_FOLLOWER_INDEX_SHOW_DETAILS_CLICK } from '../../../../../constants';
import { FollowerIndexActionsProvider } from '../../../../../components';
import { routing } from '../../../../../services/routing';
import { trackUiMetric } from '../../../../../services/track_ui_metric';
import { ContextMenu } from '../context_menu';
import type { ApiStatus, FollowerIndexWithPausedStatus } from '../../../../../../../common/types';

const actionI18nTexts = {
  pause: i18n.translate(
    'xpack.crossClusterReplication.followerIndexList.table.actionPauseDescription',
    {
      defaultMessage: 'Pause replication',
    }
  ),
  resume: i18n.translate(
    'xpack.crossClusterReplication.followerIndexList.table.actionResumeDescription',
    {
      defaultMessage: 'Resume replication',
    }
  ),
  edit: i18n.translate(
    'xpack.crossClusterReplication.followerIndexList.table.actionEditDescription',
    {
      defaultMessage: 'Edit follower index',
    }
  ),
  unfollow: i18n.translate(
    'xpack.crossClusterReplication.followerIndexList.table.actionUnfollowDescription',
    {
      defaultMessage: 'Unfollow leader index',
    }
  ),
};

const getFilteredIndices = (
  followerIndices: FollowerIndexWithPausedStatus[],
  queryText: string
): FollowerIndexWithPausedStatus[] => {
  if (queryText) {
    const normalizedSearchText = queryText.toLowerCase();

    return followerIndices.filter((followerIndex) => {
      // default values to avoid undefined errors
      const { name = '', remoteCluster = '', leaderIndex = '' } = followerIndex;

      if (name.toLowerCase().includes(normalizedSearchText)) {
        return true;
      }

      if (leaderIndex.toLowerCase().includes(normalizedSearchText)) {
        return true;
      }

      if (remoteCluster.toLowerCase().includes(normalizedSearchText)) {
        return true;
      }

      return false;
    });
  }

  return followerIndices;
};

export interface FollowerIndicesTableProps {
  followerIndices: FollowerIndexWithPausedStatus[];
  selectFollowerIndex: (name: string) => void;
  apiStatusDelete: ApiStatus;
  selectedItems: FollowerIndexWithPausedStatus[];
  onSelectionChange: (selectedItems: FollowerIndexWithPausedStatus[]) => void;
  resetSelection: () => void;
}

interface FollowerIndicesTableState {
  prevFollowerIndices: FollowerIndexWithPausedStatus[];
  filteredIndices: FollowerIndexWithPausedStatus[];
  queryText: string;
}

export class FollowerIndicesTable extends PureComponent<
  FollowerIndicesTableProps,
  FollowerIndicesTableState
> {
  static getDerivedStateFromProps(
    props: FollowerIndicesTableProps,
    state: FollowerIndicesTableState
  ): Partial<FollowerIndicesTableState> | null {
    const { followerIndices } = props;
    const { prevFollowerIndices, queryText } = state;

    // If a follower index gets deleted, we need to recreate the cached filtered follower indices.
    if (prevFollowerIndices !== followerIndices) {
      return {
        prevFollowerIndices: followerIndices,
        filteredIndices: getFilteredIndices(followerIndices, queryText),
      };
    }

    return null;
  }

  constructor(props: FollowerIndicesTableProps) {
    super(props);

    this.state = {
      prevFollowerIndices: props.followerIndices,
      filteredIndices: props.followerIndices,
      queryText: '',
    };
  }

  onSearch = ({ query, queryText }: EuiSearchBarOnChangeArgs) => {
    const { followerIndices } = this.props;
    const text = query?.text ?? queryText;

    // We cache the filtered indices instead of calculating them inside render() because
    // of https://github.com/elastic/eui/issues/3445.
    this.setState({
      queryText: text,
      filteredIndices: getFilteredIndices(followerIndices, text),
    });
  };

  editFollowerIndex = (id: string) => {
    const uri = routing.getFollowerIndexPath(id);
    routing.navigate(uri);
  };

  getTableColumns(actionHandlers: {
    pauseFollowerIndex: (item: FollowerIndexWithPausedStatus) => void;
    resumeFollowerIndex: (name: string) => void;
    unfollowLeaderIndex: (name: string) => void;
  }): EuiInMemoryTableProps<FollowerIndexWithPausedStatus>['columns'] {
    const { selectFollowerIndex } = this.props;

    const actions: Array<DefaultItemAction<FollowerIndexWithPausedStatus>> = [
      /* Pause follower index */
      {
        type: 'icon',
        name: actionI18nTexts.pause,
        description: actionI18nTexts.pause,
        icon: 'pause',
        onClick: (item: FollowerIndexWithPausedStatus) => actionHandlers.pauseFollowerIndex(item),
        available: (item: FollowerIndexWithPausedStatus) => !item.isPaused,
        'data-test-subj': 'pauseButton',
      },
      /* Resume follower index */
      {
        type: 'icon',
        name: actionI18nTexts.resume,
        description: actionI18nTexts.resume,
        icon: 'play',
        onClick: (item: FollowerIndexWithPausedStatus) =>
          actionHandlers.resumeFollowerIndex(item.name),
        available: (item: FollowerIndexWithPausedStatus) => !!item.isPaused,
        'data-test-subj': 'resumeButton',
      },
      /* Edit follower index */
      {
        type: 'icon',
        name: actionI18nTexts.edit,
        description: actionI18nTexts.edit,
        onClick: (item: FollowerIndexWithPausedStatus) => this.editFollowerIndex(item.name),
        icon: 'pencil',
        'data-test-subj': 'editButton',
      },
      /* Unfollow leader index */
      {
        type: 'icon',
        name: actionI18nTexts.unfollow,
        description: actionI18nTexts.unfollow,
        onClick: (item: FollowerIndexWithPausedStatus) =>
          actionHandlers.unfollowLeaderIndex(item.name),
        icon: 'chartThreshold',
        'data-test-subj': 'unfollowButton',
      },
    ];

    return [
      {
        field: 'name',
        name: i18n.translate(
          'xpack.crossClusterReplication.followerIndexList.table.nameColumnTitle',
          {
            defaultMessage: 'Name',
          }
        ),
        sortable: true,
        truncateText: false,
        render: (name: string) => {
          return (
            <EuiLink
              onClick={() => {
                trackUiMetric('click', UIM_FOLLOWER_INDEX_SHOW_DETAILS_CLICK);
                selectFollowerIndex(name);
              }}
              data-test-subj="followerIndexLink"
            >
              {name}
            </EuiLink>
          );
        },
      },
      {
        field: 'isPaused',
        name: i18n.translate(
          'xpack.crossClusterReplication.followerIndexList.table.statusColumnTitle',
          {
            defaultMessage: 'Status',
          }
        ),
        truncateText: true,
        sortable: true,
        render: (isPaused: boolean) => {
          return isPaused ? (
            <EuiHealth color="subdued">
              <FormattedMessage
                id="xpack.crossClusterReplication.followerIndexList.table.statusColumn.pausedLabel"
                defaultMessage="Paused"
              />
            </EuiHealth>
          ) : (
            <EuiHealth color="success">
              <FormattedMessage
                id="xpack.crossClusterReplication.followerIndexList.table.statusColumn.activeLabel"
                defaultMessage="Active"
              />
            </EuiHealth>
          );
        },
      },
      {
        field: 'remoteCluster',
        name: i18n.translate(
          'xpack.crossClusterReplication.followerIndexList.table.clusterColumnTitle',
          {
            defaultMessage: 'Remote cluster',
          }
        ),
        truncateText: true,
        sortable: true,
      },
      {
        field: 'leaderIndex',
        name: i18n.translate(
          'xpack.crossClusterReplication.followerIndexList.table.leaderIndexColumnTitle',
          {
            defaultMessage: 'Leader index',
          }
        ),
        truncateText: true,
        sortable: true,
      },
      {
        name: i18n.translate(
          'xpack.crossClusterReplication.followerIndexList.table.actionsColumnTitle',
          {
            defaultMessage: 'Actions',
          }
        ),
        actions,
        width: '100px',
      },
    ];
  }

  renderLoading = () => {
    const { apiStatusDelete } = this.props;

    if (apiStatusDelete === API_STATUS.DELETING) {
      return (
        <EuiOverlayMask>
          <EuiLoadingLogo logo="logoKibana" size="xl" />
        </EuiOverlayMask>
      );
    }
    return null;
  };

  render() {
    const { filteredIndices } = this.state;
    const { selectedItems, onSelectionChange, resetSelection } = this.props;
    const reactRouter = routing.reactRouterOrThrow;

    const sorting = {
      sort: {
        field: 'name',
        direction: 'asc' as const,
      },
    };

    const pagination = {
      initialPageSize: 20,
      pageSizeOptions: [10, 20, 50],
    };

    const selection = {
      selected: selectedItems,
      onSelectionChange,
    };

    const search: EuiInMemoryTableProps<FollowerIndexWithPausedStatus>['search'] = {
      toolsLeft: selectedItems.length ? (
        <ContextMenu
          followerIndices={selectedItems}
          testSubj="contextMenuButton"
          onActionComplete={resetSelection}
        />
      ) : undefined,
      toolsRight: (
        <EuiButton
          {...reactRouterNavigate(reactRouter.history, `/follower_indices/add`)}
          fill
          iconType="plusCircle"
          data-test-subj="createFollowerIndexButton"
        >
          <FormattedMessage
            id="xpack.crossClusterReplication.followerIndexList.addFollowerButtonLabel"
            defaultMessage="Create a follower index"
          />
        </EuiButton>
      ),
      onChange: this.onSearch,
      box: {
        incremental: true,
        'data-test-subj': 'followerIndexSearch',
      },
    };

    return (
      <FollowerIndexActionsProvider>
        {(getActionHandlers) => {
          const actionHandlers = getActionHandlers();
          return (
            <>
              <EuiInMemoryTable
                tableCaption={i18n.translate(
                  'xpack.crossClusterReplication.followerIndexList.table.tableCaption',
                  {
                    defaultMessage: 'List of follower indices',
                  }
                )}
                items={filteredIndices}
                itemId="name"
                columns={this.getTableColumns(actionHandlers)}
                search={search}
                pagination={pagination}
                sorting={sorting}
                selection={selection}
                rowProps={() => ({
                  'data-test-subj': 'row',
                })}
                cellProps={(item, column) => ({
                  'data-test-subj': `cell-${'field' in column ? column.field : ''}`,
                })}
                data-test-subj="followerIndexListTable"
              />
              {this.renderLoading()}
            </>
          );
        }}
      </FollowerIndexActionsProvider>
    );
  }
}
