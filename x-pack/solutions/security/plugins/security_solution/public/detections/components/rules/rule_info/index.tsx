/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { UNKNOWN_TEXT } from './translations';
import { FormattedDate } from '../../../../common/components/formatted_date';

export * from './rule_version';
export * from './rule_revision';

interface CreatedByProps {
  createdBy?: string;
  createdAt?: string;
  ['data-test-subj']?: string;
}

/**
 * Created by and created at text that are shown on rule details and rule preview in expandable flyout
 */
export const CreatedBy: React.FC<CreatedByProps> = ({
  createdBy,
  createdAt,
  'data-test-subj': dataTestSubj,
}) => {
  return (
    <div data-test-subj={dataTestSubj}>
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.ruleCreationDescription"
        defaultMessage="Created by: {by} on {date}"
        values={{
          by: createdBy ?? UNKNOWN_TEXT,
          date: (
            <FormattedDate value={createdAt ?? new Date().toISOString()} fieldName="createdAt" />
          ),
        }}
      />
    </div>
  );
};

CreatedBy.displayName = 'CreatedBy';

interface UpdatedByProps {
  updatedBy?: string;
  updatedAt?: string;
  ['data-test-subj']?: string;
}

/**
 * Updated by and updated at text that are shown on rule details and rule preview in expandable flyout
 */
export const UpdatedBy: React.FC<UpdatedByProps> = ({
  updatedBy,
  updatedAt,
  'data-test-subj': dataTestSubj,
}) => {
  return (
    <div data-test-subj={dataTestSubj}>
      <FormattedMessage
        id="xpack.securitySolution.detectionEngine.ruleDetails.ruleUpdateDescription"
        defaultMessage="Updated by: {by} on {date}"
        values={{
          by: updatedBy ?? UNKNOWN_TEXT,
          date: (
            <FormattedDate value={updatedAt ?? new Date().toISOString()} fieldName="updatedAt" />
          ),
        }}
      />
    </div>
  );
};

UpdatedBy.displayName = 'UpdatedBy';
