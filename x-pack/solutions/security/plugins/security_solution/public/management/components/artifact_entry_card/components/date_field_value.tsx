/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import type { CommonProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiIcon } from '@elastic/eui';
import styled from 'styled-components';
import { CREATED, LAST_UPDATED } from './translations';
import type { FormattedRelativePreferenceDateProps } from '../../../../common/components/formatted_date';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { TextValueDisplay } from './text_value_display';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';

const StyledEuiFlexItem = styled(EuiFlexItem)`
  padding-top: 2px;
`;

export interface DateFieldProps extends Pick<CommonProps, 'data-test-subj'> {
  date: FormattedRelativePreferenceDateProps['value'];
  type: 'update' | 'create';
}

export const DateFieldValue = memo<DateFieldProps>(
  ({ date, type, 'data-test-subj': dataTestSubj }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);

    return (
      <EuiFlexGroup
        responsive={false}
        alignItems="flexStart"
        gutterSize="m"
        data-test-subj={dataTestSubj}
      >
        <StyledEuiFlexItem grow={false}>
          <EuiIcon type="calendar" aria-hidden={true} />
        </StyledEuiFlexItem>
        <EuiFlexItem grow={true}>
          <EuiFlexGroup
            responsive={false}
            direction="column"
            alignItems="flexStart"
            gutterSize="xs"
          >
            <EuiFlexItem className="eui-textTruncate" data-test-subj={getTestId('label')}>
              <TextValueDisplay>{type === 'update' ? LAST_UPDATED : CREATED}</TextValueDisplay>
            </EuiFlexItem>
            <EuiFlexItem className="eui-textTruncate" data-test-subj={getTestId('value')}>
              <TextValueDisplay bold>
                <FormattedRelativePreferenceDate value={date} dateFormat="M/D/YYYY" />
              </TextValueDisplay>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);
DateFieldValue.displayName = 'DateField';
