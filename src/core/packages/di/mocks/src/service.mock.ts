/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Container, type ContainerOptions } from 'inversify';
import { once } from 'lodash';
import {
  type CoreDiServiceSetup,
  type CoreDiServiceStart,
  Scope,
  type ScopedContainer,
} from '@kbn/core-di';
import {
  type CoreInjectionService,
  type InternalCoreDiServiceSetup,
  type InternalCoreDiServiceStart,
  InternalCoreStart,
} from '@kbn/core-di-internal';
import type { MethodKeysOf, PublicMethodsOf } from '@kbn/utility-types';
import { lazyObject } from '@kbn/lazy-object';

function create(): jest.Mocked<PublicMethodsOf<CoreInjectionService>> {
  return lazyObject({
    setup: jest.fn(createInternalSetupContract),
    start: jest.fn(createInternalStartContract),
  });
}

function createContainer(options?: ContainerOptions) {
  const container = new Container({ defaultScope: 'Singleton', ...options });
  container.bind(Container).toConstantValue(container);

  for (const method of [
    'bind',
    'get',
    'isBound',
    'loadAsync',
    'load',
    'unbindAsync',
    'unbindAllAsync',
  ]) {
    jest.spyOn(container, method as MethodKeysOf<Container>);
  }

  return container as jest.Mocked<Container>;
}

function createSetupContract(): jest.MockedObjectDeep<CoreDiServiceSetup> {
  return lazyObject({
    getContainer: jest.fn().mockImplementation(once(createContainer)),
  });
}

function createStartContract(): jest.MockedObjectDeep<CoreDiServiceStart> {
  const root = createContainer();
  const injection = lazyObject({
    fork: jest.fn().mockImplementation(once(() => createContainer({ parent: root }))),
    getContainer: jest.fn().mockImplementation(() => root),
  });

  root.bind(InternalCoreStart('injection')).toConstantValue(injection);
  root
    .bind(Scope)
    .toDynamicValue(() => {
      const scope = Object.defineProperties(injection.fork(), {
        expose: {
          value: jest.fn(((serviceIdentifier) =>
            scope.bind(serviceIdentifier)) as ScopedContainer['expose']),
        },
        dispose: {
          value: jest.fn(),
        },
      }) as jest.Mocked<ScopedContainer>;

      return scope;
    })
    .inSingletonScope();

  return injection;
}

function createInternalSetupContract(): jest.MockedObjectDeep<InternalCoreDiServiceSetup> {
  return createSetupContract();
}

function createInternalStartContract(): jest.MockedObjectDeep<InternalCoreDiServiceStart> {
  return createStartContract();
}

/**
 * Mocks for the Dependency Injection service.
 * @public
 */
export const injectionServiceMock = {
  /**
   * Creates a mocked instance of the dependency-injection service.
   */
  create,

  /**
   * Creates a mocked instance of the setup contract.
   */
  createSetupContract,

  /**
   * Creates a mocked instance of the start contract.
   */
  createStartContract,

  /**
   * Creates a mocked instance of the internal setup contract.
   * @internal
   */
  createInternalSetupContract,

  /**
   * Creates a mocked instance of the internal start contract.
   * @internal
   */
  createInternalStartContract,
};
