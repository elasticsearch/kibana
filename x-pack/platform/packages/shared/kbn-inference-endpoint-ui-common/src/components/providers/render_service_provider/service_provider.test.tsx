/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { ServiceProviderIcon, ServiceProviderName } from './service_provider';
import { ServiceProviderKeys } from '../../../constants';

describe('ServiceProviderIcon component', () => {
  it('renders Hugging Face icon and name when providerKey is hugging_face', () => {
    render(<ServiceProviderIcon providerKey={ServiceProviderKeys.hugging_face} />);
    const avatar = screen.getByTestId('icon-service-provider-hugging_face');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('aria-label', 'hugging_face');

    const icon = avatar.querySelector('[data-euiicon-type]');
    expect(icon).toBeInTheDocument();
  });

  it('renders Open AI icon when providerKey is openai', () => {
    render(<ServiceProviderIcon providerKey={ServiceProviderKeys.openai} />);

    const avatar = screen.getByTestId('icon-service-provider-openai');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('aria-label', 'openai');

    const icon = avatar.querySelector('[data-euiicon-type]');
    expect(icon).toBeInTheDocument();
  });

  it('renders Default icon when providerKey is not present in SERVICE_PROVIDERS', () => {
    render(<ServiceProviderIcon providerKey={'brand-new-provider' as ServiceProviderKeys} />);

    const avatar = screen.getByTestId('icon-service-provider-brand-new-provider');

    expect(avatar).toBeInTheDocument();
    expect(avatar).toHaveAttribute('aria-label', 'brand-new-provider');

    const icon = avatar.querySelector('[data-euiicon-type]');
    expect(icon).toBeInTheDocument();
  });
});

describe('ServiceProviderName component', () => {
  it('renders Hugging Face icon and name when providerKey is hugging_face', () => {
    render(<ServiceProviderName providerKey={ServiceProviderKeys.hugging_face} />);
    expect(screen.getByText('Hugging Face')).toBeInTheDocument();
  });

  it('renders Open AI icon and name when providerKey is openai', () => {
    render(<ServiceProviderName providerKey={ServiceProviderKeys.openai} />);
    expect(screen.getByText('OpenAI')).toBeInTheDocument();
  });

  it('renders new provider name when providerKey is not present in SERVICE_PROVIDERS', () => {
    render(<ServiceProviderName providerKey={'brand-new-provider' as ServiceProviderKeys} />);
    expect(screen.getByText('brand-new-provider')).toBeInTheDocument();
  });
});
