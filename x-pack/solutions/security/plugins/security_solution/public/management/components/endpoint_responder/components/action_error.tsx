/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import { EndpointActionFailureMessage } from '../../endpoint_action_failure_message';
import type { CommandExecutionResultComponent } from '../../console/components/command_execution_result';
import type { ActionDetails, MaybeImmutable } from '../../../../../common/endpoint/types';

export const ActionError = memo<{
  action: MaybeImmutable<ActionDetails>;
  ResultComponent: CommandExecutionResultComponent;
  title?: string;
  dataTestSubj?: string;
}>(({ title, dataTestSubj, action, ResultComponent }) => {
  return (
    <ResultComponent
      showAs={action.wasCanceled ? 'canceled' : 'failure'}
      title={title}
      data-test-subj={dataTestSubj}
    >
      <EndpointActionFailureMessage action={action} />
    </ResultComponent>
  );
});
ActionError.displayName = 'ActionError';
