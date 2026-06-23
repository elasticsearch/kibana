/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('@kbn/shared-ux-page-kibana-template', () => {
  const MockKibanaPageTemplate: any = jest.fn(({ children, solutionNav }: any) =>
    solutionNav?.footer ? [solutionNav.footer, children] : children
  );
  MockKibanaPageTemplate.Section = jest.fn(({ children }: any) => children);
  return { KibanaPageTemplate: MockKibanaPageTemplate };
});

import { setMockValues } from '../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { i18n } from '@kbn/i18n';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import type { PageTemplateProps } from './page_template';
import { EnterpriseSearchPageTemplateWrapper } from './page_template';

const MockKibanaPageTemplate = jest.mocked(KibanaPageTemplate);

describe('EnterpriseSearchPageTemplateWrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockValues({
      readOnlyMode: false,
      notifications: { tours: { isEnabled: jest.fn(() => false) } },
    });
  });

  it('renders', () => {
    renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper />);
    expect(MockKibanaPageTemplate).toHaveBeenCalled();
  });

  it('renders children', () => {
    renderWithKibanaRenderContext(
      <EnterpriseSearchPageTemplateWrapper>
        <div className="hello">
          {i18n.translate('xpack.enterpriseSearch..div.worldLabel', { defaultMessage: 'world' })}
        </div>
      </EnterpriseSearchPageTemplateWrapper>
    );

    expect(screen.getByText('world')).toBeInTheDocument();
  });

  describe('loading state', () => {
    it('renders a loading icon in place of children', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper isLoading>
          <div data-test-subj="test" />
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.getByTestId('enterpriseSearchLoading')).toBeInTheDocument();
      expect(screen.queryByTestId('test')).not.toBeInTheDocument();
    });

    it('renders children & does not render a loading icon when the page is done loading', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper isLoading={false}>
          <div data-test-subj="test" />
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.queryByTestId('enterpriseSearchLoading')).not.toBeInTheDocument();
      expect(screen.getByTestId('test')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('renders a custom empty state in place of children', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper
          isEmptyState
          emptyState={
            <div data-test-subj="emptyState">
              {i18n.translate('xpack.enterpriseSearch..div.nothingHereYetLabel', {
                defaultMessage: 'Nothing here yet!',
              })}
            </div>
          }
        >
          <div data-test-subj="test" />
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.getByTestId('emptyState')).toBeInTheDocument();
      expect(screen.queryByTestId('test')).not.toBeInTheDocument();
    });

    it('does not render the custom empty state if the page is not empty', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper
          isEmptyState={false}
          emptyState={
            <div data-test-subj="emptyState">
              {i18n.translate('xpack.enterpriseSearch..div.nothingHereYetLabel', {
                defaultMessage: 'Nothing here yet!',
              })}
            </div>
          }
        >
          <div data-test-subj="test" />
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.queryByTestId('emptyState')).not.toBeInTheDocument();
      expect(screen.getByTestId('test')).toBeInTheDocument();
    });

    it('does not render an empty state if the page is still loading', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper
          isLoading
          isEmptyState
          emptyState={<div data-test-subj="emptyState" />}
        />
      );

      expect(screen.getByTestId('enterpriseSearchLoading')).toBeInTheDocument();
      expect(screen.queryByTestId('emptyState')).not.toBeInTheDocument();
    });
  });

  describe('read-only mode', () => {
    it('renders a callout if in read-only mode', () => {
      setMockValues({
        readOnlyMode: true,
        notifications: { tours: { isEnabled: jest.fn(() => false) } },
      });
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper />);

      expect(screen.getByText(/Enterprise Search is in read-only mode/)).toBeInTheDocument();
    });

    it('does not render a callout if not in read-only mode', () => {
      setMockValues({
        readOnlyMode: false,
        notifications: { tours: { isEnabled: jest.fn(() => false) } },
      });
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper />);

      expect(screen.queryByText(/Enterprise Search is in read-only mode/)).not.toBeInTheDocument();
    });
  });

  describe('flash messages', () => {
    it('renders FlashMessages by default', () => {
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper />);
      expect(screen.getByTestId('FlashMessages')).toBeInTheDocument();
    });

    it('does not render FlashMessages if hidden', () => {
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper hideFlashMessages />);
      expect(screen.queryByTestId('FlashMessages')).not.toBeInTheDocument();
    });
  });

  describe('page chrome', () => {
    const SetPageChrome = () => <div data-test-subj="setPageChrome" />;

    it('renders a product-specific <SetPageChrome />', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper setPageChrome={<SetPageChrome />} />
      );
      expect(screen.getByTestId('setPageChrome')).toBeInTheDocument();
    });

    it('invokes page chrome immediately (without waiting for isLoading to be finished)', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper setPageChrome={<SetPageChrome />} isLoading />
      );
      expect(screen.getByTestId('setPageChrome')).toBeInTheDocument();
    });
  });

  describe('EuiPageTemplate props', () => {
    it('overrides the restrictWidth prop', () => {
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper restrictWidth />);
      expect(MockKibanaPageTemplate.mock.calls[0][0].restrictWidth).toEqual(true);
    });

    it('passes down any ...pageTemplateProps that EuiPageTemplate accepts', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper
          panelled
          paddingSize="s"
          pageHeader={{ pageTitle: 'hello world' }}
        />
      );

      const props = MockKibanaPageTemplate.mock.calls[0][0];
      expect(props.panelled).toEqual(true);
      expect(props.paddingSize).toEqual('s');
      expect(props.pageHeader?.pageTitle).toEqual('hello world');
    });

    it('sets enterpriseSearchPageTemplate classNames while still accepting custom classNames', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper className="hello" mainProps={{ className: 'world' }} />
      );

      const props = MockKibanaPageTemplate.mock.calls[0][0];
      expect(props.className).toContain('hello');
      expect(props.mainProps?.className).toContain('enterpriseSearchPageTemplate__content');
      expect(props.mainProps?.className).toContain('world');
    });

    it('automatically sets the Elasticsearch logo onto passed solution navs', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper solutionNav={{ name: 'Elasticsearch', items: [] }} />
      );

      expect(MockKibanaPageTemplate.mock.calls[0][0].solutionNav).toMatchObject({
        icon: 'logoElasticsearch',
        name: 'Elasticsearch',
        items: [],
      });
    });

    it('sets the solutionNavIcon passed', () => {
      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper
          solutionNav={{ name: 'Elasticsearch', items: [] }}
          solutionNavIcon="logoElasticsearch"
        />
      );

      expect(MockKibanaPageTemplate.mock.calls[0][0].solutionNav).toMatchObject({
        icon: 'logoElasticsearch',
        name: 'Elasticsearch',
        items: [],
      });
    });
  });

  describe('Embedded Console', () => {
    it('renders embedded console if available', () => {
      const FakeEmbeddedConsole: React.FC = () => (
        <div data-test-subj="embeddedConsole">
          {i18n.translate('xpack.enterpriseSearch.fakeEmbeddedConsole.div.fooLabel', {
            defaultMessage: 'foo',
          })}
        </div>
      );
      const consolePlugin = { EmbeddableConsole: FakeEmbeddedConsole };

      setMockValues({
        readOnlyMode: false,
        notifications: { tours: { isEnabled: jest.fn(() => false) } },
        consolePlugin,
      });

      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper>
          <div className="hello">world</div>
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.getByTestId('embeddedConsole')).toBeInTheDocument();
    });

    it('Hides embedded console if available but page template prop set to hide', () => {
      const FakeEmbeddedConsole: React.FC = () => (
        <div data-test-subj="embeddedConsole">
          {i18n.translate('xpack.enterpriseSearch.fakeEmbeddedConsole.div.fooLabel', {
            defaultMessage: 'foo',
          })}
        </div>
      );
      const consolePlugin = { EmbeddableConsole: FakeEmbeddedConsole };

      setMockValues({
        readOnlyMode: false,
        notifications: { tours: { isEnabled: jest.fn(() => false) } },
        consolePlugin,
      });

      renderWithKibanaRenderContext(
        <EnterpriseSearchPageTemplateWrapper hideEmbeddedConsole>
          <div className="hello">world</div>
        </EnterpriseSearchPageTemplateWrapper>
      );

      expect(screen.queryByTestId('embeddedConsole')).not.toBeInTheDocument();
    });
  });

  describe('solution nav footer', () => {
    const MockFooter = () => <div data-test-subj="mockSolutionNavFooter">footer</div>;

    const renderTemplate = (props: Partial<PageTemplateProps> = {}) =>
      renderWithKibanaRenderContext(<EnterpriseSearchPageTemplateWrapper {...props} />);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('merges SolutionViewSwitchCallout into solutionNav when available', () => {
      setMockValues({
        notifications: { tours: { isEnabled: jest.fn(() => true) } },
        capabilities: { spaces: { manage: true } },
        spaces: {
          ui: {
            components: {
              getSolutionViewSwitchCallout: MockFooter,
            },
          },
        },
      });

      renderTemplate({
        solutionNav: { items: [], name: 'Elasticsearch' },
      });

      expect(screen.getByTestId('mockSolutionNavFooter')).toBeInTheDocument();
    });

    it('does not set footer when announcements are disabled', () => {
      setMockValues({
        notifications: { tours: { isEnabled: jest.fn(() => false) } },
        spaces: {
          ui: {
            components: {
              getSolutionViewSwitchCallout: MockFooter,
            },
          },
        },
      });

      renderTemplate({
        solutionNav: { items: [], name: 'Elasticsearch' },
      });

      expect(screen.queryByTestId('mockSolutionNavFooter')).not.toBeInTheDocument();
    });

    it('does not set footer when canManageSpaces is false', () => {
      setMockValues({
        notifications: { tours: { isEnabled: jest.fn(() => true) } },
        capabilities: { spaces: { manage: false } },
        spaces: {
          ui: {
            components: {
              getSolutionViewSwitchCallout: MockFooter,
            },
          },
        },
      });

      renderTemplate({
        solutionNav: { items: [], name: 'Elasticsearch' },
      });

      expect(screen.queryByTestId('mockSolutionNavFooter')).not.toBeInTheDocument();
    });
  });
});
