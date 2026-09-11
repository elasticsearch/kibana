/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ContainerModule, type ContainerModuleLoadOptions } from 'inversify';
import type { LoggerFactory } from '@kbn/logging';
import type { ServiceToken, CoreDiServiceStart } from '@kbn/core-di';
import { PluginSetup, PluginStart } from '@kbn/core-di';

/** @internal */
export interface InternalPluginInitializerContext {
  logger: LoggerFactory;
}

/** @internal */
export interface InternalCoreStartContext {
  injection: CoreDiServiceStart;
}

/** @internal */
export type ServiceIdentifierFactory<TBase> = <T extends TBase, K extends keyof T>(
  key: K
) => ServiceToken<T[K]>;

function loadEach<T extends object>(
  { bind }: ContainerModuleLoadOptions,
  object: T,
  iteratee: ServiceIdentifierFactory<T>
): void {
  for (const [key, value] of Object.entries(object)) {
    bind(iteratee(key as keyof T)).toConstantValue(value);
  }
}

function createServiceIdentifierFactory<T>(...prefix: string[]): ServiceIdentifierFactory<T> {
  return (...key) => Symbol.for([...prefix, key].join('.'));
}

/** @internal */
export const InternalPluginInitializer =
  createServiceIdentifierFactory<InternalPluginInitializerContext>('plugin', 'initializer');

/** @internal */
export const InternalCoreSetup = createServiceIdentifierFactory('core', 'setup');

/** @internal */
export const InternalCoreStart = createServiceIdentifierFactory<InternalCoreStartContext>(
  'core',
  'start'
);

/** @internal */
export function createSetupModule<
  TPluginInitializerContext extends InternalPluginInitializerContext,
  TCoreSetupContext extends object,
  TPluginsSetup extends object
>(
  pluginInitializerContext: TPluginInitializerContext,
  coreSetupContext: TCoreSetupContext,
  plugins: TPluginsSetup
) {
  return new ContainerModule((options) => {
    loadEach(options, pluginInitializerContext, InternalPluginInitializer);
    loadEach(options, coreSetupContext, InternalCoreSetup);
    loadEach(options, plugins, PluginSetup);
  });
}

/** @internal */
export function createStartModule<
  TCoreStartContext extends InternalCoreStartContext,
  TPluginsStart extends object
>(coreStartContext: TCoreStartContext, plugins: TPluginsStart) {
  return new ContainerModule((options) => {
    loadEach(options, coreStartContext, InternalCoreStart);
    loadEach(options, plugins, PluginStart);
  });
}
