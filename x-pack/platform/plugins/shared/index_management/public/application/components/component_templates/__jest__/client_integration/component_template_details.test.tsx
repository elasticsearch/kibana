/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { KibanaRenderContextProvider } from '@kbn/react-kibana-context-render';
import { coreMock } from '@kbn/core/public/mocks';

import { setupEnvironment, WithAppDependencies } from './helpers/setup_environment';
import type { ComponentTemplateDeserialized } from '../../shared_imports';
import { ComponentTemplateDetailsFlyoutContent } from '../../component_template_details';

// Services required for KibanaRenderContextProvider (provides i18n, theme, analytics)
const startServicesMock = {
  ...coreMock.createStart(),
  application: {
    ...coreMock.createStart().application,
    capabilities: {
      ...coreMock.createStart().application.capabilities,
      navLinks: {},
    },
  },
};

const COMPONENT_TEMPLATE: ComponentTemplateDeserialized = {
  name: 'comp-1',
  deprecated: true,
  template: {
    mappings: { properties: { ip_address: { type: 'ip' } } },
    aliases: { mydata: {} },
    settings: { number_of_shards: 1 },
    lifecycle: { enabled: true, data_retention: '4d' },
  },
  version: 1,
  _meta: { description: 'component template test' },
  _kbnMeta: { usedBy: ['template_1'], isManaged: false },
};

const COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS: ComponentTemplateDeserialized = {
  name: 'comp-base',
  template: {},
  _kbnMeta: { usedBy: [], isManaged: false },
};

const CUSTOM_COMPONENT_TEMPLATE = {
  name: 'test@custom',
};

describe('<ComponentTemplateDetails />', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  type FlyoutContentProps = ComponentProps<typeof ComponentTemplateDetailsFlyoutContent>;

  const renderComponentTemplateDetails = (props: FlyoutContentProps) => {
    const Comp = WithAppDependencies(ComponentTemplateDetailsFlyoutContent, httpSetup);
    return render(
      <KibanaRenderContextProvider {...startServicesMock}>
        <Comp {...props} />
      </KibanaRenderContextProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    const env = setupEnvironment();
    httpSetup = env.httpSetup;
    httpRequestsMockHelpers = env.httpRequestsMockHelpers;
  });

  describe('With component template details', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE.name,
        COMPONENT_TEMPLATE
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE.name,
        onClose: () => {},
      });

      await screen.findByTestId('title');
    });

    test('renders the details flyout', async () => {
      // Verify flyout exists with correct title
      expect(screen.getByTestId('title')).toHaveTextContent(COMPONENT_TEMPLATE.name);

      // Verify footer does not display since "actions" prop was not provided
      expect(screen.queryByTestId('footer')).not.toBeInTheDocument();

      // Verify the deprecated badge is displayed
      expect(screen.getByTestId('deprecatedComponentTemplateBadge')).toBeInTheDocument();

      // Verify tabs exist
      expect(screen.getByTestId('settingsTab')).toBeInTheDocument();
      expect(screen.getByTestId('mappingsTab')).toBeInTheDocument();
      expect(screen.getByTestId('aliasesTab')).toBeInTheDocument();
      // Summary tab should be active by default
      expect(screen.getByTestId('summaryTab')).toHaveAttribute('aria-selected', 'true');

      // [Summary tab] Verify description list items
      const summaryTabContent = screen.getByTestId('summaryTabContent');
      expect(within(summaryTabContent).getByTestId('usedByTitle')).toBeInTheDocument();
      expect(within(summaryTabContent).getByTestId('versionTitle')).toBeInTheDocument();
      expect(within(summaryTabContent).getByTestId('metaTitle')).toBeInTheDocument();
      expect(within(summaryTabContent).getByTestId('dataLifecycleTitle')).toBeInTheDocument();

      // [Settings tab] Navigate to tab and verify content
      fireEvent.click(screen.getByTestId('settingsTab'));
      await waitFor(() => {
        expect(screen.getByTestId('settingsTabContent')).toBeInTheDocument();
      });

      // [Mappings tab] Navigate to tab and verify content
      fireEvent.click(screen.getByTestId('mappingsTab'));
      await waitFor(() => {
        expect(screen.getByTestId('mappingsTabContent')).toBeInTheDocument();
      });

      // [Aliases tab] Navigate to tab and verify content
      fireEvent.click(screen.getByTestId('aliasesTab'));
      await waitFor(() => {
        expect(screen.getByTestId('aliasesTabContent')).toBeInTheDocument();
      });
    });
  });

  describe('With only required component template fields', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS.name,
        COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS.name,
        onClose: () => {},
      });

      await screen.findByTestId('title');
    });

    test('renders the details flyout', async () => {
      const summaryTabContent = screen.getByTestId('summaryTabContent');

      // [Summary tab] Verify optional description list items do not display
      expect(within(summaryTabContent).queryByTestId('usedByTitle')).not.toBeInTheDocument();
      expect(within(summaryTabContent).queryByTestId('versionTitle')).not.toBeInTheDocument();
      expect(within(summaryTabContent).queryByTestId('metaTitle')).not.toBeInTheDocument();
      // Verify callout renders indicating the component template is not in use
      expect(screen.getByTestId('notInUseCallout')).toBeInTheDocument();

      // [Settings tab] Navigate to tab and verify info callout
      fireEvent.click(screen.getByTestId('settingsTab'));
      await waitFor(() => {
        expect(screen.getByTestId('noSettingsCallout')).toBeInTheDocument();
      });

      // [Mappings tab] Navigate to tab and verify info callout
      fireEvent.click(screen.getByTestId('mappingsTab'));
      await waitFor(() => {
        expect(screen.getByTestId('noMappingsCallout')).toBeInTheDocument();
      });

      // [Aliases tab] Navigate to tab and verify info callout
      fireEvent.click(screen.getByTestId('aliasesTab'));
      await waitFor(() => {
        expect(screen.getByTestId('noAliasesCallout')).toBeInTheDocument();
      });
    });
  });

  describe('With actions', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE.name,
        COMPONENT_TEMPLATE
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE.name,
        onClose: () => {},
        actions: [
          {
            name: 'Test',
            icon: 'info',
            closePopoverOnClick: true,
            handleActionClick: () => {},
          },
        ],
      });

      await screen.findByTestId('title');
    });

    test('should render a footer with context menu', async () => {
      // Verify footer exists
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByTestId('manageComponentTemplateButton')).toBeInTheDocument();

      // Click manage button and verify actions
      fireEvent.click(screen.getByTestId('manageComponentTemplateButton'));

      await waitFor(() => {
        expect(screen.getByTestId('manageComponentTemplateContextMenu')).toBeInTheDocument();
      });

      const contextMenu = screen.getByTestId('manageComponentTemplateContextMenu');
      const actions = within(contextMenu).getAllByTestId('action');
      expect(actions).toHaveLength(1);
    });
  });

  describe('WHEN actions is an empty array', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE.name,
        COMPONENT_TEMPLATE
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE.name,
        onClose: () => {},
        actions: [],
      });

      await screen.findByTestId('title');
    });

    test('SHOULD not render the manage control while keeping the close footer', () => {
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByTestId('closeDetailsButton')).toBeInTheDocument();
      expect(screen.queryByTestId('manageComponentTemplateButton')).not.toBeInTheDocument();
    });
  });

  describe('WHEN summary call-to-action is disabled', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS.name,
        COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE_ONLY_REQUIRED_FIELDS.name,
        onClose: () => {},
        showSummaryCallToAction: false,
      });

      await screen.findByTestId('title');
    });

    test('SHOULD omit index-template links from the not-in-use summary callout', () => {
      const callout = screen.getByTestId('notInUseCallout');
      expect(within(callout).queryByRole('link', { name: 'Create' })).not.toBeInTheDocument();
      expect(within(callout).queryByRole('link', { name: 'update' })).not.toBeInTheDocument();
    });
  });

  describe('Error handling for @custom templates', () => {
    const error = {
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    };

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        encodeURIComponent(CUSTOM_COMPONENT_TEMPLATE.name),
        undefined,
        error
      );

      renderComponentTemplateDetails({
        componentTemplateName: CUSTOM_COMPONENT_TEMPLATE.name,
        onClose: () => {},
      });

      await screen.findByTestId('missingCustomComponentTemplate');
    });

    test('shows custom callout to create missing @custom template', () => {
      expect(screen.getByTestId('missingCustomComponentTemplate')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    const error = {
      statusCode: 500,
      error: 'Internal server error',
      message: 'Internal server error',
    };

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadComponentTemplateResponse(
        COMPONENT_TEMPLATE.name,
        undefined,
        error
      );

      renderComponentTemplateDetails({
        componentTemplateName: COMPONENT_TEMPLATE.name,
        onClose: () => {},
      });

      await screen.findByTestId('sectionError');
    });

    test('should render an error message if error fetching pipelines', () => {
      const errorElement = screen.getByTestId('sectionError');
      expect(errorElement).toBeInTheDocument();
      expect(errorElement).toHaveTextContent('Error loading component template');
    });
  });
});
