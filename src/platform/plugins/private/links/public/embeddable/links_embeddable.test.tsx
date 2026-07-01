/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiThemeProvider } from '@elastic/eui';
import { getLinksEmbeddableFactory } from './links_embeddable';
import type { LinksEmbeddableState } from '../../common';
import { LINKS_EMBEDDABLE_TYPE } from '../../common';
import type { Link } from '../../server';
import type { LinksApi, ResolvedLink } from '../types';
import { linksClient } from '../links_client';
import { getMockLinksParentApi } from '../mocks';

const getLinks = (): Link[] => [
  {
    type: 'dashboardLink',
    label: '',
    destination: '999',
    options: { open_in_new_tab: false, use_time_range: false, use_filters: false },
  },
  {
    type: 'dashboardLink',
    label: 'Dashboard 2',
    destination: '888',
    options: { open_in_new_tab: false, use_time_range: false, use_filters: false },
  },
  {
    type: 'externalLink',
    label: 'Example homepage',
    destination: 'https://example.com',
    options: { open_in_new_tab: false, encode_url: true },
  },
  {
    type: 'externalLink',
    destination: 'https://elastic.co',
    options: { open_in_new_tab: true, encode_url: false },
  },
];

const getResolvedLinks: () => ResolvedLink[] = () => [
  {
    id: '001',
    type: 'dashboardLink',
    label: '',
    destination: '999',
    title: 'Dashboard 1',
    description: 'Dashboard 1 description',
    options: { open_in_new_tab: false, use_time_range: false, use_filters: false },
  },
  {
    id: '002',
    type: 'dashboardLink',
    label: 'Dashboard 2',
    destination: '888',
    title: 'Dashboard 2',
    description: 'Dashboard 2 description',
    options: { open_in_new_tab: false, use_time_range: false, use_filters: false },
  },
  {
    id: '003',
    type: 'externalLink',
    label: 'Example homepage',
    destination: 'https://example.com',
    title: 'Example homepage',
    options: { open_in_new_tab: false, encode_url: true },
  },
  {
    id: '004',
    type: 'externalLink',
    destination: 'https://elastic.co',
    title: 'https://elastic.co',
    options: { open_in_new_tab: true, encode_url: false },
  },
];

jest.mock('../lib/resolve_links', () => {
  return {
    ...jest.requireActual('../lib/resolve_links'),
    resolveLinks: jest.fn().mockResolvedValue(getResolvedLinks()),
  };
});

jest.mock('../links_client', () => {
  return {
    linksClient: {
      create: jest.fn().mockResolvedValue({ id: '333' }),
      update: jest.fn().mockResolvedValue({ id: '123' }),
    },
  };
});

jest.mock('../links_client/load_from_library', () => {
  return {
    loadFromLibrary: jest.fn((refId) => {
      return Promise.resolve({
        title: 'links 001',
        description: 'some links',
        links: getLinks(),
        layout: 'vertical',
      });
    }),
  };
});

async function buildLinksEmbeddable(state: LinksEmbeddableState) {
  const factory = getLinksEmbeddableFactory();
  const parentApi = getMockLinksParentApi(state);
  const uuid = '1234';
  return await factory.buildEmbeddable({
    initializeDrilldownsManager: jest.fn(),
    initialState: state,
    finalizeApi: (api) => {
      return {
        ...api,
        uuid,
        parentApi,
        type: LINKS_EMBEDDABLE_TYPE,
      } as LinksApi;
    },
    parentApi,
    uuid,
  });
}

describe('getLinksEmbeddableFactory', () => {
  describe('anyStateChange$', () => {
    let embeddableApi: LinksApi;
    beforeEach((done) => {
      buildLinksEmbeddable({
        title: 'my links',
        description: 'just a few links',
        hide_title: false,
        hide_border: false,
        ref_id: '123',
      })
        .then(({ api }) => {
          embeddableApi = api;
          done();
        })
        .catch(done);
    });

    test('should not emit on subscribe and emit when any state changes', (done) => {
      embeddableApi.anyStateChange$.subscribe(() => {
        try {
          const { title } = embeddableApi.serializeState();
          expect(title).toBe('cute puppies');
        } catch (error) {
          // title assertion fails when
          // anyStateChange$ emits on subscribe
          done(error);
          return;
        }
        done();
      });
      embeddableApi.setTitle('cute puppies');
    });
  });

  describe('by reference embeddable', () => {
    const byRefState: LinksEmbeddableState = {
      title: 'my links',
      description: 'just a few links',
      hide_title: false,
      hide_border: false,
      ref_id: '123',
    };

    test('component renders', async () => {
      const { Component } = await buildLinksEmbeddable(byRefState);
      render(
        <EuiThemeProvider>
          <Component />
        </EuiThemeProvider>
      );
      expect(await screen.findByTestId('links--component')).toBeInTheDocument();
    });

    test('api methods', async () => {
      const { api } = await buildLinksEmbeddable(byRefState);
      expect(api.serializeState()).toEqual({
        title: 'my links',
        description: 'just a few links',
        hide_title: false,
        hide_border: false,
        ref_id: '123',
      });
      expect(await api.canUnlinkFromLibrary()).toBe(true);
      expect(api.defaultTitle$?.value).toBe('links 001');
      expect(api.defaultDescription$?.value).toBe('some links');
    });

    test('unlink from library', async () => {
      const { api } = await buildLinksEmbeddable(byRefState);
      expect(api.getSerializedStateByValue()).toEqual({
        title: 'my links',
        description: 'just a few links',
        hide_title: false,
        hide_border: false,
        links: getLinks(),
        layout: 'vertical',
      });
    });
  });

  describe('by value embeddable', () => {
    const byValueState: LinksEmbeddableState = {
      description: 'just a few links',
      title: 'my links',
      hide_title: true,
      hide_border: true,
      links: getLinks(),
      layout: 'horizontal',
    };

    test('component renders', async () => {
      const { Component } = await buildLinksEmbeddable(byValueState);
      render(
        <EuiThemeProvider>
          <Component />
        </EuiThemeProvider>
      );

      expect(await screen.findByTestId('links--component')).toBeInTheDocument();
    });

    test('api methods', async () => {
      const { api } = await buildLinksEmbeddable(byValueState);
      expect(api.serializeState()).toEqual({
        title: 'my links',
        description: 'just a few links',
        hide_title: true,
        hide_border: true,
        links: getLinks(),
        layout: 'horizontal',
      });

      expect(await api.canLinkToLibrary()).toBe(true);
    });

    test('save to library', async () => {
      const { api } = await buildLinksEmbeddable(byValueState);
      const newId = await api.saveToLibrary('some new title');
      expect(linksClient.create).toHaveBeenCalledWith({
        title: 'some new title',
        description: 'just a few links',
        links: getLinks(),
        layout: 'horizontal',
      });
      expect(newId).toBe('333');
      expect(api.getSerializedStateByReference(newId)).toEqual({
        title: 'my links',
        description: 'just a few links',
        hide_title: true,
        hide_border: true,
        ref_id: '333',
      });
    });
  });
});
