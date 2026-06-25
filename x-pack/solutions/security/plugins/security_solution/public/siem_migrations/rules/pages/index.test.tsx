/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import hash from 'object-hash';
import { createMemoryHistory } from 'history';
import { render, screen, waitFor } from '@testing-library/react';
import { MigrationRulesPage, type MigrationRulesPageProps } from '.';
import * as useLatestStatsModule from '../service/hooks/use_latest_stats';
import * as useNavigationModule from '@kbn/security-solution-navigation/src/navigation';
import * as useGetIntegrationsModule from '../service/hooks/use_get_integrations';
import * as useGetMigrationRulesModule from '../logic/use_get_migration_rules';
import * as useGetMigrationTranslationStatsModule from '../logic/use_get_migration_translation_stats';
import * as useMissingPrivilegesModule from '../../../common/hooks/use_missing_privileges';
import * as useGetMigrationMissingPrivilegesModule from '../logic/use_get_migration_privileges';
import * as useCallOutStorageModule from '../../../common/components/callouts/use_callout_storage';
import { TestProviders } from '../../../common/mock';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';
import {
  mockedLatestStats,
  mockedLatestStatsEmpty,
  mockedMigrationResultsObj,
  mockedMigrationTranslationStats,
} from '../../common/mocks/migration_result.data';
import * as useGetMissingResourcesModule from '../../common/hooks/use_get_missing_resources';
import type { SiemMigrationsService } from '../../service';

jest.mock('../../../common/components/page_wrapper', () => {
  return {
    SecuritySolutionPageWrapper: jest.fn(({ children }) => {
      return <div data-test-subj="SecuritySolutionPageWrapper">{children}</div>;
    }),
  };
});

const useLatestStatsSpy = jest.spyOn(useLatestStatsModule, 'useLatestStats');
const useNavigationSpy = jest.spyOn(useNavigationModule, 'useNavigation');
const useGetIntegrationsSpy = jest.spyOn(useGetIntegrationsModule, 'useGetIntegrations');
const useInvalidateGetMigrationRulesSpy = jest.spyOn(
  useGetMigrationRulesModule,
  'useInvalidateGetMigrationRules'
);
const useInvalidateGetMigrationTranslationStatsSpy = jest.spyOn(
  useGetMigrationTranslationStatsModule,
  'useInvalidateGetMigrationTranslationStats'
);

const useGetMigrationRulesSpy = jest.spyOn(useGetMigrationRulesModule, 'useGetMigrationRules');
// missing detection privileges
const useMissingPrivilegesSpy = jest.spyOn(useMissingPrivilegesModule, 'useMissingPrivileges');
// missing migration privileges
const useGetMigrationMissingPrivilegesSpy = jest.spyOn(
  useGetMigrationMissingPrivilegesModule,
  'useGetMigrationMissingPrivileges'
);
const useCalloutStorageSpy = jest.spyOn(useCallOutStorageModule, 'useCallOutStorage');
const useGetMissingResourcesSpy = jest.spyOn(
  useGetMissingResourcesModule,
  'useGetMissingResources'
);
const useGetMigrationTranslationStatsSpy = jest.spyOn(
  useGetMigrationTranslationStatsModule,
  'useGetMigrationTranslationStats'
);

const defaultProps: MigrationRulesPageProps = {
  history: createMemoryHistory(),
  location: createMemoryHistory().location,
  match: {
    isExact: true,
    path: '',
    url: '',
    params: {
      migrationId: undefined,
    },
  },
};

const mockNavigateTo = jest.fn();
const mockGetIntegrations = jest.fn();

const mockMissingDetectionsPrivileges: useMissingPrivilegesModule.MissingPrivileges = {
  featurePrivileges: [],
  indexPrivileges: [],
};

const mockGetMigrationMissingPrivileges = {
  data: [],
};

const mockVisibleCallStorageResult = {
  isVisible: () => true,
  dismiss: jest.fn(),
  getVisibleMessageIds: jest.fn(() => []),
};

const mockHiddenCallStorageResult = {
  isVisible: () => false,
  dismiss: jest.fn(),
  getVisibleMessageIds: jest.fn(() => []),
};

const defaultStartServicesMock = createStartServicesMock();

const startServicesMock = {
  ...defaultStartServicesMock,
  siemMigrations: {
    ...defaultStartServicesMock.siemMigrations,
    rules: {
      ...defaultStartServicesMock.siemMigrations.rules,
      hasMissingCapabilities: jest.fn().mockReturnValue(false),
      getMissingCapabilities: jest.fn().mockReturnValue([]),
    },
  } as unknown as SiemMigrationsService,
};

const TestProviderWrapper: React.FC<React.PropsWithChildren<{}>> = ({ children }) => (
  <TestProviders startServices={startServicesMock}>{children}</TestProviders>
);

function renderTestComponent(args?: { migrationId?: string; wrapper?: React.ComponentType }) {
  const finalProps = {
    ...defaultProps,
    match: {
      ...defaultProps.match,
      params: {
        migrationId: args?.migrationId ?? defaultProps.match.params.migrationId,
      },
    },
  };
  return render(
    <TestProviderWrapper>
      <MigrationRulesPage {...finalProps} />
    </TestProviderWrapper>,
    {
      wrapper: args?.wrapper,
    }
  );
}

const mockUseMigrationRuleTransationStats: typeof useGetMigrationTranslationStatsModule.useGetMigrationTranslationStats =
  jest.fn((migrationId: string) => {
    const result = structuredClone(mockedMigrationTranslationStats)[migrationId];
    return {
      data: result,
      isLoading: false,
    } as unknown as ReturnType<
      typeof useGetMigrationTranslationStatsModule.useGetMigrationTranslationStats
    >;
  });

const mockUseGetMigrationRules: typeof useGetMigrationRulesModule.useGetMigrationRules = jest.fn(
  ({ migrationId }) => {
    const { data, total } = mockedMigrationResultsObj[migrationId];
    return {
      data: {
        migrationRules: data,
        total,
      },
      isLoading: false,
    } as unknown as ReturnType<typeof useGetMigrationRulesModule.useGetMigrationRules>;
  }
);

describe('Migrations: Translated Rules Page', () => {
  beforeEach(() => {
    useLatestStatsSpy.mockReturnValue(mockedLatestStatsEmpty);
    useNavigationSpy.mockReturnValue({ navigateTo: mockNavigateTo, getAppUrl: jest.fn() });
    useGetIntegrationsSpy.mockReturnValue({
      getIntegrations: mockGetIntegrations,
      isLoading: false,
      error: null,
    });
    useInvalidateGetMigrationTranslationStatsSpy.mockReturnValue(jest.fn());
    useInvalidateGetMigrationRulesSpy.mockReturnValue(jest.fn());
    useMissingPrivilegesSpy.mockReturnValue(mockMissingDetectionsPrivileges);
    useGetMigrationMissingPrivilegesSpy.mockReturnValue(
      mockGetMigrationMissingPrivileges as unknown as ReturnType<
        typeof useGetMigrationMissingPrivilegesModule.useGetMigrationMissingPrivileges
      >
    );
    useCalloutStorageSpy.mockReturnValue(mockHiddenCallStorageResult);
    useGetMigrationRulesSpy.mockImplementation(mockUseGetMigrationRules);
    useGetMissingResourcesSpy.mockReturnValue({
      getMissingResources: jest.fn(() => []),
      isLoading: false,
    } as unknown as ReturnType<typeof useGetMissingResourcesModule.useGetMissingResources>);

    useGetMigrationTranslationStatsSpy.mockImplementation(mockUseMigrationRuleTransationStats);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('With No MigrationId', () => {
    test('should render empty page when no translated rules are available', () => {
      renderTestComponent({
        wrapper: TestProviderWrapper,
      });

      expect(screen.getByTestId('siemMigrationsTranslatedRulesEmptyPageHeader')).toBeVisible();
      expect(screen.queryByTestId('siemMigrationsRulesTable')).toBeNull();
    });

    test('should render skeleton when loading', () => {
      useLatestStatsSpy.mockReturnValue({ ...mockedLatestStatsEmpty, isLoading: true });
      renderTestComponent();

      expect(screen.getByTestId('migrationRulesPageLoading')).toBeVisible();
    });

    test('should redirect to the most recent migration when no migrationId is provided and migrations exists', () => {
      useLatestStatsSpy.mockReturnValue(mockedLatestStats);
      renderTestComponent();

      expect(mockNavigateTo).toHaveBeenCalledWith({
        deepLinkId: 'siem_migrations-rules',
        path: '2',
      });
    });

    test('should render missing privileges panel', () => {
      const mockMissingPrivileges: useMissingPrivilegesModule.MissingPrivileges = {
        ...mockMissingDetectionsPrivileges,
        indexPrivileges: [['index', ['privilege1', 'privilege2']]],
      };

      useLatestStatsSpy.mockReturnValue(mockedLatestStats);
      useMissingPrivilegesSpy.mockReturnValue(mockMissingPrivileges);
      useCalloutStorageSpy.mockReturnValue(mockVisibleCallStorageResult);

      const missingPrivilegesHash = hash(mockMissingPrivileges);

      renderTestComponent({
        wrapper: TestProviderWrapper,
      });

      expect(useCalloutStorageSpy).toHaveBeenCalled();

      expect(
        screen.getByTestId(`callout-missing-siem-migrations-privileges-${missingPrivilegesHash}`)
      ).toBeVisible();

      expect(
        screen.getByTestId(`callout-missing-siem-migrations-privileges-${missingPrivilegesHash}`)
      ).toHaveTextContent(/Insufficient privileges/);
    });

    test('should render unknown migration state if no migrationId is provided', () => {
      useLatestStatsSpy.mockReturnValue(mockedLatestStats);
      renderTestComponent();
      expect(screen.getByTestId('siemMigrationsUnknown')).toBeVisible();
    });
  });

  describe('With MigrationId', () => {
    test('should render migration table successfully if migrationId is provided', async () => {
      useLatestStatsSpy.mockReturnValue(mockedLatestStats);
      renderTestComponent({
        migrationId: '1',
        wrapper: TestProviderWrapper,
      });

      await waitFor(() => {
        expect(screen.getByTestId('siemMigrationsRulesTable')).toBeVisible();
      });

      expect(screen.getAllByTestId(/ruleName/)).toHaveLength(2);
      expect(screen.getAllByTestId(/ruleName/)[0]).toHaveTextContent(/Converted Splunk Rule -/);
      // only successful is selectable
      expect(screen.getAllByLabelText(/Select row 1/)).toHaveLength(1);
      expect(screen.getByLabelText(/Not fully translated migration rule/)).toBeDisabled();
    });
  });
});
