/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { getFieldValue } from '@kbn/discover-utils';
import type { DocumentProfileProvider } from '../../../profiles';
import { DataSourceCategory, DocumentType } from '../../../profiles';
import type { ProfileProviderServices } from '../../profile_provider_services';
import { SECURITY_PROFILE_ID, SIGNAL_RULE_NAME_FIELD_NAME } from '../constants';
import * as i18n from '../translations';
import type { SecurityProfileProviderFactory } from '../types';
import { AlertEventOverviewLazy } from '../components';
import { isAlertDocument, isEventDocument } from '../utils/is_alert_document';

export const createSecurityDocumentProfileProvider: SecurityProfileProviderFactory<
  DocumentProfileProvider
> = (_services: ProfileProviderServices) => {
  return {
    profileId: SECURITY_PROFILE_ID.document,
    profile: {
      getDocViewer: (prev) => (params) => {
        const prevDocViewer = prev(params);
        const isAlert = isAlertDocument(params.record);
        const isEvent = isEventDocument(params.record);

        const ruleName = isAlert
          ? (getFieldValue(params.record, SIGNAL_RULE_NAME_FIELD_NAME) as string | undefined)
          : undefined;
        const title = ruleName ? i18n.alertFlyoutTitle(ruleName) : prevDocViewer.title;

        return {
          ...prevDocViewer,
          title,
          docViewsRegistry: (registry) => {
            if (isAlert || isEvent) {
              registry.add({
                id: 'doc_view_alerts_overview',
                title: i18n.overviewTabTitle(isAlert),
                order: 0,
                render: (props) => <AlertEventOverviewLazy {...props} />,
              });
            }

            return prevDocViewer.docViewsRegistry(registry);
          },
        };
      },
    },
    resolve: ({ dataSourceContext }) => {
      if (dataSourceContext.category !== DataSourceCategory.Security) {
        return { isMatch: false };
      }

      return {
        isMatch: true,
        context: {
          type: DocumentType.Default,
        },
      };
    },
  };
};
