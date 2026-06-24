/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiAvatar } from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { defineAttachment } from '@kbn/cases-plugin/public';
import { OSQUERY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { OsqueryAttachmentPayloadSchema } from '../../../common/cases/attachments/schema';
import { getLazyContent } from './lazy_content';
import type { ServicesWrapperProps } from '../services_wrapper';

const DISPLAY_NAME = i18n.translate('xpack.osquery.cases.osquery.displayName', {
  defaultMessage: 'Osquery results',
});

const ATTACHED_RESULTS_EVENT = i18n.translate('xpack.osquery.cases.attachments.attachedEvent', {
  defaultMessage: 'attached Osquery results',
});

export const getOsqueryCaseAttachment = (services: ServicesWrapperProps['services']) =>
  defineAttachment({
    id: OSQUERY_ATTACHMENT_TYPE,
    icon: 'logoOsquery',
    displayName: DISPLAY_NAME,
    schema: OsqueryAttachmentPayloadSchema,
    getAttachmentViewObject: () => ({
      event: ATTACHED_RESULTS_EVENT,
      timelineAvatar: <EuiAvatar name="osquery" color="subdued" iconType="logoOsquery" />,
      children: getLazyContent(services),
    }),
  });
