/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const { execFileSync } = require('child_process');
const Path = require('path');

const SCRIPT = Path.join(__dirname, 'get_connector_ids.js');

function run(connectors, evalModelGroups) {
  return execFileSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      KIBANA_TESTING_INFERENCE_ENDPOINTS: JSON.stringify(connectors),
      EVAL_MODEL_GROUPS: evalModelGroups,
    },
  }).trim();
}

const OPENROUTER_GPT = {
  'openrouter-openai-gpt-5-4': {
    provider: 'openai',
    providerConfig: { model_id: 'openai/gpt-5.4' },
  },
};

const EIS_GPT = {
  'eis-openai-gpt-5-4': {
    provider: 'elastic',
    providerConfig: { model_id: 'openai-gpt-5.4' },
  },
};

describe('get_connector_ids', () => {
  it('matches `openrouter/<provider>-<model>` groups to the slugified connector id', () => {
    expect(run(OPENROUTER_GPT, 'openrouter/openai-gpt-5.4')).toBe('openrouter-openai-gpt-5-4');
  });

  it('matches a native OpenRouter id against providerConfig.model_id', () => {
    expect(run(OPENROUTER_GPT, 'openai/gpt-5.4')).toBe('openrouter-openai-gpt-5-4');
  });

  it('still matches `eis/<modelId>` groups', () => {
    expect(run(EIS_GPT, 'eis/openai-gpt-5.4')).toBe('eis-openai-gpt-5-4');
  });

  it('does not match `eis/<modelId>` groups against non-EIS endpoint defs', () => {
    expect(() => run(OPENROUTER_GPT, 'eis/openai/gpt-5.4')).toThrow();
  });
});
