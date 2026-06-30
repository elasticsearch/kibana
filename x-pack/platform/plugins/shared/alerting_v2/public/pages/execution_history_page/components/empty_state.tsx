/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

export const PoliciesEmptyState = () => (
  <EuiEmptyPrompt
    data-test-subj="executionHistoryEmptyPrompt"
    iconType="clock"
    title={
      <h2>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.emptyTitle"
          defaultMessage="No policy execution activity in the last 24 hours."
        />
      </h2>
    }
    body={
      <p>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.emptyBody"
          defaultMessage="Summary events appear here after the dispatcher evaluates episodes against a policy."
        />
      </p>
    }
  />
);

export const FilteredEmptyState = () => (
  <EuiEmptyPrompt
    data-test-subj="executionHistoryFilteredEmptyPrompt"
    iconType="search"
    title={
      <h2>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.filteredEmptyTitle"
          defaultMessage="No matches for the current search and filters."
        />
      </h2>
    }
    body={
      <p>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.filteredEmptyBody"
          defaultMessage="Try a different search term or change the outcome filter."
        />
      </p>
    }
  />
);

export const RulesEmptyState = () => (
  <EuiEmptyPrompt
    data-test-subj="ruleExecutionHistoryEmptyPrompt"
    iconType="clock"
    title={
      <h2>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.rulesTab.emptyTitle"
          defaultMessage="No rule execution history."
        />
      </h2>
    }
    body={
      <p>
        <FormattedMessage
          id="xpack.alertingV2.executionHistory.rulesTab.emptyBody"
          defaultMessage="Execution history will appear here after rules run."
        />
      </p>
    }
  />
);
