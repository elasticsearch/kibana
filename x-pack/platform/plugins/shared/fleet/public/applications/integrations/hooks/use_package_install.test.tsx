/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';

import { createIntegrationsTestRendererMock } from '../../../mock';

import {
  useInstallPackage,
  useUninstallPackage,
  PackageInstallProvider,
} from './use_package_install';

const mockInvalidateQueries = jest.fn();
jest.mock('@kbn/react-query', () => ({
  ...jest.requireActual('@kbn/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

describe('usePackageInstall', () => {
  const coreStart = coreMock.createStart();

  const addErrorSpy = jest.spyOn(coreStart.notifications.toasts, 'addError');
  const addSuccessSpy = jest.spyOn(coreStart.notifications.toasts, 'addSuccess');
  const addWarningSpy = jest.spyOn(coreStart.notifications.toasts, 'addWarning');

  beforeEach(() => {
    createIntegrationsTestRendererMock();
    addErrorSpy.mockReset();
    addSuccessSpy.mockReset();
    addWarningSpy.mockReset();
    mockInvalidateQueries.mockReset();
  });

  describe('useInstallPackage', () => {
    function createRenderer() {
      const renderer = createIntegrationsTestRendererMock();
      renderer.startServices.http.post.mockImplementation((async (path: string) => {
        if (path === '/api/fleet/epm/packages/test/1.0.0') {
          return { data: {} };
        }
        if (path === '/api/fleet/epm/packages/test-install-error/1.0.0') {
          const error = {
            body: {
              message: 'install error not implemented',
            },
          };
          throw error;
        }
        const error = {
          body: {
            message: 'not implemented',
          },
        };
        throw error;
      }) as any);

      const wrapper = ({ children }: React.PropsWithChildren<unknown>) => (
        <PackageInstallProvider startServices={coreStart}>{children}</PackageInstallProvider>
      );

      const { result } = renderer.renderHook(() => useInstallPackage(), wrapper);

      const installPackage = result.current;

      return {
        installPackage,
      };
    }

    it('should work for install', async () => {
      const { installPackage } = createRenderer();
      let res: boolean | undefined;
      await act(async () => {
        res = await installPackage({
          name: 'test',
          title: 'TestTitle',
          version: '1.0.0',
        });
      });

      expect(addErrorSpy).not.toBeCalled();
      expect(addSuccessSpy).toBeCalled();

      expect(res).toBeTruthy();
    });

    it('should work for upgrade', async () => {
      const { installPackage } = createRenderer();
      let res: boolean | undefined;
      await act(async () => {
        res = await installPackage({
          name: 'test',
          title: 'TestTitle',
          version: '1.0.0',
          isUpgrade: true,
        });
      });

      expect(addErrorSpy).not.toBeCalled();
      expect(addSuccessSpy).toBeCalled();

      expect(res).toBeTruthy();
    });

    it('should handle install error', async () => {
      const { installPackage } = createRenderer();

      let res: boolean | undefined;
      await act(async () => {
        res = await installPackage({
          name: 'test-install-error',
          title: 'TestTitle',
          version: '1.0.0',
        });
      });

      expect(addSuccessSpy).not.toBeCalled();
      expect(addErrorSpy).toBeCalled();

      expect(res).toBeFalsy();
    });
  });

  describe('useUninstallPackage', () => {
    function createRenderer() {
      const renderer = createIntegrationsTestRendererMock();
      renderer.startServices.http.delete.mockImplementation((async (path: string) => {
        if (path === '/api/fleet/epm/packages/test/1.0.0') {
          return { data: {} };
        }
        if (path === '/api/fleet/epm/packages/test-uninstall-error/1.0.0') {
          const error = { body: { message: 'uninstall failed' } };
          throw error;
        }
        const error = { body: { message: 'not implemented' } };
        throw error;
      }) as any);

      const wrapper = ({ children }: React.PropsWithChildren<unknown>) => (
        <PackageInstallProvider startServices={coreStart}>{children}</PackageInstallProvider>
      );

      const { result } = renderer.renderHook(() => useUninstallPackage(), wrapper);

      return { uninstallPackage: result.current };
    }

    it('should invalidate package and get-packages queries on successful uninstall', async () => {
      const { uninstallPackage } = createRenderer();

      await act(async () => {
        await uninstallPackage({
          name: 'test',
          title: 'TestTitle',
          version: '1.0.0',
          redirectToVersion: '1.0.0',
        });
      });

      expect(addSuccessSpy).toBeCalled();
      expect(addWarningSpy).not.toBeCalled();

      expect(mockInvalidateQueries).toHaveBeenCalledWith(['test']);
      expect(mockInvalidateQueries).toHaveBeenCalledWith(['get-packages']);
    });

    it('should not invalidate queries when uninstall fails', async () => {
      const { uninstallPackage } = createRenderer();

      await act(async () => {
        await uninstallPackage({
          name: 'test-uninstall-error',
          title: 'TestTitle',
          version: '1.0.0',
          redirectToVersion: '1.0.0',
        });
      });

      expect(addWarningSpy).toBeCalled();
      expect(addSuccessSpy).not.toBeCalled();
      expect(mockInvalidateQueries).not.toBeCalled();
    });
  });
});
