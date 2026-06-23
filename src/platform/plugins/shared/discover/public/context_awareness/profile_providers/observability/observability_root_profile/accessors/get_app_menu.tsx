/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { AppMenuRegistry } from '@kbn/discover-utils';
import { AppMenuActionId } from '@kbn/discover-utils';
import type { DataQualityLocatorParams } from '@kbn/deeplinks-observability';
import { DATA_QUALITY_LOCATOR_ID } from '@kbn/deeplinks-observability';
import { AlertConsumers, OBSERVABILITY_THRESHOLD_RULE_TYPE_ID } from '@kbn/rule-data-utils';
import { RuleFormFlyout } from '@kbn/response-ops-rule-form/flyout';
import { isOfQueryType } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { isValidRuleFormPlugins } from '@kbn/response-ops-rule-form/lib';
import type { RootProfileProvider } from '../../../../profiles';
import type { ProfileProviderServices } from '../../../profile_provider_services';
import type { AppMenuExtensionParams } from '../../../..';

export const createGetAppMenu =
  (services: ProfileProviderServices): RootProfileProvider['profile']['getAppMenu'] =>
  (prev) =>
  (params) => {
    const prevValue = prev(params);

    return {
      appMenuRegistry: (registry) => {
        // Register custom link actions
        registerDatasetQualityLink(registry, services);
        // Register alerts sub menu actions
        registerCreateSLOAction(registry, services, params);
        registerCustomThresholdRuleAction(registry, services, params);

        return prevValue.appMenuRegistry(registry);
      },
    };
  };

const registerDatasetQualityLink = (
  registry: AppMenuRegistry,
  { share, timefilter }: ProfileProviderServices
) => {
  const dataQualityLocator =
    share?.url.locators.get<DataQualityLocatorParams>(DATA_QUALITY_LOCATOR_ID);

  if (dataQualityLocator) {
    registry.registerItem({
      id: 'dataset-quality-link',
      label: i18n.translate('discover.observabilitySolution.appMenu.datasets', {
        defaultMessage: 'Data sets',
      }),
      order: 5,
      iconType: 'database',
      testId: 'discoverAppMenuDatasetQualityLink',
      run: ({ context: { onFinishAction } }) => {
        const refresh = timefilter.getRefreshInterval();
        const { from, to } = timefilter.getTime();

        dataQualityLocator.navigate({
          filters: {
            timeRange: {
              from: from ?? 'now-24h',
              to: to ?? 'now',
              refresh,
            },
          },
        });

        onFinishAction();
      },
    });
  }
};

const registerCustomThresholdRuleAction = (
  registry: AppMenuRegistry,
  {
    data,
    triggersActionsUi: { ruleTypeRegistry, actionTypeRegistry },
    ...services
  }: ProfileProviderServices,
  { dataView, authorizedRuleTypeIds }: AppMenuExtensionParams
): void => {
  if (!authorizedRuleTypeIds.includes(OBSERVABILITY_THRESHOLD_RULE_TYPE_ID)) return;

  const popoverItem = {
    id: 'custom-threshold-rule',
    order: 2,
    iconType: 'bell',
    testId: 'discoverAppMenuCustomThresholdRule',
    label: i18n.translate('discover.observabilitySolution.appMenu.customThresholdRule', {
      defaultMessage: 'Create custom threshold rule',
    }),

    render: ({ context: { onFinishAction } }: { context: { onFinishAction: () => void } }) => {
      const index = dataView?.toMinimalSpec();
      const { filters, query } = data.query.getState();

      // Some of the rule form's required plugins are from x-pack, so make sure they're defined before
      // rendering the flyout. The alerting plugin is also part of x-pack, so this check should probably never
      // return false. This is mostly here because Typescript requires us to mark x-pack plugins as optional.
      const plugins = { ...services, data };
      if (!isValidRuleFormPlugins(plugins)) return null;

      return (
        <RuleFormFlyout
          plugins={{
            ...plugins,
            ruleTypeRegistry,
            actionTypeRegistry,
          }}
          consumer={AlertConsumers.ALERTS}
          validConsumers={[
            AlertConsumers.LOGS,
            AlertConsumers.INFRASTRUCTURE,
            AlertConsumers.OBSERVABILITY,
            AlertConsumers.STACK_ALERTS,
            AlertConsumers.ALERTS,
          ]}
          multiConsumerSelection={AlertConsumers.ALERTS}
          ruleTypeId={OBSERVABILITY_THRESHOLD_RULE_TYPE_ID}
          initialValues={{
            params: {
              searchConfiguration: {
                index,
                query,
                filter: filters,
              },
            },
          }}
          onSubmit={onFinishAction}
          onCancel={onFinishAction}
        />
      );
    },
  };

  registry.registerPopoverItem(AppMenuActionId.alerts, popoverItem);
};

const registerCreateSLOAction = (
  registry: AppMenuRegistry,
  allServices: ProfileProviderServices,
  { dataView, isEsqlMode }: AppMenuExtensionParams
): void => {
  const { data, discoverShared, application } = allServices;
  const sloFeature = discoverShared.features.registry.getById('observability-create-slo');
  const hasSloPermission = application.capabilities.slo?.write;

  if (sloFeature && hasSloPermission) {
    const popoverItem = {
      id: 'create-slo',
      order: 3,
      label: i18n.translate('discover.observabilitySolution.appMenu.slo', {
        defaultMessage: 'Create SLO',
      }),
      iconType: 'chartGauge',
      testId: 'discoverAppMenuCreateSlo',
      render: ({ context: { onFinishAction } }: { context: { onFinishAction: () => void } }) => {
        const index = dataView?.getIndexPattern();
        const timestampField = dataView?.timeFieldName;
        const { filters, query: kqlQuery } = data.query.getState();

        const filter = isEsqlMode
          ? {}
          : {
              kqlQuery: isOfQueryType(kqlQuery) ? kqlQuery.query : '',
              filters: filters?.map(({ meta, query }) => ({ meta, query })),
            };

        const result = sloFeature.createSLOFlyout({
          initialValues: {
            indicator: {
              type: 'sli.kql.custom',
              params: {
                index,
                timestampField,
                filter,
              },
            },
          },
          onClose: onFinishAction,
        });

        return React.isValidElement(result) ? result : null;
      },
    };

    registry.registerPopoverItem(AppMenuActionId.alerts, popoverItem);
  }
};
