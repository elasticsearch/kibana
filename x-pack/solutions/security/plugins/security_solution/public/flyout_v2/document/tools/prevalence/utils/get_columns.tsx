/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiText, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { IS_OPERATOR } from '@kbn/timelines-plugin/common';
import type { IdentityFields } from '../../../../../flyout/document_details/shared/utils';
import {
  getDataProvider,
  getDataProviderAnd,
} from '../../../../../common/components/event_details/use_action_cell_data_provider';
import type { CellActionRenderer } from '../../../../shared/components/cell_actions';
import type { PrevalenceData } from '../hooks/use_prevalence';
import {
  PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_COUNT_TEXT_BUTTON_TEST_ID,
  PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID,
  PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID,
  PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID,
} from '../test_ids';
import { FormattedCount } from '../../../../../common/components/formatted_number';
import { getEmptyTagValue } from '../../../../../common/components/empty_value';
import { InvestigateInTimelineButton } from '../../../../../common/components/event_details/investigate_in_timeline_button';
import type { OpenFlyoutLinkRenderer } from '../../../main/components/highlighted_fields_cell';

/**
 * Component that renders a grey box to indicate the user doesn't have proper license to view the actual data
 */
export const LicenseProtectedCell: React.FC = () => {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      data-test-subj={PREVALENCE_DETAILS_TABLE_UPSELL_CELL_TEST_ID}
      css={{ height: '16px', width: '100%', background: euiTheme.colors.lightShade }}
    />
  );
};

export interface PrevalenceDetailsRow extends PrevalenceData {
  /**
   * From datetime selected in the date picker to pass to timeline
   */
  from: string;
  /**
   * To datetime selected in the date picker to pass to timeline
   */
  to: string;
  /**
   * License to drive the rendering of the last 2 prevalence columns
   */
  isPlatinumPlus: boolean;
  /**
   * Scope id to pass to the preview link
   */
  scopeId: string;
  /**
   * True if user have the correct timeline read privilege
   */
  canUseTimeline: boolean;
  /**
   * Host entity identifiers from the current document (for EUID / entity store).
   */
  documentHostEntityIdentifiers?: IdentityFields | null;
  /**
   * User entity identifiers from the current document (for EUID / entity store).
   */
  documentUserEntityIdentifiers?: IdentityFields | null;
}

export const fieldColumn: EuiBasicTableColumn<PrevalenceDetailsRow> = {
  field: 'field',
  name: (
    <FormattedMessage
      id="xpack.securitySolution.flyout.prevalence.fieldColumnLabel"
      defaultMessage="Field"
    />
  ),
  'data-test-subj': PREVALENCE_DETAILS_TABLE_FIELD_CELL_TEST_ID,
  render: (field: string) => <EuiText size="xs">{field}</EuiText>,
  width: '20%',
};

export const alertCountColumn = (
  isInSecurityApp: boolean
): EuiBasicTableColumn<PrevalenceDetailsRow> => ({
  name: (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.securitySolution.flyout.prevalence.alertCountColumnTooltip"
          defaultMessage="Total number of alerts with identical field value pairs."
        />
      }
    >
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.alertCountColumnLabel"
            defaultMessage="Alert"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.alertCountColumnCountLabel"
            defaultMessage="count"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  ),
  'data-test-subj': PREVALENCE_DETAILS_TABLE_ALERT_COUNT_CELL_TEST_ID,
  render: (data: PrevalenceDetailsRow) => {
    const dataProviders = data.values.map((value) =>
      getDataProvider(data.field, `timeline-indicator-${data.field}-${value}`, value)
    );

    if (data.alertCount === 0) {
      return getEmptyTagValue();
    }

    const alertCount = <FormattedCount count={data.alertCount} />;
    if (!isInSecurityApp || !data.canUseTimeline) {
      return (
        <EuiText size="xs" data-test-subj={PREVALENCE_DETAILS_TABLE_COUNT_TEXT_BUTTON_TEST_ID}>
          {alertCount}
        </EuiText>
      );
    }
    return (
      <InvestigateInTimelineButton
        asEmptyButton={true}
        dataProviders={dataProviders}
        filters={[]}
        timeRange={{ kind: 'absolute', from: data.from, to: data.to }}
        data-test-subj={PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID}
      >
        {alertCount}
      </InvestigateInTimelineButton>
    );
  },
  width: '10%',
});

export const documentCountColumn = (
  isInSecurityApp: boolean
): EuiBasicTableColumn<PrevalenceDetailsRow> => ({
  name: (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.securitySolution.flyout.prevalence.documentCountColumnTooltip"
          defaultMessage="Total number of event documents with identical field value pairs."
        />
      }
    >
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.documentCountColumnLabel"
            defaultMessage="Document"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.documentCountColumnCountLabel"
            defaultMessage="count"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  ),
  'data-test-subj': PREVALENCE_DETAILS_TABLE_DOC_COUNT_CELL_TEST_ID,
  render: (data: PrevalenceDetailsRow) => {
    const dataProviders = data.values.map((value) => ({
      ...getDataProvider(data.field, `timeline-indicator-${data.field}-${value}`, value),
      and: [
        getDataProviderAnd(
          'event.kind',
          `timeline-indicator-event.kind-not-signal`,
          'signal',
          IS_OPERATOR,
          true
        ),
      ],
    }));

    if (data.docCount === 0) {
      return getEmptyTagValue();
    }

    const docCount = <FormattedCount count={data.docCount} />;
    if (!isInSecurityApp || !data.canUseTimeline) {
      return (
        <EuiText size="xs" data-test-subj={PREVALENCE_DETAILS_TABLE_COUNT_TEXT_BUTTON_TEST_ID}>
          {docCount}
        </EuiText>
      );
    }
    return (
      <InvestigateInTimelineButton
        asEmptyButton={true}
        dataProviders={dataProviders}
        filters={[]}
        timeRange={{ kind: 'absolute', from: data.from, to: data.to }}
        keepDataView // changing dataview from only detections to include non-alerts docs
        data-test-subj={PREVALENCE_DETAILS_TABLE_INVESTIGATE_IN_TIMELINE_BUTTON_TEST_ID}
      >
        {docCount}
      </InvestigateInTimelineButton>
    );
  },
  width: '10%',
});

export const hostPrevalenceColumn: EuiBasicTableColumn<PrevalenceDetailsRow> = {
  name: (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.securitySolution.flyout.prevalence.hostPrevalenceColumnTooltip"
          defaultMessage="Percentage of unique hosts with identical field value pairs."
        />
      }
    >
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.hostPrevalenceColumnLabel"
            defaultMessage="Host"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.hostPrevalenceColumnCountLabel"
            defaultMessage="prevalence"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  ),
  'data-test-subj': PREVALENCE_DETAILS_TABLE_HOST_PREVALENCE_CELL_TEST_ID,
  render: (data: PrevalenceDetailsRow) => (
    <>
      {data.isPlatinumPlus ? (
        <EuiText size="xs">{`${Math.round(data.hostPrevalence * 100)}%`}</EuiText>
      ) : (
        <LicenseProtectedCell />
      )}
    </>
  ),
  width: '10%',
};

export const userPrevalenceColumn: EuiBasicTableColumn<PrevalenceDetailsRow> = {
  name: (
    <EuiToolTip
      content={
        <FormattedMessage
          id="xpack.securitySolution.flyout.prevalence.userPrevalenceColumnTooltip"
          defaultMessage="Percentage of unique users with identical field value pairs."
        />
      }
    >
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.userPrevalenceColumnLabel"
            defaultMessage="User"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <FormattedMessage
            id="xpack.securitySolution.flyout.prevalence.userPrevalenceColumnCountLabel"
            defaultMessage="prevalence"
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  ),
  'data-test-subj': PREVALENCE_DETAILS_TABLE_USER_PREVALENCE_CELL_TEST_ID,
  render: (data: PrevalenceDetailsRow) => (
    <>
      {data.isPlatinumPlus ? (
        <EuiText size="xs">{`${Math.round(data.userPrevalence * 100)}%`}</EuiText>
      ) : (
        <LicenseProtectedCell />
      )}
    </>
  ),
  width: '10%',
};

/**
 * Function that returns the columns definition for the prevalence details table in the insights tab of the document flyout.
 */
export const getColumns = (
  /**
   * Callback to render cell actions in Security Solution and Discover
   */
  renderCellActions: CellActionRenderer,
  /**
   * Boolean that drives the rendering of the alert count and document count columns as buttons with timeline links in Security Solution, and as plain text in Discover where timeline is not available
   */
  isInSecurityApp: boolean,
  /**
   * Scope id for cell actions
   */
  scopeId: string,
  /**
   * Optional component to render preview links for supported field types (e.g. IP fields)
   */
  RenderFlyoutLink?: OpenFlyoutLinkRenderer
): Array<EuiBasicTableColumn<PrevalenceDetailsRow>> => [
  fieldColumn,
  {
    name: (
      <FormattedMessage
        id="xpack.securitySolution.flyout.prevalence.valueColumnLabel"
        defaultMessage="Value"
      />
    ),
    'data-test-subj': PREVALENCE_DETAILS_TABLE_VALUE_CELL_TEST_ID,
    render: (data: PrevalenceDetailsRow) => {
      const renderValue = (value: string) => {
        const text = <EuiText size="xs">{value}</EuiText>;
        if (RenderFlyoutLink) {
          return (
            <RenderFlyoutLink field={data.field} value={value}>
              {text}
            </RenderFlyoutLink>
          );
        }
        return text;
      };

      return (
        <EuiFlexGroup direction="column" gutterSize="none">
          {data.values.map((value) => (
            <EuiFlexItem key={value}>
              {renderCellActions
                ? renderCellActions({
                    field: data.field,
                    value,
                    scopeId,
                    children: renderValue(value),
                  })
                : renderValue(value)}
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      );
    },
    width: '20%',
  },
  alertCountColumn(isInSecurityApp),
  documentCountColumn(isInSecurityApp),
  hostPrevalenceColumn,
  userPrevalenceColumn,
];
