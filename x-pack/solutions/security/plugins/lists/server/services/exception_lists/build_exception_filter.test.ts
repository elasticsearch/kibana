/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  EntryList,
  EntryMatchAny,
  ExceptionListItemSchema,
} from '@kbn/securitysolution-io-ts-list-types';

import { ENTRIES } from '../../../common/constants.mock';
import {
  getEntryMatchAnyExcludeMock,
  getEntryMatchAnyMock,
} from '../../../common/schemas/types/entry_match_any.mock';
import {
  getEntryExistsExcludedMock,
  getEntryExistsMock,
} from '../../../common/schemas/types/entry_exists.mock';
import {
  getEntryNestedExcludeMock,
  getEntryNestedMixedEntries,
  getEntryNestedMock,
} from '../../../common/schemas/types/entry_nested.mock';
import { getExceptionListItemSchemaMock } from '../../../common/schemas/response/exception_list_item_schema.mock';
import {
  getEntryMatchWildcardExcludeMock,
  getEntryMatchWildcardMock,
} from '../../../common/schemas/types/entry_match_wildcard.mock';
import {
  getEntryMatchExcludeMock,
  getEntryMatchMock,
} from '../../../common/schemas/types/entry_match.mock';
import { getListClientMock } from '../lists/list_client.mock';
import {
  getEntryListExcludedMock,
  getEntryListMock,
} from '../../../common/schemas/types/entry_list.mock';

import {
  buildExceptionFilter,
  buildExceptionItemFilter,
  buildExclusionClause,
  buildExistsClause,
  buildListClause,
  buildMatchAnyClause,
  buildMatchClause,
  buildMatchWildcardClause,
  buildNestedClause,
  createOrClauses,
  filterOutUnprocessableValueLists,
  removeExpiredExceptions,
} from './build_exception_filter';

const modifiedGetEntryMatchAnyMock = (): EntryMatchAny => ({
  ...getEntryMatchAnyMock(),
  operator: 'included',
  value: ['some "host" name', 'some other host name'],
});

const listClient = getListClientMock();

describe('build_exceptions_filter', () => {
  describe('buildExceptionFilter', () => {
    test('it should return undefined if no exception items', async () => {
      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 1,
        excludeExceptions: false,
        listClient,
        lists: [],
        startedAt: new Date(),
      });
      expect(filter).toBeUndefined();
    });

    test('it should build a filter given an exception list', async () => {
      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 1,
        excludeExceptions: false,
        listClient,
        lists: [getExceptionListItemSchemaMock()],
        startedAt: new Date(),
      });

      expect(filter).toMatchInlineSnapshot(`
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "negate": false,
          },
          "query": Object {
            "bool": Object {
              "should": Array [
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "nested": Object {
                          "path": "some.parentField",
                          "query": Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "match_phrase": Object {
                                    "some.parentField.nested.field": "some value",
                                  },
                                },
                              ],
                            },
                          },
                          "score_mode": "none",
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "some.not.nested.field": "some value",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }
      `);
    });

    test('it should build a filter without chunking exception items', async () => {
      const exceptionItem1: ExceptionListItemSchema = {
        ...getExceptionListItemSchemaMock(),
        entries: [
          { field: 'host.name', operator: 'included', type: 'match', value: 'linux' },
          { field: 'some.field', operator: 'included', type: 'match', value: 'value' },
        ],
      };
      const exceptionItem2: ExceptionListItemSchema = {
        ...getExceptionListItemSchemaMock(),
        entries: [{ field: 'user.name', operator: 'included', type: 'match', value: 'name' }],
      };
      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 2,
        excludeExceptions: true,
        listClient,
        lists: [exceptionItem1, exceptionItem2],
        startedAt: new Date(),
      });
      expect(filter).toMatchInlineSnapshot(`
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "negate": true,
          },
          "query": Object {
            "bool": Object {
              "should": Array [
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "linux",
                              },
                            },
                          ],
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "some.field": "value",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "match_phrase": Object {
                          "user.name": "name",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }
      `);
    });

    test('it should properly chunk exception items', async () => {
      const exceptionItem1: ExceptionListItemSchema = {
        ...getExceptionListItemSchemaMock(),
        entries: [
          { field: 'host.name', operator: 'included', type: 'match', value: 'linux' },
          { field: 'some.field', operator: 'included', type: 'match', value: 'value' },
        ],
      };
      const exceptionItem2: ExceptionListItemSchema = {
        ...getExceptionListItemSchemaMock(),
        entries: [{ field: 'user.name', operator: 'included', type: 'match', value: 'name' }],
      };
      const exceptionItem3: ExceptionListItemSchema = {
        ...getExceptionListItemSchemaMock(),
        entries: [{ field: 'file.path', operator: 'included', type: 'match', value: '/safe/path' }],
      };
      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 2,
        excludeExceptions: true,
        listClient,
        lists: [exceptionItem1, exceptionItem2, exceptionItem3],
        startedAt: new Date(),
      });

      expect(filter).toMatchInlineSnapshot(`
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "negate": true,
          },
          "query": Object {
            "bool": Object {
              "should": Array [
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "linux",
                              },
                            },
                          ],
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "some.field": "value",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "match_phrase": Object {
                          "user.name": "name",
                        },
                      },
                    ],
                  },
                },
                Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "match_phrase": Object {
                          "file.path": "/safe/path",
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }
      `);
    });

    test('it should format all exception items and their entries as expected', async () => {
      const exceptions = [
        { ...getExceptionListItemSchemaMock(), entries: [getEntryNestedMixedEntries()] },
        { ...getExceptionListItemSchemaMock(), entries: [modifiedGetEntryMatchAnyMock()] },
        {
          ...getExceptionListItemSchemaMock(),
          entries: [getEntryExistsExcludedMock(), getEntryMatchMock()],
        },
      ];

      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 1,
        excludeExceptions: true,
        listClient,
        lists: exceptions,
        startedAt: new Date(),
      });

      expect(filter).toMatchInlineSnapshot(`
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "negate": true,
          },
          "query": Object {
            "bool": Object {
              "should": Array [
                Object {
                  "nested": Object {
                    "path": "parent.field",
                    "query": Object {
                      "bool": Object {
                        "filter": Array [
                          Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "match_phrase": Object {
                                    "parent.field.host.name": "some host name",
                                  },
                                },
                              ],
                            },
                          },
                          Object {
                            "bool": Object {
                              "must_not": Object {
                                "bool": Object {
                                  "minimum_should_match": 1,
                                  "should": Array [
                                    Object {
                                      "bool": Object {
                                        "minimum_should_match": 1,
                                        "should": Array [
                                          Object {
                                            "match_phrase": Object {
                                              "parent.field.host.name": "some host name",
                                            },
                                          },
                                        ],
                                      },
                                    },
                                    Object {
                                      "bool": Object {
                                        "minimum_should_match": 1,
                                        "should": Array [
                                          Object {
                                            "match_phrase": Object {
                                              "parent.field.host.name": "some other host name",
                                            },
                                          },
                                        ],
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          },
                          Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "exists": Object {
                                    "field": "parent.field.host.name",
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    "score_mode": "none",
                  },
                },
                Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some \\"host\\" name",
                              },
                            },
                          ],
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some other host name",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "bool": Object {
                          "must_not": Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "exists": Object {
                                    "field": "host.name",
                                  },
                                },
                              ],
                            },
                          },
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some host name",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }
      `);
    });

    test('it should remove all exception items that are expired', async () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      const expiredDate = new Date(Date.now() - 1000000).toISOString();
      const exceptions = [
        { ...getExceptionListItemSchemaMock(), entries: [ENTRIES[0]], expire_time: futureDate },
        { ...getExceptionListItemSchemaMock(), entries: [ENTRIES[1]], expire_time: expiredDate },
        getExceptionListItemSchemaMock(),
      ];

      const { filter } = await buildExceptionFilter({
        alias: null,
        chunkSize: 1,
        excludeExceptions: true,
        listClient,
        lists: exceptions,
        startedAt: new Date(),
      });

      expect(filter).toMatchInlineSnapshot(`
        Object {
          "meta": Object {
            "alias": null,
            "disabled": false,
            "negate": true,
          },
          "query": Object {
            "bool": Object {
              "should": Array [
                Object {
                  "nested": Object {
                    "path": "some.parentField",
                    "query": Object {
                      "bool": Object {
                        "minimum_should_match": 1,
                        "should": Array [
                          Object {
                            "match_phrase": Object {
                              "some.parentField.nested.field": "some value",
                            },
                          },
                        ],
                      },
                    },
                    "score_mode": "none",
                  },
                },
                Object {
                  "bool": Object {
                    "filter": Array [
                      Object {
                        "nested": Object {
                          "path": "some.parentField",
                          "query": Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "match_phrase": Object {
                                    "some.parentField.nested.field": "some value",
                                  },
                                },
                              ],
                            },
                          },
                          "score_mode": "none",
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "some.not.nested.field": "some value",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        }
      `);
    });
  });

  describe('createOrClauses', () => {
    test('it should create filter with one item if only one exception item exists', async () => {
      const booleanFilter = await createOrClauses({
        chunkSize: 20,
        exceptionsWithValueLists: [],
        exceptionsWithoutValueLists: [
          {
            ...getExceptionListItemSchemaMock(),
            entries: [getEntryNestedMock(), getEntryMatchMock()],
          },
          {
            ...getExceptionListItemSchemaMock(),
            entries: [
              getEntryNestedMixedEntries(),
              modifiedGetEntryMatchAnyMock(),
              getEntryMatchExcludeMock(),
              getEntryExistsExcludedMock(),
            ],
          },
          {
            ...getExceptionListItemSchemaMock(),
            entries: [getEntryExistsExcludedMock()],
          },
        ],
        listClient,
      });

      expect(booleanFilter).toMatchInlineSnapshot(`
        Object {
          "orClauses": Array [
            Object {
              "bool": Object {
                "filter": Array [
                  Object {
                    "nested": Object {
                      "path": "parent.field",
                      "query": Object {
                        "bool": Object {
                          "filter": Array [
                            Object {
                              "bool": Object {
                                "minimum_should_match": 1,
                                "should": Array [
                                  Object {
                                    "match_phrase": Object {
                                      "parent.field.host.name": "some host name",
                                    },
                                  },
                                ],
                              },
                            },
                            Object {
                              "bool": Object {
                                "minimum_should_match": 1,
                                "should": Array [
                                  Object {
                                    "match_phrase": Object {
                                      "parent.field.host.name": "some host name",
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      "score_mode": "none",
                    },
                  },
                  Object {
                    "bool": Object {
                      "minimum_should_match": 1,
                      "should": Array [
                        Object {
                          "match_phrase": Object {
                            "host.name": "some host name",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            Object {
              "bool": Object {
                "filter": Array [
                  Object {
                    "nested": Object {
                      "path": "parent.field",
                      "query": Object {
                        "bool": Object {
                          "filter": Array [
                            Object {
                              "bool": Object {
                                "minimum_should_match": 1,
                                "should": Array [
                                  Object {
                                    "match_phrase": Object {
                                      "parent.field.host.name": "some host name",
                                    },
                                  },
                                ],
                              },
                            },
                            Object {
                              "bool": Object {
                                "must_not": Object {
                                  "bool": Object {
                                    "minimum_should_match": 1,
                                    "should": Array [
                                      Object {
                                        "bool": Object {
                                          "minimum_should_match": 1,
                                          "should": Array [
                                            Object {
                                              "match_phrase": Object {
                                                "parent.field.host.name": "some host name",
                                              },
                                            },
                                          ],
                                        },
                                      },
                                      Object {
                                        "bool": Object {
                                          "minimum_should_match": 1,
                                          "should": Array [
                                            Object {
                                              "match_phrase": Object {
                                                "parent.field.host.name": "some other host name",
                                              },
                                            },
                                          ],
                                        },
                                      },
                                    ],
                                  },
                                },
                              },
                            },
                            Object {
                              "bool": Object {
                                "minimum_should_match": 1,
                                "should": Array [
                                  Object {
                                    "exists": Object {
                                      "field": "parent.field.host.name",
                                    },
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      },
                      "score_mode": "none",
                    },
                  },
                  Object {
                    "bool": Object {
                      "minimum_should_match": 1,
                      "should": Array [
                        Object {
                          "bool": Object {
                            "minimum_should_match": 1,
                            "should": Array [
                              Object {
                                "match_phrase": Object {
                                  "host.name": "some \\"host\\" name",
                                },
                              },
                            ],
                          },
                        },
                        Object {
                          "bool": Object {
                            "minimum_should_match": 1,
                            "should": Array [
                              Object {
                                "match_phrase": Object {
                                  "host.name": "some other host name",
                                },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  },
                  Object {
                    "bool": Object {
                      "must_not": Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some host name",
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                  Object {
                    "bool": Object {
                      "must_not": Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "exists": Object {
                                "field": "host.name",
                              },
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
            Object {
              "bool": Object {
                "must_not": Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "exists": Object {
                          "field": "host.name",
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
          "unprocessableExceptionItems": Array [],
        }
      `);
    });
  });

  describe('buildExceptionItemFilter', () => {
    test('it should build exception item boolean filter from entries', async () => {
      const exceptionItemFilter = await buildExceptionItemFilter(
        {
          ...getExceptionListItemSchemaMock(),
          entries: [
            getEntryNestedMixedEntries(),
            modifiedGetEntryMatchAnyMock(),
            getEntryMatchExcludeMock(),
            getEntryExistsExcludedMock(),
          ],
        },
        listClient
      );
      expect(exceptionItemFilter).toMatchInlineSnapshot(`
        Array [
          Object {
            "bool": Object {
              "filter": Array [
                Object {
                  "nested": Object {
                    "path": "parent.field",
                    "query": Object {
                      "bool": Object {
                        "filter": Array [
                          Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "match_phrase": Object {
                                    "parent.field.host.name": "some host name",
                                  },
                                },
                              ],
                            },
                          },
                          Object {
                            "bool": Object {
                              "must_not": Object {
                                "bool": Object {
                                  "minimum_should_match": 1,
                                  "should": Array [
                                    Object {
                                      "bool": Object {
                                        "minimum_should_match": 1,
                                        "should": Array [
                                          Object {
                                            "match_phrase": Object {
                                              "parent.field.host.name": "some host name",
                                            },
                                          },
                                        ],
                                      },
                                    },
                                    Object {
                                      "bool": Object {
                                        "minimum_should_match": 1,
                                        "should": Array [
                                          Object {
                                            "match_phrase": Object {
                                              "parent.field.host.name": "some other host name",
                                            },
                                          },
                                        ],
                                      },
                                    },
                                  ],
                                },
                              },
                            },
                          },
                          Object {
                            "bool": Object {
                              "minimum_should_match": 1,
                              "should": Array [
                                Object {
                                  "exists": Object {
                                    "field": "parent.field.host.name",
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                    "score_mode": "none",
                  },
                },
                Object {
                  "bool": Object {
                    "minimum_should_match": 1,
                    "should": Array [
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some \\"host\\" name",
                              },
                            },
                          ],
                        },
                      },
                      Object {
                        "bool": Object {
                          "minimum_should_match": 1,
                          "should": Array [
                            Object {
                              "match_phrase": Object {
                                "host.name": "some other host name",
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                Object {
                  "bool": Object {
                    "must_not": Object {
                      "bool": Object {
                        "minimum_should_match": 1,
                        "should": Array [
                          Object {
                            "match_phrase": Object {
                              "host.name": "some host name",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                Object {
                  "bool": Object {
                    "must_not": Object {
                      "bool": Object {
                        "minimum_should_match": 1,
                        "should": Array [
                          Object {
                            "exists": Object {
                              "field": "host.name",
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        ]
      `);
    });

    test('it should build exclusion boolean filter when entry is "match_any"', () => {
      const booleanFilter = buildMatchAnyClause(modifiedGetEntryMatchAnyMock());
      const exclusionFilter = buildExclusionClause(booleanFilter);

      expect(exclusionFilter).toEqual({
        bool: {
          must_not: {
            bool: {
              minimum_should_match: 1,
              should: [
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'host.name': 'some "host" name' } }],
                  },
                },
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'host.name': 'some other host name' } }],
                  },
                },
              ],
            },
          },
        },
      });
    });

    test('it should build exclusion boolean filter when entry is "exists"', () => {
      const booleanFilter = buildExistsClause(getEntryExistsMock());
      const exclusionFilter = buildExclusionClause(booleanFilter);

      expect(exclusionFilter).toEqual({
        bool: {
          must_not: {
            bool: { minimum_should_match: 1, should: [{ exists: { field: 'host.name' } }] },
          },
        },
      });
    });
  });

  describe('buildMatchClause', () => {
    test('it should build boolean filter when operator is "included"', () => {
      const booleanFilter = buildMatchClause(getEntryMatchMock());

      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ match_phrase: { 'host.name': 'some host name' } }],
        },
      });
    });

    test('it should build boolean filter when operator is "excluded"', () => {
      const booleanFilter = buildMatchClause(getEntryMatchExcludeMock());

      expect(booleanFilter).toEqual({
        bool: {
          must_not: {
            bool: {
              minimum_should_match: 1,
              should: [{ match_phrase: { 'host.name': 'some host name' } }],
            },
          },
        },
      });
    });
  });

  describe('buildMatchAnyClause', () => {
    test('it should build boolean filter when operator is "included"', () => {
      const booleanFilter = buildMatchAnyClause(modifiedGetEntryMatchAnyMock());

      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              bool: {
                minimum_should_match: 1,
                should: [{ match_phrase: { 'host.name': 'some "host" name' } }],
              },
            },
            {
              bool: {
                minimum_should_match: 1,
                should: [{ match_phrase: { 'host.name': 'some other host name' } }],
              },
            },
          ],
        },
      });
    });

    test('it should build boolean filter when operator is "excluded"', () => {
      const booleanFilter = buildMatchAnyClause(getEntryMatchAnyExcludeMock());

      expect(booleanFilter).toEqual({
        bool: {
          must_not: {
            bool: {
              minimum_should_match: 1,
              should: [
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'host.name': 'some host name' } }],
                  },
                },
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'host.name': 'some other host name' } }],
                  },
                },
              ],
            },
          },
        },
      });
    });
  });

  describe('buildExistsClause', () => {
    test('it should build boolean filter when operator is "included"', () => {
      const booleanFilter = buildExistsClause(getEntryExistsMock());

      expect(booleanFilter).toEqual({
        bool: { minimum_should_match: 1, should: [{ exists: { field: 'host.name' } }] },
      });
    });

    test('it should build boolean filter when operator is "excluded"', () => {
      const booleanFilter = buildExistsClause(getEntryExistsExcludedMock());

      expect(booleanFilter).toEqual({
        bool: {
          must_not: {
            bool: { minimum_should_match: 1, should: [{ exists: { field: 'host.name' } }] },
          },
        },
      });
    });
  });

  describe('buildNestedClause', () => {
    test('it should build nested filter when operator is "included"', async () => {
      const nestedFilter = await buildNestedClause(getEntryNestedMock(), listClient);

      expect(nestedFilter).toEqual({
        nested: {
          path: 'parent.field',
          query: {
            bool: {
              filter: [
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'parent.field.host.name': 'some host name' } }],
                  },
                },
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'parent.field.host.name': 'some host name' } }],
                  },
                },
              ],
            },
          },
          score_mode: 'none',
        },
      });
    });

    test('it should build nested filter when operator is "excluded"', async () => {
      const nestedFilter = await buildNestedClause(getEntryNestedExcludeMock(), listClient);

      expect(nestedFilter).toEqual({
        nested: {
          path: 'parent.field',
          query: {
            bool: {
              filter: [
                {
                  bool: {
                    must_not: {
                      bool: {
                        minimum_should_match: 1,
                        should: [{ match_phrase: { 'parent.field.host.name': 'some host name' } }],
                      },
                    },
                  },
                },
                {
                  bool: {
                    must_not: {
                      bool: {
                        minimum_should_match: 1,
                        should: [
                          {
                            bool: {
                              minimum_should_match: 1,
                              should: [
                                { match_phrase: { 'parent.field.host.name': 'some host name' } },
                              ],
                            },
                          },
                          {
                            bool: {
                              minimum_should_match: 1,
                              should: [
                                {
                                  match_phrase: {
                                    'parent.field.host.name': 'some other host name',
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
          score_mode: 'none',
        },
      });
    });

    test('it should build nested filter with mixed entry types', async () => {
      const nestedFilter = await buildNestedClause(getEntryNestedMixedEntries(), listClient);

      expect(nestedFilter).toEqual({
        nested: {
          path: 'parent.field',
          query: {
            bool: {
              filter: [
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ match_phrase: { 'parent.field.host.name': 'some host name' } }],
                  },
                },
                {
                  bool: {
                    must_not: {
                      bool: {
                        minimum_should_match: 1,
                        should: [
                          {
                            bool: {
                              minimum_should_match: 1,
                              should: [
                                { match_phrase: { 'parent.field.host.name': 'some host name' } },
                              ],
                            },
                          },
                          {
                            bool: {
                              minimum_should_match: 1,
                              should: [
                                {
                                  match_phrase: {
                                    'parent.field.host.name': 'some other host name',
                                  },
                                },
                              ],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
                {
                  bool: {
                    minimum_should_match: 1,
                    should: [{ exists: { field: 'parent.field.host.name' } }],
                  },
                },
              ],
            },
          },
          score_mode: 'none',
        },
      });
    });
  });

  describe('buildWildcardClause', () => {
    test('it should build wildcard filter when operator is "included"', () => {
      const booleanFilter = buildMatchWildcardClause(getEntryMatchWildcardMock());

      expect(booleanFilter).toEqual({
        bool: {
          filter: {
            wildcard: {
              'host.name': 'some host name',
            },
          },
        },
      });
    });

    test('it should build boolean filter when operator is "excluded"', () => {
      const booleanFilter = buildMatchWildcardClause(getEntryMatchWildcardExcludeMock());

      expect(booleanFilter).toEqual({
        bool: {
          must_not: {
            bool: {
              filter: {
                wildcard: {
                  'host.name': 'some host name',
                },
              },
            },
          },
        },
      });
    });
  });

  describe('buildListClause', () => {
    test('it should build list filter when operator is "included"', async () => {
      const booleanFilter = await buildListClause(getEntryListMock(), listClient);

      expect(booleanFilter).toEqual({
        bool: {
          filter: {
            terms: {
              'host.name': ['127.0.0.1'],
            },
          },
        },
      });
    });

    test('it should build boolean filter when operator is "excluded"', async () => {
      const booleanFilter = await buildListClause(getEntryListExcludedMock(), listClient);

      expect(booleanFilter).toEqual({
        bool: {
          must_not: {
            terms: {
              'host.name': ['127.0.0.1'],
            },
          },
        },
      });
    });

    test('it should build with a should clause when list is ip_range type', async () => {
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'ip_range' } },
        listClient
      );

      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              term: {
                'host.name': '127.0.0.1',
              },
            },
          ],
        },
      });
    });

    test('it should build range should clauses for integer_range type', async () => {
      const rangeListClient = getListClientMock();
      rangeListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: '100-200' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'integer_range' } },
        rangeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ range: { 'host.name': { gte: '100', lte: '200' } } }],
        },
      });
    });

    test('it should build range should clauses for float_range type', async () => {
      const rangeListClient = getListClientMock();
      rangeListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: '99.5-100.5' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'float_range' } },
        rangeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ range: { 'host.name': { gte: '99.5', lte: '100.5' } } }],
        },
      });
    });

    test('it should build range should clauses for long_range type', async () => {
      const rangeListClient = getListClientMock();
      rangeListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: '100-200' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'long_range' } },
        rangeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ range: { 'host.name': { gte: '100', lte: '200' } } }],
        },
      });
    });

    test('it should build range should clauses for double_range type', async () => {
      const rangeListClient = getListClientMock();
      rangeListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: '99.5-100.5' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'double_range' } },
        rangeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ range: { 'host.name': { gte: '99.5', lte: '100.5' } } }],
        },
      });
    });

    test('it should build range should clauses for date_range type', async () => {
      const rangeListClient = getListClientMock();
      rangeListClient.findAllListItems = jest.fn().mockResolvedValue({
        data: [{ value: '2020-01-01T00:00:00.000Z,2021-01-01T00:00:00.000Z' }],
        total: 1,
      });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'date_range' } },
        rangeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              range: {
                'host.name': {
                  gte: '2020-01-01T00:00:00.000Z',
                  lte: '2021-01-01T00:00:00.000Z',
                },
              },
            },
          ],
        },
      });
    });

    test('it should build geo_distance should clauses for geo_point type', async () => {
      const geoListClient = getListClientMock();
      geoListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: '40.7128,-74.006' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'geo_point' } },
        geoListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [{ geo_distance: { distance: '1m', 'host.name': '40.7128,-74.006' } }],
        },
      });
    });

    test('it should build geo_shape should clauses for geo_shape type', async () => {
      const geoListClient = getListClientMock();
      geoListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: 'POINT (-74.006 40.7128)' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'geo_shape' } },
        geoListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              geo_shape: {
                'host.name': { relation: 'intersects', shape: 'POINT (-74.006 40.7128)' },
              },
            },
          ],
        },
      });
    });

    test('it should build shape should clauses for shape type', async () => {
      const shapeListClient = getListClientMock();
      shapeListClient.findAllListItems = jest
        .fn()
        .mockResolvedValue({ data: [{ value: 'POINT (100.0 200.0)' }], total: 1 });
      const booleanFilter = await buildListClause(
        { ...getEntryListMock(), list: { id: getEntryListMock().list.id, type: 'shape' } },
        shapeListClient
      );
      expect(booleanFilter).toEqual({
        bool: {
          minimum_should_match: 1,
          should: [
            {
              shape: {
                'host.name': { relation: 'intersects', shape: 'POINT (100.0 200.0)' },
              },
            },
          ],
        },
      });
    });
  });

  describe('filterOutUnprocessableValueLists', () => {
    test('it should filter in list types we do support', async () => {
      const listEntryItem: EntryList = {
        ...getEntryListMock(),
        list: { id: getEntryListMock().list.id, type: 'keyword' },
      };
      const listExceptionItem = getExceptionListItemSchemaMock({ entries: [listEntryItem] });

      const { filteredExceptions, unprocessableValueListExceptions } =
        await filterOutUnprocessableValueLists([listExceptionItem], listClient);

      expect(filteredExceptions).toEqual([listExceptionItem]);
      expect(unprocessableValueListExceptions).toEqual([]);
    });

    test("it should filter out list types we don't support", async () => {
      const listEntryItem: EntryList = {
        ...getEntryListMock(),
        list: { id: getEntryListMock().list.id, type: 'text' },
      };
      const listExceptionItem = getExceptionListItemSchemaMock({ entries: [listEntryItem] });

      const { filteredExceptions, unprocessableValueListExceptions } =
        await filterOutUnprocessableValueLists([listExceptionItem], listClient);

      expect(filteredExceptions).toEqual([]);
      expect(unprocessableValueListExceptions).toEqual([listExceptionItem]);
    });
  });

  describe('removeExpiredExceptions', () => {
    test('it should filter out expired exceptions', () => {
      const futureDate = new Date(Date.now() + 1000000).toISOString();
      const expiredDate = new Date(Date.now() - 1000000).toISOString();
      const exceptions = [
        { ...getExceptionListItemSchemaMock(), expire_time: futureDate },
        { ...getExceptionListItemSchemaMock(), expire_time: expiredDate },
        getExceptionListItemSchemaMock(),
      ];
      const filteredExceptions = removeExpiredExceptions(exceptions, new Date());

      expect(filteredExceptions).toEqual([
        { ...getExceptionListItemSchemaMock(), expire_time: futureDate },
        getExceptionListItemSchemaMock(),
      ]);
    });
  });
});
