/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Subject } from 'rxjs';
import { createActionService } from './create_action_service';
import { resolveQueryReference } from '../../lib/resolve_query_reference';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';

jest.mock('../../lib/resolve_query_reference');

const mockedResolveQueryReference = resolveQueryReference as jest.MockedFunction<
  typeof resolveQueryReference
>;

const STATIC_SQL = 'select 1;';
const PARAMETERIZED_SQL = 'select * from processes where pid={{process.pid}};';

const buildContext = () => {
  const warn = jest.fn();

  return {
    context: {
      licensing: { license$: new Subject() },
      logFactory: { get: jest.fn().mockReturnValue({ warn, error: jest.fn() }) },
      getStartServices: jest.fn().mockResolvedValue([{}]),
    } as unknown as OsqueryAppContext,
    warn,
  };
};

describe('createActionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveQueryReference.mockResolvedValue(undefined);
  });

  describe('containsDynamicQueries', () => {
    it('reports true from the persisted query without resolving anything', async () => {
      const { context } = buildContext();
      const service = createActionService(context);

      await expect(service.containsDynamicQueries({ query: PARAMETERIZED_SQL })).resolves.toBe(
        true
      );
      expect(mockedResolveQueryReference).not.toHaveBeenCalled();
    });

    it('reports true from the persisted queries[] without resolving anything', async () => {
      const { context } = buildContext();
      const service = createActionService(context);

      await expect(
        service.containsDynamicQueries({
          queries: [{ query: STATIC_SQL }, { query: PARAMETERIZED_SQL }],
        })
      ).resolves.toBe(true);
      expect(mockedResolveQueryReference).not.toHaveBeenCalled();
    });

    it('reports false with no reference and no parameters', async () => {
      const { context } = buildContext();
      const service = createActionService(context);

      await expect(service.containsDynamicQueries({ query: STATIC_SQL })).resolves.toBe(false);
      expect(mockedResolveQueryReference).not.toHaveBeenCalled();
    });

    it('reports true when the stored saved query is parameterized but the persisted copy is not', async () => {
      // The drift case: a saved query edited to add `{{...}}` must not leave a rule dispatching
      // nothing because its stale persisted copy still looks static.
      const { context } = buildContext();
      const service = createActionService(context);

      mockedResolveQueryReference.mockResolvedValue({
        savedObjectId: 'so-1',
        query: PARAMETERIZED_SQL,
      });

      await expect(
        service.containsDynamicQueries({ saved_query_id: 'sq-1', query: STATIC_SQL })
      ).resolves.toBe(true);
    });

    it('reports true when any stored pack query is parameterized', async () => {
      const { context } = buildContext();
      const service = createActionService(context);

      mockedResolveQueryReference.mockResolvedValue({
        savedObjectId: 'so-1',
        isPack: true,
        queries: [STATIC_SQL, PARAMETERIZED_SQL],
      });

      await expect(
        service.containsDynamicQueries({ pack_id: 'pack-1', queries: [{ query: STATIC_SQL }] })
      ).resolves.toBe(true);
    });

    it('reports false when the stored content is static', async () => {
      // The mirror case: a parameter edited *out* of the saved query is harmless.
      const { context } = buildContext();
      const service = createActionService(context);

      mockedResolveQueryReference.mockResolvedValue({
        savedObjectId: 'so-1',
        query: STATIC_SQL,
      });

      await expect(service.containsDynamicQueries({ saved_query_id: 'sq-1' })).resolves.toBe(false);
    });

    it('resolves within the supplied space', async () => {
      const { context } = buildContext();
      const service = createActionService(context);

      await service.containsDynamicQueries(
        { saved_query_id: 'sq-1' },
        { space: { id: 'other-space' } }
      );

      expect(mockedResolveQueryReference).toHaveBeenCalledWith(
        expect.anything(),
        'other-space',
        expect.objectContaining({ saved_query_id: 'sq-1' })
      );
    });

    it('falls back to the persisted verdict and warns when resolution fails', async () => {
      // Unresolvable stored content is reported on the action document by the dispatch path;
      // failing the whole rule run here would be worse.
      const { context, warn } = buildContext();
      const service = createActionService(context);

      mockedResolveQueryReference.mockRejectedValue(new Error('ES unavailable'));

      await expect(service.containsDynamicQueries({ saved_query_id: 'sq-1' })).resolves.toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ES unavailable'));
    });
  });
});
