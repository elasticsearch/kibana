/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { CompactionStep as CompactionStepData } from '@kbn/agent-builder-common';
import { StepLayout } from '../step_layout';

interface CompactionStepProps {
  step: CompactionStepData;
}

export const CompactionStep: React.FC<CompactionStepProps> = ({ step }) => {
  const isInProgress = step.token_count_after === 0;

  return (
    <StepLayout
      label={
        <EuiText size="s" color="inherit">
          <p role="status" aria-live="polite">
            {isInProgress ? (
              <FormattedMessage
                id="xpack.agentBuilder.roundEvents.steps.compaction.inProgress"
                defaultMessage="Compacting context"
              />
            ) : (
              <FormattedMessage
                id="xpack.agentBuilder.roundEvents.steps.compaction.complete"
                defaultMessage="Context condensed: {before} → {after} tokens, {count, plural, one {# round} other {# rounds}}"
                values={{
                  before: step.token_count_before.toLocaleString(),
                  after: step.token_count_after.toLocaleString(),
                  count: step.summarized_round_count,
                }}
              />
            )}
          </p>
        </EuiText>
      }
    />
  );
};
