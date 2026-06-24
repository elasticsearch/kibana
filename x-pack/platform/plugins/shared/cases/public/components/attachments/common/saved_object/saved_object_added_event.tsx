/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useSavedObjectInAppUrl } from './use_saved_object_in_app_url';
import { UNTITLED } from './translations';

export interface SavedObjectAddedEventProps {
  soType: string;
  /** Foreign SO id (matches the `attachmentId` field on the SO attachment payload). */
  attachmentId: string;
  /** Cached title from the attachment payload; falls back to "Untitled" when absent. */
  title?: string;
  /** Localized prefix shown before the link, e.g. `"added dashboard"`. */
  label: string;
  'data-test-subj'?: string;
}

/**
 * Timeline event used by all SO-typed attachments.
 */
const SavedObjectAddedEventComponent: React.FC<SavedObjectAddedEventProps> = ({
  soType,
  attachmentId,
  title,
  label,
  'data-test-subj': dataTestSubj,
}) => {
  const href = useSavedObjectInAppUrl(soType, attachmentId);
  const display = title && title.length > 0 ? title : UNTITLED;
  const link = href ? (
    <EuiLink href={href} data-test-subj={dataTestSubj} target="_blank">
      {display}
    </EuiLink>
  ) : (
    display
  );

  return (
    <FormattedMessage
      id="xpack.cases.savedObjectAttachments.addedEvent"
      defaultMessage="{label} {link}"
      values={{ label, link }}
    />
  );
};

SavedObjectAddedEventComponent.displayName = 'SavedObjectAddedEvent';

export const SavedObjectAddedEvent = React.memo(SavedObjectAddedEventComponent);
