/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiContextMenu } from '@elastic/eui';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { getDnsTopDomainsLensAttributes } from './lens_attributes/network/dns_top_domains';
import { VisualizationActions } from './actions';
import { TestProviders } from '../../mock';
import type { VisualizationActionsProps } from './types';
import * as useLensAttributesModule from './use_lens_attributes';
import { PageScope } from '../../../data_view_manager/constants';

jest.mock('./use_actions');

jest.mock('../inspect/use_inspect', () => {
  return {
    useInspect: jest.fn().mockReturnValue({}),
  };
});

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    EuiContextMenu: jest.fn(() => <div data-test-subj="viz-actions-menu" />),
  };
});

describe('VisualizationActions', () => {
  const spyUseLensAttributes = jest.spyOn(useLensAttributesModule, 'useLensAttributes');
  const props: VisualizationActionsProps = {
    getLensAttributes: getDnsTopDomainsLensAttributes,
    queryId: 'networkDnsHistogramQuery',
    timerange: {
      from: '2022-03-06T16:00:00.000Z',
      to: '2022-03-07T15:59:59.999Z',
    },
    title: 'mock networkDnsHistogram',
    extraOptions: { dnsIsPtrIncluded: true },
    stackByField: 'dns.question.registered_domain',
  };
  const mockContextMenu = EuiContextMenu as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Should generate attributes', () => {
    render(
      <TestProviders>
        <VisualizationActions {...props} />
      </TestProviders>
    );
    expect(spyUseLensAttributes.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        applyGlobalQueriesAndFilters: true,
        extraOptions: props.extraOptions,
        getLensAttributes: props.getLensAttributes,
        lensAttributes: props.lensAttributes,
        scopeId: PageScope.default,
        stackByField: props.stackByField,
        title: '',
      })
    );
  });

  test('Should render VisualizationActions button', async () => {
    const { queryByTestId } = render(
      <TestProviders>
        <VisualizationActions {...props} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(queryByTestId(`stat-networkDnsHistogramQuery`)).toBeInTheDocument();
    });
  });

  test('renders context menu', async () => {
    const { getByTestId } = render(
      <TestProviders>
        <VisualizationActions {...props} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(getByTestId(`stat-networkDnsHistogramQuery`)).toBeInTheDocument();
    });

    fireEvent.click(getByTestId(`stat-networkDnsHistogramQuery`));

    expect(getByTestId('viz-actions-menu')).toBeInTheDocument();
    expect(mockContextMenu.mock.calls[0][0].panels[0].items[0].name).toEqual('Inspect');
    expect(mockContextMenu.mock.calls[0][0].panels[0].items[1].name).toEqual('Add to case');
    expect(mockContextMenu.mock.calls[0][0].panels[0].items[2].name).toEqual('Added to library');
    expect(mockContextMenu.mock.calls[0][0].panels[0].items[3].name).toEqual('Open in Lens');
  });
});
