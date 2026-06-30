/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { EuiProvider } from '@elastic/eui';

import { EditPackPage } from '.';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ packId: 'test-pack-id' }),
}));

const mockUseKibana = jest.fn();
jest.mock('../../../common/lib/kibana', () => ({
  ...jest.requireActual('../../../common/lib/kibana'),
  useRouterNavigate: (path: string) => ({ onClick: jest.fn(), href: path }),
  useKibana: () => mockUseKibana(),
}));

jest.mock('../../../common/hooks/use_breadcrumbs', () => ({
  useBreadcrumbs: jest.fn(),
}));

const mockUseIsExperimentalFeatureEnabled = jest.fn();
jest.mock('../../../common/experimental_features_context', () => ({
  ...jest.requireActual('../../../common/experimental_features_context'),
  useIsExperimentalFeatureEnabled: (feature: string) =>
    mockUseIsExperimentalFeatureEnabled(feature),
}));

let capturedOnDirtyStateChange: ((isDirty: boolean) => void) | undefined;
let capturedIsReadOnly: boolean | undefined;
let capturedIsPrebuilt: boolean | undefined;

jest.mock('../../../packs/form', () => ({
  PackForm: ({
    onDirtyStateChange,
    isReadOnly,
    isPrebuilt,
  }: {
    onDirtyStateChange?: (isDirty: boolean) => void;
    isReadOnly?: boolean;
    isPrebuilt?: boolean;
  }) => {
    capturedOnDirtyStateChange = onDirtyStateChange;
    capturedIsReadOnly = isReadOnly;
    capturedIsPrebuilt = isPrebuilt;

    return <div data-testid="pack-form">Mock PackForm</div>;
  },
}));

const mockUsePack = jest.fn();
jest.mock('../../../packs/use_pack', () => ({
  usePack: (args: unknown) => mockUsePack(args),
}));

const mockDeleteMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseDeletePack = jest.fn();
jest.mock('../../../packs/use_delete_pack', () => ({
  useDeletePack: (args: unknown) => mockUseDeletePack(args),
}));

const mockCopyMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseCopyPack = jest.fn();
jest.mock('../../../packs/use_copy_pack', () => ({
  useCopyPack: (args: unknown) => mockUseCopyPack(args),
}));

jest.mock('../../../components/layouts', () => ({
  WithHeaderLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="with-header-layout">{children}</div>
  ),
  fullWidthFormContentCss: {},
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, cacheTime: 0 },
      mutations: { retry: false },
    },
  });

const mockPackData = {
  id: 'test-pack-id',
  saved_object_id: 'test-pack-id',
  name: 'Test Pack',
  description: 'A test pack',
  enabled: true,
  queries: {},
  created_at: '2024-01-01',
  created_by: 'test-user',
  updated_at: '2024-01-01',
  updated_by: 'test-user',
  policy_ids: [],
  references: [],
  read_only: false,
};

const renderPage = () => {
  capturedOnDirtyStateChange = undefined;

  return render(
    <EuiProvider>
      <IntlProvider locale="en">
        <QueryClientProvider client={createTestQueryClient()}>
          <EditPackPage />
        </QueryClientProvider>
      </IntlProvider>
    </EuiProvider>
  );
};

const setPermissions = (osquery: Record<string, boolean>) => {
  mockUseKibana.mockReturnValue({
    services: { application: { capabilities: { osquery } } },
  });
};

const setupDefaultMocks = () => {
  mockUseIsExperimentalFeatureEnabled.mockReturnValue(true);
  mockUsePack.mockReturnValue({ isLoading: false, data: mockPackData, error: null });
  mockUseDeletePack.mockReturnValue({ mutateAsync: mockDeleteMutateAsync, isLoading: false });
  mockUseCopyPack.mockReturnValue({ mutateAsync: mockCopyMutateAsync, isLoading: false });
  setPermissions({ readPacks: true, writePacks: true });
};

describe('EditPackPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnDirtyStateChange = undefined;
    capturedIsReadOnly = undefined;
    capturedIsPrebuilt = undefined;
    setupDefaultMocks();
  });

  describe('duplicate confirmation modal', () => {
    it('shows the confirmation modal when form is dirty and user clicks Duplicate pack', () => {
      renderPage();

      act(() => {
        capturedOnDirtyStateChange?.(true);
      });

      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Your unsaved changes will be lost. The duplicate will be based on the last saved version of this pack.'
        )
      ).toBeInTheDocument();
    });

    it('does not show the confirmation modal when form is clean and user clicks Duplicate pack', () => {
      renderPage();

      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    });

    it('calls copy mutation directly without modal when form is clean', () => {
      renderPage();

      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(mockCopyMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('does not call copy mutation immediately when form is dirty', () => {
      renderPage();

      act(() => {
        capturedOnDirtyStateChange?.(true);
      });
      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(mockCopyMutateAsync).not.toHaveBeenCalled();
    });

    it('closes the modal without calling the mutation when Cancel is clicked', () => {
      renderPage();

      act(() => {
        capturedOnDirtyStateChange?.(true);
      });
      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Cancel'));

      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
      expect(mockCopyMutateAsync).not.toHaveBeenCalled();
    });

    it('calls the copy mutation and closes the modal when Duplicate is clicked in the modal', () => {
      renderPage();

      act(() => {
        capturedOnDirtyStateChange?.(true);
      });
      fireEvent.click(screen.getByText('Duplicate pack'));

      fireEvent.click(screen.getByText('Duplicate'));

      expect(mockCopyMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    });

    it('does not render the Duplicate pack button when queryHistoryRework feature flag is disabled', () => {
      mockUseIsExperimentalFeatureEnabled.mockReturnValue(false);

      renderPage();

      expect(screen.queryByText('Duplicate pack')).not.toBeInTheDocument();
    });
  });

  describe('back navigation', () => {
    it('renders a "View all packs" back link that targets the packs list', () => {
      renderPage();

      const backLink = screen.getByText('View all packs').closest('a');
      expect(backLink).toHaveAttribute('href', 'packs');
    });
  });

  describe('read-only access (readPacks without writePacks)', () => {
    beforeEach(() => {
      setPermissions({ readPacks: true, writePacks: false });
    });

    it('renders the page (does not block readPacks-only users)', () => {
      renderPage();

      expect(screen.getByText('Mock PackForm')).toBeInTheDocument();
    });

    it('passes isReadOnly to the PackForm', () => {
      renderPage();

      expect(capturedIsReadOnly).toBe(true);
    });

    it('hides the Delete and Duplicate write actions', () => {
      renderPage();

      expect(screen.queryByText('Delete pack')).not.toBeInTheDocument();
      expect(screen.queryByText('Duplicate pack')).not.toBeInTheDocument();
    });

    it('shows the read-only access callout', () => {
      renderPage();

      expect(
        screen.getByText(
          'You have read-only access to packs. You can view this pack but cannot make changes.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('write access (writePacks)', () => {
    it('does not pass isReadOnly to the PackForm for an editable pack', () => {
      renderPage();

      expect(capturedIsReadOnly).toBe(false);
    });

    it('does not flag an editable pack as prebuilt', () => {
      renderPage();

      expect(capturedIsPrebuilt).toBe(false);
    });

    it('renders the Delete and Duplicate write actions', () => {
      renderPage();

      expect(screen.getByText('Delete pack')).toBeInTheDocument();
      expect(screen.getByText('Duplicate pack')).toBeInTheDocument();
    });
  });

  describe('prebuilt pack with write access (read_only pack, writePacks)', () => {
    beforeEach(() => {
      mockUsePack.mockReturnValue({
        isLoading: false,
        data: { ...mockPackData, read_only: true },
        error: null,
      });
      setPermissions({ readPacks: true, writePacks: true });
    });

    it('passes isPrebuilt but not isReadOnly to the PackForm', () => {
      renderPage();

      // A writePacks user editing a prebuilt pack may still re-target its
      // scheduled agent policies, so the form is not fully read-only.
      expect(capturedIsReadOnly).toBe(false);
      expect(capturedIsPrebuilt).toBe(true);
    });

    it('shows the prebuilt callout, not the read-only access callout', () => {
      renderPage();

      expect(
        screen.getByText(
          'This is a prebuilt Elastic pack. You can modify the scheduled agent policies, but you cannot edit queries in the pack.'
        )
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'You have read-only access to packs. You can view this pack but cannot make changes.'
        )
      ).not.toBeInTheDocument();
    });
  });

  describe('dirty state tracking', () => {
    it('transitions from clean to dirty when onDirtyStateChange is called with true', () => {
      renderPage();

      fireEvent.click(screen.getByText('Duplicate pack'));
      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();

      act(() => {
        capturedOnDirtyStateChange?.(true);
      });
      fireEvent.click(screen.getByText('Duplicate pack'));
      expect(screen.getByText('You have unsaved changes')).toBeInTheDocument();
    });

    it('transitions back to clean when onDirtyStateChange is called with false', () => {
      renderPage();

      act(() => {
        capturedOnDirtyStateChange?.(true);
        capturedOnDirtyStateChange?.(false);
      });

      fireEvent.click(screen.getByText('Duplicate pack'));

      expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
      expect(mockCopyMutateAsync).toHaveBeenCalledTimes(1);
    });
  });
});
