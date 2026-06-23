/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { memo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule } from '@elastic/eui';
import styled from '@emotion/styled';
import { useTestIdGenerator } from '../../../../hooks/use_test_id_generator';
import { useDataTestSubj } from '../../hooks/state_selectors/use_data_test_subj';

export interface SidePanelContentLayoutProps {
  children: ReactNode;
  headerContent?: ReactNode;
}

const StyledEuiFlexItemNoPadding = styled(EuiFlexItem)`
  padding: 0 !important;
`;

/**
 * A layout component for displaying content in the right-side panel of the console
 */
export const SidePanelContentLayout = memo<SidePanelContentLayoutProps>(
  ({ headerContent, children }) => {
    const getTestId = useTestIdGenerator(useDataTestSubj('sidePanel'));

    return (
      <EuiFlexGroup
        direction="column"
        responsive={false}
        className="eui-fullHeight"
        gutterSize="none"
        data-test-subj={getTestId()}
      >
        {headerContent && (
          <>
            <EuiFlexItem
              grow={false}
              className="layout-container"
              data-test-subj={getTestId('header')}
            >
              {headerContent}
            </EuiFlexItem>
            <EuiHorizontalRule margin="none" />
          </>
        )}
        <StyledEuiFlexItemNoPadding className="eui-scrollBar eui-yScroll layout-container">
          <div data-test-subj={getTestId('body')}>{children}</div>
        </StyledEuiFlexItemNoPadding>
      </EuiFlexGroup>
    );
  }
);
SidePanelContentLayout.displayName = 'SidePanelContentLayout';
