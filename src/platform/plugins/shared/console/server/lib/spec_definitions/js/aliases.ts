/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SpecDefinitionsService } from '../../../services';

export const aliases = (specService: SpecDefinitionsService) => {
  const aliasRules = {
    filter: { __scope_link: 'GLOBAL.query' },
    routing: '1',
    search_routing: '1,2',
    index_routing: '1',
    is_write_index: false,
    is_hidden: false,
  };
  specService.addGlobalAutocompleteRules('aliases', {
    '*': aliasRules,
  });
};
