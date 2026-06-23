/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  return {
    ...actual,
    // EuiTitle applies size via CSS-in-JS only (no stable DOM class); mock to inspect props
    EuiTitle: jest.fn(({ children }) => children),
  };
});

import React from 'react';

import { screen } from '@testing-library/react';

import { EuiButton, EuiTitle } from '@elastic/eui';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { DataPanel } from './data_panel';

const MockEuiTitle = jest.mocked(EuiTitle);

describe('DataPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with a title and children', () => {
    renderWithKibanaRenderContext(
      <DataPanel title={<h1 data-test-subj="title">Tabula Rasa</h1>}>
        <div data-test-subj="children">Look at this graph</div>
      </DataPanel>
    );

    expect(screen.getByTestId('title')).toHaveTextContent('Tabula Rasa');
    expect(screen.getByTestId('children')).toHaveTextContent('Look at this graph');
  });

  it('conditionally renders a spacer between the header and children', () => {
    const { container, rerender } = renderWithKibanaRenderContext(
      <DataPanel title={<h1>Test</h1>} />
    );

    expect(container.querySelector('.euiSpacer--s')).toBeNull();
    expect(container.querySelector('.euiSpacer--l')).toBeNull();

    rerender(<DataPanel title={<h1>Test</h1>}>hello world</DataPanel>);

    expect(container.querySelector('.euiSpacer--s')).not.toBeNull();

    rerender(
      <DataPanel title={<h1>Test</h1>} filled>
        hello world
      </DataPanel>
    );

    expect(container.querySelector('.euiSpacer--l')).not.toBeNull();
  });

  describe('components', () => {
    it('renders with an icon', () => {
      const { container } = renderWithKibanaRenderContext(
        <DataPanel title={<h1>The Smoke Monster</h1>} iconType="eye" />
      );

      expect(container.querySelector('[data-euiicon-type="eye"]')).not.toBeNull();
    });

    it('renders with a subtitle', () => {
      renderWithKibanaRenderContext(
        <DataPanel title={<h1>Hugo Reyes</h1>} subtitle="Hurley was typically happy-go-lucky" />
      );

      expect(screen.getByText('Hurley was typically happy-go-lucky')).toBeInTheDocument();
    });

    it('renders with an icon and a subtitle', () => {
      const { container } = renderWithKibanaRenderContext(
        <DataPanel
          title={<h1>Flight 815</h1>}
          iconType="package"
          subtitle="Oceanic Airlines Flight 815 was a scheduled flight from Sydney, Australia to Los Angeles, California"
        />
      );

      expect(container.querySelector('[data-euiicon-type="package"]')).not.toBeNull();
      expect(
        screen.getByText(
          'Oceanic Airlines Flight 815 was a scheduled flight from Sydney, Australia to Los Angeles, California'
        )
      ).toBeInTheDocument();
    });

    it('renders with a button', () => {
      renderWithKibanaRenderContext(
        <DataPanel
          title={<h1>Board Flight 815</h1>}
          action={<EuiButton data-test-subj="action">Book flight</EuiButton>}
        />
      );

      expect(screen.getByTestId('action')).toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('passes titleSize to the title', () => {
      const { rerender } = renderWithKibanaRenderContext(<DataPanel title={<h2>Test</h2>} />);

      expect(MockEuiTitle.mock.calls[0][0].size).toEqual('xs');

      rerender(<DataPanel title={<h2>Test</h2>} titleSize="s" />);

      expect(MockEuiTitle.mock.calls[1][0].size).toEqual('s');
    });

    it('renders panel color based on filled flag', () => {
      const { container, rerender } = renderWithKibanaRenderContext(
        <DataPanel title={<h1>Test</h1>} />
      );

      expect(container.querySelector('.euiPanel--plain')).not.toBeNull();
      expect(container.querySelector('.dataPanel--filled')).toBeNull();

      rerender(<DataPanel title={<h1>Test</h1>} filled />);

      expect(container.querySelector('.euiPanel--subdued')).not.toBeNull();
      expect(container.querySelector('.dataPanel--filled')).not.toBeNull();
    });

    it('renders a loading overlay based on isLoading flag', () => {
      const { container, rerender } = renderWithKibanaRenderContext(
        <DataPanel title={<h1>Test</h1>} />
      );

      expect(container.querySelector('[aria-busy]')).toBeNull();
      expect(screen.queryByTestId('enterpriseSearchLoadingOverlay')).not.toBeInTheDocument();

      rerender(<DataPanel title={<h1>Test</h1>} isLoading />);

      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(screen.getByTestId('enterpriseSearchLoadingOverlay')).toBeInTheDocument();
    });

    it('passes class names', () => {
      const { container } = renderWithKibanaRenderContext(
        <DataPanel title={<h1>Test</h1>} className="testing" />
      );

      expect(container.querySelector('.testing')).not.toBeNull();
    });

    it('passes arbitrary props', () => {
      renderWithKibanaRenderContext(<DataPanel title={<h1>Test</h1>} data-test-subj="testing" />);

      expect(screen.getByTestId('testing')).toBeInTheDocument();
    });
  });
});
