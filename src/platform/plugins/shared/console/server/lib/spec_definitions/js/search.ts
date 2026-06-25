/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SpecDefinitionsService } from '../../../services';

export const search = (specService: SpecDefinitionsService) => {
  specService.addEndpointDescription('search', {
    priority: 10, // collides with get doc by id
    data_autocomplete_rules: {
      query: {
        // populated by a global rule
      },
      profile: {
        __one_of: [true, false],
      },
      aggs: {
        __template: {
          NAME: {
            AGG_TYPE: {},
          },
        },
      },

      post_filter: {
        __scope_link: 'GLOBAL.query',
      },
      size: {
        __template: 20,
      },
      from: 0,
      sort: {
        __template: [
          {
            FIELD: {
              order: 'desc',
            },
          },
        ],
        __any_of: [
          {
            '{field}': {
              order: {
                __one_of: ['desc', 'asc'],
              },
              missing: {
                __one_of: ['_last', '_first'],
              },
              mode: {
                __one_of: ['min', 'max', 'avg', 'sum'],
              },
              nested_path: '',
              nested_filter: {
                __scope_link: 'GLOBAL.query',
              },
            },
          },
          '{field}',
          '_score',
          {
            _geo_distance: {
              __template: {
                FIELD: {
                  lat: 40,
                  lon: -70,
                },
                order: 'asc',
              },
              '{field}': {
                __one_of: [
                  {
                    __template: {
                      lat: 40,
                      lon: -70,
                    },
                    lat: 40,
                    lon: -70,
                  },
                  [
                    {
                      __template: {
                        lat: 40,
                        lon: -70,
                      },
                      lat: 40,
                      lon: -70,
                    },
                  ],
                  [''],
                  '',
                ],
              },
              distance_type: { __one_of: ['sloppy_arc', 'arc', 'plane'] },
              sort_mode: { __one_of: ['min', 'max', 'avg'] },
              order: { __one_of: ['asc', 'desc'] },
              unit: 'km',
            },
          },
        ],
      },
      pit: {
        __template: {
          id: '',
          keep_alive: '1m',
        },
      },
      search_after: [],
      stored_fields: ['{field}'],
      suggest: {
        __template: {
          YOUR_SUGGESTION: {
            text: 'YOUR TEXT',
            term: {
              FIELD: 'MESSAGE',
            },
          },
        },
        '*': {
          include: [],
          exclude: [],
        },
      },
      docvalue_fields: ['{field}'],
      fields: {
        __one_of: [
          [
            {
              __one_of: [
                '{field}',
                '*',
                {
                  field: '{field}',
                  include_unmapped: {
                    __one_of: ['true', 'false'],
                  },
                  format: '',
                },
              ],
            },
          ],
          '*',
        ],
      },
      collapse: {
        __template: {
          field: 'FIELD',
        },
      },
      indices_boost: {
        __template: [{ INDEX: 1.0 }],
      },
      rescore: {
        __template: {
          query: {},
          window_size: 50,
        },
      },
      script_fields: {
        __template: {
          FIELD: {
            script: {
              // populated by a global rule
            },
          },
        },
        '*': {
          __scope_link: 'GLOBAL.script',
        },
      },
      runtime_mappings: {
        __template: {
          FIELD: {
            type: '',
            script: {
              // populated by a global rule
            },
          },
        },
        '*': {
          __scope_link: 'GLOBAL.script',
        },
      },
      partial_fields: {
        __template: {
          NAME: {
            include: [],
          },
        },
        '*': {
          include: [],
          exclude: [],
        },
      },
      highlight: {
        // populated by a global rule
      },
      _source: {
        __one_of: [
          ['{field}'],
          '*',
          '{field}',
          true,
          false,
          {
            includes: {
              __one_of: ['{field}', ['{field}']],
            },
            excludes: {
              __one_of: ['{field}', ['{field}']],
            },
          },
        ],
      },
      explain: {
        __one_of: [true, false],
      },
      stats: [''],
      timeout: '1s',
      version: { __one_of: [true, false] },
      track_total_hits: { __one_of: [true, false] },
      knn: {
        __template: {
          field: '',
          query_vector_builder: {
            text_embedding: {
              model_id: '',
              model_text: '',
            },
          },
          k: 10,
          num_candidates: 100,
        },
        __one_of: [
          {
            field: '{field}',
            filter: { __scope_link: 'GLOBAL.query' },
            k: 10,
            num_candidates: 100,
            query_vector: [],
            query_vector_builder: {
              text_embedding: {
                model_id: '',
                model_text: '',
              },
            },
            similarity: { __one_of: ['l2_norm', 'cosine', 'dot_product', 'max_inner_product'] },
            boost: 1.0,
            rescore_vector: {
              oversample: 1.5,
            },
          },
          [
            {
              field: '{field}',
              filter: { __scope_link: 'GLOBAL.query' },
              k: 10,
              num_candidates: 100,
              query_vector: [],
              query_vector_builder: {},
              similarity: { __one_of: ['l2_norm', 'cosine', 'dot_product', 'max_inner_product'] },
              boost: 1.0,
              rescore_vector: {
                oversample: 1.5,
              },
            },
          ],
        ],
      },
      retriever: {
        // populated by a global rule
      },
    },
  });

  specService.addEndpointDescription('render_search_template', {
    data_autocomplete_rules: {
      __one_of: [{ source: { __scope_link: 'search' } }, { __scope_link: 'GLOBAL.script' }],
      params: {},
    },
  });

  specService.addEndpointDescription('_search/template/{id}', {
    data_autocomplete_rules: {
      template: {
        __scope_link: 'search',
      },
    },
  });
};
