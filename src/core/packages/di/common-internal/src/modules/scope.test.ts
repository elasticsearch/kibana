/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Container, ContainerModule } from 'inversify';
import { Scope, type ScopedContainer } from '@kbn/core-di';
import { InternalCoreStart, type InternalCoreStartContext } from './lifecycle';
import { Global } from './plugin';
import { loadScope } from './scope';

describe('loadScope', () => {
  let injection: jest.Mocked<InternalCoreStartContext['injection']>;
  let container: Container;

  beforeEach(() => {
    container = new Container();
    injection = {
      fork: jest.fn(() => new Container({ parent: container })),
    } as unknown as typeof injection;
    container.bind(InternalCoreStart('injection')).toConstantValue(injection);
    container.load(new ContainerModule(loadScope));
  });

  it('should bind the `Scope` service', () => {
    expect(container.isBound(Scope)).toBe(true);
  });

  it('should fork the injection container', () => {
    const scope = container.get(Scope);

    expect(scope).not.toBe(container);
    expect(injection.fork).toHaveBeenCalledTimes(1);
    expect(injection.fork).toHaveReturnedWith(scope);
  });

  describe('Scope', () => {
    let scope: ScopedContainer;

    beforeEach(() => {
      scope = container.get(Scope);
    });

    it('should resolve a scoped container', () => {
      expect(scope.expose).toBeInstanceOf(Function);
      expect(scope.dispose).toBeInstanceOf(Function);
    });

    describe('expose', () => {
      beforeEach(() => {
        scope.expose('token').toConstantValue('value');
      });

      it('should bind a service', () => {
        expect(scope.get('token')).toBe('value');
      });

      it('should bind a global service', () => {
        expect(scope.get(Global)).toBe('token');
      });
    });

    describe('dispose', () => {
      it('should unbind all services', async () => {
        scope.bind('token').toConstantValue('value');
        scope.dispose();
        await new Promise(process.nextTick);

        expect(scope.isBound('token')).toBe(false);
      });
    });
  });
});
