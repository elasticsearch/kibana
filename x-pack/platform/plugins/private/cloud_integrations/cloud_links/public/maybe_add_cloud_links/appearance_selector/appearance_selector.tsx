/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef } from 'react';
import { EuiContextMenuItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SecurityPluginStart } from '@kbn/security-plugin/public';
import { UserProfilesKibanaProvider } from '@kbn/user-profile-components';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';

import { AppearanceModal } from './appearance_modal';
import { useAppearance } from './use_appearance_hook';

interface Props {
  security: SecurityPluginStart;
  core: CoreStart;
  closePopover: () => void;
  isServerless: boolean;
}

export const AppearanceSelector = ({ security, core, closePopover, isServerless }: Props) => {
  return (
    <UserProfilesKibanaProvider core={core} security={security} toMountPoint={toMountPoint}>
      <AppearanceSelectorUI
        core={core}
        security={security}
        closePopover={closePopover}
        isServerless={isServerless}
      />
    </UserProfilesKibanaProvider>
  );
};

function AppearanceSelectorUI({ security, core, closePopover, isServerless }: Props) {
  // Only `isVisible` is consumed here, so `defaultColorMode` has no effect; kept consistent with
  // the appearance modal default to avoid confusion.
  const { isVisible } = useAppearance({
    uiSettingsClient: core.uiSettings,
    defaultColorMode: 'system',
    defaultContrastMode: 'standard',
  });

  const modalRef = useRef<OverlayRef | null>(null);

  const closeModal = () => {
    modalRef.current?.close();
    modalRef.current = null;
  };

  const openModal = () => {
    modalRef.current = core.overlays.openModal(
      toMountPoint(
        <UserProfilesKibanaProvider core={core} security={security} toMountPoint={toMountPoint}>
          <AppearanceModal
            closeModal={closeModal}
            uiSettingsClient={core.uiSettings}
            isServerless={isServerless}
          />
        </UserProfilesKibanaProvider>,
        core
      ),
      { 'data-test-subj': 'appearanceModal', maxWidth: 600 }
    );
  };

  if (!isVisible) {
    return null;
  }

  return (
    <EuiContextMenuItem
      icon="brush"
      onClick={() => {
        openModal();
        closePopover();
      }}
      data-test-subj="appearanceSelector"
    >
      {i18n.translate('xpack.cloudLinks.userMenuLinks.appearanceLinkText', {
        defaultMessage: 'Appearance',
      })}
    </EuiContextMenuItem>
  );
}
