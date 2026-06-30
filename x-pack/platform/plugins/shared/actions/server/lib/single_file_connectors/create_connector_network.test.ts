/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createConnectorNetwork, AllowlistDeniedError } from './create_connector_network';
import type { ActionsConfigurationUtilities } from '../../actions_config';

describe('createConnectorNetwork', () => {
  const mockConfigUtils = {
    ensureUriAllowed: jest.fn(),
    ensureHostnameAllowed: jest.fn(),
  } as unknown as ActionsConfigurationUtilities;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an object with exactly ensureUriAllowed and ensureHostnameAllowed', () => {
    const network = createConnectorNetwork(mockConfigUtils);
    expect(Object.keys(network).sort()).toEqual(['ensureHostnameAllowed', 'ensureUriAllowed']);
  });

  it('delegates ensureUriAllowed to configUtils', () => {
    const network = createConnectorNetwork(mockConfigUtils);
    network.ensureUriAllowed('https://allowed.example.com');
    expect(mockConfigUtils.ensureUriAllowed).toHaveBeenCalledWith('https://allowed.example.com');
  });

  it('delegates ensureHostnameAllowed to configUtils', () => {
    const network = createConnectorNetwork(mockConfigUtils);
    network.ensureHostnameAllowed('allowed.example.com');
    expect(mockConfigUtils.ensureHostnameAllowed).toHaveBeenCalledWith('allowed.example.com');
  });

  it('wraps an ensureUriAllowed denial in AllowlistDeniedError, preserving message and cause', () => {
    const original = new Error('URI not allowed');
    (mockConfigUtils.ensureUriAllowed as jest.Mock).mockImplementation(() => {
      throw original;
    });
    const network = createConnectorNetwork(mockConfigUtils);

    const thrown = (() => {
      try {
        network.ensureUriAllowed('https://denied.example.com');
      } catch (e) {
        return e;
      }
    })();

    expect(thrown).toBeInstanceOf(AllowlistDeniedError);
    expect((thrown as Error).message).toBe('URI not allowed');
    expect((thrown as Error).cause).toBe(original);
  });

  it('wraps an ensureHostnameAllowed denial in AllowlistDeniedError', () => {
    (mockConfigUtils.ensureHostnameAllowed as jest.Mock).mockImplementation(() => {
      throw new Error('hostname not allowed');
    });
    const network = createConnectorNetwork(mockConfigUtils);

    expect(() => network.ensureHostnameAllowed('denied.example.com')).toThrow(AllowlistDeniedError);
    expect(() => network.ensureHostnameAllowed('denied.example.com')).toThrow(
      'hostname not allowed'
    );
  });
});
