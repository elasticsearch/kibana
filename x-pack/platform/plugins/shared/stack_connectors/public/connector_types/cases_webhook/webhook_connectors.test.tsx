/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import CasesWebhookActionConnectorFields from './webhook_connectors';
import { ConnectorFormTestProvider } from '../lib/test_utils';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthType } from '@kbn/connector-schemas/common/auth/constants';
import userEvent from '@testing-library/user-event';
import * as i18n from './translations';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useSecretHeaders } from '../../common/auth/use_secret_headers';

jest.mock('../../common/auth/use_secret_headers');

const useSecretHeadersMock = useSecretHeaders as jest.Mock;

jest.mock('@kbn/triggers-actions-ui-plugin/public', () => {
  const originalModule = jest.requireActual('@kbn/triggers-actions-ui-plugin/public');
  return {
    ...originalModule,
    useKibana: () => ({
      services: {
        docLinks: {
          ELASTIC_WEBSITE_URL: 'url',
          links: { alerting: { casesWebhookAction: 'url/cases-webhook' } },
        },
        notifications: {
          toasts: {
            addError: jest.fn(),
          },
        },
      },
    }),
  };
});

const customQueryProviderWrapper: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

const invalidJsonTitle = `{"fields":{"summary":"wrong","description":{{{case.description}}},"project":{"key":"ROC"},"issuetype":{"id":"10024"}}}`;
const invalidJsonBoth = `{"fields":{"summary":"wrong","description":"wrong","project":{"key":"ROC"},"issuetype":{"id":"10024"}}}`;
const config = {
  authType: AuthType.Basic,
  createCommentJson: '{"body":{{{case.comment}}}}',
  createCommentMethod: 'post',
  createCommentUrl: 'https://coolsite.net/rest/api/2/issue/{{{external.system.id}}}/comment',
  createIncidentJson:
    '{"fields":{"summary":{{{case.title}}},"description":{{{case.description}}},"project":{"key":"ROC"},"issuetype":{"id":"10024"}}}',
  createIncidentMethod: 'post',
  createIncidentResponseKey: 'id',
  createIncidentUrl: 'https://coolsite.net/rest/api/2/issue',
  getIncidentResponseExternalTitleKey: 'key',
  hasAuth: true,
  headers: [{ key: 'content-type', value: 'text' }],
  viewIncidentUrl: 'https://coolsite.net/browse/{{{external.system.title}}}',
  getIncidentUrl: 'https://coolsite.net/rest/api/2/issue/{{{external.system.id}}}',
  getIncidentMethod: 'get',
  updateIncidentJson:
    '{"fields":{"summary":{{{case.title}}},"description":{{{case.description}}},"project":{"key":"ROC"},"issuetype":{"id":"10024"}}}',
  updateIncidentMethod: 'put',
  updateIncidentUrl: 'https://coolsite.net/rest/api/2/issue/{{{external.system.id}}}',
};
const actionConnector = {
  secrets: {
    user: 'user',
    password: 'pass',
  },
  id: 'test',
  actionTypeId: '.cases-webhook',
  isDeprecated: false,
  isPreconfigured: false,
  name: 'cases webhook',
  config,
};

describe('CasesWebhookActionConnectorFields renders', () => {
  beforeEach(() => {
    useSecretHeadersMock.mockReturnValue({ isLoading: true, isFetching: false, data: [] });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('All inputs are properly rendered', async () => {
    useSecretHeadersMock.mockReturnValue({ isLoading: false, isFetching: false, data: [] });
    render(
      <ConnectorFormTestProvider connector={actionConnector}>
        <CasesWebhookActionConnectorFields
          readOnly={false}
          isEdit={false}
          registerPreSubmitValidator={() => {}}
        />
      </ConnectorFormTestProvider>,
      { wrapper: customQueryProviderWrapper }
    );

    // All steps mount in a single tree (toggled via CSS display), so wait once
    // for the form to settle, then assert synchronously.
    expect(await screen.findByTestId('authNone')).toBeInTheDocument();
    expect(screen.getByTestId('authBasic')).toBeInTheDocument();
    expect(screen.getByTestId('authSSL')).toBeInTheDocument();
    expect(screen.getByTestId('webhookUserInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookPasswordInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookHeadersKeyInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookHeadersValueInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookCreateMethodSelect')).toBeInTheDocument();
    expect(screen.getByTestId('webhookCreateUrlText')).toBeInTheDocument();
    expect(screen.getByTestId('webhookCreateIncidentJson')).toBeInTheDocument();
    expect(screen.getByTestId('createIncidentResponseKeyText')).toBeInTheDocument();
    expect(screen.getByTestId('getIncidentUrlInput')).toBeInTheDocument();
    expect(screen.getByTestId('getIncidentResponseExternalTitleKeyText')).toBeInTheDocument();
    expect(screen.getByTestId('viewIncidentUrlInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookUpdateMethodSelect')).toBeInTheDocument();
    expect(screen.getByTestId('updateIncidentUrlInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookUpdateIncidentJson')).toBeInTheDocument();
    expect(screen.getByTestId('webhookCreateCommentMethodSelect')).toBeInTheDocument();
    expect(screen.getByTestId('createCommentUrlInput')).toBeInTheDocument();
    expect(screen.getByTestId('webhookCreateCommentJson')).toBeInTheDocument();
    // Rendering the full 4-step form under parallel CI load can exceed jest's 5s default.
  }, 15000);

  it('Add comment to case section is rendered only when the toggle button is on', async () => {
    const incompleteActionConnector = {
      ...actionConnector,
      config: {
        ...actionConnector.config,
        createCommentUrl: undefined,
        createCommentJson: undefined,
      },
    };
    render(
      <ConnectorFormTestProvider connector={incompleteActionConnector}>
        <CasesWebhookActionConnectorFields
          readOnly={false}
          isEdit={false}
          registerPreSubmitValidator={() => {}}
        />
      </ConnectorFormTestProvider>,
      { wrapper: customQueryProviderWrapper }
    );

    await userEvent.click(await screen.findByTestId('webhookAddCommentToggle'));

    expect(await screen.findByTestId('webhookCreateCommentMethodSelect')).toBeInTheDocument();
    expect(await screen.findByTestId('createCommentUrlInput')).toBeInTheDocument();
    expect(await screen.findByTestId('webhookCreateCommentJson')).toBeInTheDocument();
  });

  it('Toggle button is active when create comment section fields are populated', async () => {
    render(
      <ConnectorFormTestProvider connector={actionConnector}>
        <CasesWebhookActionConnectorFields
          readOnly={false}
          isEdit={false}
          registerPreSubmitValidator={() => {}}
        />
      </ConnectorFormTestProvider>,
      { wrapper: customQueryProviderWrapper }
    );

    expect(await screen.findByTestId('webhookAddCommentToggle')).toHaveAttribute(
      'aria-checked',
      'true'
    );
  });

  it('connector auth toggles work as expected', async () => {
    render(
      <ConnectorFormTestProvider connector={actionConnector}>
        <CasesWebhookActionConnectorFields
          readOnly={false}
          isEdit={false}
          registerPreSubmitValidator={() => {}}
        />
      </ConnectorFormTestProvider>,
      { wrapper: customQueryProviderWrapper }
    );

    const authNoneToggle = await screen.findByTestId('authNone');

    expect(authNoneToggle).toBeInTheDocument();
    expect(await screen.findByTestId('authBasic')).toBeInTheDocument();
    expect(await screen.findByTestId('webhookUserInput')).toBeInTheDocument();
    expect(await screen.findByTestId('webhookPasswordInput')).toBeInTheDocument();

    await userEvent.click(authNoneToggle);

    expect(screen.queryByTestId('webhookUserInput')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webhookPasswordInput')).not.toBeInTheDocument();

    expect(await screen.findByTestId('webhookViewHeadersSwitch')).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await userEvent.click(await screen.findByTestId('webhookViewHeadersSwitch'));
    expect(await screen.findByTestId('webhookViewHeadersSwitch')).toHaveAttribute(
      'aria-checked',
      'false'
    );
    expect(screen.queryByTestId('webhookHeadersKeyInput')).not.toBeInTheDocument();
    expect(screen.queryByTestId('webhookHeadersValueInput')).not.toBeInTheDocument();
  });

  // FLAKY: https://github.com/elastic/kibana/issues/237095
  describe.skip('Step Validation', () => {
    it('Steps work correctly when all fields valid', async () => {
      render(
        <ConnectorFormTestProvider connector={actionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );
      expect(await screen.findByTestId('horizontalStep1-current')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('authStep')).toHaveAttribute('style', 'display: block;');
      expect(await screen.findByTestId('createStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('getStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('updateStep')).toHaveAttribute('style', 'display: none;');
      expect(screen.queryByTestId('casesWebhookBack')).not.toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep1-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-current')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('authStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('createStep')).toHaveAttribute('style', 'display: block;');
      expect(await screen.findByTestId('getStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('updateStep')).toHaveAttribute('style', 'display: none;');

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep1-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-current')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-incomplete')).toBeInTheDocument();
      expect(await screen.findByTestId('authStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('createStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('getStep')).toHaveAttribute('style', 'display: block;');
      expect(await screen.findByTestId('updateStep')).toHaveAttribute('style', 'display: none;');

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep1-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-current')).toBeInTheDocument();
      expect(await screen.findByTestId('authStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('createStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('getStep')).toHaveAttribute('style', 'display: none;');
      expect(await screen.findByTestId('updateStep')).toHaveAttribute('style', 'display: block;');
      expect(screen.queryByTestId('casesWebhookNext')).not.toBeInTheDocument();
    });

    it('Step 1 is properly validated', async () => {
      const incompleteActionConnector = {
        ...actionConnector,
        secrets: {
          user: '',
          password: '',
        },
      };
      render(
        <ConnectorFormTestProvider connector={incompleteActionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );

      expect(await screen.findByTestId('horizontalStep1-current')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep1-danger')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('authNone'));
      await userEvent.click(await screen.findByTestId('webhookViewHeadersSwitch'));
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep1-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-current')).toBeInTheDocument();
    });

    it('form submit works with valid headers', async () => {
      const customActionConnector = {
        ...actionConnector,
        secrets: {
          user: 'user',
          password: 'pass',
        },
        __internal__: {
          headers: [
            {
              key: 'configKey',
              value: 'configValue',
              type: 'config',
            },
            {
              key: 'secretKey',
              value: 'secretValue',
              type: 'secret',
            },
          ],
        },
      };
      render(
        <ConnectorFormTestProvider connector={customActionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );
      expect(await screen.findByTestId('horizontalStep1-current')).toBeInTheDocument();
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      expect(await screen.findByTestId('horizontalStep1-complete')).toBeInTheDocument();
    });

    it('marks step 1 as danger if the header fields are invalid', async () => {
      useSecretHeadersMock.mockReturnValue({ isLoading: false, isFetching: false, data: [] });

      const customActionConnector = {
        ...actionConnector,
        secrets: {
          user: 'user',
          password: 'pass',
        },
        __internal__: {
          headers: [
            {
              key: 'configKey',
              value: 'configValue',
              type: 'config',
            },
          ],
        },
      };
      render(
        <ConnectorFormTestProvider connector={customActionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );

      expect(await screen.findByTestId('webhookViewHeadersSwitch')).toHaveAttribute(
        'aria-checked',
        'true'
      );

      const keyInput = await screen.findByTestId('webhookHeadersKeyInput');
      expect(keyInput).toHaveValue('configKey');
      await userEvent.clear(keyInput);

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      expect(await screen.findByTestId('horizontalStep1-danger')).toBeInTheDocument();
    });

    it('Step 2 is properly validated', async () => {
      const incompleteActionConnector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          createIncidentUrl: undefined,
        },
      };
      render(
        <ConnectorFormTestProvider connector={incompleteActionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );
      expect(await screen.findByTestId('horizontalStep2-incomplete')).toBeInTheDocument();
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      expect(await screen.findByText(i18n.CREATE_URL_REQUIRED)).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep2-danger')).toBeInTheDocument();
      await userEvent.clear(await screen.findByTestId('webhookCreateUrlText'));
      await userEvent.type(
        await screen.findByTestId('webhookCreateUrlText'),
        config.createIncidentUrl,
        {
          delay: 10,
        }
      );

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep2-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-current')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('horizontalStep2-complete'));

      expect(await screen.findByTestId('horizontalStep2-current')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-incomplete')).toBeInTheDocument();
    });

    it('Step 3 is properly validated', async () => {
      const incompleteActionConnector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          getIncidentResponseExternalTitleKey: undefined,
        },
      };
      render(
        <ConnectorFormTestProvider connector={incompleteActionConnector}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>,
        { wrapper: customQueryProviderWrapper }
      );
      expect(await screen.findByTestId('horizontalStep2-incomplete')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));
      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(
        await screen.findByText(i18n.GET_RESPONSE_EXTERNAL_TITLE_KEY_REQUIRED)
      ).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep3-danger')).toBeInTheDocument();

      await userEvent.clear(await screen.findByTestId('getIncidentResponseExternalTitleKeyText'));
      await userEvent.type(
        await screen.findByTestId('getIncidentResponseExternalTitleKeyText'),
        config.getIncidentResponseExternalTitleKey,
        {
          delay: 10,
        }
      );

      await userEvent.click(await screen.findByTestId('casesWebhookNext'));

      expect(await screen.findByTestId('horizontalStep3-complete')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-current')).toBeInTheDocument();

      await userEvent.click(await screen.findByTestId('horizontalStep3-complete'));

      expect(await screen.findByTestId('horizontalStep3-current')).toBeInTheDocument();
      expect(await screen.findByTestId('horizontalStep4-incomplete')).toBeInTheDocument();
    });

    // step 4 is not validated like the others since it is the last step
    // this validation is tested in the main validation section
  });

  // FLAKY: https://github.com/elastic/kibana/issues/205731
  describe.skip('Validation', () => {
    const onSubmit = jest.fn();

    beforeEach(() => {
      jest.clearAllMocks();
    });

    const tests: Array<[string, string]> = [
      ['webhookCreateUrlText', 'not-valid'],
      ['webhookUserInput', ''],
      ['webhookPasswordInput', ''],
      ['viewIncidentUrlInput', 'https://missingexternalid.com'],
      ['createIncidentResponseKeyText', ''],
      ['getIncidentUrlInput', 'https://missingexternalid.com'],
      ['getIncidentResponseExternalTitleKeyText', ''],
      ['updateIncidentUrlInput', 'badurl.com'],
      ['createCommentUrlInput', 'badurl.com'],
    ];

    const mustacheTests: Array<[string, string, string[]]> = [
      ['createIncidentJson', invalidJsonTitle, ['{{{case.title}}}']],
      ['createIncidentJson', invalidJsonBoth, ['{{{case.title}}}', '{{{case.description}}}']],
      ['updateIncidentJson', invalidJsonTitle, ['{{{case.title}}}']],
      ['updateIncidentJson', invalidJsonBoth, ['{{{case.title}}}', '{{{case.description}}}']],
      ['createCommentJson', invalidJsonBoth, ['{{{case.comment}}}']],
      [
        'viewIncidentUrl',
        'https://missingexternalid.com',
        ['{{{external.system.id}}}', '{{{external.system.title}}}'],
      ],
      ['getIncidentUrl', 'https://missingexternalid.com', ['{{{external.system.id}}}']],
    ];

    it('connector validation succeeds when connector config is valid', async () => {
      render(
        <ConnectorFormTestProvider connector={actionConnector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));
      const { isPreconfigured, ...rest } = actionConnector;
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          data: {
            ...rest,
            __internal__: {
              hasCA: false,
              hasHeaders: true,
            },
          },
          isValid: true,
        })
      );
    });

    it('connector validation succeeds when auth=false', async () => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          hasAuth: false,
        },
      };

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));

      const { isPreconfigured, secrets, ...rest } = actionConnector;
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          data: {
            ...rest,
            config: {
              ...actionConnector.config,
              hasAuth: false,
              authType: null,
            },
            __internal__: {
              hasCA: false,
              hasHeaders: true,
            },
          },
          isValid: true,
        })
      );
    });

    it('connector validation succeeds without headers', async () => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          headers: null,
        },
      };

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));

      const { isPreconfigured, ...rest } = actionConnector;
      const { headers, ...rest2 } = actionConnector.config;
      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          data: {
            ...rest,
            config: rest2,
            __internal__: {
              hasCA: false,
              hasHeaders: false,
            },
          },
          isValid: true,
        })
      );
    });

    it('validates correctly if the method is empty', async () => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          createIncidentMethod: '',
        },
      };

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: {}, isValid: false }));
    });

    it.each(tests)('validates correctly %p', async (field, value) => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          headers: [],
        },
      };

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.clear(await screen.findByTestId(field));
      if (value !== '') {
        await userEvent.type(await screen.findByTestId(field), value, {
          delay: 10,
        });
      }

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: {}, isValid: false }));
    });

    it.each(mustacheTests)(
      'validates mustache field correctly %p',
      async (field, value, missingVariables) => {
        const connector = {
          ...actionConnector,
          config: {
            ...actionConnector.config,
            [field]: value,
            headers: [],
          },
        };

        render(
          <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
            <CasesWebhookActionConnectorFields
              readOnly={false}
              isEdit={false}
              registerPreSubmitValidator={() => {}}
            />
          </ConnectorFormTestProvider>
        );

        await userEvent.click(await screen.findByTestId('form-test-provide-submit'));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: {}, isValid: false }));
        expect(
          await screen.findByText(i18n.MISSING_VARIABLES(missingVariables))
        ).toBeInTheDocument();
      }
    );

    it('validates get incident json required correctly', async () => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          getIncidentUrl: 'https://coolsite.net/rest/api/2/issue',
          getIncidentMethod: 'post',
          headers: [],
        },
      };

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ data: {}, isValid: false }));
      expect(await screen.findByText(i18n.GET_INCIDENT_REQUIRED)).toBeInTheDocument();
    });

    it('validation succeeds get incident url with post correctly', async () => {
      const connector = {
        ...actionConnector,
        config: {
          ...actionConnector.config,
          getIncidentUrl: 'https://coolsite.net/rest/api/2/issue/{{{external.system.id}}}',
          getIncidentMethod: 'post',
          getIncidentJson: '{"id": {{{external.system.id}}} }',
          headers: [],
        },
      };

      const { isPreconfigured, ...rest } = actionConnector;
      const { headers, ...rest2 } = actionConnector.config;

      render(
        <ConnectorFormTestProvider connector={connector} onSubmit={onSubmit}>
          <CasesWebhookActionConnectorFields
            readOnly={false}
            isEdit={false}
            registerPreSubmitValidator={() => {}}
          />
        </ConnectorFormTestProvider>
      );

      await userEvent.click(await screen.findByTestId('form-test-provide-submit'));

      await waitFor(() =>
        expect(onSubmit).toHaveBeenCalledWith({
          data: {
            __internal__: {
              hasCA: false,
              hasHeaders: true,
            },
            ...rest,
            config: {
              ...rest2,
              getIncidentUrl: 'https://coolsite.net/rest/api/2/issue/{{{external.system.id}}}',
              getIncidentMethod: 'post',
              getIncidentJson: '{"id": {{{external.system.id}}} }',
            },
          },
          isValid: true,
        })
      );
    });
  });
});
