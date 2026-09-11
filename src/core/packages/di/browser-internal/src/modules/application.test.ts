/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Container } from 'inversify';
import { inject, injectable } from 'inversify';
import { KibanaContainerModule, Scope, type ScopedContainer } from '@kbn/core-di';
import { injectionServiceMock, setup, start } from '@kbn/core-di-mocks';
import { CoreSetup, CoreStart, Application, ApplicationParameters } from '@kbn/core-di-browser';
import type { App, AppMountParameters, AppUnmount } from '@kbn/core-application-browser';
import type { CoreSetup as TCoreSetup } from '@kbn/core-lifecycle-browser';
import { loadApplication } from './application';

@injectable()
export class TestApplication {
  public static id = 'test';
  public static title = 'Test';
  public static visibleIn = [];

  constructor(@inject(ApplicationParameters) public readonly params: AppMountParameters) {}

  mount() {
    return () => this.unmount();
  }

  unmount() {}
}

describe('application', () => {
  let injection: jest.Mocked<ReturnType<typeof injectionServiceMock.createStartContract>>;
  let container: Container;
  let application: jest.Mocked<TCoreSetup['application']>;

  beforeEach(() => {
    injection = injectionServiceMock.createStartContract();
    application = { register: jest.fn() } as unknown as typeof application;
    container = injection.getContainer();

    container.load(new KibanaContainerModule(loadApplication));
    container.bind(CoreSetup('application')).toConstantValue(application);
    container.bind(CoreStart('injection')).toConstantValue(injection);
    container.bind(Application).toConstantValue(TestApplication);
  });

  describe('OnSetup', () => {
    it('should register an application', () => {
      setup(container);

      expect(application.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: TestApplication.id,
          title: TestApplication.title,
          visibleIn: TestApplication.visibleIn,
          mount: expect.any(Function),
        })
      );
    });

    it('should not register an application if there are no corresponding bindings', () => {
      container.unbind(Application);

      expect(() => setup(container)).not.toThrow();
      expect(application.register).not.toHaveBeenCalled();
    });
  });

  describe('Application', () => {
    let scope: ScopedContainer;
    let mount: App['mount'];
    let mountSpy: jest.SpyInstance;
    let unmountSpy: jest.SpyInstance;
    let disposeSpy: jest.SpyInstance;
    let params: AppMountParameters;

    beforeEach(() => {
      scope = container.get(Scope);
      params = {} as unknown as AppMountParameters;

      mountSpy = jest.spyOn(TestApplication.prototype, 'mount');
      unmountSpy = jest.spyOn(TestApplication.prototype, 'unmount');
      disposeSpy = jest.spyOn(scope, 'dispose');

      setup(container);
      start(container);
      [{ mount }] = application.register.mock.lastCall!;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should mount an application', async () => {
      await expect(mount(params)).resolves.toBeInstanceOf(Function);
      expect(mountSpy).toHaveBeenCalled();

      const [testApplication] = mountSpy.mock.contexts as TestApplication[];
      expect(testApplication.params).toBe(params);
      expect(unmountSpy).not.toHaveBeenCalled();
      expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('should unmount an application', async () => {
      const unmount = await mount(params);
      (unmount as Function)();

      expect(unmountSpy).toHaveBeenCalled();
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should dispose the request scope when unmount throws', async () => {
      const unmount = await mount(params);
      unmountSpy.mockImplementation(() => {
        throw new Error('Unmount error');
      });

      expect(() => (unmount as Function)()).toThrow('Unmount error');
      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should dispose the request scope when unmount is a promise', async () => {
      let resolveHandle: () => void;
      mountSpy.mockImplementation(function (this: TestApplication) {
        return new Promise<AppUnmount>((resolve) => {
          resolveHandle = () => resolve(() => this.unmount());
        });
      });
      const unmount = mount(params);
      await new Promise(process.nextTick);

      expect(disposeSpy).not.toHaveBeenCalled();
      resolveHandle!();
      await expect(unmount as Promise<AppUnmount>).resolves.toBeInstanceOf(Function);
      (await unmount)();
      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
