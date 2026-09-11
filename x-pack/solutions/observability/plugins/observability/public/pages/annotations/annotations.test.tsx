/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiThemeProvider as ThemeProvider } from '@elastic/eui';
import { APP_HEADER_TEST_SUBJECTS } from '@kbn/app-header';
import { MockAppHeaderProvider } from '@kbn/app-header/mocks';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import { AnnotationsPage } from './annotations';
const mockUseKibanaReturnValue = kibanaStartMock.startContract();
const onboardingHref = '/app/observabilityOnboarding';
const onboardingLocator = sharePluginMock.createLocator();
onboardingLocator.useUrl.mockReturnValue(onboardingHref);
jest
  .spyOn(mockUseKibanaReturnValue.services.share.url.locators, 'get')
  .mockReturnValue(onboardingLocator);

jest.mock('../../utils/kibana_react', () => ({
  __esModule: true,
  useKibana: jest.fn(() => mockUseKibanaReturnValue),
}));

jest.mock('@kbn/observability-shared-plugin/public', () => ({
  ...jest.requireActual('@kbn/observability-shared-plugin/public'),
  useBreadcrumbs: jest.fn(),
}));

jest.mock('../../hooks/use_plugin_context');
jest.mock('./annotations_privileges');
jest.mock('./annotations_list', () => ({
  AnnotationsList: () => <div data-test-subj="annotationsList" />,
}));

const { usePluginContext } = jest.requireMock('../../hooks/use_plugin_context');
const { useAnnotationsPrivileges } = jest.requireMock('./annotations_privileges');

function ObservabilityPageTemplate({
  children,
  'data-test-subj': dataTestSubj,
}: {
  children?: ReactNode;
  'data-test-subj'?: string;
}) {
  return <div data-test-subj={dataTestSubj}>{children}</div>;
}

function renderPage() {
  return render(
    <ThemeProvider>
      <IntlProvider locale="en">
        <MockAppHeaderProvider>
          <AnnotationsPage />
        </MockAppHeaderProvider>
      </IntlProvider>
    </ThemeProvider>
  );
}

describe('AnnotationsPage', () => {
  beforeEach(() => {
    usePluginContext.mockReturnValue({
      ObservabilityPageTemplate,
    });
    jest
      .spyOn(mockUseKibanaReturnValue.services.share.url.locators, 'get')
      .mockReturnValue(onboardingLocator);
    onboardingLocator.useUrl.mockReturnValue(onboardingHref);
  });

  it('renders the list when the user has privileges', () => {
    useAnnotationsPrivileges.mockReturnValue(null);

    renderPage();

    expect(screen.getByTestId('annotationsPage')).toBeInTheDocument();
    expect(screen.getByTestId('annotationsList')).toBeInTheDocument();
  });

  it('renders the title when privileges are missing', () => {
    useAnnotationsPrivileges.mockReturnValue(<div data-test-subj="privilegesPrompt" />);

    renderPage();

    expect(screen.getByTestId(APP_HEADER_TEST_SUBJECTS.title)).toHaveTextContent('Annotations');
    expect(screen.getByTestId('privilegesPrompt')).toBeInTheDocument();
    expect(screen.queryByTestId('annotationsList')).not.toBeInTheDocument();
  });
});
