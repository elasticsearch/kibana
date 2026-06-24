/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mount } from 'enzyme';
import { EuiProvider } from '@elastic/eui';

import { BuilderAndBadgeComponent } from './and_badge';

describe('BuilderAndBadgeComponent', () => {
  test('it renders exceptionItemEntryFirstRowAndBadge for very first exception item in builder', () => {
    const wrapper = mount(
      <EuiProvider>
        <BuilderAndBadgeComponent entriesLength={2} exceptionItemIndex={0} />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryFirstRowAndBadge"]').exists()
    ).toBeTruthy();
  });

  test('it renders exceptionItemEntryInvisibleAndBadge if "entriesLength" is 1 or less', () => {
    const wrapper = mount(
      <EuiProvider>
        <BuilderAndBadgeComponent entriesLength={1} exceptionItemIndex={0} />
      </EuiProvider>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionItemEntryInvisibleAndBadge"]').exists()
    ).toBeTruthy();
  });

  test('it renders regular "and" badge if exception item is not the first one and includes more than one entry', () => {
    const wrapper = mount(
      <EuiProvider>
        <BuilderAndBadgeComponent entriesLength={2} exceptionItemIndex={1} />
      </EuiProvider>
    );

    expect(wrapper.find('[data-test-subj="exceptionItemEntryAndBadge"]').exists()).toBeTruthy();
  });
});
