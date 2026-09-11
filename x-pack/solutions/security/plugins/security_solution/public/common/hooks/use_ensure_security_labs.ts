/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import type { Logger } from '@kbn/logging';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { ProductDocBasePluginStart } from '@kbn/product-doc-base-plugin/public';
import {
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
} from '@kbn/management-settings-ids';
import { ResourceTypes } from '@kbn/product-doc-common';

// Sentinels that mean no default AI connector/model is configured. Either can
// appear depending on which settings UI last wrote genAiSettings:defaultAIConnector
// (gen_ai_settings vs search_inference_endpoints "Use AI features" toggle).
const AI_DISABLED_SENTINELS = new Set(['NO_DEFAULT_MODEL', 'NO_DEFAULT_CONNECTOR']);

// Module-level guard: the server's runStartupTasks already handles installation on
// startup. This hook is a client-side fallback (e.g. AI enabled mid-session). Using
// a module-level flag means re-mounts from SPA navigation don't redundantly re-check.
// Reset when privilege is lost so a later space-switch that grants privilege retries.
let installAttempted = false;

/** Reset module-level state. Call in beforeEach during tests. */
export const _resetInstallAttemptedForTesting = () => {
  installAttempted = false;
};

export interface EnsureSecurityLabsServices {
  productDocBase: ProductDocBasePluginStart;
  uiSettings: IUiSettingsClient;
  logger: Logger;
  /** True when the user can manage product docs (Agent Builder manageAgents / llm_product_doc). */
  hasManagePrivilege: boolean;
}

const isAiFeaturesDisabled = (uiSettings: IUiSettingsClient): boolean => {
  const defaultAIConnector = uiSettings.get<string>(GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR);
  const defaultAIConnectorOnly = uiSettings.get<boolean>(
    GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY
  );
  return AI_DISABLED_SENTINELS.has(defaultAIConnector) && defaultAIConnectorOnly === true;
};

const isForbiddenError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const err = error as {
    response?: { status?: number };
    body?: { statusCode?: number; status_code?: number };
  };
  return (
    err.response?.status === 403 || err.body?.statusCode === 403 || err.body?.status_code === 403
  );
};

/**
 * Ensures Security Labs content is installed for the default inference ID.
 * No-op when the user lacks manage privilege, AI features are disabled,
 * already installed, or in progress. Retries when in error state.
 */
export const ensureSecurityLabsInstalled = async ({
  productDocBase,
  uiSettings,
  logger,
  hasManagePrivilege,
}: EnsureSecurityLabsServices): Promise<void> => {
  if (!hasManagePrivilege) {
    logger.debug(
      'Skipping Security Labs auto-install: user lacks product documentation manage privilege'
    );
    return;
  }

  if (isAiFeaturesDisabled(uiSettings)) {
    logger.debug('Skipping Security Labs auto-install: Use AI features is disabled');
    return;
  }

  const inferenceId = await productDocBase.installation.getDefaultInferenceId({
    resourceType: ResourceTypes.securityLabs,
  });
  const statusResponse = await productDocBase.installation.getStatus({
    inferenceId,
    resourceType: ResourceTypes.securityLabs,
  });

  const status = 'status' in statusResponse ? statusResponse.status : undefined;
  if (status === 'uninstalled' || status === 'error') {
    logger.debug(
      `Auto-installing Security Labs content for inference ID [${inferenceId}] (status: ${status})`
    );
    await productDocBase.installation.install({
      inferenceId,
      resourceType: ResourceTypes.securityLabs,
    });
    return;
  }

  logger.debug(
    `Skipping Security Labs auto-install for inference ID [${inferenceId}] (status: ${status})`
  );
};

/**
 * Auto-installs Security Labs when Security Solution mounts (e.g. navigating to a
 * space with the security solution view). Safe to call repeatedly; skips when the
 * user lacks manage privilege, already installed, in progress, or AI features are disabled.
 */
export const useEnsureSecurityLabs = (services: EnsureSecurityLabsServices): void => {
  const { productDocBase, uiSettings, logger, hasManagePrivilege } = services;

  useEffect(() => {
    if (!hasManagePrivilege) {
      // Reset so we retry when privilege is gained (e.g. space switch).
      installAttempted = false;
      return;
    }
    if (installAttempted) return;
    installAttempted = true;

    ensureSecurityLabsInstalled({
      productDocBase,
      uiSettings,
      logger,
      hasManagePrivilege,
    }).catch((error) => {
      if (isForbiddenError(error)) {
        logger.warn(
          'Security Labs auto-install returned 403 — privilege check may be stale or incorrect'
        );
        logger.warn(error);
        return;
      }
      // Reset on unexpected errors so the next mount retries.
      installAttempted = false;
      logger.error('Failed to auto-install Security Labs content');
      logger.error(error);
    });
  }, [productDocBase, uiSettings, logger, hasManagePrivilege]);
};
