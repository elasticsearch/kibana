/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isPromise } from '@kbn/std';
import type { App, AppUnmount } from '@kbn/core-application-browser';
import { type KibanaContainerModuleLoadOptions, Scope } from '@kbn/core-di';
import { Application, ApplicationParameters, CoreSetup } from '@kbn/core-di-browser';

export function loadApplication({ onSetup }: KibanaContainerModuleLoadOptions) {
  onSetup(Application, CoreSetup('application'), ({ inject }, definition, application) => {
    application.register({
      ...definition,
      mount: inject(Scope, (scope, params) => {
        scope.expose(ApplicationParameters).toConstantValue(params);

        const unmount = scope.get(definition, { autobind: true }).mount();
        const wrap = (callback: AppUnmount) => () => {
          try {
            return callback();
          } finally {
            scope.dispose();
          }
        };

        return isPromise(unmount) ? unmount.then(wrap) : wrap(unmount);
      }) as App['mount'],
    });
  });
}
