/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  registerInstall,
  registerUninstall,
  registerStop,
  registerStart,
  registerStatus,
  registerForceLogExtraction,
  registerStartMaintainer,
  registerStopMaintainer,
  registerGetMaintainers,
  registerInitMaintainers,
  registerRunMaintainer,
  registerForceRemoteExtractToUpdates,
  registerForceHistorySnapshot,
  registerCRUDCreate,
  registerCRUDUpdate,
  registerCRUDBulkUpdate,
  registerCRUDGet,
  registerCRUDDelete,
  registerResolutionLink,
  registerResolutionUnlink,
  registerResolutionGroup,
  registerUpdate,
  registerCheckPrivileges,
  registerDiscoveredSources,
} from './apis';
import type { EntityStorePluginRouter } from '../types';

export function registerRoutes(router: EntityStorePluginRouter) {
  registerInstall(router);
  registerStop(router);
  registerStatus(router);
  registerUninstall(router);
  registerForceLogExtraction(router);
  registerForceRemoteExtractToUpdates(router);
  registerForceHistorySnapshot(router);
  registerCheckPrivileges(router);
  registerDiscoveredSources(router);
  registerCRUDCreate(router);
  registerCRUDUpdate(router);
  registerCRUDBulkUpdate(router);
  registerCRUDGet(router);
  registerCRUDDelete(router);
  registerStart(router);
  registerUpdate(router);
  registerResolutionLink(router);
  registerResolutionUnlink(router);
  registerResolutionGroup(router);
  registerStartMaintainer(router);
  registerStopMaintainer(router);
  registerGetMaintainers(router);
  registerInitMaintainers(router);
  registerRunMaintainer(router);
}
