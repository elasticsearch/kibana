/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { loggerMock } from '@kbn/logging-mocks';
import {
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
} from '@kbn/management-settings-ids';
import { ResourceTypes } from '@kbn/product-doc-common';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type { ProductDocBasePluginStart } from '@kbn/product-doc-base-plugin/public';
import {
  ensureSecurityLabsInstalled,
  useEnsureSecurityLabs,
  _resetInstallAttemptedForTesting,
} from './use_ensure_security_labs';

describe('ensureSecurityLabsInstalled', () => {
  const inferenceId = defaultInferenceEndpoints.ELSER;
  let productDocBase: ProductDocBasePluginStart;
  let uiSettings: { get: jest.Mock };
  let logger: ReturnType<typeof loggerMock.create>;

  beforeEach(() => {
    productDocBase = {
      installation: {
        getDefaultInferenceId: jest.fn().mockResolvedValue(inferenceId),
        getStatus: jest.fn().mockResolvedValue({
          inferenceId,
          resourceType: ResourceTypes.securityLabs,
          status: 'uninstalled',
        }),
        install: jest.fn().mockResolvedValue({ installed: true }),
        uninstall: jest.fn(),
      },
    };
    uiSettings = {
      get: jest.fn((key: string) => {
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR) return 'some-connector';
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY) return false;
        return undefined;
      }),
    };
    logger = loggerMock.create();
  });

  it('installs Security Labs when uninstalled', async () => {
    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: true,
    });

    expect(productDocBase.installation.getDefaultInferenceId).toHaveBeenCalledWith({
      resourceType: ResourceTypes.securityLabs,
    });
    expect(productDocBase.installation.getStatus).toHaveBeenCalledWith({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
    });
    expect(productDocBase.installation.install).toHaveBeenCalledWith({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
    });
  });

  it('reinstalls when status is error', async () => {
    (productDocBase.installation.getStatus as jest.Mock).mockResolvedValue({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
      status: 'error',
    });

    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: true,
    });

    expect(productDocBase.installation.install).toHaveBeenCalledWith({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
    });
  });

  it('skips install when already installed', async () => {
    (productDocBase.installation.getStatus as jest.Mock).mockResolvedValue({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
      status: 'installed',
    });

    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: true,
    });

    expect(productDocBase.installation.install).not.toHaveBeenCalled();
  });

  it('installs Security Labs when in error state', async () => {
    (productDocBase.installation.getStatus as jest.Mock).mockResolvedValue({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
      status: 'error',
    });

    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: true,
    });

    expect(productDocBase.installation.install).toHaveBeenCalledWith({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
    });
  });

  it('skips install when installation is in progress', async () => {
    (productDocBase.installation.getStatus as jest.Mock).mockResolvedValue({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
      status: 'installing',
    });

    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: true,
    });

    expect(productDocBase.installation.install).not.toHaveBeenCalled();
  });

  it('skips install when user lacks manage privilege', async () => {
    await ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings: uiSettings as unknown as Parameters<
        typeof ensureSecurityLabsInstalled
      >[0]['uiSettings'],
      logger,
      hasManagePrivilege: false,
    });

    expect(productDocBase.installation.getDefaultInferenceId).not.toHaveBeenCalled();
    expect(productDocBase.installation.getStatus).not.toHaveBeenCalled();
    expect(productDocBase.installation.install).not.toHaveBeenCalled();
  });

  it.each(['NO_DEFAULT_MODEL', 'NO_DEFAULT_CONNECTOR'])(
    'skips install when AI features are disabled (%s)',
    async (disabledSentinel) => {
      uiSettings.get.mockImplementation((key: string) => {
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR) return disabledSentinel;
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY) return true;
        return undefined;
      });

      await ensureSecurityLabsInstalled({
        productDocBase,
        uiSettings: uiSettings as unknown as Parameters<
          typeof ensureSecurityLabsInstalled
        >[0]['uiSettings'],
        logger,
        hasManagePrivilege: true,
      });

      expect(productDocBase.installation.getStatus).not.toHaveBeenCalled();
      expect(productDocBase.installation.install).not.toHaveBeenCalled();
    }
  );
});

describe('useEnsureSecurityLabs', () => {
  afterEach(() => {
    _resetInstallAttemptedForTesting();
  });

  const createServices = () => {
    const productDocBase = {
      installation: {
        getDefaultInferenceId: jest.fn().mockResolvedValue(defaultInferenceEndpoints.ELSER),
        getStatus: jest.fn().mockResolvedValue({
          inferenceId: defaultInferenceEndpoints.ELSER,
          resourceType: ResourceTypes.securityLabs,
          status: 'uninstalled',
        }),
        install: jest.fn().mockResolvedValue({ installed: true }),
        uninstall: jest.fn(),
      },
    } as unknown as ProductDocBasePluginStart;
    const uiSettings = {
      get: jest.fn((key: string) => {
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR) return 'some-connector';
        if (key === GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY) return false;
        return undefined;
      }),
    };
    const logger = loggerMock.create();
    return { productDocBase, uiSettings, logger };
  };

  it('triggers ensureSecurityLabsInstalled on mount when privileged', async () => {
    const { productDocBase, uiSettings, logger } = createServices();

    renderHook(() =>
      useEnsureSecurityLabs({
        productDocBase,
        uiSettings: uiSettings as unknown as Parameters<
          typeof useEnsureSecurityLabs
        >[0]['uiSettings'],
        logger,
        hasManagePrivilege: true,
      })
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(productDocBase.installation.install).toHaveBeenCalledWith({
      inferenceId: defaultInferenceEndpoints.ELSER,
      resourceType: ResourceTypes.securityLabs,
    });
  });

  it('does not call product-doc APIs when user lacks manage privilege', async () => {
    const { productDocBase, uiSettings, logger } = createServices();

    renderHook(() =>
      useEnsureSecurityLabs({
        productDocBase,
        uiSettings: uiSettings as unknown as Parameters<
          typeof useEnsureSecurityLabs
        >[0]['uiSettings'],
        logger,
        hasManagePrivilege: false,
      })
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(productDocBase.installation.getDefaultInferenceId).not.toHaveBeenCalled();
    expect(productDocBase.installation.install).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs 403 failures at warn instead of error', async () => {
    const { productDocBase, uiSettings, logger } = createServices();
    (productDocBase.installation.getDefaultInferenceId as jest.Mock).mockRejectedValue({
      response: { status: 403 },
      body: { statusCode: 403 },
    });

    renderHook(() =>
      useEnsureSecurityLabs({
        productDocBase,
        uiSettings: uiSettings as unknown as Parameters<
          typeof useEnsureSecurityLabs
        >[0]['uiSettings'],
        logger,
        hasManagePrivilege: true,
      })
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not re-fire install on re-mount after a successful attempt', async () => {
    const { productDocBase, uiSettings, logger } = createServices();
    const uiSettingsCast = uiSettings as unknown as Parameters<
      typeof useEnsureSecurityLabs
    >[0]['uiSettings'];

    const { unmount } = renderHook(() =>
      useEnsureSecurityLabs({
        productDocBase,
        uiSettings: uiSettingsCast,
        logger,
        hasManagePrivilege: true,
      })
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(productDocBase.installation.install).toHaveBeenCalledTimes(1);

    // Simulate SPA navigation: unmount then remount
    unmount();
    renderHook(() =>
      useEnsureSecurityLabs({
        productDocBase,
        uiSettings: uiSettingsCast,
        logger,
        hasManagePrivilege: true,
      })
    );
    await new Promise((resolve) => setImmediate(resolve));

    // install should still have been called exactly once across both mounts
    expect(productDocBase.installation.install).toHaveBeenCalledTimes(1);
  });

  it('retries after privilege is lost and regained (space switch)', async () => {
    const { productDocBase, uiSettings, logger } = createServices();
    const uiSettingsCast = uiSettings as unknown as Parameters<
      typeof useEnsureSecurityLabs
    >[0]['uiSettings'];

    // First mount with privilege
    const { rerender, unmount } = renderHook(
      ({ hasManagePrivilege }: { hasManagePrivilege: boolean }) =>
        useEnsureSecurityLabs({
          productDocBase,
          uiSettings: uiSettingsCast,
          logger,
          hasManagePrivilege,
        }),
      { initialProps: { hasManagePrivilege: true } }
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(productDocBase.installation.install).toHaveBeenCalledTimes(1);

    // Space switch removes privilege → resets the flag
    rerender({ hasManagePrivilege: false });
    await new Promise((resolve) => setImmediate(resolve));

    // Space switch grants privilege again → should retry
    rerender({ hasManagePrivilege: true });
    await new Promise((resolve) => setImmediate(resolve));

    expect(productDocBase.installation.install).toHaveBeenCalledTimes(2);

    unmount();
  });
});
