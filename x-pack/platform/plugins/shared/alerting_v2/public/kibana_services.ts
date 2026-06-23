/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Container } from 'inversify';
import { BehaviorSubject } from 'rxjs';
import type { RuleFormServices } from '@kbn/alerting-v2-rule-form';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { ExpressionsStart } from '@kbn/expressions-plugin/public';

/** Services shared by rule UI, episodes UI, and other alerting_v2 surfaces. */
export type AlertingV2KibanaServices = RuleFormServices & {
  expressions: ExpressionsStart;
  uiSettings: IUiSettingsClient;
  container: Container;
};

const servicesReady$ = new BehaviorSubject<AlertingV2KibanaServices | undefined>(undefined);

export const untilPluginStartServicesReady = (): Promise<AlertingV2KibanaServices> => {
  if (servicesReady$.value) return Promise.resolve(servicesReady$.value);
  return new Promise<AlertingV2KibanaServices>((resolve) => {
    const sub = servicesReady$.subscribe((deps) => {
      if (deps) {
        sub.unsubscribe();
        resolve(deps);
      }
    });
  });
};

export const setKibanaServices = (services: AlertingV2KibanaServices) => {
  servicesReady$.next(services);
};
