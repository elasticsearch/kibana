/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { StoryFn, Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';

import { Subscription } from 'rxjs';
import {
  getGlobalSettingsMock,
  getSettingsMock,
} from '@kbn/management-settings-utilities/mocks/settings.mock';
import type { UiSettingsScope } from '@kbn/core-ui-settings-common';
import { getSettingsCapabilitiesMock } from '@kbn/management-settings-utilities/mocks/capabilities.mock';
import { SettingsApplication as Component } from '../application';
import { SettingsApplicationProvider } from '../services';

export default {
  title: 'Settings/Settings Application',
  description: '',
  parameters: {
    backgrounds: {
      default: 'ghost',
    },
  },
} as Meta<typeof Component>;

/**
 * Props for a {@link SettinggApplication} Storybook story.
 */
export interface StoryProps {
  hasGlobalSettings: boolean;
}

const getSettingsApplicationStory = ({ hasGlobalSettings }: StoryProps) => (
  <SettingsApplicationProvider
    showDanger={action('showDanger')}
    links={{ deprecationKey: 'link/to/deprecation/docs' }}
    getAllowlistedSettings={(scope: UiSettingsScope) =>
      Promise.resolve(
        scope === 'namespace' ? getSettingsMock() : hasGlobalSettings ? getGlobalSettingsMock() : {}
      )
    }
    getSections={() => []}
    // @ts-ignore
    getToastsService={() => null}
    getCapabilities={getSettingsCapabilitiesMock}
    setBadge={() => {}}
    isCustomSetting={() => false}
    isOverriddenSetting={() => false}
    saveChanges={action('saveChanges')}
    showError={action('showError')}
    showReloadPagePrompt={action('showReloadPagePrompt')}
    subscribeToUpdates={() => new Subscription()}
    addUrlToHistory={action('addUrlToHistory')}
    validateChange={async (key, value) => {
      action(`validateChange`)({
        key,
        value,
      });
      return { successfulValidation: true, valid: true };
    }}
    subscribeToActiveSpace={() => new Subscription()}
  >
    <Component />
  </SettingsApplicationProvider>
);

export const SettingsApplicationWithGlobalSettings: StoryFn = () =>
  getSettingsApplicationStory({
    hasGlobalSettings: true,
  });

export const SettingsApplicationWithoutGlobal: StoryFn = () =>
  getSettingsApplicationStory({
    hasGlobalSettings: false,
  });
