/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { coreMock } from '@kbn/core/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { I18nProvider } from '@kbn/i18n-react';
import type { ProductDocBasePluginStart } from '@kbn/product-doc-base-plugin/public';
import { ResourceTypes } from '@kbn/product-doc-common';
import { DocumentationSection } from './documentation_section';
import { enableProductDocumentationToolOnDefaultAgent } from './enable_product_documentation_tool_on_agent';

jest.mock('@kbn/react-kibana-mount', () => ({
  // In unit tests we don’t need a real MountPoint; returning the node allows us to assert on its contents.
  toMountPoint: (node: unknown) => node,
}));

jest.mock('./enable_product_documentation_tool_on_agent', () => ({
  enableProductDocumentationToolOnDefaultAgent: jest.fn().mockResolvedValue(undefined),
}));

const enableProductDocumentationToolOnDefaultAgentMock =
  enableProductDocumentationToolOnDefaultAgent as jest.Mock;

describe('DocumentationSection', () => {
  const coreStart = coreMock.createStart();

  const mockProductDocBase: ProductDocBasePluginStart = {
    installation: {
      getStatus: jest.fn().mockImplementation(({ resourceType }) => {
        if (resourceType === ResourceTypes.securityLabs) {
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            resourceType: ResourceTypes.securityLabs,
            status: 'uninstalled',
          });
        }
        return Promise.resolve({
          inferenceId: '.elser-2-elasticsearch',
          overall: 'uninstalled',
          perProducts: {},
        });
      }),
      install: jest.fn().mockResolvedValue({ installed: true }),
      uninstall: jest.fn().mockResolvedValue({ success: true }),
      getDefaultInferenceId: jest.fn().mockResolvedValue('.elser-2-elasticsearch'),
    },
  };

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

  const renderComponent = (
    productDocBase: ProductDocBasePluginStart = mockProductDocBase,
    hasManagePrivilege: boolean = true
  ) => {
    const queryClient = createQueryClient();
    // Set capabilities directly on the mock before rendering
    (coreStart.application.capabilities as Record<string, Record<string, boolean>>).agentBuilder = {
      show: true,
      manageAgents: hasManagePrivilege,
    };
    return render(
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <KibanaContextProvider services={coreStart}>
            <DocumentationSection productDocBase={productDocBase} />
          </KibanaContextProvider>
        </I18nProvider>
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    enableProductDocumentationToolOnDefaultAgentMock.mockResolvedValue(undefined);
    mockProductDocBase.installation.install = jest.fn().mockResolvedValue({ installed: true });
    mockProductDocBase.installation.uninstall = jest.fn().mockResolvedValue({ success: true });
    mockProductDocBase.installation.getStatus = jest.fn().mockImplementation(({ resourceType }) => {
      if (resourceType === ResourceTypes.securityLabs) {
        return Promise.resolve({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.securityLabs,
          status: 'uninstalled',
        });
      }
      return Promise.resolve({
        inferenceId: '.elser-2-elasticsearch',
        overall: 'uninstalled',
        perProducts: {},
      });
    });
  });

  describe('rendering', () => {
    it('should render the documentation section', async () => {
      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getByTestId('documentationSection')).toBeInTheDocument();
        expect(screen.getByTestId('documentationTitle')).toBeInTheDocument();
        expect(screen.getByTestId('documentationTable')).toBeInTheDocument();
      });
    });

    it('should render a "Learn more" link in the description', async () => {
      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
          'href',
          coreStart.docLinks.links.aiAssistantSettings
        );
      });
    });

    it('should render all documentation items', async () => {
      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getByText('Elastic documentation')).toBeInTheDocument();
        expect(screen.getByText('Security labs')).toBeInTheDocument();
      });
    });
  });

  describe('status display', () => {
    it('should show "Not installed" status when uninstalled', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase);

      await waitFor(() => {
        const notInstalledBadges = screen.getAllByText('Not installed');
        expect(notInstalledBadges.length).toBeGreaterThan(0);
      });
    });

    it('should show "Installed" status when installed', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getAllByText('Installed').length).toBeGreaterThan(0);
      });
    });
  });

  describe('actions', () => {
    it('should show install action for uninstalled items', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-elastic_documents')).toBeInTheDocument();
        expect(screen.getByTestId('documentation-install-security_labs')).toBeInTheDocument();
      });
    });

    it('should show uninstall action for installed items', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-uninstall-elastic_documents')).toBeInTheDocument();
        expect(screen.getByTestId('documentation-uninstall-security_labs')).toBeInTheDocument();
      });
    });

    it('should call install when install action is clicked', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-elastic_documents')).toBeInTheDocument();
      });

      const initialCalls = (mockProductDocBase.installation.getStatus as jest.Mock).mock.calls
        .length;
      fireEvent.click(screen.getByTestId('documentation-install-elastic_documents'));

      await waitFor(() => {
        expect(mockProductDocBase.installation.install).toHaveBeenCalledWith({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.productDoc,
        });
      });

      // Regression: successful install should invalidate/refetch status without requiring a page refresh.
      await waitFor(() => {
        const calls = (mockProductDocBase.installation.getStatus as jest.Mock).mock.calls.length;
        expect(calls).toBeGreaterThan(initialCalls);
      });

      await waitFor(() => {
        expect(enableProductDocumentationToolOnDefaultAgentMock).toHaveBeenCalledTimes(1);
      });
    });

    it('should show a helpful toast (air-gapped hint + docs link) when install fails', async () => {
      mockProductDocBase.installation.getStatus = jest.fn().mockResolvedValue({
        inferenceId: '.elser-2-elasticsearch',
        overall: 'uninstalled',
        perProducts: {},
      });
      mockProductDocBase.installation.install = jest.fn().mockRejectedValue(new Error('boom'));

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-elastic_documents')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-install-elastic_documents'));

      await waitFor(() => {
        expect(coreStart.notifications.toasts.addDanger).toHaveBeenCalled();
      });

      const toastArg = (coreStart.notifications.toasts.addDanger as jest.Mock).mock.calls[0][0];
      expect(toastArg.title).toBe('Failed to install Elastic documentation');

      // toMountPoint is mocked to return a React node, so we can assert on its contents.
      const { container } = render(<>{toastArg.text}</>);
      const toast = within(container);
      expect(
        toast.getByText(
          'If your environment has no internet access, you can host these artifacts yourself.'
        )
      ).toBeInTheDocument();
      expect(toast.getByRole('link', { name: /Learn more/ })).toHaveAttribute(
        'href',
        coreStart.docLinks.links.aiAssistantSettings
      );
    });

    it('should call install for Security Labs when install action is clicked', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-security_labs')).toBeInTheDocument();
      });

      enableProductDocumentationToolOnDefaultAgentMock.mockClear();
      fireEvent.click(screen.getByTestId('documentation-install-security_labs'));

      await waitFor(() => {
        expect(mockProductDocBase.installation.install).toHaveBeenCalledWith({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.securityLabs,
        });
      });

      await waitFor(() => {
        expect(enableProductDocumentationToolOnDefaultAgentMock).toHaveBeenCalled();
      });
    });

    it('keeps both rows in an installing UI state for back-to-back install clicks', async () => {
      // Make installs never resolve so the mutation stays "loading"
      const never = new Promise(() => {});
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });
      mockProductDocBase.installation.install = jest.fn().mockReturnValue(never as any);

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-elastic_documents')).toBeInTheDocument();
        expect(screen.getByTestId('documentation-install-security_labs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-install-elastic_documents'));
      fireEvent.click(screen.getByTestId('documentation-install-security_labs'));

      await waitFor(() => {
        expect(
          screen.getByTestId('documentation-installing-elastic_documents')
        ).toBeInTheDocument();
        expect(screen.getByTestId('documentation-installing-security_labs')).toBeInTheDocument();
      });
    });

    it('should show update action when Security Labs has an update available and call install on click', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
              isUpdateAvailable: true,
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-update-security_labs')).toBeInTheDocument();
        expect(screen.getByTestId('documentation-uninstall-security_labs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-update-security_labs'));

      await waitFor(() => {
        expect(mockProductDocBase.installation.install).toHaveBeenCalledWith({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.securityLabs,
        });
      });
    });

    it('should call uninstall when uninstall action is clicked', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-uninstall-elastic_documents')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-uninstall-elastic_documents'));

      await waitFor(() => {
        expect(mockProductDocBase.installation.uninstall).toHaveBeenCalledWith({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.productDoc,
        });
      });
    });

    it('should call uninstall for Security Labs when uninstall action is clicked', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-uninstall-security_labs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-uninstall-security_labs'));

      await waitFor(() => {
        expect(mockProductDocBase.installation.uninstall).toHaveBeenCalledWith({
          inferenceId: '.elser-2-elasticsearch',
          resourceType: ResourceTypes.securityLabs,
        });
      });
    });

    it('keeps both rows in an uninstalling UI state for back-to-back uninstall clicks', async () => {
      // Make uninstalls never resolve so the mutation stays "loading"
      const never = new Promise(() => {});
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });
      mockProductDocBase.installation.uninstall = jest.fn().mockReturnValue(never as any);

      renderComponent(mockProductDocBase, true);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-uninstall-elastic_documents')).toBeInTheDocument();
        expect(screen.getByTestId('documentation-uninstall-security_labs')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-uninstall-elastic_documents'));
      fireEvent.click(screen.getByTestId('documentation-uninstall-security_labs'));

      await waitFor(() => {
        expect(
          screen.getByTestId('documentation-uninstalling-elastic_documents')
        ).toBeInTheDocument();
        expect(screen.getByTestId('documentation-uninstalling-security_labs')).toBeInTheDocument();
      });
    });
  });

  describe('RBAC - insufficient privileges', () => {
    it('should disable install button when user lacks manage privilege', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'uninstalled',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'uninstalled',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, false);

      await waitFor(() => {
        const installButton = screen.getByTestId('documentation-install-elastic_documents');
        expect(installButton).toBeInTheDocument();
        expect(installButton).toBeDisabled();
      });
    });

    it('should disable uninstall button when user lacks manage privilege', async () => {
      mockProductDocBase.installation.getStatus = jest
        .fn()
        .mockImplementation(({ resourceType }) => {
          if (resourceType === ResourceTypes.securityLabs) {
            return Promise.resolve({
              inferenceId: '.elser-2-elasticsearch',
              resourceType: ResourceTypes.securityLabs,
              status: 'installed',
            });
          }
          return Promise.resolve({
            inferenceId: '.elser-2-elasticsearch',
            overall: 'installed',
            perProducts: {},
          });
        });

      renderComponent(mockProductDocBase, false);

      await waitFor(() => {
        const uninstallButton = screen.getByTestId('documentation-uninstall-elastic_documents');
        expect(uninstallButton).toBeInTheDocument();
        expect(uninstallButton).toBeDisabled();
      });
    });

    it('should not call install when install button is clicked without privilege', async () => {
      mockProductDocBase.installation.getStatus = jest.fn().mockResolvedValue({
        inferenceId: '.elser-2-elasticsearch',
        overall: 'uninstalled',
        perProducts: {},
      });

      renderComponent(mockProductDocBase, false);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-install-elastic_documents')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-install-elastic_documents'));

      // Wait a bit to ensure no call was made
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockProductDocBase.installation.install).not.toHaveBeenCalled();
    });

    it('should not call uninstall when uninstall button is clicked without privilege', async () => {
      mockProductDocBase.installation.getStatus = jest.fn().mockResolvedValue({
        inferenceId: '.elser-2-elasticsearch',
        overall: 'installed',
        perProducts: {},
      });

      renderComponent(mockProductDocBase, false);

      await waitFor(() => {
        expect(screen.getByTestId('documentation-uninstall-elastic_documents')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('documentation-uninstall-elastic_documents'));

      // Wait a bit to ensure no call was made
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockProductDocBase.installation.uninstall).not.toHaveBeenCalled();
    });
  });
});
