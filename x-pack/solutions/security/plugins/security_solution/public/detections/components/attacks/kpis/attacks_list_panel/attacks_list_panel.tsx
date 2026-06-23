/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import styled from '@emotion/styled';
import {
  EuiBasicTable,
  EuiPanel,
  EuiTitle,
  EuiLink,
  EuiLoadingChart,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import type { Criteria, EuiBasicTableColumn } from '@elastic/eui';
import type { Filter, Query } from '@kbn/es-query';
import type { DataView } from '@kbn/data-views-plugin/common';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { i18n } from '@kbn/i18n';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { AttackDetailsRightPanelKey } from '../../../../../flyout/attack_details/constants/panel_keys';
import { SeverityBar } from '../../../../../entity_analytics/components/severity/severity_bar';
import { useAttacksListData } from './use_attacks_list_data';
import type { AttacksListItem } from './types';
import { useKibana } from '../../../../../common/lib/kibana';
import { AttacksEventTypes } from '../../../../../common/lib/telemetry';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { useDefaultDocumentFlyoutProperties } from '../../../../../flyout_v2/shared/hooks/use_default_flyout_properties';
import { flyoutProviders } from '../../../../../flyout_v2/shared/components/flyout_provider';
import { AttackFlyoutWrapper } from '../../../../../flyout_v2/attack/main/attack_flyout_wrapper';
import { documentFlyoutHistoryKey } from '../../../../../flyout_v2/shared/constants/flyout_history';

const PAGE_SIZE = 10;
const TABLE_WIDTH = 385;
const TABLE_HEIGHT = 200;
export const ATTACKS_LIST_PANEL_TEST_ID = 'attacksListPanel';
export const ATTACKS_LIST_TABLE_TEST_ID = 'attacksListTable';
export const ATTACKS_LIST_ATTACK_NAME_COLUMN_TEST_ID = 'attacksListAttackNameColumn';
export const ATTACKS_LIST_ALERTS_COUNT_COLUMN_TEST_ID = 'attacksListAlertsCountColumn';

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
`;

const SeverityBarContainer = styled.div`
  width: 75px;
  border-radius: 4px;
  overflow: hidden;
`;

export interface AttacksListPanelProps {
  /** Optional array of filters to apply to the query */
  filters?: Filter[];
  /** Optional query object */
  query?: Query;
  /** DataView for the attacks page */
  dataView: DataView;
}

/**
 * Renders the attacks list panel
 * @param props - The props for the component
 * @returns The attacks list panel
 */
export const AttacksListPanel = React.memo<AttacksListPanelProps>(
  ({ filters, query, dataView }) => {
    const { openFlyout } = useExpandableFlyoutApi();
    const { services } = useKibana();
    const { telemetry, overlays } = services;
    const newFlyoutSystemEnabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
    const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();
    const store = useStore();
    const history = useHistory();

    const { items, isLoading, pageIndex, setPageIndex, pageSize, setPageSize, total, refetch } =
      useAttacksListData({
        filters,
        query,
        pageSize: PAGE_SIZE,
      });

    const columns = useMemo<EuiBasicTableColumn<AttacksListItem>[]>(
      () => [
        {
          field: 'name',
          'data-test-subj': ATTACKS_LIST_ATTACK_NAME_COLUMN_TEST_ID,
          name: i18n.translate(
            'xpack.securitySolution.attacksPage.attacksListPanel.attackNameColumn',
            {
              defaultMessage: 'Attack name',
            }
          ),
          render: (name: string, item: AttacksListItem) => (
            <EuiLink
              className="eui-textTruncate"
              onClick={() => {
                if (newFlyoutSystemEnabled) {
                  overlays.openSystemFlyout(
                    flyoutProviders({
                      services,
                      store,
                      history,
                      children: (
                        <AttackFlyoutWrapper
                          attackId={item.id}
                          indexName={dataView.getIndexPattern()}
                          onAttackUpdated={refetch}
                        />
                      ),
                    }),
                    {
                      ...defaultFlyoutProperties,
                      historyKey: documentFlyoutHistoryKey,
                      session: 'start',
                    }
                  );
                } else {
                  openFlyout({
                    right: {
                      id: AttackDetailsRightPanelKey,
                      params: {
                        attackId: item.id,
                        indexName: dataView.getIndexPattern(),
                      },
                    },
                  });
                }
                telemetry.reportEvent(AttacksEventTypes.DetailsFlyoutOpened, {
                  id: item.id,
                  source: 'attacks_page_summary_kpi',
                });
              }}
              title={name}
            >
              {name}
            </EuiLink>
          ),
        },
        {
          field: 'alertsCount',
          'data-test-subj': ATTACKS_LIST_ALERTS_COUNT_COLUMN_TEST_ID,
          name: i18n.translate(
            'xpack.securitySolution.attacksPage.attacksListPanel.alertCountColumn',
            {
              defaultMessage: 'Alerts count',
            }
          ),
          width: '110px',
          align: 'left',
          render: (count: number, item: AttacksListItem) => (
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>
                <SeverityBarContainer>
                  <SeverityBar severityCount={item.severityCount} />
                </SeverityBarContainer>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{count}</EuiFlexItem>
            </EuiFlexGroup>
          ),
        },
      ],
      [
        dataView,
        defaultFlyoutProperties,
        history,
        newFlyoutSystemEnabled,
        openFlyout,
        overlays,
        refetch,
        services,
        store,
        telemetry,
      ]
    );

    const pagination = {
      pageIndex,
      pageSize,
      totalItemCount: total,
    };

    const onTableChange = ({ page }: Criteria<AttacksListItem>) => {
      if (page) {
        setPageIndex(page.index);
        setPageSize(page.size);
      }
    };

    return (
      <EuiPanel
        hasBorder
        data-test-subj={ATTACKS_LIST_PANEL_TEST_ID}
        style={{
          width: TABLE_WIDTH,
          height: TABLE_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('xpack.securitySolution.attacksPage.attacksListPanel.title', {
              defaultMessage: '{total} attacks detected',
              values: { total },
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <TableContainer>
          {isLoading ? (
            <EuiLoadingChart size="xl" />
          ) : (
            <EuiBasicTable<AttacksListItem>
              data-test-subj={ATTACKS_LIST_TABLE_TEST_ID}
              items={items}
              columns={columns}
              pagination={pagination}
              onChange={onTableChange}
              compressed
              tableCaption={i18n.translate(
                'xpack.securitySolution.attacksPage.attacksListPanel.tableCaption',
                {
                  defaultMessage: 'List of attacks sorted by alert volume',
                }
              )}
            />
          )}
        </TableContainer>
      </EuiPanel>
    );
  }
);
AttacksListPanel.displayName = 'AttacksListPanel';
