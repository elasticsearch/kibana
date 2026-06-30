/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useRef } from 'react';
import { EuiContextMenuItem } from '@elastic/eui';
import { i18n, getAvailableLocales } from '@kbn/i18n';
import type { SecurityPluginStart } from '@kbn/security-plugin/public';
import { UserProfilesKibanaProvider } from '@kbn/user-profile-components';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';

import { LanguageModal } from './language_modal';
import { useLanguage } from './use_language_hook';

interface Props {
  security: SecurityPluginStart;
  core: CoreStart;
  closePopover: () => void;
}

export const LanguageSelector = ({ security, core, closePopover }: Props) => {
  return (
    <UserProfilesKibanaProvider core={core} security={security} toMountPoint={toMountPoint}>
      <LanguageSelectorUI core={core} security={security} closePopover={closePopover} />
    </UserProfilesKibanaProvider>
  );
};

function LanguageSelectorUI({ security, core, closePopover }: Props) {
  const { isVisible } = useLanguage();
  const hasConfiguredLocales = getAvailableLocales().length > 0;

  const modalRef = useRef<OverlayRef | null>(null);

  const closeModal = () => {
    modalRef.current?.close();
    modalRef.current = null;
  };

  const openModal = () => {
    modalRef.current = core.overlays.openModal(
      toMountPoint(
        <UserProfilesKibanaProvider core={core} security={security} toMountPoint={toMountPoint}>
          <LanguageModal closeModal={closeModal} analytics={core.analytics} />
        </UserProfilesKibanaProvider>,
        core
      ),
      { 'data-test-subj': 'languageModal', maxWidth: 500 }
    );
  };

  if (!isVisible || !hasConfiguredLocales) {
    return null;
  }

  return (
    <EuiContextMenuItem
      icon="globe"
      onClick={() => {
        openModal();
        closePopover();
      }}
      data-test-subj="languageSelector"
    >
      {i18n.translate('xpack.cloudLinks.userMenuLinks.languageLinkText', {
        defaultMessage: 'Language',
      })}
    </EuiContextMenuItem>
  );
}
