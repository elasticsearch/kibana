/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import { HeaderMenuPortal } from '@kbn/observability-shared-plugin/public';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import { act, screen, waitFor } from '@testing-library/react';
import React from 'react';
import Router from 'react-router-dom';
import { useFetchSloTemplates } from '../../hooks/use_fetch_slo_templates';
import { useFetchSloTemplateTags } from '../../hooks/use_fetch_slo_template_tags';
import { useHasSlos } from '../../hooks/use_has_slos';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { render } from '../../utils/test_helper';
import { SlosWelcomePage } from './slos_welcome';

const mockHistoryReplace = jest.fn();
const mockUseHistory = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
  useHistory: () => mockUseHistory(),
}));

jest.mock('@kbn/observability-shared-plugin/public');
jest.mock('../../hooks/use_kibana');
jest.mock('../../hooks/use_license');
jest.mock('../../hooks/use_has_slos');
jest.mock('../../hooks/use_permissions');
jest.mock('../../hooks/use_fetch_slo_templates');
jest.mock('../../hooks/use_fetch_slo_template_tags');
jest.mock('@elastic/eui-illustrations', () => ({
  monitoringLogs: {
    id: 'monitoringLogs',
    title: 'Monitoring logs',
    light: '<svg></svg>',
    dark: '<svg></svg>',
  },
}));

const HeaderMenuPortalMock = HeaderMenuPortal as jest.Mock;
HeaderMenuPortalMock.mockReturnValue(<div>Portal node</div>);

const useKibanaMock = useKibana as jest.Mock;
const useLicenseMock = useLicense as jest.Mock;
const useHasSlosMock = useHasSlos as jest.Mock;
const usePermissionsMock = usePermissions as jest.Mock;
const useFetchSloTemplatesMock = useFetchSloTemplates as jest.Mock;
const useFetchSloTemplateTagsMock = useFetchSloTemplateTags as jest.Mock;

const mockNavigate = jest.fn();

const mockObservabilityAIAssistant = observabilityAIAssistantPluginMock.createStartContract();

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    services: {
      application: { navigateToUrl: mockNavigate },
      theme: {},
      http: {
        basePath: {
          prepend: (url: string) => url,
        },
      },
      docLinks: {
        links: {
          query: {},
          observability: {
            slo: 'dummy_link',
          },
        },
      },
      inspector: { open: jest.fn() },
      uiSettings: { get: () => false },
      observabilityAIAssistant: mockObservabilityAIAssistant,
    },
  });
};

describe('SLOs Welcome Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHistoryReplace.mockClear();
    mockUseHistory.mockReturnValue({
      replace: mockHistoryReplace,
      createHref: (location: any) => {
        if (typeof location === 'string') return location;
        return location.pathname || '/';
      },
      location: { pathname: '/slos/welcome', search: '', hash: '', state: undefined },
    });
    mockKibana();
    useFetchSloTemplatesMock.mockReturnValue({
      data: { total: 0, page: 1, perPage: 20, results: [] },
      isLoading: false,
      isError: false,
    });
    useFetchSloTemplateTagsMock.mockReturnValue({
      data: { tags: [] },
      isLoading: false,
      isError: false,
    });
    jest
      .spyOn(Router, 'useLocation')
      .mockReturnValue({ pathname: '/slos/welcome', search: '', state: '', hash: '' });
  });

  describe('when the incorrect license is found', () => {
    it('renders the welcome message with subscription buttons', async () => {
      useHasSlosMock.mockReturnValue({ hasSlos: false, isLoading: false, isError: false });
      useLicenseMock.mockReturnValue({ hasAtLeast: () => false });
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: true,
          hasAllReadRequested: true,
        },
      });

      await act(async () => {
        render(<SlosWelcomePage />);
      });

      expect(screen.queryByTestId('sloWelcomePage')).toBeTruthy();
      expect(screen.queryByTestId('sloWelcomePageSignupForCloudButton')).toBeTruthy();
      expect(screen.queryByTestId('sloWelcomePageSignupForLicenseButton')).toBeTruthy();
    });
  });

  describe('when the correct license is found', () => {
    beforeEach(() => {
      useLicenseMock.mockReturnValue({ hasAtLeast: () => true });
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: true,
          hasAllReadRequested: true,
        },
      });
    });

    describe('when loading is done and no results are found', () => {
      beforeEach(() => {
        useHasSlosMock.mockReturnValue({ hasSlos: false, isLoading: false, isError: false });
      });

      it('disables the create slo button when no write capabilities', async () => {
        usePermissionsMock.mockReturnValue({
          isLoading: false,
          data: {
            hasAllWriteRequested: false,
            hasAllReadRequested: true,
          },
        });

        await act(async () => {
          render(<SlosWelcomePage />);
        });

        expect(screen.queryByTestId('sloWelcomePage')).toBeTruthy();

        const createNewSloButton = screen.queryByTestId('o11ySloListWelcomePromptCreateSloButton');

        expect(createNewSloButton).toBeDisabled();
        expect(
          screen.queryByTestId('o11ySloListWelcomePromptCreateFromTemplateButton')
        ).toBeDisabled();
      });

      it('disables the create slo button when no cluster permissions capabilities', async () => {
        usePermissionsMock.mockReturnValue({
          isLoading: false,
          data: {
            hasAllWriteRequested: false,
            hasAllReadRequested: true,
          },
        });

        await act(async () => {
          render(<SlosWelcomePage />);
        });
        expect(screen.queryByTestId('sloWelcomePage')).toBeTruthy();

        const createNewSloButton = screen.queryByTestId('o11ySloListWelcomePromptCreateSloButton');
        expect(createNewSloButton).toBeDisabled();
      });

      it('should display the welcome message with a Create new SLO button which should navigate to the SLO Creation page', async () => {
        usePermissionsMock.mockReturnValue({
          isLoading: false,
          data: {
            hasAllWriteRequested: true,
            hasAllReadRequested: true,
          },
        });

        await act(async () => {
          render(<SlosWelcomePage />);
        });
        expect(screen.queryByTestId('sloWelcomePage')).toBeTruthy();

        const createNewSloButton = screen.queryByTestId('o11ySloListWelcomePromptCreateSloButton');
        expect(createNewSloButton).toBeTruthy();

        await act(async () => {
          createNewSloButton?.click();
        });

        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith(paths.sloCreate);
        });
      });

      it('should display a Create from template button which should open the templates flyout', async () => {
        usePermissionsMock.mockReturnValue({
          isLoading: false,
          data: {
            hasAllWriteRequested: true,
            hasAllReadRequested: true,
          },
        });

        await act(async () => {
          render(<SlosWelcomePage />);
        });

        expect(screen.queryByTestId('sloTemplatesFlyout')).toBeFalsy();

        await act(async () => {
          screen.getByTestId('o11ySloListWelcomePromptCreateFromTemplateButton').click();
        });

        expect(screen.getByTestId('sloTemplatesFlyout')).toBeTruthy();
      });
    });

    describe('when loading is done and results are found', () => {
      beforeEach(() => {
        useHasSlosMock.mockReturnValue({ hasSlos: true, isLoading: false, isError: false });
        usePermissionsMock.mockReturnValue({
          isLoading: false,
          data: {
            hasAllWriteRequested: true,
            hasAllReadRequested: true,
          },
        });
      });

      it('should navigate to the SLO List page', async () => {
        await act(async () => {
          render(<SlosWelcomePage />);
        });
        await waitFor(() => {
          expect(mockHistoryReplace).toHaveBeenCalledWith('/');
        });
      });
    });
  });
});
