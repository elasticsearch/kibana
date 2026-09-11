/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { DefaultRouteHandlerResources } from '@kbn/server-route-repository';
import type { AlertsClient } from '@kbn/rule-registry-plugin/server';
import type { NightshiftInvestigationsClient } from '../client/investigations_client';
import type { CortexPageStore } from '../cortex/page_store';
import type { GetTriggerEmitter } from '../types';

export type GetInvestigationsClient = (
  request: KibanaRequest,
  spaceId?: string
) => NightshiftInvestigationsClient;

export type GetAlertsClient = (request: KibanaRequest) => Promise<AlertsClient> | undefined;

export type GetCortexPageStore = (request: KibanaRequest) => CortexPageStore;

export interface NightshiftInvestigationsRouteHandlerResources
  extends DefaultRouteHandlerResources {
  getInvestigationsClient: GetInvestigationsClient;
  getTriggerEmitter: GetTriggerEmitter;
  getAlertsClient: GetAlertsClient;
  getCortexPageStore: GetCortexPageStore;
  isCortexEnabled: () => boolean;
}
