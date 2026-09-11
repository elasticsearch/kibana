/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const pluginModuleMock = {};

jest.mock('./modules/plugin', () => ({
  ...jest.requireActual('./modules/plugin'),
  PluginModule: jest.fn().mockReturnValue(pluginModuleMock),
}));

import { Container } from 'inversify';
import { CoreInjectionService } from './service';
import { Fork, Plugin } from './modules/plugin';

describe('CoreInjectionService', () => {
  let container: Container;
  let service: CoreInjectionService;

  beforeEach(() => {
    container = new Container();
    service = new CoreInjectionService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setup', () => {
    let setup: ReturnType<CoreInjectionService['setup']>;

    beforeEach(() => {
      jest.spyOn(Container.prototype, 'load').mockReturnValue(undefined);
      setup = service.setup();
    });

    it('should return a setup contract', () => {
      expect(setup).toEqual({
        getContainer: expect.any(Function),
      });
    });

    it('should load the plugin module into the root container', () => {
      expect(Container.prototype.load).toHaveBeenCalledWith(pluginModuleMock);
    });

    describe('getContainer', () => {
      it('should return the plugin container for the specified identifier', () => {
        const id = Symbol.for('test');
        const plugin = {} as Container;
        const pluginFactory = jest.fn(() => plugin);
        container.bind(Plugin).toConstantValue(pluginFactory);

        expect(setup.getContainer(id, container)).toBe(plugin);
        expect(pluginFactory).toHaveBeenCalledWith(id);
      });
    });
  });

  describe('start', () => {
    let start: ReturnType<CoreInjectionService['start']>;

    beforeEach(() => {
      start = service.start();
    });

    it('should return a start contract', () => {
      expect(start).toEqual({
        fork: expect.any(Function),
        getContainer: expect.any(Function),
      });
    });

    describe('fork', () => {
      it('should return the forked container for the specified identifier', () => {
        const id = Symbol.for('test');
        const fork = {} as Container;
        const forkFactory = jest.fn(() => fork);
        container.bind(Fork).toConstantValue(forkFactory);

        expect(start.fork(id, container)).toBe(fork);
        expect(forkFactory).toHaveBeenCalledWith(id);
      });
    });
  });
});
