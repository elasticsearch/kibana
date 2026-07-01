/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Threats } from '@kbn/securitysolution-io-ts-alerting-types';

export type MitreThreatEntityType = 'tactic' | 'technique' | 'subtechnique';

export interface MitreThreatEntity {
  type: MitreThreatEntityType;
  id: string;
}

/**
 * Walks a rule's `threat` array and yields one `MitreThreatEntity` per
 * tactic, technique, and subtechnique entry found under the MITRE ATT&CK™
 * framework. Threat entries from other frameworks are skipped.
 *
 * Order is depth-first within each threat item:
 *   tactic, technique[0], technique[0].subtechnique[0..n], technique[1], ...
 *
 * The iterator does not dedupe — callers that need uniqueness should
 * collect into a `Set`.
 */
export function* iterateMitreThreatEntities(
  threats: Threats | undefined
): IterableIterator<MitreThreatEntity> {
  if (!threats || threats.length === 0) {
    return;
  }

  for (const threatItem of threats) {
    if (threatItem.framework === 'MITRE ATT&CK') {
      yield { type: 'tactic', id: threatItem.tactic.id };

      for (const technique of threatItem.technique ?? []) {
        yield { type: 'technique', id: technique.id };

        for (const subtechnique of technique.subtechnique ?? []) {
          yield { type: 'subtechnique', id: subtechnique.id };
        }
      }
    }
  }
}
