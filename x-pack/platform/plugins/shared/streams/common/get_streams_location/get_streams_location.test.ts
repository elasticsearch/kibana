/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getStreamsLocation } from './get_streams_location';

describe('getStreamsLocation', () => {
  it('returns root path when no params are provided', () => {
    expect(getStreamsLocation({})).toEqual({
      app: 'streams',
      path: '/',
    });
  });

  it('returns stream path when only name is provided', () => {
    expect(getStreamsLocation({ name: 'logs.nginx' })).toEqual({
      app: 'streams',
      path: '/logs.nginx',
    });
  });

  it('returns management tab path when name and managementTab are provided', () => {
    expect(getStreamsLocation({ name: 'logs.nginx', managementTab: 'significantEvents' })).toEqual({
      app: 'streams',
      path: '/logs.nginx/management/significantEvents',
    });
  });

  it('returns canvas management tab path', () => {
    expect(getStreamsLocation({ name: 'logs.nginx', managementTab: 'canvas' })).toEqual({
      app: 'streams',
      path: '/logs.nginx/management/canvas',
    });
  });
});
