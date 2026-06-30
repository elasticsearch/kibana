/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { AnalyticsServiceStart } from '@kbn/core/public';
import type { ChangeHistoryBadgeRenderFn } from '../types/change_history_badge';
import type {
  ChangeHistoryFeatures,
  ChangeHistoryPermissions,
} from '../types/change_history_features';
import type { ChangeHistoryLabels } from '../types/change_history_labels';
import type { ChangeHistoryPreviewRenderFn } from '../types/change_history_preview';
import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import { createChangeHistoryTelemetryReporter } from '../telemetry/create_change_history_telemetry_reporter';
import type { ChangeHistoryScope } from '../types/change_history_scope';
import { DEFAULT_CHANGE_HISTORY_PAGE_SIZE } from '../types/change_history_constants';
import { ChangeHistoryConfigContext } from './change_history_config_context';
import { ChangeHistoryModalContext } from './change_history_modal_context';
import { resolveChangeHistorySupports } from './resolve_change_history_supports';
import * as i18n from '../components/timeline/translations';

export interface ChangeHistoryProviderProps {
  objectId: string;
  adapter: ChangeHistoryAdapter;
  renderPreview: ChangeHistoryPreviewRenderFn;
  renderBadge?: ChangeHistoryBadgeRenderFn;
  labels: ChangeHistoryLabels;
  features?: ChangeHistoryFeatures;
  permissions?: ChangeHistoryPermissions;
  scope: ChangeHistoryScope;
  listPageSize?: number;
  analytics?: Pick<AnalyticsServiceStart, 'reportEvent'>;
  children: React.ReactNode;
}

export const ChangeHistoryProvider = ({
  objectId,
  adapter,
  renderPreview,
  renderBadge,
  labels,
  features,
  permissions,
  scope,
  listPageSize = DEFAULT_CHANGE_HISTORY_PAGE_SIZE,
  analytics,
  children,
}: ChangeHistoryProviderProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const [prevObjectId, setPrevObjectId] = useState(objectId);

  if (objectId !== prevObjectId) {
    setPrevObjectId(objectId);
    setIsOpen(false);
  }

  const supports = useMemo(
    () => resolveChangeHistorySupports(adapter, { features, permissions }),
    [adapter, features, permissions]
  );

  const telemetry = useMemo(
    () =>
      createChangeHistoryTelemetryReporter({
        analytics,
        scope,
        enabled: features?.telemetry !== false,
      }),
    [analytics, features?.telemetry, scope]
  );

  const openModal = useCallback(() => {
    setIsOpen((wasOpen) => {
      if (!wasOpen) {
        telemetry.reportOpened();
      }
      return true;
    });
  }, [telemetry]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const configValue = useMemo(
    () => ({
      objectId,
      adapter,
      renderPreview,
      renderBadge,
      labels: {
        previewBackLabel: labels.previewBackLabel ?? i18n.BACK_TO_HOST,
        previewTitle: labels.previewTitle,
      },
      supports,
      telemetry,
      scope,
      listPageSize,
    }),
    [
      adapter,
      labels.previewBackLabel,
      labels.previewTitle,
      listPageSize,
      objectId,
      renderBadge,
      renderPreview,
      scope,
      supports,
      telemetry,
    ]
  );

  const modalValue = useMemo(
    () => ({ isOpen, openModal, closeModal }),
    [isOpen, openModal, closeModal]
  );

  return (
    <ChangeHistoryConfigContext.Provider value={configValue}>
      <ChangeHistoryModalContext.Provider value={modalValue}>
        {children}
      </ChangeHistoryModalContext.Provider>
    </ChangeHistoryConfigContext.Provider>
  );
};
