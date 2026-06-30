/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import styled from 'styled-components';
import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';

export const Wrapper = styled.div`
  // Set the min height to the viewport size minus the height of any global Kibana headers
  min-height: var(--kbn-application--content-height);

  // should be white
  background-color: ${(props) => props.theme.eui.euiColorBackgroundBasePlain};
`;

export const Page = styled(EuiPage)`
  width: 100%;
  align-self: center;
  margin: auto;
  flex: 1;
`;

export const ContentWrapper = styled.div`
  height: 100%;
  padding-left: ${(props) => props.theme.eui.euiSizeM};
  padding-right: ${(props) => props.theme.eui.euiSizeM};
`;

interface Props {
  restrictWidth?: number | string;
  /**
   * Rendered inside the full-height wrapper, above the (width-restricted) page body. Use this for a
   * full-bleed inline app header so it counts toward the wrapper's `min-height` and doesn't add an
   * extra header-height of scroll on top of the application content area.
   */
  header?: React.ReactNode;
  children?: React.ReactNode;
}

export const WithoutHeaderLayout: React.FC<Props> = ({ restrictWidth, header, children }) => (
  <Wrapper>
    {header}
    <Page restrictWidth={restrictWidth || 1200}>
      <EuiPageBody>
        <ContentWrapper>
          <EuiSpacer size="m" />
          {children}
        </ContentWrapper>
      </EuiPageBody>
    </Page>
  </Wrapper>
);
