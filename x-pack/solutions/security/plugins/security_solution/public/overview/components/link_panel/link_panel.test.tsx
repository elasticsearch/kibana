/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiButton, EuiPanel } from '@elastic/eui';
import { TestProviders } from '../../../common/mock';
import { LinkPanel } from './link_panel';

describe('LinkPanel', () => {
  const defaultProps = {
    button: <EuiButton data-test-subj="_test_button_" />,
    columns: [
      { name: 'title', field: 'title', sortable: true },
      {
        name: 'count',
        field: 'count',
      },
    ],
    dataTestSubj: '_custom_test_subj_',
    infoPanel: <div className="info-panel" />,
    listItems: [
      { title: 'a', count: 2, path: '' },
      { title: 'b', count: 1, path: '/test' },
    ],
    panelTitle: 'test-panel-title',
    splitPanel: <EuiPanel data-test-subj="_split_panel_" />,
    subtitle: <EuiPanel data-test-subj="_subtitle_" />,
  };

  it('renders expected children', () => {
    const { container } = render(
      <TestProviders>
        <LinkPanel {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('_custom_test_subj_')).toBeInTheDocument();
    expect(container.querySelector('.euiTable')).toBeInTheDocument();
    expect(screen.getByTestId('_test_button_')).toBeInTheDocument();
    expect(screen.getByTestId('_split_panel_')).toBeInTheDocument();
    expect(screen.getByTestId('_subtitle_')).toBeInTheDocument();
  });
});
