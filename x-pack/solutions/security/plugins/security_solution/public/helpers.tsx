/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_RULE_NAME, ALERT_RULE_PARAMETERS, ALERT_RULE_UUID } from '@kbn/rule-data-utils';
import { get, has, isEmpty } from 'lodash/fp';
import React from 'react';
import type { RouteProps } from 'react-router-dom';
import { matchPath } from 'react-router-dom';

import type { Capabilities, CoreStart } from '@kbn/core/public';
import type { DocLinks } from '@kbn/doc-links';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { dataTableActions, TableId } from '@kbn/securitysolution-data-table';
import { isObject } from 'lodash';
import { PageScope } from './data_view_manager/constants';
import {
  ALERTS_PATH,
  APP_UI_ID,
  CASES_FEATURE_ID,
  CASES_PATH,
  DASHBOARDS_PATH,
  EXCEPTIONS_PATH,
  RULES_CHANGES_HISTORY_PATH,
  RULES_PATH,
  THREAT_INTELLIGENCE_PATH,
} from '../common/constants';
import type {
  FactoryQueryTypes,
  StrategyResponseType,
} from '../common/search_strategy/security_solution';
import type { TimelineEqlResponse } from '../common/search_strategy/timeline';
import { NoPrivilegesPage } from './common/components/no_privileges';
import { SecurityPageName } from './app/types';
import type { InspectResponse, StartedSubPlugins, StartServices } from './types';
import { CASES_SUB_PLUGIN_KEY } from './types';
import { timelineActions } from './timelines/store';
import { TimelineId } from '../common/types';
import { hasAccessToAttackDiscovery, hasAccessToSecuritySolution } from './helpers_access';

export const parseRoute = (location: Pick<Location, 'hash' | 'pathname' | 'search'>) => {
  if (!isEmpty(location.hash)) {
    const hashPath = location.hash.split('?');
    const search = hashPath.length >= 1 ? `?${hashPath[1]}` : '';
    const pageRoute = hashPath.length > 0 ? hashPath[0].split('/') : [];
    const pageName = pageRoute.length >= 1 ? pageRoute[1] : '';
    const path = `/${pageRoute.slice(2).join('/') ?? ''}${search}`;

    return {
      pageName,
      path,
      search,
    };
  }

  const search = location.search;
  const pageRoute = location.pathname.split('/');
  const pageName = pageRoute[3];
  const subpluginPath = pageRoute.length > 4 ? `/${pageRoute.slice(4).join('/')}` : '';
  const path = `${subpluginPath}${search}`;

  return {
    pageName,
    path,
    search,
  };
};

export const manageOldSiemRoutes = async (coreStart: CoreStart) => {
  const { application } = coreStart;
  const { pageName, path } = parseRoute(window.location);

  switch (pageName) {
    case SecurityPageName.overview:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.overview,
        replace: true,
        path,
      });
      break;
    case 'ml-hosts':
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.hosts,
        replace: true,
        path: `/ml-hosts${path}`,
      });
      break;
    case SecurityPageName.hosts:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.hosts,
        replace: true,
        path,
      });
      break;
    case 'ml-network':
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.network,
        replace: true,
        path: `/ml-network${path}`,
      });
      break;
    case SecurityPageName.network:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.network,
        replace: true,
        path,
      });
      break;
    case SecurityPageName.timelines:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.timelines,
        replace: true,
        path,
      });
      break;
    case SecurityPageName.case:
    case 'case':
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.case,
        replace: true,
        path,
      });
      break;
    case SecurityPageName.detections:
    case SecurityPageName.alerts:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.alerts,
        replace: true,
        path,
      });
      break;
    case SecurityPageName.rules:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.rules,
        replace: true,
        path,
      });
      break;
    case SecurityPageName.exceptions:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.exceptions,
        replace: true,
        path,
      });
      break;
    default:
      application.navigateToApp(APP_UI_ID, {
        deepLinkId: SecurityPageName.landing,
        replace: true,
        path,
      });
      break;
  }
};

export const getInspectResponse = <T extends FactoryQueryTypes>(
  response: StrategyResponseType<T> | TimelineEqlResponse | undefined,
  prevResponse: InspectResponse
): InspectResponse => ({
  dsl:
    isObject(response?.inspect) && response?.inspect.dsl
      ? response.inspect.dsl
      : prevResponse?.dsl || [],
  response:
    response != null ? [JSON.stringify(response.rawResponse, null, 2)] : prevResponse?.response,
});

export const isDetectionsPath = (pathname: string): boolean => {
  return !!matchPath(pathname, {
    path: `(${ALERTS_PATH}|${RULES_PATH}|${EXCEPTIONS_PATH})`,
    strict: false,
  });
};

export const isDashboardViewPath = (pathname: string): boolean =>
  matchPath(pathname, {
    path: `${DASHBOARDS_PATH}/:detailName`,
    exact: false,
    strict: false,
  }) != null;

export const isRuleChangesHistoryPath = (pathname: string): boolean =>
  !!matchPath(pathname, {
    path: RULES_CHANGES_HISTORY_PATH,
    exact: true,
    strict: false,
  });

const isAlertsPath = (pathname: string): boolean => {
  return !!matchPath(pathname, {
    path: `${ALERTS_PATH}`,
    strict: false,
  });
};

const isCaseDetailsPath = (pathname: string): boolean => {
  return !!matchPath(pathname, {
    path: `${CASES_PATH}/:detailName`,
    strict: false,
  });
};
export const isTourPath = (pathname: string): boolean =>
  isAlertsPath(pathname) || isCaseDetailsPath(pathname);

export const isThreatIntelligencePath = (pathname: string): boolean => {
  return !!matchPath(pathname, {
    path: `(${THREAT_INTELLIGENCE_PATH})`,
    strict: false,
  });
};

export const getSubPluginRoutesByCapabilities = (
  subPlugins: StartedSubPlugins,
  services: StartServices
): RouteProps[] => {
  return Object.entries(subPlugins).reduce<RouteProps[]>((acc, [key, value]) => {
    if (isSubPluginAvailable(key, services.application.capabilities)) {
      acc.push(...value.routes);
    } else {
      const docLinkSelector = (docLinks: DocLinks) => docLinks.siem.privileges;
      acc.push(
        ...value.routes.map((route: RouteProps) => ({
          path: route.path,
          component: () => {
            const Upsell = services.upselling.getPageUpselling(key as SecurityPageName);
            if (Upsell) {
              return <Upsell />;
            }
            return <NoPrivilegesPage pageName={key} docLinkSelector={docLinkSelector} />;
          },
        }))
      );
    }
    return acc;
  }, []);
};

export const isSubPluginAvailable = (pluginKey: string, capabilities: Capabilities): boolean => {
  if (CASES_SUB_PLUGIN_KEY === pluginKey) {
    return capabilities[CASES_FEATURE_ID].read_cases === true;
  }
  if (pluginKey === 'attackDiscovery') {
    return hasAccessToAttackDiscovery(capabilities);
  }
  return hasAccessToSecuritySolution(capabilities);
};

const siemSignalsFieldMappings: Record<string, string> = {
  [ALERT_RULE_UUID]: 'signal.rule.id',
  [ALERT_RULE_NAME]: 'signal.rule.name',
  [`${ALERT_RULE_PARAMETERS}.filters`]: 'signal.rule.filters',
  [`${ALERT_RULE_PARAMETERS}.language`]: 'signal.rule.language',
  [`${ALERT_RULE_PARAMETERS}.query`]: 'signal.rule.query',
};

const alertFieldMappings: Record<string, string> = {
  'signal.rule.id': ALERT_RULE_UUID,
  'signal.rule.name': ALERT_RULE_NAME,
  'signal.rule.filters': `${ALERT_RULE_PARAMETERS}.filters`,
  'signal.rule.language': `${ALERT_RULE_PARAMETERS}.language`,
  'signal.rule.query': `${ALERT_RULE_PARAMETERS}.query`,
};

/*
 * Deprecation notice: This functionality should be removed when support for signal.* is no longer
 * supported.
 *
 * Selectively returns the AAD field key (kibana.alert.*) or the legacy field
 * (signal.*), whichever is present. For backwards compatibility.
 */
export const getFieldKey = (ecsData: Ecs, field: string): string => {
  const aadField = (alertFieldMappings[field] ?? field).replace('signal', 'kibana.alert');
  const siemSignalsField = (siemSignalsFieldMappings[field] ?? field).replace(
    'kibana.alert',
    'signal'
  );
  if (has(aadField, ecsData)) return aadField;
  return siemSignalsField;
};

/*
 * Deprecation notice: This functionality should be removed when support for signal.* is no longer
 * supported.
 *
 * Selectively returns the AAD field value (kibana.alert.*) or the legacy field value
 * (signal.*), whichever is present. For backwards compatibility.
 */
export const getField = (ecsData: Ecs, field: string) => {
  const aadField = (alertFieldMappings[field] ?? field).replace('signal', 'kibana.alert');
  const siemSignalsField = (siemSignalsFieldMappings[field] ?? field).replace(
    'kibana.alert',
    'signal'
  );
  const parts = aadField.split('.');
  if (parts.includes('parameters') && parts[parts.length - 1] !== 'parameters') {
    const paramsField = parts.slice(0, parts.length - 1).join('.');
    const params = get(paramsField, ecsData);
    const value = get(parts[parts.length - 1], params);
    return value;
  }
  const value = get(aadField, ecsData) ?? get(siemSignalsField, ecsData);

  return value;
};

export const isTimelineScope = (scopeId: string) =>
  Object.values(TimelineId).includes(scopeId as unknown as TimelineId);
export const isInTableScope = (scopeId: string) =>
  Object.values(TableId).includes(scopeId as unknown as TableId);

export const isAlertsPageScope = (scopeId: string) =>
  [
    TableId.alertsOnAlertsPage,
    TableId.alertsOnRuleDetailsPage,
    TableId.alertsOnCasePage,
    TableId.alertsOnAttacksPage,
  ].includes(scopeId as TableId);

export const getScopedActions = (scopeId: string) => {
  if (isTimelineScope(scopeId)) {
    return timelineActions;
  } else if (isInTableScope(scopeId)) {
    return dataTableActions;
  }
};

export const isActiveTimeline = (timelineId: string) => timelineId === TimelineId.active;

export const getSourcererScopeId = (scopeId: string): PageScope => {
  if (isTimelineScope(scopeId)) {
    return PageScope.timeline;
  } else if (isAlertsPageScope(scopeId)) {
    return PageScope.alerts;
  } else {
    return PageScope.default;
  }
};
