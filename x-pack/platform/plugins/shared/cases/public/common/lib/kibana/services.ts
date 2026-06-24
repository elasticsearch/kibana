/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { CasesUiConfigType } from '../../../../common/ui/types';
import type { CasesPublicStartDependencies } from '../../../types';

type GlobalServices = Pick<
  CoreStart,
  'application' | 'http' | 'theme' | 'uiSettings' | 'userProfile'
> &
  Pick<CasesPublicStartDependencies, 'serverless' | 'savedObjectsTaggingOss'>;

export class KibanaServices {
  private static kibanaVersion?: string;
  private static services?: GlobalServices;
  private static config?: CasesUiConfigType;

  public static init({
    application,
    config,
    http,
    serverless,
    savedObjectsTaggingOss,
    kibanaVersion,
    ...startServices
  }: GlobalServices & {
    kibanaVersion: string;
    config: CasesUiConfigType;
  }) {
    this.services = { application, http, serverless, savedObjectsTaggingOss, ...startServices };
    this.kibanaVersion = kibanaVersion;
    this.config = config;
  }

  public static get(): GlobalServices {
    if (!this.services) {
      this.throwUninitializedError();
    }

    return this.services;
  }

  public static getKibanaVersion(): string {
    if (!this.kibanaVersion) {
      this.throwUninitializedError();
    }

    return this.kibanaVersion;
  }

  public static getConfig() {
    return this.config;
  }

  private static throwUninitializedError(): never {
    throw new Error(
      'Kibana services not initialized - are you trying to import this module from outside of the Cases app?'
    );
  }
}
