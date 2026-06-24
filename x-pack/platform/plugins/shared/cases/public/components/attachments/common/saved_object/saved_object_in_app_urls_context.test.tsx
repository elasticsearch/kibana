/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { useKibana } from '../../../../common/lib/kibana';
import { TestProviders } from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DISCOVER_SESSION_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
} from '../../../../../common/constants/attachments';
import type { AttachmentUIV2, CaseUI } from '../../../../../common/ui/types';
import { SavedObjectInAppUrlsProvider } from './saved_object_in_app_urls_context';
import { useSavedObjectInAppUrl, useSavedObjectInAppUrls } from './use_saved_object_in_app_url';

jest.mock('../../../../common/lib/kibana');

const useKibanaMock = useKibana as jest.Mock;

const buildHttp = (post: jest.Mock) => ({
  services: {
    http: {
      post,
      basePath: { prepend: (path: string) => `/base${path}` },
    },
  },
});

const soAttachment = (
  id: string,
  type: string,
  attachmentId: string,
  soType: string
): AttachmentUIV2 =>
  ({
    id,
    type,
    attachmentId,
    metadata: { title: `t-${attachmentId}`, soType },
  } as unknown as AttachmentUIV2);

const caseWith = (comments: AttachmentUIV2[]): CaseUI => ({ ...basicCase, comments } as CaseUI);

describe('SavedObjectInAppUrlsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fires one bulk_get per SO type present on the case', async () => {
    const post = jest.fn().mockImplementation((_url: string, opts: { body: string }) => {
      const body = JSON.parse(opts.body) as Array<{ type: string; id: string }>;
      return Promise.resolve(
        body.map(({ type, id }) => ({
          id,
          type,
          meta: { inAppUrl: { path: `/app/${type}/${id}` } },
        }))
      );
    });
    useKibanaMock.mockReturnValue(buildHttp(post));

    const data = caseWith([
      soAttachment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'dashboard'),
      soAttachment('c2', DASHBOARD_ATTACHMENT_TYPE, 'dash-2', 'dashboard'),
      soAttachment('c3', MAP_ATTACHMENT_TYPE, 'map-1', 'map'),
      soAttachment('c4', DISCOVER_SESSION_ATTACHMENT_TYPE, 'search-1', 'search'),
    ]);

    const wrapper: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
      <TestProviders>
        <SavedObjectInAppUrlsProvider caseData={data}>{children}</SavedObjectInAppUrlsProvider>
      </TestProviders>
    );

    // Render two consumers for the same dashboard id to prove they don't each
    // fire their own request when the provider is mounted above them.
    const { result } = renderHook(
      () => ({
        a: useSavedObjectInAppUrl('dashboard', 'dash-1'),
        b: useSavedObjectInAppUrl('dashboard', 'dash-1'),
        c: useSavedObjectInAppUrls('map', ['map-1']),
      }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.a).toBe('/base/app/dashboard/dash-1');
    });
    expect(result.current.b).toBe('/base/app/dashboard/dash-1');
    expect(result.current.c).toEqual({ 'map-1': '/base/app/map/map-1' });

    // One request per SO type — dashboard, map, search — even though we
    // rendered three consumers above.
    expect(post).toHaveBeenCalledTimes(3);
    const postedTypes = post.mock.calls
      .map(([, opts]) => (JSON.parse(opts.body) as Array<{ type: string }>)[0]?.type)
      .sort();
    expect(postedTypes).toEqual(['dashboard', 'map', 'search']);
  });

  it('falls back to per-hook fetching when no provider is mounted', async () => {
    const post = jest
      .fn()
      .mockResolvedValue([
        { id: 'dash-1', type: 'dashboard', meta: { inAppUrl: { path: '/app/d/dash-1' } } },
      ]);
    useKibanaMock.mockReturnValue(buildHttp(post));

    const { result } = renderHook(() => useSavedObjectInAppUrl('dashboard', 'dash-1'), {
      wrapper: TestProviders,
    });

    await waitFor(() => expect(result.current).toBe('/base/app/d/dash-1'));
    expect(post).toHaveBeenCalledTimes(1);
  });
});
