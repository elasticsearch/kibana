/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiBetaBadge, EuiFlexGroup, EuiFlexItem, EuiPageTemplate, EuiSpacer } from '@elastic/eui';
import {
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
  ALERT_STATUS_RECOVERED,
  ALERT_STATUS_UNTRACKED,
  AlertConsumers,
  isSiemRuleType,
} from '@kbn/rule-data-utils';
import { QueryClientProvider } from '@kbn/react-query';
import type { BoolQuery, Filter } from '@kbn/es-query';
import { FormattedMessage } from '@kbn/i18n-react';
import { AlertsTable } from '@kbn/response-ops-alerts-table';
import { alertProducersData } from '@kbn/response-ops-alerts-table/constants';
import { alertsTableQueryClient } from '@kbn/response-ops-alerts-table/query_client';
import { defaultAlertsTableSort } from '@kbn/response-ops-alerts-table/configuration';
import type {
  AlertDetailsNavigation,
  AlertsTableSupportedConsumers,
} from '@kbn/response-ops-alerts-table/types';
import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared';
import type { FilterGroupHandler } from '@kbn/alerts-ui-shared/src/alert_filter_controls/types';
import { ALERTS_PAGE_ID } from '../../../../common/constants';
import type { QuickFiltersMenuItem } from '../../alerts_search_bar/quick_filters';
import { NoPermissionPrompt } from '../../../components/prompts/no_permission_prompt';
import { useRuleStats } from '../hooks/use_rule_stats';
import { getAlertingSectionBreadcrumb } from '../../../lib/breadcrumb';
import { UrlSyncedAlertsSearchBar } from '../../alerts_search_bar/url_synced_alerts_search_bar';
import { useKibana } from '../../../../common/lib/kibana';
import {
  alertSearchBarStateContainer,
  Provider,
} from '../../alerts_search_bar/use_alert_search_bar_state_container';
import { getCurrentDocTitle } from '../../../lib/doc_title';
import type { AlertsFeatureIdsFilter } from '../../../lib/search_filters';
import { createMatchPhraseFilter, createRuleTypesFilter } from '../../../lib/search_filters';
import { nonNullable } from '../../../../../common/utils';
import type { RuleTypeIdsByFeatureId } from '../hooks/use_rule_type_ids_by_feature_id';
import { useRuleTypeIdsByFeatureId } from '../hooks/use_rule_type_ids_by_feature_id';
import { TECH_PREVIEW_DESCRIPTION, TECH_PREVIEW_LABEL } from '../../translations';
import { NON_SIEM_CONSUMERS } from '../../alerts_search_bar/constants';
import { RuleAlertActionsCell } from '../../rule_details/components/rule_alert_actions_cell';

/**
 * A unified view for all types of alerts
 */
export const StackAlertsPage = () => {
  return (
    <Provider value={alertSearchBarStateContainer}>
      <QueryClientProvider client={alertsTableQueryClient}>
        <PageContentWrapper />
      </QueryClientProvider>
    </Provider>
  );
};

const getFeatureFilterLabel = (featureName: string) =>
  i18n.translate('xpack.triggersActionsUI.sections.stackAlertsPage.featureRuleTypes', {
    defaultMessage: '{feature} rule types',
    values: {
      feature: featureName,
    },
  });

const PageContentWrapperComponent: React.FC = () => {
  const {
    chrome: { docTitle },
    setBreadcrumbs,
    http,
    notifications: { toasts },
    application: { capabilities },
  } = useKibana().services;

  const {
    ruleTypesState: { data: ruleTypesIndex, isInitialLoad: isInitialLoadingRuleTypes },
    authorizedToReadAnyAlerts,
  } = useGetRuleTypesPermissions({ http, toasts, capabilities, filteredRuleTypes: [] });

  const ruleTypeIdsByFeatureId = useRuleTypeIdsByFeatureId(ruleTypesIndex);

  useEffect(() => {
    setBreadcrumbs([getAlertingSectionBreadcrumb('alerts')]);
    docTitle.change(getCurrentDocTitle('alerts'));
  }, [docTitle, setBreadcrumbs]);

  return !isInitialLoadingRuleTypes ? (
    <PageContent
      isLoading={isInitialLoadingRuleTypes}
      authorizedToReadAnyRules={authorizedToReadAnyAlerts}
      ruleTypeIdsByFeatureId={ruleTypeIdsByFeatureId}
    />
  ) : null;
};

const PageContentWrapper = React.memo(PageContentWrapperComponent);

interface PageContentProps {
  isLoading: boolean;
  authorizedToReadAnyRules: boolean;
  ruleTypeIdsByFeatureId: RuleTypeIdsByFeatureId;
}

const PageContentComponent: React.FC<PageContentProps> = ({
  isLoading,
  authorizedToReadAnyRules,
  ruleTypeIdsByFeatureId,
}) => {
  const {
    data,
    http,
    notifications,
    rendering,
    fieldFormats,
    application,
    licensing,
    settings,
    ruleTypeRegistry,
  } = useKibana().services;

  const getAlertFormatter = useCallback(
    (ruleTypeId: string) => {
      if (!ruleTypeRegistry.has(ruleTypeId)) {
        return undefined;
      }
      return ruleTypeRegistry.get(ruleTypeId).format;
    },
    [ruleTypeRegistry]
  );
  const ruleTypeIdsByFeatureIdEntries = Object.entries(ruleTypeIdsByFeatureId);

  const [esQuery, setEsQuery] = useState({ bool: {} } as { bool: BoolQuery });
  const [ruleTypeIds, setRuleTypeIds] = useState<string[]>(() =>
    getInitialRuleTypeIds(ruleTypeIdsByFeatureId)
  );

  const [consumers, setConsumers] = useState<string[]>(NON_SIEM_CONSUMERS);
  const [filterControls, setFilterControls] = useState<Filter[]>();
  const [controlApi, setControlApi] = useState<FilterGroupHandler | undefined>();
  const hasInitialControlLoadingFinished = useMemo(
    () => Boolean(controlApi) && Array.isArray(filterControls),
    [controlApi, filterControls]
  );

  const [selectedFilters, setSelectedFilters] = useState<AlertsFeatureIdsFilter[]>([]);
  const ruleStats = useRuleStats({ ruleTypeIds });
  const isFilteringSecurityRules = ruleTypeIds.every(isSiemRuleType);

  const onFilterSelected = useCallback(
    (filters: Filter[]) => {
      const newRuleTypeIds = [
        ...new Set(
          filters
            .flatMap((ruleTypeId) => (ruleTypeId as AlertsFeatureIdsFilter).meta.ruleTypeIds)
            .filter(nonNullable)
        ),
      ];

      const newConsumers = [
        ...new Set(
          filters
            .flatMap((ruleTypeId) => (ruleTypeId as AlertsFeatureIdsFilter).meta.consumers)
            .filter(nonNullable)
        ),
      ];

      setSelectedFilters(filters as AlertsFeatureIdsFilter[]);

      if (newRuleTypeIds.length > 0) {
        setRuleTypeIds(newRuleTypeIds);
        setConsumers(newConsumers);
        return;
      }

      setRuleTypeIds(getInitialRuleTypeIds(ruleTypeIdsByFeatureId));
      setConsumers(NON_SIEM_CONSUMERS);
    },
    [ruleTypeIdsByFeatureId]
  );

  const { capabilities } = application;
  const hasObservabilityAccess = [
    capabilities.navLinks.apm,
    capabilities.navLinks.metrics,
    capabilities.navLinks.uptime,
    capabilities.navLinks.synthetics,
    capabilities.navLinks.slo,
    capabilities.logs?.show,
  ].some(Boolean);

  const alertDetailsNavigation: AlertDetailsNavigation | undefined = hasObservabilityAccess
    ? {
        appId: 'observability',
        getPath: (alertId: string) => `/alerts/${encodeURIComponent(alertId)}`,
      }
    : undefined;

  const quickFilters = useMemo(() => {
    const filters: QuickFiltersMenuItem[] = [];
    if (ruleTypeIdsByFeatureIdEntries.length > 0) {
      filters.push(
        ...ruleTypeIdsByFeatureIdEntries
          .map(([consumer, _ruleTypeIds]) => {
            const producerData = alertProducersData[consumer as AlertsTableSupportedConsumers];
            if (!producerData) {
              return null;
            }

            const filterLabel = getFeatureFilterLabel(producerData.displayName);
            const shouldDisable =
              (isFilteringSecurityRules && consumer !== AlertConsumers.SIEM) ||
              (!isFilteringSecurityRules && consumer === AlertConsumers.SIEM);

            const isQuickFilterSelected = _ruleTypeIds.every((ruleTypeId) =>
              ruleTypeIds.includes(ruleTypeId)
            );

            const disabled = selectedFilters.length > 0 && (shouldDisable || isQuickFilterSelected);

            return {
              name: filterLabel,
              icon: producerData.icon,
              filter: createRuleTypesFilter(
                _ruleTypeIds,
                producerData.subFeatureIds ?? [consumer],
                filterLabel
              ),
              disabled,
            };
          })
          .filter(nonNullable)
      );
    }

    filters.push({
      title: i18n.translate('xpack.triggersActionsUI.sections.globalAlerts.quickFilters.status', {
        defaultMessage: 'Status',
      }),
      icon: 'bell',
      items: [ALERT_STATUS_ACTIVE, ALERT_STATUS_RECOVERED, ALERT_STATUS_UNTRACKED].map((s) => ({
        name: s,
        filter: createMatchPhraseFilter(ALERT_STATUS, s),
      })),
    });
    return filters;
  }, [
    isFilteringSecurityRules,
    ruleTypeIds,
    ruleTypeIdsByFeatureIdEntries,
    selectedFilters.length,
  ]);

  return (
    <>
      <EuiPageTemplate.Header
        paddingSize="none"
        pageTitle={
          <EuiFlexGroup>
            <EuiFlexItem grow={false}>
              <span data-test-subj="appTitle">
                <FormattedMessage
                  id="xpack.triggersActionsUI.managementSection.alerts.displayName"
                  defaultMessage="Alerts"
                />
              </span>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBetaBadge label={TECH_PREVIEW_LABEL} tooltipContent={TECH_PREVIEW_DESCRIPTION} />
            </EuiFlexItem>
          </EuiFlexGroup>
        }
        bottomBorder
        rightSideItems={ruleStats}
      />
      <EuiSpacer size="l" />
      {!isLoading && !authorizedToReadAnyRules ? (
        <NoPermissionPrompt />
      ) : (
        <EuiFlexGroup gutterSize="m" direction="column" data-test-subj="stackAlertsPageContent">
          <UrlSyncedAlertsSearchBar
            appName={ALERTS_PAGE_ID}
            ruleTypeIds={ruleTypeIds}
            showFilterControls
            showFilterBar
            quickFilters={quickFilters}
            filterControls={filterControls}
            onFilterControlsChange={setFilterControls}
            onControlApiAvailable={setControlApi}
            onEsQueryChange={setEsQuery}
            onFilterSelected={onFilterSelected}
          />
          {hasInitialControlLoadingFinished && (
            <AlertsTable
              // Here we force a rerender when switching feature ids to prevent the data grid
              // columns alignment from breaking after a change in the number of columns
              key={ruleTypeIds.join()}
              id="stack-alerts-page-table"
              ruleTypeIds={ruleTypeIds}
              consumers={consumers}
              query={esQuery}
              sort={defaultAlertsTableSort}
              showAlertStatusWithFlapping
              pageSize={20}
              showInspectButton
              renderActionsCell={RuleAlertActionsCell}
              actionsColumnWidth={120}
              getAlertFormatter={getAlertFormatter}
              alertDetailsNavigation={alertDetailsNavigation}
              services={{
                data,
                http,
                notifications,
                rendering,
                fieldFormats,
                application,
                licensing,
                settings,
              }}
            />
          )}
        </EuiFlexGroup>
      )}
    </>
  );
};

const PageContent = React.memo(PageContentComponent);

const getInitialRuleTypeIds = (ruleTypeIdsByFeatureId: RuleTypeIdsByFeatureId): string[] =>
  Object.entries(ruleTypeIdsByFeatureId)
    .filter(([featureId]) => featureId !== AlertConsumers.SIEM)
    .map(([_, _ruleTypeIds]) => _ruleTypeIds)
    .flat();
