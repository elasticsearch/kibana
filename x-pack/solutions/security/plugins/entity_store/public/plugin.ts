/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { AppPluginSetupDependencies } from './types';
import { registerTriggerDefinitions } from './workflow/triggers';

export class EntityStorePlugin implements Plugin {
  public setup(core: CoreSetup, deps: AppPluginSetupDependencies) {
    registerTriggerDefinitions(deps.workflowsExtensions);

    // DON'T REGISTER APPLICATION ON THIS STAGE, WILL BE DONE LATER ON DEVELOPMENT STAGE
    //
    // core.application.register({
    //   id: PLUGIN_ID,
    //   title: PLUGIN_NAME,
    //   visibleIn: [],
    //   async mount(params: AppMountParameters) {
    //     // Load application bundle
    //     const { renderApp } = await import('./application');
    //     // Get start services as specified in kibana.json
    //     const [coreStart] = await core.getStartServices();
    //     // Render the application
    //     return renderApp(coreStart, params);
    //   },
    // });
  }

  public start(core: CoreStart) {}

  public stop() {}
}
