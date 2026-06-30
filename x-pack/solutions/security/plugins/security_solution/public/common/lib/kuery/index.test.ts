/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { fromKueryExpression } from '@kbn/es-query';
import type { DataProvider } from '../../../../common/types/timeline';
import { buildGlobalQuery, convertToBuildEsQuery } from '.';
import { mockBrowserFields } from '../../containers/source/mock';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';

describe('convertToBuildEsQuery', () => {
  /**
   * All the fields in this query, except for `@timestamp`,
   * are nested fields https://www.elastic.co/guide/en/elasticsearch/reference/current/nested.html
   *
   * This mix of nested and non-nested fields will be used to verify that:
   * ✅ Nested fields are converted to use the `nested` query syntax
   * ✅ The `nested` query syntax includes the `ignore_unmapped` option
   * ✅ Non-nested fields are NOT converted to the `nested` query syntax
   * ✅ Non-nested fields do NOT include the `ignore_unmapped` option
   */
  const queryWithNestedFields = [
    {
      query:
        '((threat.enrichments: { matched.atomic: a4f87cbcd2a4241da77b6bf0c5d9e8553fec991f } and threat.enrichments: { matched.type: indicator_match_rule } and threat.enrichments: { matched.field: file.hash.md5 }) and (@timestamp : *))',
      language: 'kuery',
    },
  ];

  /** A search bar filter (displayed below the KQL / Lucene search bar ) */
  const filters = [
    {
      meta: {
        alias: null,
        negate: false,
        disabled: false,
        type: 'exists',
        key: '_id',
        value: 'exists',
      },
      query: {
        exists: {
          field: '_id',
        },
      },
    },
  ];

  const config = {
    allowLeadingWildcards: true,
    queryStringOptions: {
      analyze_wildcard: true,
    },
    ignoreFilterIfFieldNotInIndex: false,
    dateFormatTZ: 'Browser',
  };

  const expectedConverted = {
    bool: {
      must: [],
      filter: [
        {
          bool: {
            filter: [
              {
                bool: {
                  filter: [
                    {
                      // ✅ Nested fields are converted to use the `nested` query syntax
                      nested: {
                        path: 'threat.enrichments',
                        query: {
                          bool: {
                            should: [
                              {
                                match: {
                                  'threat.enrichments.matched.atomic':
                                    'a4f87cbcd2a4241da77b6bf0c5d9e8553fec991f',
                                },
                              },
                            ],
                            minimum_should_match: 1,
                          },
                        },
                        score_mode: 'none',
                        // ✅ The `nested` query syntax includes the `ignore_unmapped` option
                        ignore_unmapped: true,
                      },
                    },
                    {
                      nested: {
                        path: 'threat.enrichments',
                        query: {
                          bool: {
                            should: [
                              {
                                match: {
                                  'threat.enrichments.matched.type': 'indicator_match_rule',
                                },
                              },
                            ],
                            minimum_should_match: 1,
                          },
                        },
                        score_mode: 'none',
                        ignore_unmapped: true,
                      },
                    },
                    {
                      nested: {
                        path: 'threat.enrichments',
                        query: {
                          bool: {
                            should: [
                              {
                                match: {
                                  'threat.enrichments.matched.field': 'file.hash.md5',
                                },
                              },
                            ],
                            minimum_should_match: 1,
                          },
                        },
                        score_mode: 'none',
                        ignore_unmapped: true,
                      },
                    },
                  ],
                },
              },
              {
                bool: {
                  should: [
                    {
                      exists: {
                        // ✅ Non-nested fields are NOT converted to the `nested` query syntax
                        // ✅ Non-nested fields do NOT include the `ignore_unmapped` option
                        field: '@timestamp',
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
            ],
          },
        },
        {
          exists: {
            field: '_id',
          },
        },
      ],
      should: [],
      must_not: [],
    },
  };

  it('should, by default, build a query where the `nested` fields syntax includes the `"ignore_unmapped":true` option', () => {
    const [converted, _] = convertToBuildEsQuery({
      config,
      dataView: createStubDataView({ spec: {} }),
      queries: queryWithNestedFields,
      filters,
    });

    expect(JSON.parse(converted ?? '')).to.eql(expectedConverted);
  });

  it('should, when the default is overridden, build a query where `nested` fields include the `"ignore_unmapped":false` option', () => {
    const configWithOverride = {
      ...config,
      nestedIgnoreUnmapped: false, // <-- override the default
    };

    const [converted, _] = convertToBuildEsQuery({
      config: configWithOverride,
      dataView: createStubDataView({ spec: {} }),
      queries: queryWithNestedFields,
      filters,
    });

    expect(JSON.parse(converted ?? '')).to.eql({
      bool: {
        must: [],
        filter: [
          {
            bool: {
              filter: [
                {
                  bool: {
                    filter: [
                      {
                        nested: {
                          path: 'threat.enrichments',
                          query: {
                            bool: {
                              should: [
                                {
                                  match: {
                                    'threat.enrichments.matched.atomic':
                                      'a4f87cbcd2a4241da77b6bf0c5d9e8553fec991f',
                                  },
                                },
                              ],
                              minimum_should_match: 1,
                            },
                          },
                          score_mode: 'none',
                          ignore_unmapped: false, // <-- overridden by the config to be false
                        },
                      },
                      {
                        nested: {
                          path: 'threat.enrichments',
                          query: {
                            bool: {
                              should: [
                                {
                                  match: {
                                    'threat.enrichments.matched.type': 'indicator_match_rule',
                                  },
                                },
                              ],
                              minimum_should_match: 1,
                            },
                          },
                          score_mode: 'none',
                          ignore_unmapped: false,
                        },
                      },
                      {
                        nested: {
                          path: 'threat.enrichments',
                          query: {
                            bool: {
                              should: [
                                {
                                  match: {
                                    'threat.enrichments.matched.field': 'file.hash.md5',
                                  },
                                },
                              ],
                              minimum_should_match: 1,
                            },
                          },
                          score_mode: 'none',
                          ignore_unmapped: false,
                        },
                      },
                    ],
                  },
                },
                {
                  bool: {
                    should: [
                      {
                        exists: {
                          field: '@timestamp',
                        },
                      },
                    ],
                    minimum_should_match: 1,
                  },
                },
              ],
            },
          },
          {
            exists: {
              field: '_id',
            },
          },
        ],
        should: [],
        must_not: [],
      },
    });
  });

  describe('When ignoreFilterIfFieldNotInIndex is true', () => {
    const updatedConfig = { ...config, ignoreFilterIfFieldNotInIndex: true };

    it('should not use the field if the filter is not mapped in the', () => {
      const updatedConvertedWithoutIdQuery = structuredClone(expectedConverted);
      updatedConvertedWithoutIdQuery.bool.filter = [updatedConvertedWithoutIdQuery.bool.filter[0]]; // remove the search bar filter
      const dataViewWithoutIdMapped = createStubDataView({
        spec: {
          id: 'test-id',
          title: 'some-title',
        },
      });
      const [converted] = convertToBuildEsQuery({
        config: updatedConfig,
        dataView: dataViewWithoutIdMapped,
        queries: queryWithNestedFields,
        filters,
      });

      expect(JSON.parse(converted ?? '')).to.eql(updatedConvertedWithoutIdQuery); // just verify that something was built
    });

    it('should use the filters when the field is mapped in the dataView', () => {
      const dataViewWithIdMapped = createStubDataView({
        spec: {
          id: 'test-id',
          title: 'some-title',
          fields: {
            _id: {
              name: '_id',
              type: 'string',
              esTypes: ['keyword'],
              aggregatable: true,
              searchable: true,
              scripted: false,
            },
          },
        },
      });
      const [converted] = convertToBuildEsQuery({
        config: updatedConfig,
        dataView: dataViewWithIdMapped,
        queries: queryWithNestedFields,
        filters,
      });

      // This should have the id with the
      expect(JSON.parse(converted ?? '')).to.eql(expectedConverted);
    });
  });
});

describe('buildGlobalQuery', () => {
  it('should generate correct kql query when provided value is an array', () => {
    const providers = [
      {
        and: [],
        enabled: true,
        id: 'event-details-value-default-draggable-plain-column-renderer-formatted-field-value-timeline-1-Imhtx44Bu3sCtYk3xxsO-host_name-p1',
        name: 'p1',
        excluded: false,
        kqlQuery: '',
        queryMatch: {
          field: 'host.name',
          value: ['p1', 'p2'],
          operator: 'includes',
          displayField: 'host.name',
          displayValue: '( p1 OR p2 )',
        },
      } as DataProvider,
    ];

    const query = buildGlobalQuery(providers, {});

    expect(query).to.equal('host.name : ("p1" OR "p2")');
  });

  it('should quote array values that contain reserved KQL characters', () => {
    const url =
      'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
    const providers = [
      {
        and: [],
        enabled: true,
        id: 'timeline-url-includes',
        name: url,
        excluded: false,
        kqlQuery: '',
        queryMatch: {
          field: 'url.full',
          value: [url],
          operator: 'includes',
          displayField: 'url.full',
          displayValue: url,
        },
      } as DataProvider,
    ];

    const query = buildGlobalQuery(providers, {});

    expect(query).to.equal(`url.full : ("${url}")`);
    expect(() => fromKueryExpression(query)).not.to.throwError();
  });

  it('should quote nested field values that contain reserved KQL characters', () => {
    const url =
      'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
    const providers = [
      {
        and: [],
        enabled: true,
        id: 'timeline-nested-url',
        name: url,
        excluded: false,
        kqlQuery: '',
        queryMatch: {
          field: 'nestedField.firstAttributes',
          value: url,
          operator: ':',
          displayField: 'nestedField.firstAttributes',
          displayValue: url,
        },
      } as DataProvider,
    ];

    const query = buildGlobalQuery(providers, mockBrowserFields);

    expect(query).to.equal(`nestedField: { firstAttributes: "${url}" }`);
    expect(() => fromKueryExpression(query)).not.to.throwError();
  });
});
