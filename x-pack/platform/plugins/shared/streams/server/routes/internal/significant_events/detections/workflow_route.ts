/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { STREAMS_API_PRIVILEGES } from '../../../../../common/constants';
import { createServerRoute } from '../../../create_server_route';
import { assertSignificantEventsAccess } from '../../../utils/assert_significant_events_access';

const countAlertsRoute = createServerRoute({
  endpoint: 'POST /internal/significant_events/detections/workflow/_count_alerts',
  options: {
    access: 'internal',
    summary: 'Count alerts for the Detection workflow',
    description:
      'Counts alert or rule-event documents in a lookback window, resolving v1 vs v2 alerts source from advanced settings.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      lookback: z.string().max(64),
      ruleUuid: z.string().max(256).optional(),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server, getSpaceId }) => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { alertsReader } = await scopedClients.getSignificantEventsAlertingContext();
    const count = await alertsReader.countAlerts(scopedClusterClient.asCurrentUser, {
      lookback: params.body.lookback,
      ruleUuid: params.body.ruleUuid,
      spaceId: await getSpaceId(request),
    });

    return { alertIndex: alertsReader.index, count };
  },
});

const changePointScanRoute = createServerRoute({
  endpoint: 'POST /internal/significant_events/detections/workflow/_change_point_scan',
  options: {
    access: 'internal',
    summary: 'Run per-rule change_point scan for the Detection workflow',
    description:
      'Executes the Detection workflow change_point aggregation against the resolved alerts source.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      lookback: z.string().max(64),
      bucketInterval: z.string().max(64),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server, getSpaceId }) => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const [kiClient, sigEventsContext] = await Promise.all([
      scopedClients.getKnowledgeIndicatorClient(),
      scopedClients.getSignificantEventsAlertingContext(),
    ]);
    const queryLinks = await kiClient.getRuleBackedQueryLinks();
    const aggregations = await sigEventsContext.alertsReader.runChangePointScan(
      scopedClusterClient.asCurrentUser,
      {
        lookback: params.body.lookback,
        bucketInterval: params.body.bucketInterval,
        spaceId: await getSpaceId(request),
      },
      queryLinks
    );

    return { alertIndex: sigEventsContext.alertsReader.index, aggregations };
  },
});

const ruleChangePointRoute = createServerRoute({
  endpoint: 'POST /internal/significant_events/detections/workflow/_rule_change_point',
  options: {
    access: 'internal',
    summary: 'Run quick-recovery change_point for one rule',
    description: 'Per-rule short-window change_point aggregation for the Detection workflow.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      ruleUuid: z.string().max(256),
      lookback: z.string().max(64),
      bucketInterval: z.string().max(64),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server, getSpaceId }) => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { alertsReader } = await scopedClients.getSignificantEventsAlertingContext();
    const result = await alertsReader.runRuleChangePoint(scopedClusterClient.asCurrentUser, {
      ruleUuid: params.body.ruleUuid,
      lookback: params.body.lookback,
      bucketInterval: params.body.bucketInterval,
      spaceId: await getSpaceId(request),
    });

    return { alertIndex: alertsReader.index, ...result };
  },
});

const ruleActivityRoute = createServerRoute({
  endpoint: 'POST /internal/significant_events/detections/workflow/_rule_activity',
  options: {
    access: 'internal',
    summary: 'Fetch per-rule activity windows for the Detection workflow',
    description: 'Returns activity histogram and peak counts for one rule.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      ruleUuid: z.string().max(256),
      lookback: z.string().max(64),
      windowInterval: z.string().max(64),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server, getSpaceId }) => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { alertsReader } = await scopedClients.getSignificantEventsAlertingContext();
    const result = await alertsReader.runRuleActivity(scopedClusterClient.asCurrentUser, {
      ruleUuid: params.body.ruleUuid,
      lookback: params.body.lookback,
      windowInterval: params.body.windowInterval,
      spaceId: await getSpaceId(request),
    });

    return { alertIndex: alertsReader.index, ...result };
  },
});

const ruleAlertWindowsRoute = createServerRoute({
  endpoint: 'POST /internal/significant_events/detections/workflow/_rule_alert_windows',
  options: {
    access: 'internal',
    summary: 'Compare current and reference alert windows for one rule',
    description:
      'Day-over-day style alert window counts for quick-recovery logic in the Detection workflow.',
  },
  security: {
    authz: {
      requiredPrivileges: [STREAMS_API_PRIVILEGES.read],
    },
  },
  params: z.object({
    body: z.object({
      ruleUuid: z.string().max(256),
      currentLookback: z.string().max(64),
      referenceLookbackGte: z.string().max(64),
      referenceLookbackLt: z.string().max(64),
    }),
  }),
  handler: async ({ params, request, getScopedClients, server, getSpaceId }) => {
    const scopedClients = await getScopedClients({ request });
    const { scopedClusterClient, licensing, uiSettingsClient } = scopedClients;

    await assertSignificantEventsAccess({ server, licensing, uiSettingsClient });

    const { alertsReader } = await scopedClients.getSignificantEventsAlertingContext();
    const result = await alertsReader.runRuleAlertWindows(scopedClusterClient.asCurrentUser, {
      ruleUuid: params.body.ruleUuid,
      currentLookback: params.body.currentLookback,
      referenceLookbackGte: params.body.referenceLookbackGte,
      referenceLookbackLt: params.body.referenceLookbackLt,
      spaceId: await getSpaceId(request),
    });

    return { alertIndex: alertsReader.index, ...result };
  },
});

export const internalSigEventsDetectionsWorkflowRoutes = {
  ...countAlertsRoute,
  ...changePointScanRoute,
  ...ruleChangePointRoute,
  ...ruleActivityRoute,
  ...ruleAlertWindowsRoute,
};
