/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import _ from 'lodash';

import type { SpecDefinitionsService } from '../../../../services';

import {
  spanFirstTemplate,
  spanNearTemplate,
  spanOrTemplate,
  spanNotTemplate,
  spanTermTemplate,
  spanContainingTemplate,
  spanWithinTemplate,
  wildcardTemplate,
  fuzzyTemplate,
  prefixTemplate,
  rangeTemplate,
  regexpTemplate,
} from './templates';

const matchOptions = {
  cutoff_frequency: 0.001,
  query: '',
  operator: {
    __one_of: ['and', 'or'],
  },
  zero_terms_query: {
    __one_of: ['none', 'all'],
  },
  max_expansions: 10,
  analyzer: '',
  boost: 1.0,
  lenient: {
    __one_of: ['true', 'false'],
  },
  fuzzy_transpositions: {
    __one_of: ['true', 'false'],
  },
  auto_generate_synonyms_phrase_query: {
    __one_of: ['true', 'false'],
  },
  fuzziness: 1.0,
  prefix_length: 1,
  minimum_should_match: 1,
};

const innerHits = {
  docvalue_fields: ['FIELD'],
  from: {},
  size: {},
  sort: {},
  name: {},
  highlight: {},
  _source: {
    __one_of: ['true', 'false'],
  },
  explain: {
    __one_of: ['true', 'false'],
  },
  script_fields: {
    __template: {
      FIELD: {
        script: {},
      },
    },
    '{field}': {
      script: {},
    },
  },
  version: {
    __one_of: ['true', 'false'],
  },
};

const SPAN_QUERIES_NO_FIELD_MASK = {
  // TODO add one_of for objects
  span_first: {
    __template: spanFirstTemplate,
    __scope_link: '.span_first',
  },
  span_near: {
    __template: spanNearTemplate,
    __scope_link: '.span_near',
  },
  span_or: {
    __template: spanOrTemplate,
    __scope_link: '.span_or',
  },
  span_not: {
    __template: spanNotTemplate,
    __scope_link: '.span_not',
  },
  span_term: {
    __template: spanTermTemplate,
    __scope_link: '.span_term',
  },
  span_containing: {
    __template: spanContainingTemplate,
    __scope_link: '.span_containing',
  },
  span_within: {
    __template: spanWithinTemplate,
    __scope_link: '.span_within',
  },
};

const SPAN_QUERIES = {
  ...SPAN_QUERIES_NO_FIELD_MASK,
  field_masking_span: {
    __template: {
      query: {
        SPAN_QUERY: {},
      },
    },
    query: SPAN_QUERIES_NO_FIELD_MASK,
    field: '',
  },
};

const SPAN_MULTI_QUERIES = {
  wildcard: {
    __template: wildcardTemplate,
    __scope_link: '.wildcard',
  },
  fuzzy: {
    __template: fuzzyTemplate,
    __scope_link: '.fuzzy',
  },
  prefix: {
    __template: prefixTemplate,
    __scope_link: '.prefix',
  },
  range: {
    __template: rangeTemplate,
    __scope_link: '.range',
  },
  regexp: {
    __template: regexpTemplate,
    __scope_link: '.regexp',
  },
};

const DECAY_FUNC_DESC = {
  __template: {
    FIELD: {
      origin: '',
      scale: '',
    },
  },
  '{field}': {
    origin: '',
    scale: '',
    offset: '',
    decay: 0.5,
  },
};

const SCORING_FUNCS = {
  script_score: {
    __template: {
      script: "_score * doc['f'].value",
    },
    script: {
      // populated by a global rule
    },
  },
  boost_factor: 2.0,
  random_score: {
    seed: 314159265359,
  },
  linear: DECAY_FUNC_DESC,
  exp: DECAY_FUNC_DESC,
  gauss: DECAY_FUNC_DESC,
  field_value_factor: {
    __template: {
      field: '',
    },
    field: '{field}',
    factor: 1.2,
    modifier: {
      __one_of: [
        'none',
        'log',
        'log1p',
        'log2p',
        'ln',
        'ln1p',
        'ln2p',
        'square',
        'sqrt',
        'reciprocal',
      ],
    },
  },
};

export const query = (specService: SpecDefinitionsService) => {
  specService.addGlobalAutocompleteRules('query', {
    match: {
      __template: {
        FIELD: 'TEXT',
      },
      '{field}': {
        type: {
          __one_of: ['phrase', 'phrase_prefix', 'boolean'],
        },
        ...matchOptions,
      },
    },
    match_phrase: {
      __template: {
        FIELD: 'PHRASE',
      },
      '{field}': {
        query: '',
        analyzer: '',
        slop: 1,
      },
    },
    match_phrase_prefix: {
      __template: {
        FIELD: 'PREFIX',
      },
      '{field}': {
        query: '',
        analyzer: '',
        max_expansions: 10,
        prefix_length: 1,
        fuzziness: 0.1,
      },
    },
    regexp: {
      __template: regexpTemplate,
      '{field}': {
        value: '',
        flags: {
          __one_of: ['ALL', 'ANYSTRING', 'COMPLEMENT', 'EMPTY', 'INTERSECTION', 'INTERVAL', 'NONE'],
        },
        max_determinized_states: 10000,
      },
    },
    multi_match: {
      __template: {
        query: '',
        fields: [],
      },
      ...matchOptions,
      fields: ['{field}'],
      use_dis_max: {
        __template: true,
        __one_of: [true, false],
      },
      tie_breaker: 0.0,
      type: {
        __one_of: ['best_fields', 'most_fields', 'cross_fields', 'phrase', 'phrase_prefix'],
      },
    },
    bool: {
      must: [
        {
          __scope_link: '.',
        },
      ],
      must_not: [
        {
          __scope_link: '.',
        },
      ],
      should: [
        {
          __scope_link: '.',
        },
      ],
      filter: [
        {
          __scope_link: '.',
        },
      ],
      minimum_should_match: 1,
      boost: 1.0,
    },
    boosting: {
      positive: {
        __scope_link: '.',
      },
      negative: {
        __scope_link: '.',
      },
      negative_boost: 0.2,
    },
    ids: {
      type: '',
      values: [],
    },
    constant_score: {
      __template: {
        filter: {},
        boost: 1.2,
      },
      query: {},
      filter: { __scope_link: 'GLOBAL.query' },
      boost: 1.2,
    },
    dis_max: {
      __template: {
        tie_breaker: 0.7,
        boost: 1.2,
        queries: [],
      },
      tie_breaker: 0.7,
      boost: 1.2,
      queries: [
        {
          __scope_link: '.',
        },
      ],
    },
    distance_feature: {
      __template: {
        field: '',
        origin: '',
        pivot: '',
      },
      field: '{field}',
      origin: '',
      pivot: '',
    },
    exists: {
      field: '',
    },
    field: {
      '{field}': {
        query: '',
        boost: 2.0,
        enable_position_increments: {
          __template: false,
          __one_of: [true, false],
        },
      },
    },
    fuzzy: {
      __template: fuzzyTemplate,
      '{field}': {
        value: '',
        boost: 1.0,
        fuzziness: 0.5,
        prefix_length: 0,
      },
    },
    has_child: {
      __template: {
        type: 'TYPE',
        query: {},
      },
      inner_hits: { ...innerHits },
      type: '',
      score_mode: {
        __one_of: ['none', 'max', 'sum', 'avg'],
      },
      _scope: '',
      query: {},
      min_children: 1,
      max_children: 10,
    },
    has_parent: {
      __template: {
        parent_type: 'TYPE',
        query: {},
      },
      parent_type: '',
      score_mode: {
        __one_of: ['none', 'score'],
      },
      _scope: '',
      query: {},
    },
    knn: {
      __template: {
        field: '',
        k: 10,
        num_candidates: 100,
        query_vector_builder: {
          text_embedding: {
            model_id: '',
            model_text: '',
          },
        },
      },
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
      rescore_vector: {
        oversample: 1.5,
      },
      similarity: { __one_of: ['l2_norm', 'cosine', 'dot_product', 'max_inner_product'] },
      boost: 1.0,
    },
    match_all: {
      boost: 1,
    },
    more_like_this: {
      __template: {
        fields: ['FIELD'],
        like: 'text like this one',
        min_term_freq: 1,
        max_query_terms: 12,
      },
      fields: ['{field}'],
      like: '',
      percent_terms_to_match: 0.3,
      min_term_freq: 2,
      max_query_terms: 25,
      stop_words: [''],
      min_doc_freq: 5,
      max_doc_freq: 100,
      min_word_len: 0,
      max_word_len: 0,
      boost_terms: 1,
      boost: 1.0,
      analyzer: '',
      docs: [
        {
          _index: '{index}',
          _id: '',
        },
      ],
      ids: [''],
    },
    mlt: {
      __template: {
        fields: ['FIELD'],
        like: 'text like this one',
        min_term_freq: 1,
        max_query_terms: 12,
      },
      __scope_link: '.more_like_this',
    },
    pinned: {
      __template: {
        organic: {},
        ids: [],
      },
      organic: {
        query: {},
      },
      ids: [],
    },
    prefix: {
      __template: prefixTemplate,
      '{field}': {
        value: '',
        boost: 1.0,
      },
    },
    rank_feature: {
      __template: {
        field: 'FIELD',
      },
      field: '{field}',
      boost: 1.0,
      saturation: {},
      log: {},
      sigmoid: {},
      linear: {},
    },
    query_string: {
      __template: {
        default_field: 'FIELD',
        query: 'this AND that OR thus',
      },
      query: '',
      default_field: '{field}',
      fields: ['{field}'],
      default_operator: {
        __one_of: ['OR', 'AND'],
      },
      analyzer: '',
      allow_leading_wildcard: {
        __one_of: [true, false],
      },
      enable_position_increments: {
        __one_of: [true, false],
      },
      fuzzy_max_expansions: 50,
      fuzziness: 0.5,
      fuzzy_prefix_length: 0,
      phrase_slop: 0,
      boost: 1.0,
      analyze_wildcard: {
        __one_of: [false, true],
      },
      auto_generate_phrase_queries: {
        __one_of: [false, true],
      },
      minimum_should_match: '20%',
      lenient: {
        __one_of: [false, true],
      },
      use_dis_max: {
        __one_of: [true, false],
      },
      tie_breaker: 0,
      time_zone: '+01:00',
    },
    simple_query_string: {
      __template: {
        query: '',
        fields: [],
      },
      query: '',
      fields: ['{field}'],
      default_operator: { __one_of: ['OR', 'AND'] },
      analyzer: '',
      flags: 'OR|AND|PREFIX',
      locale: 'ROOT',
      lenient: { __one_of: [true, false] },
    },
    range: {
      __template: rangeTemplate,
      '{field}': {
        __template: {
          gte: 10,
          lte: 20,
        },
        gte: 10,
        gt: 10,
        lte: 20,
        lt: 20,
        time_zone: '+01:00',
        boost: 1.0,
        format: 'dd/MM/yyyy||yyyy',
      },
    },
    rule: {
      __template: {
        organic: {},
        ruleset_ids: [''],
        match_criteria: {
          FIELD: 'VALUE',
        },
      },
    },
    semantic: {
      __template: {
        field: '',
        query: '',
      },
      field: '{field}',
      query: '',
    },
    span_first: {
      __template: spanFirstTemplate,
      match: SPAN_QUERIES,
    },
    span_multi: {
      __template: {
        match: {
          MULTI_TERM_QUERY: {},
        },
      },
      match: SPAN_MULTI_QUERIES,
    },
    span_near: {
      __template: spanNearTemplate,
      clauses: [SPAN_QUERIES],
      slop: 12,
      in_order: {
        __one_of: [false, true],
      },
      collect_payloads: {
        __one_of: [false, true],
      },
    },
    span_term: {
      __template: spanTermTemplate,
      '{field}': {
        value: '',
        boost: 2.0,
      },
    },
    span_not: {
      __template: spanNotTemplate,
      include: SPAN_QUERIES,
      exclude: SPAN_QUERIES,
    },
    span_or: {
      __template: spanOrTemplate,
      clauses: [SPAN_QUERIES],
    },
    span_containing: {
      __template: spanContainingTemplate,
      little: SPAN_QUERIES,
      big: SPAN_QUERIES,
    },
    span_within: {
      __template: spanWithinTemplate,
      little: SPAN_QUERIES,
      big: SPAN_QUERIES,
    },
    sparse_vector: {
      field: 'NAME',
      inference_id: '',
      query: '',
      prune: true,
      pruning_config: {
        tokens_freq_ratio_threshold: 5,
        tokens_weight_threshold: 0.4,
        only_score_pruned_tokens: false,
      },
      query_vector: {},
    },
    term: {
      __template: {
        FIELD: {
          value: 'VALUE',
        },
      },
      '{field}': {
        value: '',
        boost: 2.0,
      },
    },
    terms: {
      __template: {
        FIELD: ['VALUE1', 'VALUE2'],
      },
      '{field}': [''],
    },
    wildcard: {
      __template: wildcardTemplate,
      '{field}': {
        value: '',
        boost: 2.0,
      },
    },
    nested: {
      __template: {
        path: 'path_to_nested_doc',
        query: {},
      },
      inner_hits: { ...innerHits },
      path: '',
      query: {},
      score_mode: {
        __one_of: ['avg', 'total', 'max', 'none'],
      },
    },
    percolate: {
      __template: {
        field: '',
        document: {},
      },
      field: '',
      document: {},
      name: '',
      documents: [{}],
      document_type: '',
      index: '',
      type: '',
      id: '',
      routing: '',
      preference: '',
    },
    common: {
      __template: {
        FIELD: {
          query: {},
        },
      },
      '{field}': {
        query: {},
        cutoff_frequency: 0.001,
        minimum_should_match: {
          low_freq: {},
          high_freq: {},
        },
      },
    },
    custom_filters_score: {
      __template: {
        query: {},
        filters: [
          {
            filter: {},
          },
        ],
      },
      query: {},
      filters: [
        {
          filter: { __scope_link: 'GLOBAL.query' },
          boost: 2.0,
          script: {
            // populated by a global rule
          },
        },
      ],
      score_mode: {
        __one_of: ['first', 'min', 'max', 'total', 'avg', 'multiply'],
      },
      max_boost: 2.0,
      params: {},
      lang: '',
    },
    indices: {
      __template: {
        indices: ['INDEX1', 'INDEX2'],
        query: {},
      },
      indices: ['{index}'],
      query: {},
      no_match_query: {
        __scope_link: '.',
      },
    },
    geo_shape: {
      __template: {
        FIELD: {
          shape: {
            type: 'envelope',
            coordinates: [
              [-45, 45],
              [45, -45],
            ],
          },
          relation: 'within',
        },
      },
      '{field}': {
        shape: {
          type: '',
          coordinates: [],
        },
        indexed_shape: {
          id: '',
          index: '{index}',
          shape_field_name: 'shape',
        },
        relation: {
          __one_of: ['within', 'intersects', 'disjoint'],
        },
      },
    },
    geo_bounding_box: {
      __template: {
        FIELD: {
          top_left: {
            lat: 40.73,
            lon: -74.1,
          },
          bottom_right: {
            lat: 40.717,
            lon: -73.99,
          },
        },
      },
      '{field}': {
        top_left: {
          lat: 40.73,
          lon: -74.1,
        },
        bottom_right: {
          lat: 40.73,
          lon: -74.1,
        },
      },
      type: {
        __one_of: ['memory', 'indexed'],
      },
    },
    geo_distance: {
      __template: {
        distance: 100,
        FIELD: {
          lat: 40.73,
          lon: -74.1,
        },
      },
      distance: 100,
      distance_type: {
        __one_of: ['arc', 'plane'],
      },
      optimize_bbox: {
        __one_of: ['memory', 'indexed', 'none'],
      },
      '{field}': {
        lat: 40.73,
        lon: -74.1,
      },
    },
    geo_polygon: {
      __template: {
        FIELD: {
          points: [
            {
              lat: 40.73,
              lon: -74.1,
            },
            {
              lat: 40.83,
              lon: -75.1,
            },
          ],
        },
      },
      '{field}': {
        points: [
          {
            lat: 40.73,
            lon: -74.1,
          },
        ],
      },
    },
    // js hint gets confused here
    /* jshint -W015 */
    function_score: _.defaults(
      {
        __template: {
          query: {},
          functions: [{}],
        },
        query: {},
        functions: [
          _.defaults(
            {
              filter: { __scope_link: 'GLOBAL.query' },
              weight: 1.0,
            },
            SCORING_FUNCS
          ),
        ],
        boost: 1.0,
        boost_mode: {
          __one_of: ['multiply', 'replace', 'sum', 'avg', 'max', 'min'],
        },
        score_mode: {
          __one_of: ['multiply', 'sum', 'first', 'avg', 'max', 'min'],
        },
        max_boost: 10,
        min_score: 1.0,
      },
      SCORING_FUNCS
    ),
    script: {
      __template: {
        script: "_score * doc['f'].value",
      },
      script: {
        // populated by a global rule
      },
    },
    script_score: {
      __template: {
        script: {},
        query: {},
      },
      script: {},
      query: {},
      min_score: '',
      boost: 1.0,
    },
    wrapper: {
      __template: {
        query: 'QUERY_BASE64_ENCODED',
      },
      query: '',
    },
  });
};
