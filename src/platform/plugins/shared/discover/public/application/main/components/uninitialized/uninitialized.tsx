/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { Fragment } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiButton,
  EuiDescriptionList,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { esqlKeyboardShortcuts } from '@kbn/esql-editor';
import { useIsEsqlMode } from '../../hooks/use_is_esql_mode';
import { useCurrentDataView } from '../../state_management/redux';
import { useCurrentTabMenuActions } from '../../hooks/use_current_tab_menu_actions';

interface Props {
  onRefresh: () => void;
}

export const DiscoverUninitialized = ({ onRefresh }: Props) => {
  const isEsqlMode = useIsEsqlMode();
  const currentDataView = useCurrentDataView();
  const { canSwitchLanguageMode, isDataViewMode, switchLanguageMode } = useCurrentTabMenuActions({
    currentDataView,
    switchToEsqlMetric: 'esql:uninitialized_query_in_esql_clicked',
  });
  const shortcutsLabel = i18n.translate('discover.uninitialized.keyboardShortcutsLabel', {
    defaultMessage: 'Keyboard shortcuts',
  });
  const shortcutsLabelId = useGeneratedHtmlId();

  const startSearchingPrompt = (
    <EuiEmptyPrompt
      iconType="discoverApp"
      title={
        <h2>
          <FormattedMessage id="discover.uninitializedTitle" defaultMessage="Start searching" />
        </h2>
      }
      body={
        <EuiText size="s" color="subdued">
          <p>
            <FormattedMessage
              id="discover.uninitializedText"
              defaultMessage="Write a query, add some filters, or simply hit Refresh to retrieve results for the current query."
            />
          </p>
        </EuiText>
      }
      actions={
        <EuiFlexGroup responsive={false} alignItems="center" justifyContent="center">
          <EuiFlexItem grow={false}>
            <EuiButton color="primary" fill onClick={onRefresh} data-test-subj="refreshDataButton">
              <FormattedMessage
                id="discover.uninitializedRefreshButtonText"
                defaultMessage="Refresh data"
              />
            </EuiButton>
          </EuiFlexItem>
          {canSwitchLanguageMode && isDataViewMode && (
            <>
              <EuiFlexItem grow={false}>
                <EuiText component="span" size="s" color="subdued">
                  <FormattedMessage id="discover.uninitializedActionsOrText" defaultMessage="or" />
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  color="primary"
                  iconType="code"
                  onClick={switchLanguageMode}
                  data-test-subj="queryInEsqlButton"
                >
                  <FormattedMessage
                    id="discover.uninitializedQueryInEsqlButtonText"
                    defaultMessage="Query in ES|QL"
                  />
                </EuiButton>
              </EuiFlexItem>
            </>
          )}
        </EuiFlexGroup>
      }
    />
  );

  if (!isEsqlMode) {
    return startSearchingPrompt;
  }

  return (
    <EuiText size="m" data-test-subj="discoverUninitializedKeyboardShortcuts">
      <h3 id={shortcutsLabelId}>{shortcutsLabel}</h3>
      <EuiDescriptionList
        aria-labelledby={shortcutsLabelId}
        type="column"
        columnWidths={['auto', 'auto']}
        columnGutterSize="m"
        compressed
        listItems={esqlKeyboardShortcuts.map(({ keys, label }) => ({
          title: label,
          description: keys.map((key, index) => (
            <Fragment key={`${key}-${index}`}>
              {index > 0 ? ' ' : null}
              <kbd>{key}</kbd>
            </Fragment>
          )),
        }))}
      />
    </EuiText>
  );
};
