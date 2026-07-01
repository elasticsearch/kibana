/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const MITRE_ATTACK_BASE_URL = 'https://attack.mitre.org';

/**
 * Builds the canonical attack.mitre.org reference URL for a MITRE ATT&CK
 * tactic, technique, or subtechnique ID. The MITRE URL scheme is stable:
 *
 *   tactic       TAxxxx     -> /tactics/TAxxxx/
 *   technique    Txxxx      -> /techniques/Txxxx/
 *   subtechnique Txxxx.yyy  -> /techniques/Txxxx/yyy/
 *
 * Returns `undefined` for IDs that do not match any of the known prefixes
 * (e.g. malformed input). Useful for outdated IDs whose `reference` is no
 * longer carried by the bundled dataset.
 */
export const buildMitreReferenceUrl = (id: string): string | undefined => {
  if (!id) {
    return undefined;
  }

  if (id.startsWith('TA')) {
    return `${MITRE_ATTACK_BASE_URL}/tactics/${id}/`;
  }

  if (id.startsWith('T')) {
    const [parent, child] = id.split('.');
    if (child) {
      return `${MITRE_ATTACK_BASE_URL}/techniques/${parent}/${child}/`;
    }
    return `${MITRE_ATTACK_BASE_URL}/techniques/${parent}/`;
  }

  return undefined;
};
