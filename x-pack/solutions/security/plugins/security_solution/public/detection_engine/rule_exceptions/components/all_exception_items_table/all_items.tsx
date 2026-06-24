/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import styled from '@emotion/styled';

import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';

import { ExceptionItemCard } from '../exception_item_card';
import type { ExceptionListItemIdentifiers } from '../../utils/types';
import type { RuleReferences } from '../../logic/use_find_references';
import type { ViewerState } from './reducer';
import { ExeptionItemsViewerEmptyPrompts } from './empty_viewer_state';

const MyFlexItem = styled(EuiFlexItem)`
  margin: ${({ theme }) => `${theme.euiTheme.size.base} 0`};
  &:first-child {
    margin: ${({ theme }) => `${theme.euiTheme.size.xs} 0 ${theme.euiTheme.size.base}`};
  }
`;

interface ExceptionItemsViewerProps {
  isReadOnly: boolean;
  disableActions: boolean;
  exceptions: ExceptionListItemSchema[];
  isEndpoint: boolean;
  ruleReferences: RuleReferences | null;
  viewerState: ViewerState;
  onCreateExceptionListItem: () => void;
  onDeleteException: (arg: ExceptionListItemIdentifiers) => void;
  onEditExceptionItem: (item: ExceptionListItemSchema) => void;
}

const ExceptionItemsViewerComponent: React.FC<ExceptionItemsViewerProps> = ({
  isReadOnly,
  exceptions,
  isEndpoint,
  disableActions,
  ruleReferences,
  viewerState,
  onCreateExceptionListItem,
  onDeleteException,
  onEditExceptionItem,
}): JSX.Element => {
  return (
    <>
      {viewerState != null && viewerState !== 'deleting' ? (
        <ExeptionItemsViewerEmptyPrompts
          isReadOnly={isReadOnly}
          isEndpoint={isEndpoint}
          currentState={viewerState}
          onCreateExceptionListItem={onCreateExceptionListItem}
        />
      ) : (
        <EuiFlexGroup direction="column" className="eui-yScrollWithShadows">
          <EuiFlexItem grow={false} className="eui-yScrollWithShadows">
            <EuiFlexGroup data-test-subj="exceptionsContainer" gutterSize="none" direction="column">
              {exceptions.map((exception) => (
                <MyFlexItem data-test-subj="exceptionItemContainer" grow={false} key={exception.id}>
                  <ExceptionItemCard
                    disableActions={disableActions}
                    exceptionItem={exception}
                    isEndpoint={isEndpoint}
                    listAndReferences={
                      ruleReferences != null ? ruleReferences[exception.list_id] : null
                    }
                    onDeleteException={onDeleteException}
                    onEditException={onEditExceptionItem}
                    dataTestSubj="exceptionItemsViewerItem"
                  />
                </MyFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      )}
    </>
  );
};

ExceptionItemsViewerComponent.displayName = 'ExceptionItemsViewerComponent';

export const ExceptionsViewerItems = React.memo(ExceptionItemsViewerComponent);

ExceptionsViewerItems.displayName = 'ExceptionsViewerItems';
