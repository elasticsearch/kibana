/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ReactNode } from 'react';
import React, { useState, useEffect } from 'react';
import {
  copyToClipboard,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  EuiCallOut,
  EuiLiveAnnouncer,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { ParsedAggregationResults } from '@kbn/triggers-actions-ui-plugin/common';
import { useTestQuery } from './use_test_query';
import { TestQueryRowTable } from './test_query_row_table';

export interface TestQueryRowProps {
  fetch: () => Promise<{
    testResults: ParsedAggregationResults;
    isGrouped: boolean;
    timeWindow: string;
  }>;
  copyQuery?: () => string;
  hasValidationErrors: boolean;
  showTable?: boolean;
}

export const TestQueryRow: React.FC<TestQueryRowProps> = ({
  fetch,
  copyQuery,
  hasValidationErrors,
  showTable,
}) => {
  const {
    onTestQuery,
    resetTestQueryResponse,
    testQueryResult,
    testQueryError,
    testQueryWarning,
    testQueryLoading,
    testQueryPreview,
  } = useTestQuery(fetch);

  const [copiedMessage, setCopiedMessage] = useState<ReactNode | null>(null);
  const [copyQueryError, setCopyQueryError] = useState<string | null>(null);

  useEffect(() => {
    setCopyQueryError(null);
  }, [fetch]);

  return (
    <>
      <EuiFormRow>
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton
              data-test-subj="testQuery"
              color="primary"
              iconSide="left"
              iconType="play"
              onClick={() => {
                setCopyQueryError(null);
                onTestQuery();
              }}
              disabled={hasValidationErrors}
              isLoading={testQueryLoading}
              size="s"
            >
              <FormattedMessage
                id="xpack.stackAlerts.esQuery.ui.testQuery"
                defaultMessage="Test query"
              />
            </EuiButton>
          </EuiFlexItem>
          {copyQuery && (
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={copiedMessage}
                onMouseOut={() => {
                  setCopiedMessage(null);
                }}
              >
                <EuiButtonEmpty
                  data-test-subj="copyQuery"
                  color="primary"
                  iconSide="left"
                  iconType="copy"
                  onClick={() => {
                    setCopyQueryError(null);
                    resetTestQueryResponse();
                    try {
                      const copied = copyToClipboard(copyQuery());
                      if (copied) {
                        setCopiedMessage(
                          <FormattedMessage
                            id="xpack.stackAlerts.esQuery.ui.queryCopiedToClipboard"
                            defaultMessage="Copied"
                          />
                        );
                      }
                    } catch (err) {
                      setCopyQueryError(
                        i18n.translate('xpack.stackAlerts.esQuery.ui.copyQueryError', {
                          defaultMessage: 'Error copying query: {message}',
                          values: { message: err.message },
                        })
                      );
                    }
                  }}
                  disabled={hasValidationErrors}
                  isLoading={testQueryLoading}
                  size="s"
                >
                  <FormattedMessage
                    id="xpack.stackAlerts.esQuery.ui.copyQuery"
                    defaultMessage="Copy query"
                  />
                </EuiButtonEmpty>
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFormRow>
      {testQueryLoading && (
        <EuiFormRow>
          <EuiText color="subdued" size="s">
            <p>
              <FormattedMessage
                id="xpack.stackAlerts.esQuery.ui.testQueryIsExecuted"
                defaultMessage="Query is executed."
              />
            </p>
          </EuiText>
        </EuiFormRow>
      )}
      {testQueryResult && (
        <>
          <EuiFormRow>
            <EuiText data-test-subj="testQuerySuccess" color="subdued" size="s">
              <p>{testQueryResult}</p>
            </EuiText>
          </EuiFormRow>
          <EuiLiveAnnouncer data-test-subj="testQuerySuccessAnnouncement" isActive>
            {testQueryResult}
          </EuiLiveAnnouncer>
        </>
      )}
      {testQueryError && (
        <>
          <EuiFormRow>
            <EuiText data-test-subj="testQueryError" color="danger" size="s">
              <p>{testQueryError}</p>
            </EuiText>
          </EuiFormRow>
          <EuiLiveAnnouncer
            aria-live="assertive"
            data-test-subj="testQueryErrorAnnouncement"
            isActive
          >
            {testQueryError}
          </EuiLiveAnnouncer>
        </>
      )}
      {copyQueryError && (
        <EuiFormRow>
          <EuiText data-test-subj="copyQueryError" color="danger" size="s">
            <p>{copyQueryError}</p>
          </EuiText>
        </EuiFormRow>
      )}
      {testQueryWarning && (
        <EuiFormRow fullWidth>
          <EuiCallOut
            announceOnMount
            color="warning"
            size="s"
            title={testQueryWarning}
            iconType="warning"
          />
        </EuiFormRow>
      )}
      {showTable && testQueryPreview && (
        <>
          <EuiSpacer size="s" />
          <TestQueryRowTable preview={testQueryPreview} />
        </>
      )}
    </>
  );
};
