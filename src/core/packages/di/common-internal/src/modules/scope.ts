/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  BindToFluentSyntax,
  Container,
  ContainerModuleLoadOptions,
  ServiceIdentifier,
} from 'inversify';
import { Plugin, type PluginApi } from '@inversifyjs/plugin';
import { Scope, type ScopedContainer } from '@kbn/core-di';
import { InternalCoreStart } from './lifecycle';
import { Global } from './plugin';

class ScopePlugin extends Plugin<ScopedContainer> {
  public load(api: PluginApi): void {
    api.define('expose', function <
      T
    >(this: Container, serviceIdentifier: ServiceIdentifier<T>): BindToFluentSyntax<T> {
      this.bind(Global).toConstantValue(serviceIdentifier);

      return this.bind(serviceIdentifier);
    });

    api.define('dispose', function (this: Container): void {
      this.unbindAllAsync().catch(() => {});
    });
  }
}

export function loadScope({ bind }: ContainerModuleLoadOptions): void {
  bind(Scope)
    .toResolvedValue(
      (injection) => {
        const scope = injection.fork();
        scope.register(ScopePlugin);

        return scope as ScopedContainer;
      },
      [InternalCoreStart('injection')]
    )
    .inRequestScope();
}
