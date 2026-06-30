/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from '@kbn/zod/v4';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { Form, useForm } from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { MultiOptionUnionWidget } from './multi_option_union_widget';
import { getMeta, setMeta, addMeta } from '@kbn/connector-specs/src/connector_spec_ui';

const meta = { getMeta, setMeta };

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <IntlProvider locale="en">{children}</IntlProvider>
);

const TestFormWrapper = ({
  children,
  defaultValue,
}: {
  children: React.ReactNode;
  defaultValue?: any;
}) => {
  const { form } = useForm({ defaultValue });
  return <Form form={form}>{children}</Form>;
};

describe('MultiOptionUnionWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic rendering', () => {
    it('should render all options as checkable cards', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      expect(screen.getByText('Authentication')).toBeDefined();
      expect(screen.getByText('Basic Auth')).toBeDefined();
      expect(screen.getByText('Bearer Token')).toBeDefined();
    });

    it('should render fieldset legend with correct title', () => {
      const option1 = z
        .object({
          type: z.literal('none'),
        })
        .meta({ label: 'None' });

      const schema = z.discriminatedUnion('type', [option1]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1]}
            fieldProps={{
              label: 'Select Authentication Method',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      expect(screen.getByText('Select Authentication Method')).toBeDefined();
    });
  });

  describe('default option selection', () => {
    it('should select first option by default when no defaultValue is provided', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const basicCard = screen.getByLabelText('Basic Auth', {
        selector: 'input',
      }) as HTMLInputElement;
      expect(basicCard.checked).toBe(true);

      expect(screen.getByLabelText('Username', { selector: 'input' })).toBeDefined();
    });

    it('should select option matching fieldConfig defaultValue', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              defaultValue: { type: 'bearer', token: 'my-token' },
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const bearerCard = screen.getByLabelText('Bearer Token', {
        selector: 'input',
      }) as HTMLInputElement;
      expect(bearerCard.checked).toBe(true);

      expect(screen.getByLabelText('Token', { selector: 'input' })).toBeDefined();
    });
  });

  describe('option switching', () => {
    it('should switch between options when clicking cards', async () => {
      const user = userEvent.setup();
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const basicCard = screen.getByLabelText('Basic Auth', {
        selector: 'input',
      }) as HTMLInputElement;
      expect(basicCard.checked).toBe(true);

      const bearerCard = screen.getByLabelText('Bearer Token', {
        selector: 'input',
      }) as HTMLInputElement;
      await user.click(bearerCard);

      expect(bearerCard.checked).toBe(true);

      await waitFor(() => {
        expect(screen.getByLabelText('Token', { selector: 'input' })).toBeDefined();
      });

      expect(screen.queryByLabelText('Username', { selector: 'input' })).toBeNull();
    });

    it('should show different fields when switching options', async () => {
      const user = userEvent.setup();
      const option1 = z.object({
        type: z.literal('none'),
      });

      const option2 = z.object({
        type: z.literal('apiKey'),
        key: z.string().meta({ label: 'API Key', sensitive: true }),
      });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      expect(screen.queryByLabelText('API Key')).toBeNull();

      const apiKeyCard = screen.getByTestId('form-generator-field-auth-apiKey');
      await user.click(apiKeyCard);

      await waitFor(() => {
        expect(screen.getByLabelText('API Key')).toBeDefined();
      });
    });
  });

  describe('disabled state', () => {
    it('should disable all cards when formConfig.disabled is true', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{ disabled: true }}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const basicCard = screen.getByLabelText('Basic Auth', {
        selector: 'input',
      }) as HTMLInputElement;
      const bearerCard = screen.getByLabelText('Bearer Token', {
        selector: 'input',
      }) as HTMLInputElement;

      expect(basicCard).toBeDisabled();
      expect(bearerCard).toBeDisabled();
    });

    it('should disable all cards when schema has disabled metadata', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]);
      addMeta(schema, { disabled: true });

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const basicCard = screen.getByLabelText('Basic Auth', {
        selector: 'input',
      }) as HTMLInputElement;
      const bearerCard = screen.getByLabelText('Bearer Token', {
        selector: 'input',
      }) as HTMLInputElement;

      expect(basicCard).toBeDisabled();
      expect(bearerCard).toBeDisabled();
    });

    it('should disable fields within selected option when parent is disabled', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const schema = z.discriminatedUnion('type', [option1]).meta({ disabled: true });

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const usernameInput = screen.getByLabelText('Username', {
        selector: 'input',
      }) as HTMLInputElement;
      expect(usernameInput).toBeDisabled();
    });

    it('should not disable option with explicit disabled: false even when parent is disabled', () => {
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z.string().meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth', disabled: false });

      const option2 = z
        .object({
          type: z.literal('bearer'),
          token: z.string().meta({ label: 'Token' }),
        })
        .meta({ label: 'Bearer Token' });

      const schema = z.discriminatedUnion('type', [option1, option2]).meta({ disabled: true });

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1, option2]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const basicCard = screen.getByLabelText('Basic Auth', {
        selector: 'input',
      }) as HTMLInputElement;
      const bearerCard = screen.getByLabelText('Bearer Token', {
        selector: 'input',
      }) as HTMLInputElement;

      expect(bearerCard).toBeDisabled();
      expect(basicCard).not.toBeDisabled();
    });
  });

  describe('field validation', () => {
    it('should validate fields within selected option', async () => {
      const user = userEvent.setup();
      const option1 = z
        .object({
          type: z.literal('basic'),
          username: z
            .string()
            .min(3, 'Username must be at least 3 characters')
            .meta({ label: 'Username' }),
        })
        .meta({ label: 'Basic Auth' });

      const schema = z.discriminatedUnion('type', [option1]);

      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={[option1]}
            fieldProps={{
              label: 'Authentication',
              euiFieldProps: {},
            }}
            fieldConfig={{
              validations: [{ validator: () => undefined }],
            }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );

      const usernameInput = screen.getByLabelText('Username', { selector: 'input' });
      await user.type(usernameInput, 'ab');
      await user.tab();

      expect(await screen.findByText('Username must be at least 3 characters')).toBeDefined();
    });
  });

  describe('badges', () => {
    const renderOptions = (options: Array<z.ZodObject<z.ZodRawShape>>) => {
      const schema = z.discriminatedUnion('type', options as any);
      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={options as any}
            fieldProps={{ label: 'Authentication', euiFieldProps: {} }}
            fieldConfig={{ validations: [{ validator: () => undefined }] }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );
    };

    it('renders a "Recommended" badge only for options flagged isRecommended', () => {
      const ears = z
        .object({ type: z.literal('ears'), token: z.string().meta({ label: 'Token' }) })
        .meta({ label: 'Quick Connect', isRecommended: true });
      const oauth = z
        .object({ type: z.literal('oauth'), clientId: z.string().meta({ label: 'Client ID' }) })
        .meta({ label: 'OAuth 2.0' });

      renderOptions([ears, oauth]);

      // Exactly one "Recommended" badge (on the ears card).
      expect(screen.getAllByText('Recommended')).toHaveLength(1);
    });

    it('renders authMode badges: per-user -> Personal credentials, shared -> Service account', () => {
      const perUser = z
        .object({ type: z.literal('oauth'), clientId: z.string().meta({ label: 'Client ID' }) })
        .meta({ label: 'OAuth 2.0', authMode: 'per-user' });
      const shared = z
        .object({ type: z.literal('client'), secret: z.string().meta({ label: 'Secret' }) })
        .meta({ label: 'Client Credentials', authMode: 'shared' });

      renderOptions([perUser, shared]);

      expect(screen.getByText('Personal credentials')).toBeInTheDocument();
      expect(screen.getByText('Service account')).toBeInTheDocument();
    });

    it('renders no badges when neither isRecommended nor authMode meta is present', () => {
      const a = z
        .object({ type: z.literal('a'), x: z.string().meta({ label: 'X' }) })
        .meta({ label: 'Option A' });
      const b = z
        .object({ type: z.literal('b'), y: z.string().meta({ label: 'Y' }) })
        .meta({ label: 'Option B' });

      renderOptions([a, b]);

      expect(screen.queryByText('Recommended')).toBeNull();
      expect(screen.queryByText('Personal credentials')).toBeNull();
      expect(screen.queryByText('Service account')).toBeNull();
    });
  });

  describe('legacy options', () => {
    const renderOptions = (
      options: Array<z.ZodObject<z.ZodRawShape>>,
      fieldConfig: Record<string, unknown> = {}
    ) => {
      const schema = z.discriminatedUnion('type', options as any);
      render(
        <TestFormWrapper>
          <MultiOptionUnionWidget
            meta={meta}
            formConfig={{}}
            path="auth"
            schema={schema}
            options={options as any}
            fieldProps={{ label: 'Authentication', euiFieldProps: {} }}
            fieldConfig={{ validations: [{ validator: () => undefined }], ...fieldConfig }}
            discriminatorKey="type"
          />
        </TestFormWrapper>,
        { wrapper }
      );
    };

    const ears = () =>
      z
        .object({ type: z.literal('ears'), token: z.string().meta({ label: 'Quick Token' }) })
        .meta({ label: 'Quick Connect' });
    const legacyBearer = () =>
      z
        .object({
          type: z.literal('bearer'),
          legacyToken: z.string().meta({ label: 'Legacy Token' }),
        })
        .meta({ label: 'Bearer (legacy)', isLegacy: true });

    it('does not render a legacy option that is not selected', () => {
      renderOptions([ears(), legacyBearer()]);

      expect(screen.getByText('Quick Connect')).toBeInTheDocument();
      expect(screen.queryByText('Bearer (legacy)')).toBeNull();
    });

    it('skips legacy options when picking the default (selects first non-legacy)', () => {
      // legacy option listed FIRST — default selection should still land on the non-legacy option
      renderOptions([legacyBearer(), ears()]);

      // ears is selected, so its field renders; the legacy option is not rendered at all
      expect(screen.getByLabelText('Quick Token', { selector: 'input' })).toBeInTheDocument();
      expect(screen.queryByText('Bearer (legacy)')).toBeNull();
    });

    it('renders a legacy option when it is the active selection (e.g. existing connector)', () => {
      renderOptions([ears(), legacyBearer()], {
        defaultValue: { type: 'bearer', legacyToken: 'existing' },
      });

      expect(screen.getByText('Bearer (legacy)')).toBeInTheDocument();
      expect(screen.getByLabelText('Legacy Token', { selector: 'input' })).toBeInTheDocument();
    });
  });

  it('should work with custom discriminator key names', () => {
    const option1 = z
      .object({
        authMethod: z.literal('basic'),
        username: z.string().meta({ label: 'Username' }),
      })
      .meta({ label: 'Basic Auth' });

    const option2 = z
      .object({
        authMethod: z.literal('bearer'),
        token: z.string().meta({ label: 'Token' }),
      })
      .meta({ label: 'Bearer Token' });

    const schema = z.discriminatedUnion('authMethod', [option1, option2]);

    render(
      <TestFormWrapper>
        <MultiOptionUnionWidget
          meta={meta}
          formConfig={{}}
          path="auth"
          schema={schema}
          options={[option1, option2]}
          fieldProps={{
            label: 'Authentication',
            euiFieldProps: {},
          }}
          fieldConfig={{
            validations: [{ validator: () => undefined }],
          }}
          discriminatorKey="authMethod"
        />
      </TestFormWrapper>,
      { wrapper }
    );

    expect(screen.getByText('Basic Auth')).toBeInTheDocument();
    expect(screen.getByText('Bearer Token')).toBeInTheDocument();
  });
});
