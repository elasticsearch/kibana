/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; youasync async  may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getCastingTypesSuggestions } from '../../../commands/definitions/utils/autocomplete/expressions/positions/after_cast';
import { fields, getFunctionSignaturesByReturnType, setup } from './helpers';
import { Location } from '../../../commands/registry/types';

const fieldsToTest = fields.filter(
  (field) => field.name !== 'any#Char$Field' && field.type !== 'unsupported'
);

describe('Inline Cast Autocomplete Suggestions', () => {
  it.each(fieldsToTest)('suggests casting types for $name', async (field) => {
    const { assertSuggestions } = await setup('^');
    await assertSuggestions(
      `FROM index_a | WHERE ${field.name}::^`,
      getCastingTypesSuggestions(field.type)
    );
  });

  it('suggests casting types when already partially writen', async () => {
    const { assertSuggestions } = await setup('^');
    await assertSuggestions(
      'FROM index_a | WHERE true::str^',
      getCastingTypesSuggestions('boolean')
    );
  });

  it('suggests casting types inside a function', async () => {
    const { assertSuggestions } = await setup('^');
    await assertSuggestions(
      'FROM index_a | WHERE abs(false::^)',
      getCastingTypesSuggestions('boolean')
    );
  });

  it('suggests operators after inline cast', async () => {
    const { assertSuggestions } = await setup('^');
    await assertSuggestions('FROM index_a | WHERE "false"::boolean ^', [
      '\n',
      '| ',
      ...getFunctionSignaturesByReturnType(
        Location.WHERE,
        'any',
        {
          operators: true,
          skipAssign: true,
        },
        ['boolean']
      ),
    ]);
  });
});
