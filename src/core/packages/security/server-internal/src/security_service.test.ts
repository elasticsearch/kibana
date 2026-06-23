/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  convertSecurityApiMock,
  getDefaultSecurityImplementationMock,
} from './security_service.test.mocks';

import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import { mockCoreContext } from '@kbn/core-base-server-mocks';
import type { CoreSecurityDelegateContract } from '@kbn/core-security-server';
import { SecurityService } from './security_service';
import { configServiceMock } from '@kbn/config-mocks';
import { getFips } from 'crypto';

const createStubInternalContract = (): CoreSecurityDelegateContract => {
  return Symbol('stubContract') as unknown as CoreSecurityDelegateContract;
};

describe('SecurityService', function () {
  let coreContext: ReturnType<typeof mockCoreContext.create>;
  let configService: ReturnType<typeof configServiceMock.create>;
  let service: SecurityService;

  beforeEach(() => {
    const mockConfig = {
      xpack: {
        security: {
          fipsMode: {
            enabled: !!getFips(),
          },
        },
      },
    };
    configService = configServiceMock.create({ getConfig$: mockConfig });
    coreContext = mockCoreContext.create({ configService });
    service = new SecurityService(coreContext);

    convertSecurityApiMock.mockReset();
    getDefaultSecurityImplementationMock.mockReset();
  });

  describe('#setup', () => {
    describe('#registerSecurityDelegate', () => {
      it('throws if called more than once', () => {
        const { registerSecurityDelegate } = service.setup();

        const contract = createStubInternalContract();
        registerSecurityDelegate(contract);

        expect(() => registerSecurityDelegate(contract)).toThrowErrorMatchingInlineSnapshot(
          `"security API can only be registered once"`
        );
      });
    });

    describe('#fips', () => {
      describe('#isEnabled', () => {
        it('should return boolean', () => {
          const { fips } = service.setup();
          if (getFips() === 0) {
            expect(fips.isEnabled()).toBe(false);
          } else {
            expect(fips.isEnabled()).toBe(true);
          }
        });
      });
    });

    describe('#acquireFakeRequestEnricher', () => {
      it('returns a function on the first call', () => {
        const setup = service.setup();

        const enricher = setup.acquireFakeRequestEnricher();

        expect(typeof enricher).toBe('function');
      });

      it('throws if called more than once (one-shot, reserved for Task Manager)', () => {
        const setup = service.setup();

        setup.acquireFakeRequestEnricher();

        expect(() => setup.acquireFakeRequestEnricher()).toThrow(
          /can only be called once and is reserved for Task Manager/
        );
      });

      it('throws when the returned enricher is invoked before the security delegate is registered', () => {
        const setup = service.setup();
        const enricher = setup.acquireFakeRequestEnricher();

        const request = { isFakeRequest: true } as any;
        expect(() => enricher(request, 'u_test_profile_123')).toThrow(
          /Cannot enrich a fake request before the security delegate has been registered/
        );
      });

      it('delegates to the registered security delegate when invoked', () => {
        const setup = service.setup();
        const enricher = setup.acquireFakeRequestEnricher();

        const fakeRequestEnricher = jest.fn();
        setup.registerSecurityDelegate({
          fakeRequestEnricher,
        } as unknown as CoreSecurityDelegateContract);

        const request = { isFakeRequest: true } as any;
        enricher(request, 'u_test_profile_123');

        expect(fakeRequestEnricher).toHaveBeenCalledTimes(1);
        expect(fakeRequestEnricher).toHaveBeenCalledWith(request, 'u_test_profile_123');
      });
    });

    describe('#uiam', () => {
      it('should be set to `null` if UIAM is not configured ', () => {
        expect(service.setup().uiam).toBeNull();
      });

      it('should be set to `null` if UIAM is not enabled', () => {
        service = new SecurityService(
          mockCoreContext.create({
            configService: configServiceMock.create({
              getConfig$: {
                xpack: {
                  security: {
                    fipsMode: { enabled: !!getFips() },
                    uiam: { enabled: false, sharedSecret: 'some-secret' },
                  },
                },
              },
            }),
          })
        );
        expect(service.setup().uiam).toBeNull();
      });

      it('should return shared secret if UIAM is enabled', () => {
        service = new SecurityService(
          mockCoreContext.create({
            configService: configServiceMock.create({
              getConfig$: {
                xpack: {
                  security: {
                    fipsMode: { enabled: !!getFips() },
                    uiam: { enabled: true, sharedSecret: 'some-secret' },
                  },
                },
              },
            }),
          })
        );
        expect(service.setup().uiam?.sharedSecret).toBe('some-secret');
      });
    });
  });

  describe('#start', () => {
    it('logs a warning if the security API was not registered', () => {
      service.setup();
      service.start();

      expect(loggerMock.collect(coreContext.logger as MockedLogger).warn).toMatchInlineSnapshot(`
        Array [
          Array [
            "Security API was not registered, using default implementation",
          ],
        ]
      `);
    });

    it('calls convertSecurityApi with the registered API', () => {
      const { registerSecurityDelegate } = service.setup();

      const contract = createStubInternalContract();
      registerSecurityDelegate(contract);

      service.start();

      expect(convertSecurityApiMock).toHaveBeenCalledTimes(1);
      expect(convertSecurityApiMock).toHaveBeenCalledWith(contract);
    });

    it('calls convertSecurityApi with the default implementation when no API was registered', () => {
      const contract = createStubInternalContract();
      getDefaultSecurityImplementationMock.mockReturnValue(contract);

      service.setup();
      service.start();

      expect(convertSecurityApiMock).toHaveBeenCalledTimes(1);
      expect(convertSecurityApiMock).toHaveBeenCalledWith(contract);
    });

    it('returns the result of convertSecurityApi as contract', () => {
      const convertedContract = { stub: true };
      convertSecurityApiMock.mockReturnValue(convertedContract);

      service.setup();
      const startContract = service.start();

      expect(startContract).toEqual(convertedContract);
    });
  });
});
