/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import type { DocLinksStart } from '@kbn/core-doc-links-browser';
import type { AnalyticsServiceStart } from '@kbn/core-analytics-browser';
import type { I18nStart } from '@kbn/core-i18n-browser';
import type { ThemeServiceStart } from '@kbn/core-theme-browser';
import type { UserProfileService } from '@kbn/core-user-profile-browser';
import type { InternalHttpStart } from '@kbn/core-http-browser-internal';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { mountReactNode } from '@kbn/core-mount-utils-browser-internal';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';

/** Only exported for tests */
export const MISSING_CONFIG_STORAGE_KEY = `core.warnings.publicBaseUrlMissingDismissed`;

interface Deps {
  docLinks: DocLinksStart;
  http: InternalHttpStart;
  notifications: NotificationsStart;
  // Exposed for easier testing
  storage?: Storage;
  location?: Location;
  // For KibanaRenderContextProvider
  analytics: AnalyticsServiceStart;
  i18n: I18nStart;
  theme: ThemeServiceStart;
  userProfile: UserProfileService;
}

export const setupPublicBaseUrlConfigWarning = ({
  docLinks,
  http,
  notifications,
  storage = window.localStorage,
  location = window.location,
  ...renderContextDeps
}: Deps) => {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return;
  }

  const missingWarningSeen = storage.getItem(MISSING_CONFIG_STORAGE_KEY) === 'true';
  if (missingWarningSeen || http.basePath.publicBaseUrl) {
    return;
  }

  const toast = notifications.toasts.addWarning({
    title: i18n.translate('core.ui.publicBaseUrlWarning.configRecommendedTitle', {
      defaultMessage: 'Configuration recommended',
    }),
    text: mountReactNode(
      <KibanaRenderContextProvider {...renderContextDeps}>
        <p>
          <FormattedMessage
            id="core.ui.publicBaseUrlWarning.configRecommendedDescription"
            defaultMessage="In a production environment, it is recommended that you configure {configKey}."
            values={{
              configKey: <code>server.publicBaseUrl</code>,
            }}
          />{' '}
          <a
            href={`${docLinks.links.server.publicBaseUrl}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FormattedMessage
              id="core.ui.publicBaseUrlWarning.learnMoreLinkLabel"
              defaultMessage="Learn more."
            />
          </a>
        </p>
      </KibanaRenderContextProvider>
    ),
    actionProps: {
      primary: {
        id: 'mute',
        onClick: () => {
          notifications.toasts.remove(toast);
          storage.setItem(MISSING_CONFIG_STORAGE_KEY, 'true');
        },
        'data-test-subj': 'mutePublicBaseUrlWarningButton',
        children: (
          <FormattedMessage
            id="core.ui.publicBaseUrlWarning.muteWarningButtonLabel"
            defaultMessage="Mute warning"
          />
        ),
      },
    },
  });
};
