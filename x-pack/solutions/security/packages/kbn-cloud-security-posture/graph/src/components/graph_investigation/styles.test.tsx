/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { AnimatedSearchBarContainer } from './styles';

const renderContainer = (className?: string) =>
  render(
    <EuiProvider>
      <AnimatedSearchBarContainer className={className} data-test-subj="container">
        <div />
      </AnimatedSearchBarContainer>
    </EuiProvider>
  );

describe('AnimatedSearchBarContainer', () => {
  it('constrains the implicit grid column so long filter chips cannot overflow the parent', () => {
    // Regression guard for the graph search bar layout breaking when a long filter chip is
    // applied. Grid items default to `min-width: auto`, so without `minmax(0, 1fr)` a single
    // long chip would push the date pickers, time-range selector and refresh button out of
    // the viewport instead of wrapping inside the chip (see security-team#17288).
    const { getByTestId } = renderContainer();

    expect(getByTestId('container')).toHaveStyleRule('grid-template-columns', 'minmax(0, 1fr)');
  });

  it('keeps a single grid row so the toggle-search collapse/expand animation is preserved', () => {
    // The `grid-template-rows: 1fr ↔ 0fr` trick drives the collapse/expand height transition;
    // the column constraint above must not regress it.
    const { getByTestId } = renderContainer();

    expect(getByTestId('container')).toHaveStyleRule('grid-template-rows', '1fr');
  });
});
