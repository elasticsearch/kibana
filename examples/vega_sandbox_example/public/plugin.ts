/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '@kbn/core/public';
import type { DeveloperExamplesSetup } from '@kbn/developer-examples-plugin/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';

interface SetupDeps {
  developerExamples: DeveloperExamplesSetup;
}

export class VegaSandboxExamplePlugin implements Plugin<void, void, SetupDeps> {
  public setup(core: CoreSetup, { developerExamples }: SetupDeps) {
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      visibleIn: [],
      async mount(params: AppMountParameters) {
        const { renderApp } = await import('./application');
        const [coreStart] = await core.getStartServices();
        return renderApp(coreStart, params);
      },
    });

    developerExamples.register({
      appId: PLUGIN_ID,
      title: PLUGIN_NAME,
      description:
        'Opaque-iframe playground for the @kbn/vega-sandbox postMessage protocol. Not the production visTypeVega host.',
    });
  }

  public start(_core: CoreStart) {
    return {};
  }

  public stop() {}
}
