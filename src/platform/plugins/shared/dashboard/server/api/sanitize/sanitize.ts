/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import type { Warnings } from '../types';
import type { DashboardSanitizeResponseBody } from './types';
import { transformDashboardIn, transformDashboardOut } from '../transforms';
import { stripUnmappedKeys } from '../scope_tooling';
import type { getDashboardStateSchema } from '../dashboard_state_schemas';

export async function sanitize(
  dashboardStateSchema: ReturnType<typeof getDashboardStateSchema>,
  dashboardState: DashboardState
): Promise<DashboardSanitizeResponseBody> {
  const warnings: Warnings = [];
  /**
   * Temporary escape hatch for lens as code
   * TODO remove transforms when lens as code transforms are ready for production
   * We need to run the full round-trip transform on the incoming state since Lens embeddable serializes
   * state in the editor format. Once we the Lens embeddable supports the API format we can remove the
   * transformDashboardIn and transformDashboardOut calls.
   */
  const { attributes: storedDashboardState, references } = transformDashboardIn(dashboardState);
  const { dashboardState: transformedApiDashboardState, warnings: dashboardStateWarnings } =
    transformDashboardOut(
      storedDashboardState ?? {},
      references ?? [],
      undefined,
      dashboardStateSchema
    );

  const { data: scopedDashboardState, warnings: scopeWarnings } = stripUnmappedKeys(
    transformedApiDashboardState as Partial<DashboardState>
  );
  warnings.push(...dashboardStateWarnings, ...scopeWarnings);
  // TODO: As part of sanitization, we should drop panels, filters, etc. that exceed their max array sizes
  const sanitizedDashboardState = dashboardStateSchema.parse(scopedDashboardState);

  // access_control is separate from the transforms and stripping logic since it is not part of the
  // dashboard saved object attributes but it should be preserved in the sanitized output if present
  // in the incoming dashboard state
  const { access_control } = dashboardState;
  return {
    data: {
      ...sanitizedDashboardState,
      ...(access_control !== undefined && { access_control }),
    },
    ...(warnings.length ? { warnings } : {}),
  };
}
