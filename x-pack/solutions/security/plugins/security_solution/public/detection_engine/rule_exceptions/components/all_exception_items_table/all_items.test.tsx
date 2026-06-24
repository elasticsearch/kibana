/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mount } from 'enzyme';

import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';

import { ExceptionsViewerItems } from './all_items';
import { TestProviders } from '../../../../common/mock';

describe('ExceptionsViewerItems', () => {
  it('it renders empty prompt if "viewerState" is "empty"', () => {
    const wrapper = mount(
      <TestProviders>
        <ExceptionsViewerItems
          disableActions={false}
          exceptions={[]}
          isEndpoint={false}
          ruleReferences={null}
          viewerState="empty"
          onCreateExceptionListItem={jest.fn()}
          onDeleteException={jest.fn()}
          onEditExceptionItem={jest.fn()}
          isReadOnly={false}
        />
      </TestProviders>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionItemViewerEmptyPrompts-empty"]').exists()
    ).toBeTruthy();
    expect(wrapper.find('[data-test-subj="exceptionsContainer"]').exists()).toBeFalsy();
  });

  it('it renders no search results found prompt if "viewerState" is "empty_search"', () => {
    const wrapper = mount(
      <TestProviders>
        <ExceptionsViewerItems
          disableActions={false}
          exceptions={[]}
          isEndpoint={false}
          ruleReferences={null}
          viewerState="empty_search"
          onCreateExceptionListItem={jest.fn()}
          onDeleteException={jest.fn()}
          onEditExceptionItem={jest.fn()}
          isReadOnly={false}
        />
      </TestProviders>
    );

    expect(
      wrapper.find('[data-test-subj="exceptionItemViewerEmptyPrompts-emptySearch"]').exists()
    ).toBeTruthy();
    expect(wrapper.find('[data-test-subj="exceptionsContainer"]').exists()).toBeFalsy();
  });

  it('it renders exceptions if "viewerState" and "null"', () => {
    const wrapper = mount(
      <TestProviders>
        <ExceptionsViewerItems
          disableActions={false}
          exceptions={[getExceptionListItemSchemaMock()]}
          isEndpoint={false}
          ruleReferences={null}
          viewerState={null}
          onCreateExceptionListItem={jest.fn()}
          onDeleteException={jest.fn()}
          onEditExceptionItem={jest.fn()}
          isReadOnly={false}
        />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="exceptionsContainer"]').exists()).toBeTruthy();
  });
});
