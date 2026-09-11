/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Container } from 'inversify';
import type { PluginOpaqueId } from '@kbn/core-base-common';
import type { InternalCoreDiServiceSetup, InternalCoreDiServiceStart } from './contracts';
import { core } from './modules/core';
import { Fork, PluginModule, Plugin } from './modules/plugin';

/** @internal */
export class CoreInjectionService {
  private static readonly DEFAULT_CONTAINER_OPTIONS = {
    autoBind: false,
    defaultScope: 'Singleton' as const,
  };

  private root = new Container(CoreInjectionService.DEFAULT_CONTAINER_OPTIONS);
  private module = new PluginModule(this.root, CoreInjectionService.DEFAULT_CONTAINER_OPTIONS);

  constructor() {
    this.fork = this.fork.bind(this);
    this.getContainer = this.getContainer.bind(this);
  }

  protected getContainer(id?: PluginOpaqueId, container: Container = this.root): Container {
    return container.get(Plugin)(id);
  }

  protected fork(id?: PluginOpaqueId, container: Container = this.root): Container {
    return container.get(Fork)(id);
  }

  public setup(): InternalCoreDiServiceSetup {
    const contract = {
      getContainer: this.getContainer,
    };
    this.root.load(this.module);
    this.root.load(core);

    return contract;
  }

  public start(): InternalCoreDiServiceStart {
    const contract = {
      fork: this.fork,
      getContainer: this.getContainer,
    };

    return contract;
  }
}
