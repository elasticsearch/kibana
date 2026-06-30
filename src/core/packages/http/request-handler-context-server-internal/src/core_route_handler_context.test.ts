/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { CoreRouteHandlerContext } from './core_route_handler_context';
import { httpServerMock } from '@kbn/core-http-server-mocks';
import { createCoreRouteHandlerContextParamsMock } from './test_helpers';

describe('#elasticsearch', () => {
  describe('#client', () => {
    test('returns the results of coreStart.elasticsearch.client.asScoped', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client = context.elasticsearch.client;
      expect(client).toBe(coreStart.elasticsearch.client.asScoped.mock.results[0].value);
    });

    test('lazily created', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      expect(coreStart.elasticsearch.client.asScoped).not.toHaveBeenCalled();
      const client = context.elasticsearch.client;
      expect(coreStart.elasticsearch.client.asScoped).toHaveBeenCalled();
      expect(client).toBeDefined();
    });

    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client1 = context.elasticsearch.client;
      const client2 = context.elasticsearch.client;
      expect(coreStart.elasticsearch.client.asScoped.mock.calls.length).toBe(1);
      const mockResult = coreStart.elasticsearch.client.asScoped.mock.results[0].value;
      expect(client1).toBe(mockResult);
      expect(client2).toBe(mockResult);
    });
  });
});

describe('#savedObjects', () => {
  describe('#client', () => {
    test('returns the results of coreStart.savedObjects.getScopedClient', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client = context.savedObjects.client;
      expect(client).toBe(coreStart.savedObjects.getScopedClient.mock.results[0].value);
    });

    test('lazily created', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const savedObjects = context.savedObjects;
      expect(coreStart.savedObjects.getScopedClient).not.toHaveBeenCalled();
      const client = savedObjects.client;
      expect(coreStart.savedObjects.getScopedClient).toHaveBeenCalled();
      expect(client).toBeDefined();
    });

    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client1 = context.savedObjects.client;
      const client2 = context.savedObjects.client;
      expect(coreStart.savedObjects.getScopedClient.mock.calls.length).toBe(1);
      const mockResult = coreStart.savedObjects.getScopedClient.mock.results[0].value;
      expect(client1).toBe(mockResult);
      expect(client2).toBe(mockResult);
    });
  });

  describe('#typeRegistry', () => {
    test('returns the results of coreStart.savedObjects.getTypeRegistry', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const typeRegistry = context.savedObjects.typeRegistry;
      expect(typeRegistry).toBe(coreStart.savedObjects.getTypeRegistry.mock.results[0].value);
    });

    test('lazily created', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      expect(coreStart.savedObjects.getTypeRegistry).not.toHaveBeenCalled();
      const typeRegistry = context.savedObjects.typeRegistry;
      expect(coreStart.savedObjects.getTypeRegistry).toHaveBeenCalled();
      expect(typeRegistry).toBeDefined();
    });

    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const typeRegistry1 = context.savedObjects.typeRegistry;
      const typeRegistry2 = context.savedObjects.typeRegistry;
      expect(coreStart.savedObjects.getTypeRegistry.mock.calls.length).toBe(1);
      const mockResult = coreStart.savedObjects.getTypeRegistry.mock.results[0].value;
      expect(typeRegistry1).toBe(mockResult);
      expect(typeRegistry2).toBe(mockResult);
    });
  });
});

describe('#uiSettings', () => {
  describe('#client', () => {
    test('returns the results of coreStart.uiSettings.asScopedToClient', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client = context.uiSettings.client;
      expect(client).toBe(coreStart.uiSettings.asScopedToClient.mock.results[0].value);
    });

    test('lazily created', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      expect(coreStart.uiSettings.asScopedToClient).not.toHaveBeenCalled();
      const client = context.uiSettings.client;
      expect(coreStart.uiSettings.asScopedToClient).toHaveBeenCalled();
      expect(client).toBeDefined();
    });

    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client1 = context.uiSettings.client;
      const client2 = context.uiSettings.client;
      expect(coreStart.uiSettings.asScopedToClient.mock.calls.length).toBe(1);
      const mockResult = coreStart.uiSettings.asScopedToClient.mock.results[0].value;
      expect(client1).toBe(mockResult);
      expect(client2).toBe(mockResult);
    });
  });
});

describe('#deprecations', () => {
  describe('#client', () => {
    test('returns the results of coreStart.deprecations.asScopedToClient', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client = context.deprecations.client;
      expect(client).toBe(coreStart.deprecations.asScopedToClient.mock.results[0].value);
    });

    test('lazily created', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      expect(coreStart.deprecations.asScopedToClient).not.toHaveBeenCalled();
      const client = context.deprecations.client;
      expect(coreStart.deprecations.asScopedToClient).toHaveBeenCalled();
      expect(client).toBeDefined();
    });

    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const client1 = context.deprecations.client;
      const client2 = context.deprecations.client;
      expect(coreStart.deprecations.asScopedToClient.mock.calls.length).toBe(1);
      const mockResult = coreStart.deprecations.asScopedToClient.mock.results[0].value;
      expect(client1).toBe(mockResult);
      expect(client2).toBe(mockResult);
    });
  });
});

describe('#security', () => {
  describe('#authc', () => {
    test('only creates one instance', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const authc1 = context.security.authc;
      const authc2 = context.security.authc;

      expect(authc1).toBe(authc2);
    });

    describe('getCurrentUser', () => {
      test('calls coreStart.security.authc.getCurrentUser with the correct parameters', () => {
        const request = httpServerMock.createKibanaRequest();
        const coreStart = createCoreRouteHandlerContextParamsMock();
        const context = new CoreRouteHandlerContext(coreStart, request);

        context.security.authc.getCurrentUser();
        expect(coreStart.security.authc.getCurrentUser).toHaveBeenCalledTimes(1);
        expect(coreStart.security.authc.getCurrentUser).toHaveBeenCalledWith(request);
      });

      test('returns the result of coreStart.security.authc.getCurrentUser', () => {
        const request = httpServerMock.createKibanaRequest();
        const coreStart = createCoreRouteHandlerContextParamsMock();
        const context = new CoreRouteHandlerContext(coreStart, request);

        const stubUser: any = Symbol.for('stubUser');
        coreStart.security.authc.getCurrentUser.mockReturnValue(stubUser);

        const user = context.security.authc.getCurrentUser();
        expect(user).toBe(stubUser);
      });
    });
  });
});

describe('#i18n', () => {
  test('delegates to the client returned by coreStart.i18n.asScopedToRequest', async () => {
    const request = httpServerMock.createKibanaRequest();
    const coreStart = createCoreRouteHandlerContextParamsMock();
    const context = new CoreRouteHandlerContext(coreStart, request);

    await context.i18n.getLocale();
    const client = coreStart.i18n.asScopedToRequest.mock.results[0].value;

    expect(coreStart.i18n.asScopedToRequest).toHaveBeenCalledWith(request);
    expect(client.getLocale).toHaveBeenCalledTimes(1);
  });

  test('lazily created', () => {
    const request = httpServerMock.createKibanaRequest();
    const coreStart = createCoreRouteHandlerContextParamsMock();
    const context = new CoreRouteHandlerContext(coreStart, request);

    expect(coreStart.i18n.asScopedToRequest).not.toHaveBeenCalled();
    const i18n = context.i18n;
    expect(i18n).toBeDefined();
    // The scoped client is only built when a method is first invoked.
    expect(coreStart.i18n.asScopedToRequest).not.toHaveBeenCalled();
    context.i18n.getLocale();
    expect(coreStart.i18n.asScopedToRequest).toHaveBeenCalledTimes(1);
  });

  test('only creates one scoped client across calls', async () => {
    const request = httpServerMock.createKibanaRequest();
    const coreStart = createCoreRouteHandlerContextParamsMock();
    const context = new CoreRouteHandlerContext(coreStart, request);

    await context.i18n.getLocale();
    await context.i18n.translate('id', { defaultMessage: 'Hello' });
    await context.i18n.formatList('conjunction', ['a', 'b']);

    expect(coreStart.i18n.asScopedToRequest).toHaveBeenCalledTimes(1);
  });
});

describe('#userProfile', () => {
  describe('getCurrent', () => {
    test('calls coreStart.userProfile.getCurrent with the correct parameters', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      context.userProfile?.getCurrent({ dataPath: '/data-path' });
      expect(coreStart.userProfile.getCurrent).toHaveBeenCalledTimes(1);
      expect(coreStart.userProfile.getCurrent).toHaveBeenCalledWith({
        request,
        dataPath: '/data-path',
      });
    });

    test('returns the result of coreStart.userProfile.getCurrent', () => {
      const request = httpServerMock.createKibanaRequest();
      const coreStart = createCoreRouteHandlerContextParamsMock();
      const context = new CoreRouteHandlerContext(coreStart, request);

      const stubProfile: any = Symbol.for('stubProfile');
      coreStart.userProfile.getCurrent.mockReturnValue(stubProfile);

      const profile = context.userProfile?.getCurrent();
      expect(profile).toBe(stubProfile);
    });
  });
});
