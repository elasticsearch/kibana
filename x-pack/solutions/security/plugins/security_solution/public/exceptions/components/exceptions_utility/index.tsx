/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { FC } from 'react';
import styled from '@emotion/styled';
import { FormattedMessage } from '@kbn/i18n-react';
import type { Pagination } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';

import { FormattedRelativePreferenceDate } from '../../../common/components/formatted_date';
import {
  UtilityBar,
  UtilityBarSection,
  UtilityBarGroup,
  UtilityBarText,
} from '../../../common/components/utility_bar';

const StyledText = styled.span`
  font-weight: bold;
  color: ${({ theme }) => theme.euiTheme.colors.textParagraph};
`;

const MyUtilities = styled(EuiFlexGroup)`
  height: 50px;
`;

const StyledCondition = styled.span`
  display: inline-block !important;
  vertical-align: middle !important;
  line-height: 1;
`;
interface ExceptionsUtilityComponentProps {
  dataTestSubj?: string;
  exceptionsTitle?: string;
  pagination: Pagination & { pageSize: number };
  // Corresponds to last time exception items were fetched
  lastUpdated: string | number | null;
}
// This component should be removed and moved to @kbn/securitysolution-exception-list-components
// once all the building components get moved

const ExceptionsUtilityComponent: FC<ExceptionsUtilityComponentProps> = ({
  dataTestSubj,
  pagination,
  lastUpdated,
  exceptionsTitle,
}) => {
  const { pageSize, totalItemCount } = pagination;
  return (
    <MyUtilities alignItems="center" justifyContent="spaceBetween">
      <EuiFlexItem grow={false}>
        <UtilityBar>
          <UtilityBarSection>
            <UtilityBarGroup>
              <UtilityBarText dataTestSubj={`${dataTestSubj}ShowingText`}>
                <FormattedMessage
                  id="xpack.securitySolution.exceptions.viewer.paginationDetails"
                  defaultMessage="Showing {partOne} of {partTwo}"
                  values={{
                    partOne: <StyledText>{`1-${Math.min(pageSize, totalItemCount)}`}</StyledText>,
                    partTwo: <StyledText>{`${totalItemCount}`}</StyledText>,
                  }}
                />
              </UtilityBarText>
              {exceptionsTitle && (
                <StyledText data-test-subj={`${dataTestSubj}exceptionsTitle`}>
                  {exceptionsTitle}
                </StyledText>
              )}
            </UtilityBarGroup>
          </UtilityBarSection>
        </UtilityBar>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="s" data-test-subj={`${dataTestSubj}LastUpdated`}>
          <FormattedMessage
            id="xpack.securitySolution.exceptions.viewer.lastUpdated"
            defaultMessage="Updated {updated}"
            values={{
              updated: (
                <StyledCondition>
                  <FormattedRelativePreferenceDate
                    value={lastUpdated}
                    tooltipAnchorClassName="eui-textTruncate"
                  />
                </StyledCondition>
              ),
            }}
          />
        </EuiText>
      </EuiFlexItem>
    </MyUtilities>
  );
};

ExceptionsUtilityComponent.displayName = 'ExceptionsUtilityComponent';

export const ExceptionsUtility = React.memo(ExceptionsUtilityComponent);

ExceptionsUtility.displayName = 'ExceptionsUtility';
