/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/public';

export class DeferredInitExamplePlugin implements Plugin<void, void> {
  public setup(core: CoreSetup): void {
    core.application.register({
      id: 'deferredInitExample',
      title: i18n.translate('deferredInitExample.app.title', {
        defaultMessage: 'Deferred Init Example',
      }),
      async mount(params) {
        const [coreStart] = await core.getStartServices();
        const { renderApp } = await import('./app');
        return renderApp(coreStart, params);
      },
    });
  }

  public start(_core: CoreStart): void {}

  public stop(): void {}
}
