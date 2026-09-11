/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSearchSourceMock } from '@kbn/data-plugin/public/mocks';
import { buildDataViewMock, deepMockedFields } from '@kbn/discover-utils/src/__mocks__';
import * as api from './api';
import { KibanaServices } from '../../common/lib/kibana';
import { TimelineTypeEnum, TimelineStatusEnum } from '../../../common/api/timeline';
import { TIMELINE_DRAFT_URL, TIMELINE_URL, TIMELINE_COPY_URL } from '../../../common/constants';
import type { ImportDataProps } from '../../detection_engine/rule_management/logic/types';

jest.mock('../../common/lib/kibana', () => {
  return {
    KibanaServices: {
      get: jest.fn(() => ({
        http: {
          fetch: jest.fn(),
        },
        savedSearch: jest.fn(),
      })),
    },
  };
});

const timelineData = {
  columns: [
    {
      columnHeaderType: 'not-filtered',
      id: '@timestamp',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'message',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'event.category',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'event.action',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'host.name',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'source.ip',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'destination.ip',
    },
    {
      columnHeaderType: 'not-filtered',
      id: 'user.name',
    },
  ],
  dataProviders: [],
  description: 'x',
  eventType: 'all',
  filters: [],
  kqlMode: 'filter',
  kqlQuery: {
    filterQuery: null,
  },
  title: '',
  timelineType: TimelineTypeEnum.default,
  templateTimelineVersion: null,
  templateTimelineId: null,
  dateRange: {
    start: 1590998565409,
    end: 1591084965409,
  },
  savedQueryId: null,
  sort: [
    {
      columnId: '@timestamp',
      sortDirection: 'desc',
    },
  ],
  status: TimelineStatusEnum.active,
  savedSearchId: null,
};
const mockPatchTimelineResponse = {
  ...timelineData,
  savedObjectId: '9d5693e0-a42a-11ea-b8f4-c5434162742a',
  version: 'WzM0NSwxXQ==',
};
describe('persistTimeline', () => {
  describe('create draft timeline', () => {
    const timelineId = null;
    const initialDraftTimeline = {
      ...timelineData,
      status: TimelineStatusEnum.draft,
    };
    const mockDraftResponse = {
      ...initialDraftTimeline,
      savedObjectId: '9d5693e0-a42a-11ea-b8f4-c5434162742a',
      version: 'WzMzMiwxXQ==',
    };

    const version = null;
    const fetchMock = jest.fn();
    const postMock = jest.fn();
    const patchMock = jest.fn();

    beforeAll(() => {
      jest.resetAllMocks();
      jest.resetModules();

      (KibanaServices.get as jest.Mock).mockReturnValue({
        http: {
          fetch: fetchMock,
          post: postMock.mockReturnValue(mockDraftResponse),
          patch: patchMock.mockReturnValue(mockPatchTimelineResponse),
        },
      });
      api.persistTimeline({
        timelineId,
        timeline: initialDraftTimeline,
        version,
      });
    });

    test('it should create a draft timeline if given status is draft and timelineId is null', () => {
      expect(postMock).toHaveBeenCalledWith(TIMELINE_DRAFT_URL, {
        body: JSON.stringify({
          timelineType: initialDraftTimeline.timelineType,
        }),
        version: '2023-10-31',
      });
    });

    test('it should update timeline', () => {
      expect(patchMock.mock.calls[0][0]).toEqual(TIMELINE_URL);
    });

    test('it should update timeline with patch', () => {
      expect(patchMock.mock.calls[0][1].method).toEqual('PATCH');
    });

    test("it should update timeline from clean draft timeline's response", () => {
      expect(JSON.parse(patchMock.mock.calls[0][1].body)).toEqual({
        timelineId: mockDraftResponse.savedObjectId,
        timeline: {
          ...initialDraftTimeline,
          templateTimelineId: mockDraftResponse.templateTimelineId,
          templateTimelineVersion: mockDraftResponse.templateTimelineVersion,
        },
        version: mockDraftResponse.version ?? '',
      });
    });
  });

  describe('create draft timeline in read-only permission', () => {
    const timelineId = null;
    const initialDraftTimeline = {
      ...timelineData,
      status: TimelineStatusEnum.draft,
    };

    const version = null;
    const fetchMock = jest.fn();
    const postMock = jest.fn();
    const patchMock = jest.fn();

    beforeAll(() => {
      jest.resetAllMocks();
      jest.resetModules();

      (KibanaServices.get as jest.Mock).mockReturnValue({
        http: {
          fetch: fetchMock.mockRejectedValue({
            body: { status_code: 403, message: 'you do not have the permission' },
          }),
          post: postMock.mockRejectedValue({
            body: { status_code: 403, message: 'you do not have the permission' },
          }),
          patch: patchMock.mockRejectedValue({
            body: { status_code: 403, message: 'you do not have the permission' },
          }),
        },
      });
    });

    test('it should return your request timeline with code and message', async () => {
      const persist = await api.persistTimeline({
        timelineId,
        timeline: initialDraftTimeline,
        version,
      });
      expect(persist).toEqual({
        statusCode: 403,
        message: 'you do not have the permission',
      });
    });
  });

  describe('create active timeline (import)', () => {
    const timelineId = null;
    const importTimeline = timelineData;
    const mockPostTimelineResponse = {
      ...timelineData,
      savedObjectId: '9d5693e0-a42a-11ea-b8f4-c5434162742a',
      version: 'WzMzMiwxXQ==',
    };

    const version = null;
    const fetchMock = jest.fn();
    const postMock = jest.fn();
    const patchMock = jest.fn();

    beforeAll(() => {
      jest.resetAllMocks();
      jest.resetModules();

      (KibanaServices.get as jest.Mock).mockReturnValue({
        http: {
          fetch: fetchMock,
          post: postMock.mockReturnValue(mockPostTimelineResponse),
          patch: patchMock,
        },
      });
      api.persistTimeline({ timelineId, timeline: importTimeline, version });
    });

    test('it should update timeline', () => {
      expect(postMock.mock.calls[0][0]).toEqual(TIMELINE_URL);
    });

    test('it should update timeline with patch', () => {
      expect(postMock.mock.calls[0][1].method).toEqual('POST');
    });

    test('should call create timeline', () => {
      expect(JSON.parse(postMock.mock.calls[0][1].body)).toEqual({ timeline: importTimeline });
    });
  });

  describe('update active timeline', () => {
    const timelineId = '9d5693e0-a42a-11ea-b8f4-c5434162742a';
    const inputTimeline = timelineData;
    const mockPatchTimelineResponseNew = {
      ...mockPatchTimelineResponse,
      version: 'WzMzMiwxXQ==',
      description: 'x',
      created: 1591092702804,
      updated: 1591092705206,
    };

    const version = 'initial version';
    const fetchMock = jest.fn();
    const postMock = jest.fn();
    const patchMock = jest.fn();

    beforeAll(() => {
      jest.resetAllMocks();
      jest.resetModules();

      (KibanaServices.get as jest.Mock).mockReturnValue({
        http: {
          fetch: fetchMock,
          post: postMock,
          patch: patchMock.mockReturnValue(mockPatchTimelineResponseNew),
        },
      });
      api.persistTimeline({ timelineId, timeline: inputTimeline, version });
    });

    test('it should update timeline', () => {
      expect(patchMock.mock.calls[0][0]).toEqual(TIMELINE_URL);
    });

    test('it should update timeline with patch', () => {
      expect(patchMock.mock.calls[0][1].method).toEqual('PATCH');
    });

    test('should call patch timeline', () => {
      expect(JSON.parse(patchMock.mock.calls[0][1].body)).toEqual({
        timeline: inputTimeline,
        timelineId,
        version,
      });
    });
  });

  describe('discover session title', () => {
    const timelineId = '9d5693e0-a42a-11ea-b8f4-c5434162742a';
    const version = 'initial version';
    const saveSavedSearchMock = jest.fn();

    const mockSavedSearch = {
      id: 'savedSearchId',
      // Stale on purpose: this is the snapshot the ES|QL tab took before the timeline was renamed
      title: 'Saved Discover session for Timeline - Old name',
      searchSource: createSearchSourceMock({
        index: buildDataViewMock({ name: 'first-data-view', fields: deepMockedFields }),
      }),
      managed: false,
    };

    beforeEach(() => {
      jest.clearAllMocks();

      (KibanaServices.get as jest.Mock).mockReturnValue({
        http: { patch: jest.fn().mockResolvedValue(mockPatchTimelineResponse) },
        savedSearch: { save: saveSavedSearchMock },
      });
    });

    test('derives the saved search title from the timeline title on save', async () => {
      await api.persistTimeline({
        timelineId,
        version,
        timeline: { ...timelineData, title: 'New name', savedSearchId: 'savedSearchId' },
        savedSearch: mockSavedSearch,
      });

      expect(saveSavedSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Saved Discover session for Timeline - New name',
        }),
        { copyOnSave: false }
      );
    });

    test('keeps the existing saved search title when the timeline has no title', async () => {
      await api.persistTimeline({
        timelineId,
        version,
        timeline: { ...timelineData, title: '', savedSearchId: 'savedSearchId' },
        savedSearch: mockSavedSearch,
      });

      expect(saveSavedSearchMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: mockSavedSearch.title }),
        { copyOnSave: false }
      );
    });
  });
});

describe('importTimelines', () => {
  const fileToImport = { fileToImport: {} } as ImportDataProps;
  const fetchMock = jest.fn();

  beforeAll(() => {
    jest.resetAllMocks();
    jest.resetModules();

    (KibanaServices.get as jest.Mock).mockReturnValue({
      http: {
        fetch: fetchMock,
      },
    });
    api.importTimelines(fileToImport);
  });

  test('should pass correct args to KibanaServices - url', () => {
    expect(fetchMock.mock.calls[0][0]).toEqual('/api/timeline/_import');
  });

  test('should pass correct args to KibanaServices - args', () => {
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toEqual(
      JSON.stringify({
        method: 'POST',
        headers: { 'Content-Type': undefined },
        body: new FormData(),
        signal: undefined,
        version: '2023-10-31',
      })
    );
  });
});

describe('exportSelectedTimeline', () => {
  const ids = ['123', 'abc'];
  const fetchMock = jest.fn();

  beforeAll(() => {
    jest.resetAllMocks();
    jest.resetModules();

    (KibanaServices.get as jest.Mock).mockReturnValue({
      http: {
        fetch: fetchMock,
      },
    });
    api.exportSelectedTimeline({
      filename: 'timelines_export.ndjson',
      ids,
      signal: {} as AbortSignal,
    });
  });

  test('should pass correct args to KibanaServices', () => {
    expect(fetchMock).toHaveBeenCalledWith('/api/timeline/_export', {
      body: JSON.stringify({ ids }),
      method: 'POST',
      query: { file_name: 'timelines_export.ndjson' },
      signal: {},
      version: '2023-10-31',
    });
  });
});

describe('getDraftTimeline', () => {
  const timelineType = { timelineType: TimelineTypeEnum.default };
  const getMock = jest.fn();

  beforeAll(() => {
    jest.resetAllMocks();
    jest.resetModules();

    (KibanaServices.get as jest.Mock).mockReturnValue({
      http: {
        get: getMock.mockImplementation(() => Promise.resolve(mockPatchTimelineResponse)),
      },
    });
    api.getDraftTimeline(timelineType);
  });

  test('should pass correct args to KibanaServices', () => {
    expect(getMock).toHaveBeenCalledWith('/api/timeline/_draft', {
      query: timelineType,
      version: '2023-10-31',
    });
  });
});

describe('cleanDraftTimeline', () => {
  const postMock = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    jest.resetModules();

    (KibanaServices.get as jest.Mock).mockReturnValue({
      http: {
        post: postMock.mockImplementation(() => Promise.resolve(mockPatchTimelineResponse)),
      },
    });
  });

  test('should pass correct args to KibanaServices - timeline', () => {
    const args = { timelineType: TimelineTypeEnum.default };

    api.cleanDraftTimeline(args);

    expect(postMock).toHaveBeenCalledWith('/api/timeline/_draft', {
      body: JSON.stringify(args),
      version: '2023-10-31',
    });
  });

  test('should pass correct args to KibanaServices - timeline template', () => {
    const args = {
      timelineType: TimelineTypeEnum.template,
      templateTimelineId: 'test-123',
      templateTimelineVersion: 1,
    };

    api.cleanDraftTimeline(args);

    expect(postMock).toHaveBeenCalledWith('/api/timeline/_draft', {
      body: JSON.stringify(args),
      version: '2023-10-31',
    });
  });
});

describe('copyTimeline', () => {
  const mockPostTimelineResponse = {
    ...timelineData,
    savedObjectId: '9d5693e0-a42a-11ea-b8f4-c5434162742a',
    version: 'WzMzMiwxXQ==',
  };

  const saveSavedSearchMock = jest.fn();
  const postMock = jest.fn();
  const initialSavedSearchId = 'initialId';
  const newSavedSearchId = 'newId-230820349807209752';

  const customQuery = {
    language: 'kuery',
    query: '_id: *',
  };

  const dataViewMock = buildDataViewMock({
    name: 'first-data-view',
    fields: deepMockedFields,
  });

  const mockSavedSearch = {
    id: initialSavedSearchId,
    title: 'first title',
    breakdownField: 'firstBreakdown Field',
    searchSource: createSearchSourceMock({
      index: dataViewMock,
      query: customQuery,
    }),
    managed: false,
  };

  beforeAll(() => {
    jest.resetAllMocks();
    jest.resetModules();

    (KibanaServices.get as jest.Mock).mockReturnValue({
      http: {
        post: postMock.mockReturnValue(mockPostTimelineResponse),
      },
      savedSearch: {
        save: saveSavedSearchMock.mockImplementation(() => newSavedSearchId),
      },
    });
  });

  it('creates a new saved search when a saved search object is passed', async () => {
    await api.copyTimeline({
      timelineId: 'test',
      timeline: {
        ...timelineData,
        savedSearchId: 'test',
      },
      savedSearch: mockSavedSearch,
    });

    // 'id' should be removed
    expect(saveSavedSearchMock).toHaveBeenCalled();
    expect(saveSavedSearchMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: initialSavedSearchId,
      })
    );

    // The new saved search id is sent to the server
    expect(postMock).toHaveBeenCalledWith(
      TIMELINE_COPY_URL,
      expect.objectContaining({
        body: expect.stringContaining(newSavedSearchId),
      })
    );
  });

  it('applies the timeline changes before sending the POST request', async () => {
    const ridiculousTimelineTitle = 'Wow, what a weirt timeline title';
    await api.copyTimeline({
      timelineId: 'test',
      timeline: {
        ...timelineData,
        title: ridiculousTimelineTitle,
        savedSearchId: 'test',
      },
      savedSearch: mockSavedSearch,
    });

    // The new saved search id is sent to the server
    expect(postMock).toHaveBeenCalledWith(
      TIMELINE_COPY_URL,
      expect.objectContaining({
        body: expect.stringContaining(ridiculousTimelineTitle),
      })
    );
  });

  it('derives the copied saved search title from the timeline title', async () => {
    jest.clearAllMocks();

    await api.copyTimeline({
      timelineId: 'test',
      timeline: {
        ...timelineData,
        title: 'Copied timeline',
        savedSearchId: 'test',
      },
      savedSearch: mockSavedSearch,
    });

    expect(saveSavedSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Saved Discover session for Timeline - Copied timeline',
      }),
      { copyOnSave: false }
    );
  });

  it('does not save a saved search for timelines without `savedSearchId`', async () => {
    jest.clearAllMocks();

    await api.copyTimeline({
      timelineId: 'test',
      timeline: {
        ...timelineData,
        savedSearchId: null,
      },
      savedSearch: mockSavedSearch,
    });

    expect(saveSavedSearchMock).not.toHaveBeenCalled();
  });
});
