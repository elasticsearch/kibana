/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiLoadingSpinner,
  EuiTitle,
  useEuiFontSize,
  useEuiTheme,
} from '@elastic/eui';

import React, { memo } from 'react';
import { css } from '@emotion/react';
import { FormattedMessage } from '@kbn/i18n-react';
import { ONE_WEEK_IN_HOURS } from '../../../../flyout/entity_details/shared/constants';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { InspectButton, InspectButtonContainer } from '../../../../common/components/inspect';
import type { ObservedDataSectionProps } from './observed_data_section_content';
import { ObservedDataSectionContent } from './observed_data_section_content';

export type { ObservedDataSectionProps } from './observed_data_section_content';

export const ObservedDataSection = memo((props: ObservedDataSectionProps) => {
  const { observedData, queryId } = props;
  const { euiTheme } = useEuiTheme();
  const xsFontSize = useEuiFontSize('xxs').fontSize;

  const buttonContent = (
    <EuiTitle size="xs">
      <h3>
        <FormattedMessage
          id="xpack.securitySolution.flyout.entityDetails.observedDataTitle"
          defaultMessage="Observed attributes"
        />
      </h3>
    </EuiTitle>
  );

  const extraAction = (
    <>
      <span
        css={css`
          margin-right: ${euiTheme.size.s};
        `}
      >
        <InspectButton
          queryId={queryId}
          title={
            <FormattedMessage
              id="xpack.securitySolution.flyout.entityDetails.observedDataInspectTitle"
              defaultMessage="Observed attributes"
            />
          }
        />
      </span>
      {observedData.lastSeen.date && (
        <span
          css={css`
            font-size: ${xsFontSize};
          `}
        >
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.observedEntityUpdatedTime"
            defaultMessage="Updated {time}"
            values={{
              time: (
                <FormattedRelativePreferenceDate
                  value={observedData.lastSeen.date}
                  dateFormat="MMM D, YYYY"
                  relativeThresholdInHrs={ONE_WEEK_IN_HOURS}
                />
              ),
            }}
          />
        </span>
      )}
    </>
  );

  return (
    <InspectButtonContainer>
      <EuiAccordion
        initialIsOpen={true}
        id="observedEntity-accordion"
        data-test-subj="observedEntity-accordion"
        buttonProps={{
          'data-test-subj': 'observedEntity-accordion-button',
          css: css`
            color: ${euiTheme.colors.primary};
          `,
        }}
        buttonContent={buttonContent}
        extraAction={extraAction}
        css={css`
          .euiAccordion__optionalAction {
            margin-left: auto;
          }
        `}
      >
        {observedData.isLoading ? (
          <EuiLoadingSpinner data-test-subj="observedDataSectionLoadingSpinner" />
        ) : (
          <ObservedDataSectionContent {...props} />
        )}
      </EuiAccordion>
    </InspectButtonContainer>
  );
});

ObservedDataSection.displayName = 'ObservedDataSection';
