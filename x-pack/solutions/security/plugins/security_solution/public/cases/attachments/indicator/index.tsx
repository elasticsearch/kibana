/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CaseAttachmentsWithoutOwner } from '@kbn/cases-plugin/public';
import { defineAttachment } from '@kbn/cases-plugin/public';
import { INDICATOR_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import type { JsonValue } from '@kbn/utility-types';
import React from 'react';
import { EuiAvatar } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { IndicatorAttachmentMetadata } from '../../../../common/cases/attachments/indicator';
import { IndicatorAttachmentPayloadSchema } from '../../../../common/cases/attachments/indicator';
import { EMPTY_VALUE } from '../../../threat_intelligence/constants/common';
import type { Indicator } from '../../../../common/threat_intelligence/types/indicator';
import { RawIndicatorFieldId } from '../../../../common/threat_intelligence/types/indicator';
import { getIndicatorFieldAndValue } from '../../../threat_intelligence/modules/indicators/utils/field_value';

export type { IndicatorAttachmentMetadata };

const IndicatorAttachmentChildrenLazy = React.lazy(
  () => import('./components/attachment_children')
);

const DISPLAY_NAME = i18n.translate('xpack.securitySolution.threatIntelligence.cases.displayName', {
  defaultMessage: 'Indicators',
});

/**
 * Defines the `indicator` cases attachment registered with the cases attachment framework.
 */
export const getIndicatorAttachment = () =>
  defineAttachment({
    id: INDICATOR_ATTACHMENT_TYPE,
    icon: 'crosshair',
    displayName: DISPLAY_NAME,
    schema: IndicatorAttachmentPayloadSchema,
    getAttachmentViewObject: () => ({
      event: (
        <FormattedMessage
          id="xpack.securitySolution.threatIntelligence.cases.eventDescription"
          defaultMessage="added an indicator of compromise"
        />
      ),
      timelineAvatar: <EuiAvatar name="indicator" color="subdued" iconType="crosshair" />,
      children: IndicatorAttachmentChildrenLazy,
    }),
  });

/**
 * Builds the unified `indicator` attachment payload posted to a case.
 *
 * @param indicatorId the indicator id (stored as `attachmentId`)
 * @param attachmentMetadata indicator fields persisted alongside the attachment for display
 */
export const generateIndicatorAttachmentsWithoutOwner = (
  indicatorId: string,
  attachmentMetadata: IndicatorAttachmentMetadata
): CaseAttachmentsWithoutOwner => {
  if (!indicatorId) {
    return [];
  }

  return [
    {
      type: INDICATOR_ATTACHMENT_TYPE,
      attachmentId: indicatorId,
      metadata: attachmentMetadata as unknown as { [p: string]: JsonValue },
    },
  ];
};

/**
 * To facilitate the rendering of the lazy loaded component defined in {@link getIndicatorAttachment}, we pass
 * some of the indicator's fields to be saved in the case's attachment.
 *
 * @param indicator the indicator we're attaching to a case
 */
export const generateIndicatorAttachmentsMetadata = (
  indicator: Indicator
): IndicatorAttachmentMetadata => {
  const indicatorName: string | null = getIndicatorFieldAndValue(
    indicator,
    RawIndicatorFieldId.Name
  ).value;
  const indicatorType: string | null = getIndicatorFieldAndValue(
    indicator,
    RawIndicatorFieldId.Type
  ).value;
  const indicatorFeedName: string | null = getIndicatorFieldAndValue(
    indicator,
    RawIndicatorFieldId.Feed
  ).value;

  return {
    indicatorName: indicatorName || EMPTY_VALUE,
    indicatorType: indicatorType || EMPTY_VALUE,
    indicatorFeedName: indicatorFeedName || EMPTY_VALUE,
  };
};
