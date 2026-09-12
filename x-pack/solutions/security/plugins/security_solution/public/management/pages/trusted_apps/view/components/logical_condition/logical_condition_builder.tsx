/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import type { CommonProps } from '@elastic/eui';
import { EuiText, EuiPanel } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ConditionGroupProps } from '../condition_group';
import { ConditionGroup } from '../condition_group';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';

export type LogicalConditionBuilderProps = CommonProps & ConditionGroupProps;
export const LogicalConditionBuilder = memo<LogicalConditionBuilderProps>(
  ({
    entries,
    os,
    className,
    isAndDisabled = false,
    onAndClicked,
    onEntryRemove,
    onEntryChange,
    onVisited,
    entryValidations,
    showRequiredErrors,
    'data-test-subj': dataTestSubj,
  }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    return (
      <div data-test-subj={dataTestSubj} className={className}>
        <div>
          {entries.length === 0 ? (
            <NoEntries />
          ) : (
            <ConditionGroup
              os={os}
              entries={entries}
              onEntryRemove={onEntryRemove}
              onEntryChange={onEntryChange}
              onAndClicked={onAndClicked}
              isAndDisabled={isAndDisabled}
              onVisited={onVisited}
              entryValidations={entryValidations}
              showRequiredErrors={showRequiredErrors}
              data-test-subj={getTestId('group1')}
            />
          )}
        </div>
      </div>
    );
  }
);

LogicalConditionBuilder.displayName = 'LogicalConditionBuilder';

const NoEntries = memo(() => {
  return (
    <EuiPanel paddingSize="l">
      <EuiText textAlign="center" size="s" color="subdued">
        <FormattedMessage
          id="xpack.securitySolution.trustedapps.logicalConditionBuilder.noEntries"
          defaultMessage="No conditions defined"
        />
      </EuiText>
    </EuiPanel>
  );
});

NoEntries.displayName = 'NoEntries';
