/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ToolingLog } from '@kbn/tooling-log';

import type {
  Config,
  Lifecycle,
  DockerServersService,
  EsVersion,
  DedicatedTaskRunner,
} from './lib';
import type { Test, Suite } from './fake_mocha_types';

export type { Lifecycle, Config };

export interface AsyncInstance<T> {
  /**
   * Services that are initialized async are not ready before the tests execute, so you might need
   * to call `init()` and await the promise it returns before interacting with the service
   */
  init(): Promise<T>;
}

/**
 * When a provider returns a promise it is initialized as an AsyncInstance that is a
 * proxy to the eventual result with an added init() method which returns the eventual
 * result. Automatically unwrap these promises and convert them to AsyncInstances + Instance
 * types.
 */
type MaybeAsyncInstance<T> = T extends Promise<infer X> ? AsyncInstance<X> & X : T;

/**
 * Covert a Provider type to the instance type it provides
 */
export type ProvidedType<T extends (...args: any[]) => any> = MaybeAsyncInstance<ReturnType<T>>;

/**
 * Convert a map of providers to a map of the instance types they provide, also converting
 * promise types into the async instances that other providers will receive.
 */
type ProvidedTypeMap<T extends {}> = {
  [K in keyof T]: T[K] extends new (...args: any[]) => infer X
    ? X
    : T[K] extends (...args: any[]) => any
    ? ProvidedType<T[K]>
    : unknown;
};

export interface GenericFtrProviderContext<
  ServiceProviders extends {},
  PageObjectProviders extends {},
  ServiceMap = ProvidedTypeMap<ServiceProviders>,
  PageObjectMap = ProvidedTypeMap<PageObjectProviders>
> {
  /**
   * Determine if a service is avaliable
   * @param serviceName
   */
  hasService(
    serviceName:
      | 'config'
      | 'log'
      | 'lifecycle'
      | 'dockerServers'
      | 'esVersion'
      | 'dedicatedTaskRunner'
  ): true;
  hasService<K extends keyof ServiceMap>(serviceName: K): serviceName is K;
  hasService(serviceName: string): serviceName is Extract<keyof ServiceMap, string>;

  /**
   * Get the instance of a service, if the service is loaded async and the service needs to be used
   * outside of a test/hook, then make sure to call its `.init()` method and await it's promise.
   * @param serviceName
   */
  getService(serviceName: 'config'): Config;
  getService(serviceName: 'log'): ToolingLog;
  getService(serviceName: 'lifecycle'): Lifecycle;
  getService(serviceName: 'dockerServers'): DockerServersService;
  getService(serviceName: 'esVersion'): EsVersion;
  getService(serviceName: 'dedicatedTaskRunner'): DedicatedTaskRunner;
  getService<T extends keyof ServiceMap>(serviceName: T): ServiceMap[T];

  /**
   * Get the instance of a page object
   * @param pageObjectName
   */
  getPageObject<K extends keyof PageObjectMap>(pageObjectName: K): PageObjectMap[K];

  /**
   * Get a map of PageObjects
   * @param pageObjects
   */
  getPageObjects<K extends keyof PageObjectMap>(pageObjects: K[]): Pick<PageObjectMap, K>;

  /**
   * Synchronously load a test file, can be called within a `describe()` block to add
   * common setup/teardown steps to several suites
   * @param path
   */
  loadTestFile(path: string): void;

  /**
   * Did the user request that baselines get updated?
   */
  updateBaselines: boolean;
}

export class GenericFtrService<ProviderContext extends GenericFtrProviderContext<any, any>> {
  constructor(protected readonly ctx: ProviderContext) {}
}

export interface FtrConfigProviderContext {
  log: ToolingLog;
  esVersion: EsVersion;
  readConfigFile(path: string): Promise<Config>;
}

export type FtrConfigProvider = <T>(ctx: FtrConfigProviderContext) => T | Promise<T>;

export type { Test, Suite };
