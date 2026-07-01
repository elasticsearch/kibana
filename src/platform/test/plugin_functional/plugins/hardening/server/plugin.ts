/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Plugin, CoreSetup } from '@kbn/core/server';
import { tryPollutingPrototypes, tryReassigningPrototypes } from '../common/pollute';
import { tryCodeGeneration } from '../common/code_generation';

export class HardeningPlugin implements Plugin {
  public setup(core: CoreSetup, deps: {}) {
    const router = core.http.createRouter();

    router.get(
      {
        path: '/internal/hardening/_pollute_prototypes',
        validate: false,
        security: { authz: { enabled: false, reason: '' } },
      },
      async (context, request, response) => {
        const result = tryPollutingPrototypes();
        return response.ok({ body: result });
      }
    );

    router.get(
      {
        path: '/internal/hardening/_reassign_prototypes',
        validate: false,
        security: { authz: { enabled: false, reason: '' } },
      },
      async (context, request, response) => {
        const result = tryReassigningPrototypes();
        return response.ok({ body: result });
      }
    );

    router.get(
      {
        path: '/internal/hardening/_try_code_generation',
        validate: false,
        security: { authz: { enabled: false, reason: '' } },
      },
      async (context, request, response) => {
        const result = tryCodeGeneration();
        return response.ok({ body: result });
      }
    );
  }

  public start() {}
  public stop() {}
}
