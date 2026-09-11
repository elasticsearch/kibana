/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Project API Journey monitors fixture. Same zip payload shape as browser
 * project monitors (`source.project.content`); Heartbeat routes `type: api`
 * to the api plugin instead of Chromium (elastic/synthetics#997).
 */
export const projectApiMonitorFixture = {
  keep_stale: true,
  project: 'test-suite',
  monitors: [
    {
      schedule: 10,
      locations: ['dev'],
      params: {},
      playwrightOptions: {
        extraHTTPHeaders: { 'x-test': '1' },
      },
      ignoreHTTPSErrors: true,
      name: 'orders api health',
      id: 'orders-api-health',
      tags: ['api'],
      content:
        'UEsDBBQACAAIAON5qVQAAAAAAAAAAAAAAAAfAAAAZXhhbXBsZXMvdG9kb3MvYmFzaWMuam91cm5leS50c22Q0WrDMAxF3/sVF7MHB0LMXlc6RvcN+wDPVWNviW0sdUsp/fe5SSiD7UFCWFfHujIGlpnkybwxFTZfoY/E3hsaLEtwhs9RPNWKDU12zAOxkXRIbN4tB9d9pFOJdO6EN2HMqQguWN9asFBuQVMmJ7jiWNII9fIXrbabdUYr58l9IhwhQQZCYORCTFFUC31Btj21NRc7Mq4Nds+4bDD/pNVgT9F52Jyr2Fa+g75LAPttg8yErk+S9ELpTmVotlVwnfNCuh2lepl3+JflUmSBJ3uggt1v9INW/lHNLKze9dJe1J3QJK8pSvWkm6aTtCet5puq+x63+AFQSwcIAPQ3VfcAAACcAQAAUEsBAi0DFAAIAAgA43mpVAD0N1X3AAAAnAEAAB8AAAAAAAAAAAAgAKSBAAAAAGV4YW1wbGVzL3RvZG9zL2Jhc2ljLmpvdXJuZXkudHNQSwUGAAAAAAEAAQBNAAAARAEAAAAA',
      filter: {
        match: 'orders api health',
      },
      hash: 'ekrjelkjrelkjre',
      max_attempts: 2,
      type: 'api',
    },
  ],
} as const;
