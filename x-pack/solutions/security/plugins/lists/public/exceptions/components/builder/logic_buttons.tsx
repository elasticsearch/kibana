/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import styled from '@emotion/styled';

import * as i18n from './translations';

const MyEuiButton = styled(EuiButton)`
  min-width: 95px;
`;

interface BuilderLogicButtonsProps {
  isAndDisabled: boolean;
  isNested: boolean;
  isNestedDisabled: boolean;
  isOrDisabled: boolean;
  isOrHidden?: boolean;
  showNestedButton: boolean;
  onAddClickWhenNested: () => void;
  onAndClicked: () => void;
  onNestedClicked: () => void;
  onOrClicked: () => void;
}

export const BuilderLogicButtons: React.FC<BuilderLogicButtonsProps> = ({
  isAndDisabled = false,
  isNested,
  isNestedDisabled = true,
  isOrDisabled = false,
  isOrHidden = false,
  showNestedButton = false,
  onAddClickWhenNested,
  onAndClicked,
  onNestedClicked,
  onOrClicked,
}) => (
  <EuiFlexGroup gutterSize="s" alignItems="center">
    <EuiFlexItem grow={false}>
      <MyEuiButton
        size="s"
        iconType="plusCircle"
        onClick={isNested ? onAddClickWhenNested : onAndClicked}
        data-test-subj="exceptionsAndButton"
        isDisabled={isAndDisabled}
      >
        {i18n.AND}
      </MyEuiButton>
    </EuiFlexItem>
    {!isOrHidden && (
      <EuiFlexItem grow={false}>
        <MyEuiButton
          fill
          size="s"
          iconType="plusCircle"
          onClick={onOrClicked}
          isDisabled={isOrDisabled}
          data-test-subj="exceptionsOrButton"
        >
          {i18n.OR}
        </MyEuiButton>
      </EuiFlexItem>
    )}
    {showNestedButton && (
      <EuiFlexItem grow={false}>
        <EuiButton
          size="s"
          iconType="nested"
          onClick={isNested ? onAndClicked : onNestedClicked}
          isDisabled={isNestedDisabled}
          data-test-subj="exceptionsNestedButton"
        >
          {isNested ? i18n.ADD_NON_NESTED_DESCRIPTION : i18n.ADD_NESTED_DESCRIPTION}
        </EuiButton>
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);
