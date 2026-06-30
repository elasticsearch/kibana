/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// Be careful adding exports to this file, it may increase the bundle size of
// the ML plugin's page load bundle. You should either just export types or
// use `getMlSharedImports()` to export static code.

import type { PluginInitializer, PluginInitializerContext } from '@kbn/core/public';
import type {
  MlPluginSetup,
  MlPluginStart,
  MlSetupDependencies,
  MlStartDependencies,
} from './plugin';
import { MlPlugin } from './plugin';

export const plugin: PluginInitializer<
  MlPluginSetup,
  MlPluginStart,
  MlSetupDependencies,
  MlStartDependencies
> = (initializerContext: PluginInitializerContext) => new MlPlugin(initializerContext);

export type { MlPluginSetup, MlPluginStart };

export type { AnomalySwimLaneEmbeddableApi } from './embeddables';

export { CONTROLLED_BY_SWIM_LANE_FILTER } from './ui_actions/constants';

export type { MlLocator } from './locator';
export {
  useMlHref,
  useMlManagementHref,
  ML_PAGES,
  MlLocatorDefinition,
  MlManagementLocatorInternal,
} from './locator';

export { MLJobsAwaitingNodeWarning } from './application/components/jobs_awaiting_node_warning/new_job_awaiting_node_shared';
export { MlNodeAvailableWarningShared } from './application/components/node_available_warning';

export { useSeverityOptions } from './application/explorer/hooks/use_severity_options';
export type { SeverityOption } from './application/explorer/hooks/use_severity_options';
export { SeverityLegendControl } from './application/explorer/components/severity_legend_control/severity_legend_control';
export type { SeverityControlProps } from './application/explorer/components/severity_legend_control/severity_legend_control';
