/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { useEntityStoreEuidApi } from '@kbn/entity-store/public';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { FlyoutPanelProps } from '@kbn/expandable-flyout';
import type { ReactNode } from 'react';
import React, { useMemo, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { ALERT_RULE_NAME } from '@kbn/rule-data-utils';
import { get } from 'lodash/fp';
import {
  EntityDetailsLeftPanelTab,
  RiskScoreLeftPanelSubTab,
} from '../../../../../flyout/entity_details/shared/components/left_panel/left_panel_header';
import type { CriticalityLevel } from '../../../../../../common/entity_analytics/asset_criticality/types';
import { getWatchlistName } from '../../../../../../common/entity_analytics/watchlists/constants';
import { useGlobalTime } from '../../../../../common/containers/use_global_time';
import { useQueryInspector } from '../../../../../common/components/page/manage_query';
import { formatRiskScore } from '../../../../common';
import type {
  InputAlert,
  UseRiskContributingAlertsResult,
} from '../../../../hooks/use_risk_contributing_alerts';
import { useRiskContributingAlerts } from '../../../../hooks/use_risk_contributing_alerts';
import { PreferenceFormattedDate } from '../../../../../common/components/formatted_date';

import { useRiskScore } from '../../../../api/hooks/use_risk_score';
import type { RiskScoreState } from '../../../../api/hooks/use_risk_score';
import { useGetWatchlists } from '../../../../api/hooks/use_get_watchlists';
import type { EntityRiskScore, EntityType } from '../../../../../../common/search_strategy';
import type { ESQuery } from '../../../../../../common/typed_json';
import { buildEntityNameFilter } from '../../../../../../common/search_strategy';
import { AssetCriticalityBadge } from '../../../asset_criticality';
import { RiskInputsUtilityBar } from '../../components/utility_bar';
import { ActionColumn } from '../../components/action_column';
import { AiAssistantButton } from '../../../ai_assistant_button/ai_assistant_button';
import { useIsExperimentalFeatureEnabled } from '../../../../../common/hooks/use_experimental_features';
import { useAgentBuilderAvailability } from '../../../../../agent_builder/hooks/use_agent_builder_availability';
import { useResolutionGroup } from '../../../entity_resolution/hooks/use_resolution_group';
import { getEntityId, getEntityField, getEntityName } from '../../../entity_resolution/helpers';
import { useStableExpandableFlyoutState } from '../../../../../flyout/shared/hooks/use_stable_expandable_flyout_state';

export interface RiskInputsTabProps<T extends EntityType> {
  entityType: T;
  entityName: string;
  entityId?: string;
  /** Navigates to the alert preview for a risk-input row. */
  onShowAlert: (id: string, indexName: string) => void;
}

const FIRST_RECORD_PAGINATION = {
  cursorStart: 0,
  querySize: 1,
};

export const EXPAND_ALERT_TEST_ID = 'risk-input-alert-preview-button';
export const RISK_INPUTS_TAB_QUERY_ID = 'RiskInputsTabQuery';

interface RiskScorePanelProps extends FlyoutPanelProps {
  params: {
    path: {
      tab: EntityDetailsLeftPanelTab.RISK_INPUTS;
      subTab?: RiskScoreLeftPanelSubTab;
    };
  };
}

function isRiskScoreFlyoutPanelProps(
  panelLeft: FlyoutPanelProps | undefined
): panelLeft is RiskScorePanelProps {
  const params = panelLeft?.params;
  if (!params || typeof params !== 'object' || !('path' in params)) {
    return false;
  }

  const path = params.path as { tab?: unknown; subTab?: unknown };
  if (path?.tab !== EntityDetailsLeftPanelTab.RISK_INPUTS) {
    return false;
  }

  return (
    path.subTab === undefined ||
    (typeof path.subTab === 'string' &&
      Object.values(RiskScoreLeftPanelSubTab).includes(path.subTab as RiskScoreLeftPanelSubTab))
  );
}

export const RiskInputsTab = <T extends EntityType>({
  entityType,
  entityName,
  entityId,
  onShowAlert,
}: RiskInputsTabProps<T>) => {
  const panels = useStableExpandableFlyoutState();
  const subTab = isRiskScoreFlyoutPanelProps(panels.left)
    ? panels.left.params.path.subTab
    : undefined;

  const { data: watchlists } = useGetWatchlists();

  const entityFilterQuery = useMemo(
    () =>
      entityId
        ? ({
            bool: {
              filter: [{ term: { [`${entityType}.risk.id_value`]: entityId } }],
              must_not: [{ term: { [`${entityType}.risk.score_type`]: 'resolution' } }],
            },
          } as ESQuery)
        : buildEntityNameFilter(entityType, [entityName]),
    [entityId, entityName, entityType]
  );

  const {
    data: riskScoreData,
    error: riskScoreError,
    loading: loadingRiskScore,
    inspect: inspectRiskScore,
    refetch,
  } = useRiskScore<T>({
    riskEntity: entityType,
    filterQuery: entityFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: entityFilterQuery === undefined,
  });

  const { data: resolutionGroup } = useResolutionGroup(entityId ?? '', {
    enabled: Boolean(entityId),
  });
  const hasRealResolutionGroup = (resolutionGroup?.group_size ?? 0) > 1;
  const resolutionTargetEntityId = useMemo(
    () => (resolutionGroup?.target ? getEntityId(resolutionGroup.target) : undefined),
    [resolutionGroup?.target]
  );
  const shouldFetchResolutionRiskScore =
    hasRealResolutionGroup && Boolean(resolutionTargetEntityId);
  const resolutionFilterQuery = useMemo(
    () =>
      shouldFetchResolutionRiskScore && resolutionTargetEntityId
        ? ({
            bool: {
              filter: [
                { term: { [`${entityType}.risk.id_value`]: resolutionTargetEntityId } },
                { term: { [`${entityType}.risk.score_type`]: 'resolution' } },
              ],
            },
          } as ESQuery)
        : undefined,
    [entityType, resolutionTargetEntityId, shouldFetchResolutionRiskScore]
  );
  const {
    data: resolutionRiskScoreData,
    loading: loadingResolutionRiskScore,
    inspect: inspectResolutionRiskScore,
    refetch: refetchResolutionRiskScore,
  } = useRiskScore<T>({
    riskEntity: entityType,
    filterQuery: resolutionFilterQuery,
    onlyLatest: false,
    pagination: FIRST_RECORD_PAGINATION,
    skip: !shouldFetchResolutionRiskScore,
  });

  const entityRiskScore = riskScoreData && riskScoreData.length > 0 ? riskScoreData[0] : undefined;
  const resolutionRiskScore =
    resolutionRiskScoreData && resolutionRiskScoreData.length > 0
      ? resolutionRiskScoreData[0]
      : undefined;
  const hasResolutionScore = hasRealResolutionGroup && Boolean(resolutionRiskScore);

  const watchlistNamesById = useMemo(() => {
    const map = new Map<string, string>();
    (watchlists ?? []).forEach((watchlist) => {
      if (watchlist.id) {
        map.set(watchlist.id, watchlist.name);
      }
    });
    return map;
  }, [watchlists]);

  if (riskScoreError) {
    return (
      <EuiCallOut
        announceOnMount
        title={
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.errorTitle"
            defaultMessage="Something went wrong"
          />
        }
        color="danger"
        iconType="error"
      >
        <p>
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.errorBody"
            defaultMessage="Error while fetching risk inputs. Please try again later."
          />
        </p>
      </EuiCallOut>
    );
  }

  return (
    <RiskInputsTabContent
      // using subTab as key to force re-render the tab content when the subTab changes
      key={subTab}
      subTab={subTab}
      entityType={entityType}
      entityName={entityName}
      entityRiskScore={entityRiskScore}
      resolutionRiskScore={resolutionRiskScore}
      hasResolutionScore={hasResolutionScore}
      loadingRiskScore={loadingRiskScore}
      loadingResolutionRiskScore={loadingResolutionRiskScore}
      inspectRiskScore={inspectRiskScore}
      inspectResolutionRiskScore={inspectResolutionRiskScore}
      refetch={refetch}
      refetchResolutionRiskScore={refetchResolutionRiskScore}
      resolutionGroup={resolutionGroup}
      watchlistNamesById={watchlistNamesById}
      onShowAlert={onShowAlert}
    />
  );
};

RiskInputsTab.displayName = 'RiskInputsTab';

interface RiskInputsTabContentProps<T extends EntityType> {
  subTab?: RiskScoreLeftPanelSubTab;
  entityType: T;
  entityName: string;
  entityRiskScore: EntityRiskScore<T> | undefined;
  resolutionRiskScore: EntityRiskScore<T> | undefined;
  hasResolutionScore: boolean;
  loadingRiskScore: boolean;
  loadingResolutionRiskScore: boolean;
  inspectRiskScore: RiskScoreState<EntityType>['inspect'];
  inspectResolutionRiskScore: RiskScoreState<EntityType>['inspect'];
  refetch: RiskScoreState<EntityType>['refetch'];
  refetchResolutionRiskScore: RiskScoreState<EntityType>['refetch'];
  resolutionGroup: ReturnType<typeof useResolutionGroup>['data'];
  watchlistNamesById: Map<string, string>;
  onShowAlert: (id: string, indexName: string) => void;
}

const RiskInputsTabContent = <T extends EntityType>({
  subTab,
  entityType,
  entityName,
  entityRiskScore,
  resolutionRiskScore,
  hasResolutionScore,
  loadingRiskScore,
  loadingResolutionRiskScore,
  inspectRiskScore,
  inspectResolutionRiskScore,
  refetch,
  refetchResolutionRiskScore,
  resolutionGroup,
  watchlistNamesById,
  onShowAlert,
}: RiskInputsTabContentProps<T>) => {
  const { setQuery, deleteQuery } = useGlobalTime();
  const euidApi = useEntityStoreEuidApi();
  const [selectedItems, setSelectedItems] = useState<InputAlert[]>([]);
  const [userSelectedView, setUserSelectedView] = useState(subTab);
  const isAssistantToolDisabled = useIsExperimentalFeatureEnabled('riskScoreAssistantToolDisabled');
  const { isAgentBuilderEnabled } = useAgentBuilderAvailability();
  const showAiAssistantButton = !isAssistantToolDisabled || isAgentBuilderEnabled;

  const defaultView =
    !loadingRiskScore && !entityRiskScore && hasResolutionScore
      ? RiskScoreLeftPanelSubTab.RESOLUTION
      : RiskScoreLeftPanelSubTab.ENTITY;
  const selectedView = userSelectedView ?? defaultView;

  const isResolutionView =
    selectedView === RiskScoreLeftPanelSubTab.RESOLUTION && hasResolutionScore;
  const activeRiskScore = isResolutionView ? resolutionRiskScore : entityRiskScore;
  const activeInspectRiskScore = isResolutionView ? inspectResolutionRiskScore : inspectRiskScore;
  const activeRiskScoreLoading = isResolutionView ? loadingResolutionRiskScore : loadingRiskScore;
  const activeRiskScoreRefetch = isResolutionView ? refetchResolutionRiskScore : refetch;

  useQueryInspector({
    deleteQuery,
    inspect: activeInspectRiskScore,
    loading: activeRiskScoreLoading,
    queryId: RISK_INPUTS_TAB_QUERY_ID,
    refetch: activeRiskScoreRefetch,
    setQuery,
  });

  const alerts = useRiskContributingAlerts<T>({ riskScore: activeRiskScore, entityType });

  const entityNameByEuid = useMemo(() => {
    const map = new Map<string, string>();
    if (!resolutionGroup) return map;
    [resolutionGroup.target, ...resolutionGroup.aliases].forEach((entity) => {
      const entityIdValue = getEntityId(entity);
      if (entityIdValue) {
        map.set(entityIdValue, getEntityName(entity) || entityIdValue);
      }
    });
    return map;
  }, [resolutionGroup]);

  const alertEntityById = useMemo(() => {
    const map = new Map<string, string>();
    if (!isResolutionView || !euidApi || !alerts.data) return map;
    alerts.data.forEach((alert) => {
      const sourceEntityId =
        alert.input.entity_id ?? euidApi.euid.getEuidFromObject(entityType, alert.rawSource);
      if (sourceEntityId) {
        map.set(alert._id, entityNameByEuid.get(sourceEntityId) ?? sourceEntityId);
      }
    });
    return map;
  }, [alerts.data, entityNameByEuid, entityType, euidApi, isResolutionView]);

  const euiTableSelectionProps = useMemo(
    () => ({
      initialSelected: [],
      selectable: () => true,
      onSelectionChange: setSelectedItems,
    }),
    []
  );

  const inputColumns: Array<EuiBasicTableColumn<InputAlert>> = useMemo(() => {
    const columns: Array<EuiBasicTableColumn<InputAlert>> = [
      {
        render: (data: InputAlert) => (
          <EuiToolTip
            content={i18n.translate('xpack.securitySolution.flyout.right.alertPreview.ariaLabel', {
              defaultMessage: 'Preview alert with id {id}',
              values: { id: data._id },
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              iconType="expand"
              data-test-subj={EXPAND_ALERT_TEST_ID}
              onClick={() => onShowAlert(data._id, data.input.index)}
              aria-label={i18n.translate(
                'xpack.securitySolution.flyout.right.alertPreview.ariaLabel',
                {
                  defaultMessage: 'Preview alert with id {id}',
                  values: { id: data._id },
                }
              )}
            />
          </EuiToolTip>
        ),
        width: '5%',
      },
      {
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.actionsColumn"
            defaultMessage="Actions"
          />
        ),
        width: '80px',
        render: (data: InputAlert) => <ActionColumn input={data} />,
      },
      {
        field: 'input.timestamp',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.dateColumn"
            defaultMessage="Date"
          />
        ),
        truncateText: false,
        mobileOptions: { show: true },
        sortable: true,
        width: isResolutionView ? '20%' : '30%',
        render: (timestamp: string) => <PreferenceFormattedDate value={new Date(timestamp)} />,
      },
      {
        field: 'alert',
        'data-test-subj': 'risk-input-table-description-cell',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.riskInputColumn"
            defaultMessage="Rule name"
          />
        ),
        truncateText: true,
        mobileOptions: { show: true },
        sortable: true,
        render: (alert: InputAlert['alert']) => get(ALERT_RULE_NAME, alert),
      },
      {
        field: 'input.contribution_score',
        'data-test-subj': 'risk-input-table-contribution-cell',
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.contributionColumn"
            defaultMessage="Contribution"
          />
        ),
        truncateText: false,
        mobileOptions: { show: true },
        sortable: true,
        align: 'right',
        render: formatContribution,
      },
    ];

    if (isResolutionView) {
      columns.splice(4, 0, {
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.entityColumn"
            defaultMessage="Entity"
          />
        ),
        width: '25%',
        render: (data: InputAlert) => alertEntityById.get(data._id) ?? '-',
      });
    }

    return columns;
  }, [alertEntityById, isResolutionView, onShowAlert]);

  const riskInputsAlertSection = (
    <>
      <EuiTitle size="xs" data-test-subj="risk-input-alert-title">
        <h3>
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.alertsTitle"
            defaultMessage="Alerts"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <RiskInputsUtilityBar riskInputs={selectedItems} />
      <EuiInMemoryTable
        compressed
        loading={(activeRiskScoreLoading || alerts.loading) && (alerts.data?.length ?? 0) === 0}
        items={alerts.data || []}
        columns={inputColumns}
        sorting
        selection={euiTableSelectionProps}
        itemId="_id"
        tableCaption={i18n.translate(
          'xpack.securitySolution.flyout.entityDetails.riskInputs.alertsTableCaption',
          {
            defaultMessage: 'Alerts contributing to the risk score',
          }
        )}
      />
      <EuiSpacer size="s" />
      <ExtraAlertsMessage<T> riskScore={activeRiskScore} alerts={alerts} entityType={entityType} />
    </>
  );

  return (
    <>
      {hasResolutionScore && (
        <>
          <EuiButtonGroup
            color="primary"
            isFullWidth
            legend={i18n.translate(
              'xpack.securitySolution.flyout.entityDetails.riskInputs.scoreViewLegend',
              { defaultMessage: 'Risk score view' }
            )}
            buttonSize="compressed"
            options={[
              {
                id: RiskScoreLeftPanelSubTab.ENTITY,
                label: i18n.translate(
                  'xpack.securitySolution.flyout.entityDetails.riskInputs.entityScoreViewLabel',
                  { defaultMessage: 'Entity risk score' }
                ),
              },
              {
                id: RiskScoreLeftPanelSubTab.RESOLUTION,
                label: i18n.translate(
                  'xpack.securitySolution.flyout.entityDetails.riskInputs.resolutionScoreViewLabel',
                  { defaultMessage: 'Resolution group risk score' }
                ),
              },
            ]}
            idSelected={selectedView}
            onChange={(id) => setUserSelectedView(id as RiskScoreLeftPanelSubTab)}
            data-test-subj="risk-input-score-view-toggle"
          />
          <EuiSpacer size="m" />
        </>
      )}
      <ContextsSection<T>
        loading={activeRiskScoreLoading}
        riskScore={activeRiskScore}
        entityType={entityType}
        isResolutionView={isResolutionView}
        resolutionGroup={resolutionGroup}
        watchlistNamesById={watchlistNamesById}
      />
      <EuiSpacer size="m" />
      {riskInputsAlertSection}
      {showAiAssistantButton && (
        <>
          <EuiSpacer size="m" />
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <AiAssistantButton
                entityType={entityType}
                entityName={entityName}
                telemetryPathway="entity_risk_contribution"
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};

interface ContextsSectionProps<T extends EntityType> {
  riskScore?: EntityRiskScore<T>;
  entityType: T;
  loading: boolean;
  isResolutionView: boolean;
  resolutionGroup?: {
    target: Record<string, unknown>;
    aliases: Array<Record<string, unknown>>;
  };
  watchlistNamesById: Map<string, string>;
}

const ContextsSection = <T extends EntityType>({
  riskScore,
  loading,
  entityType,
  isResolutionView,
  resolutionGroup,
  watchlistNamesById,
}: ContextsSectionProps<T>) => {
  const memberEntities = useMemo(
    () => (resolutionGroup ? [resolutionGroup.target, ...resolutionGroup.aliases] : []),
    [resolutionGroup]
  );
  const watchlistEntityNames = useMemo(() => {
    const map = new Map<string, string[]>();

    if (!isResolutionView) {
      return map;
    }

    memberEntities.forEach((member) => {
      const entityName = getEntityName(member) || getEntityId(member) || '-';
      const watchlistsValue = getEntityField(member, 'entity.attributes.watchlists');
      if (!Array.isArray(watchlistsValue)) {
        return;
      }

      watchlistsValue.forEach((watchlistId) => {
        if (typeof watchlistId !== 'string') {
          return;
        }

        const matchingEntities = map.get(watchlistId) ?? [];
        if (!matchingEntities.includes(entityName)) {
          matchingEntities.push(entityName);
        }
        map.set(watchlistId, matchingEntities);
      });
    });

    return map;
  }, [isResolutionView, memberEntities]);
  const criticalityEntityNames = useMemo(() => {
    const map = new Map<string, string[]>();

    if (!isResolutionView) {
      return map;
    }

    memberEntities.forEach((member) => {
      const entityName = getEntityName(member) || getEntityId(member) || '-';
      const criticalityLevel = getEntityField(member, 'asset.criticality');

      if (typeof criticalityLevel !== 'string') {
        return;
      }

      const matchingEntities = map.get(criticalityLevel) ?? [];
      if (!matchingEntities.includes(entityName)) {
        matchingEntities.push(entityName);
      }
      map.set(criticalityLevel, matchingEntities);
    });

    return map;
  }, [isResolutionView, memberEntities]);
  const contributions = useMemo(() => {
    if (!riskScore) {
      return undefined;
    }

    const modifiers = riskScore[entityType].risk.modifiers ?? [];
    const criticality = riskScore[entityType].risk.modifiers?.find(
      (mod) => mod.type === 'asset_criticality'
    );
    const watchlists = modifiers.filter((mod) => mod.type === 'watchlist');

    if (!criticality && watchlists.length === 0) {
      return undefined;
    }

    return {
      criticality: {
        level: (criticality?.metadata?.criticality_level as CriticalityLevel) ?? null,
        contribution: criticality?.contribution,
      },
      watchlists,
    };
  }, [entityType, riskScore]);

  if (contributions === undefined) {
    return null;
  }
  const { criticality, watchlists } = contributions;

  const items: ContextRow[] = [];

  if (criticality.level != null && criticality.contribution != null) {
    const relatedEntities = isResolutionView
      ? criticalityEntityNames.get(criticality.level)?.join(', ') ?? '-'
      : '';
    items.push({
      field: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.assetCriticalityField"
          defaultMessage="Asset Criticality Level"
        />
      ),
      value: (
        <AssetCriticalityBadge
          criticalityLevel={criticality.level}
          dataTestSubj="risk-inputs-asset-criticality-badge"
          textSize="xs"
        />
      ),
      contribution: formatContribution(criticality.contribution),
      entities: relatedEntities,
    });
  }

  watchlists.forEach((watchlist) => {
    const watchlistMetadata = watchlist.metadata as
      | {
          watchlist_id?: string;
          is_privileged_user?: boolean;
        }
      | undefined;
    const watchlistId =
      typeof watchlistMetadata?.watchlist_id === 'string' ? watchlistMetadata.watchlist_id : '';
    const watchlistLabel = watchlistId
      ? watchlistNamesById.get(watchlistId) ?? getWatchlistName(watchlistId)
      : i18n.translate(
          'xpack.securitySolution.flyout.entityDetails.riskInputs.unknownWatchlistLabel',
          {
            defaultMessage: 'Unknown watchlist',
          }
        );

    items.push({
      field: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.watchlistField"
          defaultMessage="Watchlist"
        />
      ),
      value: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.watchlistValue"
          defaultMessage="{watchlistName}{privilegedTag}"
          values={{
            watchlistName: watchlistLabel,
            privilegedTag: watchlistMetadata?.is_privileged_user
              ? i18n.translate(
                  'xpack.securitySolution.flyout.entityDetails.riskInputs.privilegedWatchlistSuffix',
                  {
                    defaultMessage: ' (privileged user)',
                  }
                )
              : '',
          }}
        />
      ),
      contribution: formatContribution(watchlist.contribution),
      entities: isResolutionView ? watchlistEntityNames.get(watchlistId)?.join(', ') ?? '-' : '',
    });
  });

  if (items.length === 0) {
    return null;
  }

  return (
    <>
      <EuiTitle size="xs" data-test-subj="risk-input-contexts-title">
        <h3>
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.contextsTitle"
            defaultMessage="Contexts"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiInMemoryTable
        compressed={true}
        loading={loading && items.length === 0}
        data-test-subj="risk-input-contexts-table"
        columns={getContextColumns(isResolutionView)}
        items={items}
        tableCaption={i18n.translate(
          'xpack.securitySolution.flyout.entityDetails.riskInputs.contextsTableCaption',
          {
            defaultMessage: 'Contextual contributions to the risk score',
          }
        )}
      />
    </>
  );
};

interface ContextRow {
  field: ReactNode;
  value: ReactNode;
  contribution: string;
  entities: string;
}

const getContextColumns = (isResolutionView: boolean): Array<EuiBasicTableColumn<ContextRow>> => {
  const columns: Array<EuiBasicTableColumn<ContextRow>> = [
    {
      field: 'field',
      name: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.fieldColumn"
          defaultMessage="Field"
        />
      ),
      width: '25%',
      render: (field: ContextRow['field']) => field,
    },
    {
      field: 'value',
      name: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.valueColumn"
          defaultMessage="Value"
        />
      ),
      width: isResolutionView ? '30%' : '35%',
      render: (val: ContextRow['value']) => val,
    },
  ];

  if (isResolutionView) {
    columns.push({
      field: 'entities',
      name: (
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.entityColumn"
          defaultMessage="Entity"
        />
      ),
      width: '25%',
      render: (entities: ContextRow['entities']) => entities || '-',
    });
  }

  columns.push({
    field: 'contribution',
    width: isResolutionView ? '20%' : '40%',
    align: 'right',
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.entityDetails.riskInputs.contributionColumn"
        defaultMessage="Contribution"
      />
    ),
    render: (score: ContextRow['contribution']) => score,
  });

  return columns;
};

interface ExtraAlertsMessageProps<T extends EntityType> {
  riskScore?: EntityRiskScore<T>;
  alerts: UseRiskContributingAlertsResult;
  entityType: T;
}

const ExtraAlertsMessage = <T extends EntityType>({
  riskScore,
  alerts,
  entityType,
}: ExtraAlertsMessageProps<T>) => {
  const totals = !riskScore
    ? { count: 0, score: 0 }
    : {
        count: riskScore[entityType].risk.category_1_count,
        score: riskScore[entityType].risk.category_1_score,
      };

  const displayed = {
    count: alerts.data?.length || 0,
    score: alerts.data?.reduce((sum, { input }) => sum + (input.contribution_score || 0), 0) || 0,
  };

  if (displayed.count >= totals.count) {
    return null;
  }
  return (
    <EuiCallOut
      data-test-subj="risk-input-extra-alerts-message"
      size="s"
      title={
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.riskInputs.extraAlertsMessage"
          defaultMessage="{count} more alerts contributed {score} to the calculated risk score"
          values={{
            count: totals.count - displayed.count,
            score: formatContribution(totals.score - displayed.score),
          }}
        />
      }
      iconType="annotation"
    />
  );
};

const formatContribution = (value: number): string => {
  const fixedValue = formatRiskScore(value);

  // prevent +0.00 for values like 0.0001
  if (fixedValue === '0.00') {
    return fixedValue;
  }

  if (value > 0) {
    return `+${fixedValue}`;
  }

  return fixedValue;
};
