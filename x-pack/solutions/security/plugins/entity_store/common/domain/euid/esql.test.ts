/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  getEuidEsqlEvaluation,
  getEuidEsqlDocumentsContainsIdFilter,
  getEuidEsqlFilterBasedOnDocument,
  getFieldEvaluationsEsql,
  getFieldEvaluationsEsqlFromDefinition,
  collectRankingFields,
  buildRankingCaseEsql,
  buildSourcePickerEsql,
  buildDestinationFieldEsql,
  buildOneFieldEvaluationEsql,
} from './esql';
import type { EuidRankingBranch, FieldEvaluation } from '../definitions/entity_schema';
import { getEntityDefinition } from '../definitions/registry';

const normalize = (s: string) =>
  s
    .split(/\n/)
    .map((line) => line.replace(/\s{2,}/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

describe('getEuidEsqlFilterBasedOnDocument', () => {
  it('returns undefined when doc is falsy', () => {
    expect(getEuidEsqlFilterBasedOnDocument('host', null)).toBeUndefined();
    expect(getEuidEsqlFilterBasedOnDocument('generic', undefined)).toBeUndefined();
    expect(getEuidEsqlFilterBasedOnDocument('user', {})).toBeUndefined();
  });

  describe('generic', () => {
    it('returns ESQL filter with equality on entity.id when present', () => {
      const result = getEuidEsqlFilterBasedOnDocument('generic', { entity: { id: 'e-123' } });

      expect(result).toBe('(entity.id == "e-123")');
    });

    it('unwraps _source when doc is an Elasticsearch hit', () => {
      const result = getEuidEsqlFilterBasedOnDocument('generic', {
        _source: { entity: { id: 'e-123' } },
      });

      expect(result).toBe('(entity.id == "e-123")');
    });
  });

  describe('host', () => {
    it('returns filter with equality on host.id when present', () => {
      const result = getEuidEsqlFilterBasedOnDocument('host', {
        host: { name: 'to-be-ignored', id: 'host-id-1' },
      });

      expect(result).toBe('((host.id == "host-id-1"))');
    });

    it('returns filter with equality on host.name and null/empty check on host.id when host.id is missing', () => {
      const result = getEuidEsqlFilterBasedOnDocument('host', { host: { name: 'server1' } });

      expect(result).toBe(
        '((host.name == "server1") AND (TO_STRING(host.id) IS NULL OR TO_STRING(host.id) == ""))'
      );
    });

    it('returns filter with equality on host.hostname and null/empty checks when only host.hostname is present', () => {
      const result = getEuidEsqlFilterBasedOnDocument('host', { host: { hostname: 'node-1' } });

      expect(result).toBe(
        '((host.hostname == "node-1") AND (TO_STRING(host.id) IS NULL OR TO_STRING(host.id) == "") AND (TO_STRING(host.name) IS NULL OR TO_STRING(host.name) == ""))'
      );
    });

    it('precedence: uses host.id when both host.id and host.name are present', () => {
      const result = getEuidEsqlFilterBasedOnDocument('host', {
        host: { id: 'e1', name: 'myserver' },
      });

      expect(result).toBe('((host.id == "e1"))');
    });
  });

  describe('user', () => {
    it('returns filter with user.email and source clause when event.module is present (whenClause expands to sourceMatchesAny)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'alice@example.com' },
        event: { kind: 'asset', module: 'okta' },
      });

      expect(result).toBe(
        '((user.email == "alice@example.com") AND (((event.module == "okta") OR STARTS_WITH(data_stream.dataset, "okta")) OR ((event.module == "entityanalytics_okta") OR STARTS_WITH(data_stream.dataset, "entityanalytics_okta"))))'
      );
    });

    it('returns filter with user.email and unknown source clause when no event.module or data_stream.dataset', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'alice@example.com' },
        event: { kind: 'asset' },
      });

      expect(result).toBe(
        '((user.email == "alice@example.com") AND ((TO_STRING(event.module) IS NULL OR TO_STRING(event.module) == "") AND (TO_STRING(data_stream.dataset) IS NULL OR TO_STRING(data_stream.dataset) == "")))'
      );
    });

    it('returns filter with user.name and source clause (event.module whenClause) and null/empty checks on higher-ranked identity fields', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { name: 'alice' },
        event: { kind: 'asset', module: 'azure' },
      });

      expect(result).toBe(
        '((user.name == "alice") AND (TO_STRING(user.email) IS NULL OR TO_STRING(user.email) == "") AND (TO_STRING(user.id) IS NULL OR TO_STRING(user.id) == "") AND (TO_STRING(user.domain) IS NULL OR TO_STRING(user.domain) == "") AND (((event.module == "azure") OR STARTS_WITH(data_stream.dataset, "azure")) OR ((event.module == "entityanalytics_entra_id") OR STARTS_WITH(data_stream.dataset, "entityanalytics_entra_id"))))'
      );
    });

    it('returns undefined when doc passes documentsFilter but fails postAggFilter (no asset/iam/entity.id)', () => {
      expect(
        getEuidEsqlFilterBasedOnDocument('user', {
          user: { id: 'user-id-42' },
          event: { module: 'o365' },
        })
      ).toBeUndefined();
    });

    it('returns undefined when no user id fields are present', () => {
      expect(getEuidEsqlFilterBasedOnDocument('user', {})).toBeUndefined();
    });

    it('precedence: uses user.email and source clause when both user.email and user.id are present', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'alice@example.com', id: 'user-42' },
        event: { kind: 'asset', module: 'entityanalytics_okta' },
      });

      expect(result).toBe(
        '((user.email == "alice@example.com") AND (((event.module == "okta") OR STARTS_WITH(data_stream.dataset, "okta")) OR ((event.module == "entityanalytics_okta") OR STARTS_WITH(data_stream.dataset, "entityanalytics_okta"))))'
      );
    });

    it('returns filter for user.name and user.domain with source clause (single value from whenClause)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { name: 'jane', domain: 'corp.com' },
        event: { kind: 'asset', module: 'entityanalytics_ad' },
      });

      expect(result).toBe(
        '((user.name == "jane") AND (user.domain == "corp.com") AND (TO_STRING(user.email) IS NULL OR TO_STRING(user.email) == "") AND (TO_STRING(user.id) IS NULL OR TO_STRING(user.id) == "") AND ((event.module == "entityanalytics_ad") OR STARTS_WITH(data_stream.dataset, "entityanalytics_ad")))'
      );
    });

    it('returns filter with single value source clause when event.module has no whenClause match (e.g. aws)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'romulo@elastic.co' },
        event: { kind: 'asset', module: 'aws' },
      });

      expect(result).toBe(
        '((user.email == "romulo@elastic.co") AND ((event.module == "aws") OR STARTS_WITH(data_stream.dataset, "aws")))'
      );
    });

    it('returns filter with source clause from first chunk of data_stream.dataset when event.module is missing', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'romulo@elastic.co' },
        event: { kind: 'asset' },
        data_stream: { dataset: 'aws.cloudtrail' },
      });

      expect(result).toBe(
        '((user.email == "romulo@elastic.co") AND ((event.module == "aws") OR STARTS_WITH(data_stream.dataset, "aws")))'
      );
    });
  });

  describe('service', () => {
    it('returns undefined when service.name is missing (single-field identity)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('service', {
        service: { entity: { id: 'svc-entity-1' } },
      });

      expect(result).toBeUndefined();
    });

    it('returns filter with equality on service.name (single-field identity)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('service', {
        service: { name: 'api-gateway' },
      });

      expect(result).toBe('(service.name == "api-gateway")');
    });

    it('uses service.name when both service.entity.id and service.name are present (single-field identity)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('service', {
        service: { entity: { id: 'svc-e1' }, name: 'api-gateway' },
      });

      expect(result).toBe('(service.name == "api-gateway")');
    });
  });
});

describe('getEuidEsqlDocumentsContainsIdFilter', () => {
  it('returns single field condition for generic (one required field)', () => {
    const result = getEuidEsqlDocumentsContainsIdFilter('generic');

    expect(result).toBe('(TO_STRING(entity.id) IS NOT NULL AND TO_STRING(entity.id) != "")');
  });

  it('returns OR of required fields for host', () => {
    const result = getEuidEsqlDocumentsContainsIdFilter('host');

    const expected =
      'TO_STRING(host.id) IS NOT NULL AND TO_STRING(host.id) != "" OR TO_STRING(host.name) IS NOT NULL AND TO_STRING(host.name) != "" OR TO_STRING(host.hostname) IS NOT NULL AND TO_STRING(host.hostname) != ""';
    expect(result).toBe(expected);
  });

  it('returns documents filter AND postAggFilter for user (IDP or non-IDP only)', () => {
    const result = getEuidEsqlDocumentsContainsIdFilter('user');

    expect(result).toMatchSnapshot();
  });
});

describe('getFieldEvaluationsEsql', () => {
  it.each(['generic', 'host', 'service'] as const)(
    'returns shared entity.source EVAL fragment for %s',
    (entityType) => {
      const result = getFieldEvaluationsEsql(entityType);

      expect(result).toContain('_src_entity_source0 = MV_FIRST(TO_STRING(event.module))');
      expect(result).toContain('_src_entity_source1 = MV_FIRST(TO_STRING(event.dataset))');
      expect(result).toContain('_src_entity_source2 = MV_FIRST(TO_STRING(data_stream.dataset))');
      // Multi-source picker uses COALESCE of single-arm CaseEagerEvaluators
      expect(result).toContain('_src_entity_source = COALESCE(');
      // entity.source has no whenClauses -> 2-arm CASE (already CaseEagerEvaluator)
      expect(result).toContain('entity.source = CASE(');
      expect(result).toContain('_src_entity_source)');
    }
  );

  it('returns only entity.source for user (entity.namespace is now in getEuidEsqlEvaluation)', () => {
    const result = getFieldEvaluationsEsqlFromDefinition(getEntityDefinition('user', 'default'));

    expect(result).toBeDefined();
    // entity.source has no whenClauses -> 2-arm CASE (already CaseEagerEvaluator)
    expect(result).toContain('entity.source = CASE(');
    // entity.namespace is now emitted by getEuidEsqlEvaluation, not here
    expect(result).not.toContain('entity.namespace');
    expect(result).not.toContain('entity.confidence');
  });

  it('getEuidEsqlEvaluation includes entity.namespace for user', () => {
    const result = getEuidEsqlEvaluation('user', 'entity.id');

    // Destination now uses COALESCE of single-arm CaseEagerEvaluators
    expect(result).toContain('entity.namespace = COALESCE(');
    expect(result).toContain('_src_entity_namespace');
    expect(result).toContain('"local"');
    expect(result).toContain('"unknown"');
    // namespace computed before the _present booleans that reference it
    const namespacePos = result.indexOf('entity.namespace =');
    const presentPos = result.indexOf('entity_namespace_present =');
    expect(namespacePos).toBeLessThan(presentPos);
  });
});

describe('getEuidEsqlEvaluation', () => {
  it('returns bare assignment for single-field identity (generic)', () => {
    const result = getEuidEsqlEvaluation('generic', 'entity.id');

    expect(normalize(result)).toBe('entity.id = TO_STRING(entity.id)');
  });

  it('returns bare assignment for single-field identity (service)', () => {
    const result = getEuidEsqlEvaluation('service', 'entity.id');

    expect(normalize(result)).toBe(`entity.id = CONCAT("service:", TO_STRING(service.name))`);
  });

  it('returns _present booleans followed by output assignment for host', () => {
    const result = getEuidEsqlEvaluation('host', 'entity.id');

    expect(result).toContain(
      'host_id_present = TO_STRING(host.id) IS NOT NULL AND TO_STRING(host.id) != ""'
    );
    expect(result).toContain('host_name_present =');
    expect(result).toContain('host_hostname_present =');
    expect(result).toContain('host_id_present');
    expect(result).not.toMatch(/entity\.id.*IS NOT NULL AND/);
    expect(result).toContain('TO_STRING(host.id)');
    expect(result).toMatch(/entity\.id\s*=\s*CONCAT/);
  });

  it('returns _present booleans for all user identity fields', () => {
    const result = getEuidEsqlEvaluation('user', 'entity.id');

    expect(result).toContain('entity_namespace_present =');
    expect(result).toContain('user_email_present =');
    expect(result).toContain('user_id_present =');
    expect(result).toContain('user_name_present =');
    expect(result).not.toMatch(/entity\.id.*IS NOT NULL AND/);
  });

  it('honours the outputColumn parameter', () => {
    const result = getEuidEsqlEvaluation('host', 'my_custom_euid');

    expect(result).toContain('my_custom_euid =');
    expect(result).not.toContain('entity.id =');
  });
});

describe('getEuidEsqlFilterBasedOnDocument user local namespace', () => {
  it('uses user.name@host.id@entity.namespace when fieldEvaluations set entity.namespace to local', () => {
    const result = getEuidEsqlFilterBasedOnDocument('user', {
      user: { name: 'alice' },
      host: { id: 'host-1' },
      event: { category: 'authentication' },
    });

    expect(result).toContain('user.name == "alice"');
    expect(result).toContain('host.id == "host-1"');
  });

  it('uses else ranking when entity.namespace is not local', () => {
    const result = getEuidEsqlFilterBasedOnDocument('user', {
      user: { email: 'alice@example.com' },
      event: { kind: 'asset', module: 'okta' },
    });

    expect(result).toContain('user.email == "alice@example.com"');
    expect(result).not.toContain('host.id');
  });

  describe('evaluated fields and source clauses', () => {
    it('does not add filter on evaluated fields (entity.namespace) since they are not stored', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { email: 'alice@example.com' },
        event: { kind: 'asset', module: 'okta' },
      });

      expect(result).toBeDefined();
      expect(result).not.toMatch(/entity\.namespace\s*==/);
      expect(result).not.toMatch(/entity\.confidence\s*==/);
    });

    it('includes source clause for entity.namespace evaluation (event.module, data_stream.dataset)', () => {
      const result = getEuidEsqlFilterBasedOnDocument('user', {
        user: { name: 'jane', domain: 'corp.com' },
        event: { kind: 'asset', module: 'entityanalytics_ad' },
      });

      expect(result).toBeDefined();
      expect(result).toContain('event.module');
      expect(result).toContain('data_stream.dataset');
      expect(result).not.toMatch(/entity\.namespace\s*==/);
      expect(result).not.toMatch(/entity\.confidence\s*==/);
    });
  });
});

// ---------------------------------------------------------------------------
// Builder helpers (unit-level documentation tests)
// ---------------------------------------------------------------------------

describe('collectRankingFields', () => {
  it('returns an empty set for a single-arm single-field branch (no _present columns needed)', () => {
    const branches: EuidRankingBranch[] = [{ ranking: [[{ field: 'service.name' }]] }];

    expect(collectRankingFields(branches)).toEqual(new Set());
  });

  it('returns all fields for a multi-arm branch', () => {
    const branches: EuidRankingBranch[] = [
      { ranking: [[{ field: 'host.id' }], [{ field: 'host.name' }], [{ field: 'host.hostname' }]] },
    ];

    expect(collectRankingFields(branches)).toEqual(
      new Set(['host.id', 'host.name', 'host.hostname'])
    );
  });

  it('extracts only EuidFields from composed arms, excluding separators', () => {
    const branches: EuidRankingBranch[] = [
      { ranking: [[{ field: 'user.name' }, { sep: '@' }, { field: 'host.id' }]] },
    ];

    expect(collectRankingFields(branches)).toEqual(new Set(['user.name', 'host.id']));
  });

  it('collects fields across multiple branches', () => {
    const branches: EuidRankingBranch[] = [
      { ranking: [[{ field: 'user.name' }, { sep: '@' }, { field: 'host.id' }]] },
      { ranking: [[{ field: 'user.email' }], [{ field: 'user.name' }]] },
    ];

    expect(collectRankingFields(branches)).toEqual(new Set(['user.name', 'host.id', 'user.email']));
  });
});

describe('buildRankingCaseEsql', () => {
  it('returns a bare _present_or_null column ref for a single-arm single-field ranking', () => {
    const ranking = [[{ field: 'host.id' }]];
    const aliases = new Map([['host.id', 'host_id_present_or_null']]);

    expect(buildRankingCaseEsql(ranking, aliases)).toBe('host_id_present_or_null');
  });

  it('falls back to TO_STRING(<field>) when the field is not in the alias map', () => {
    const ranking = [[{ field: 'host.id' }]];

    expect(buildRankingCaseEsql(ranking, new Map())).toBe('TO_STRING(host.id)');
  });

  it('returns CONCAT for a single composed arm (NULL when any component is absent)', () => {
    const ranking = [[{ field: 'user.name' }, { sep: '@' }, { field: 'host.id' }]];
    const aliases = new Map([
      ['user.name', 'user_name_present_or_null'],
      ['host.id', 'host_id_present_or_null'],
    ]);

    expect(buildRankingCaseEsql(ranking, aliases)).toBe(
      'CONCAT(user_name_present_or_null, "@", host_id_present_or_null)'
    );
  });

  it('returns COALESCE of arms for a multi-arm ranking, preserving priority order', () => {
    const ranking = [
      [{ field: 'host.id' }],
      [{ field: 'host.name' }],
      [{ field: 'host.hostname' }],
    ];
    const aliases = new Map([
      ['host.id', 'host_id_present_or_null'],
      ['host.name', 'host_name_present_or_null'],
      ['host.hostname', 'host_hostname_present_or_null'],
    ]);

    expect(buildRankingCaseEsql(ranking, aliases)).toBe(
      'COALESCE(host_id_present_or_null, host_name_present_or_null, host_hostname_present_or_null)'
    );
  });

  it('throws on an empty ranking', () => {
    expect(() => buildRankingCaseEsql([], new Map())).toThrow('No euid fields found');
  });

  it('throws when a single arm starts with a separator', () => {
    expect(() => buildRankingCaseEsql([[{ sep: '@' }]], new Map())).toThrow(
      'Separator found in single field'
    );
  });
});

describe('buildSourcePickerEsql', () => {
  it('returns a COALESCE of single-arm CASEs, one per source variable', () => {
    expect(buildSourcePickerEsql('_src_entity_source', 2)).toBe(
      'COALESCE(' +
        'CASE(_src_entity_source0 IS NOT NULL AND _src_entity_source0 != "", _src_entity_source0), ' +
        'CASE(_src_entity_source1 IS NOT NULL AND _src_entity_source1 != "", _src_entity_source1)' +
        ')'
    );
  });

  it('works for count=1 (degenerate single-arm COALESCE)', () => {
    expect(buildSourcePickerEsql('_src', 1)).toBe(
      'COALESCE(CASE(_src0 IS NOT NULL AND _src0 != "", _src0))'
    );
  });

  it('throws for count=0 (would produce invalid COALESCE())', () => {
    expect(() => buildSourcePickerEsql('_src', 0)).toThrow(
      'buildSourcePickerEsql requires at least one source variable'
    );
  });
});

describe('buildDestinationFieldEsql', () => {
  it('no whenClauses -> simple 2-arm CASE (fallback then pass-through)', () => {
    const { expression, conditionPrecomputes } = buildDestinationFieldEsql(
      '_src',
      '_eval_dest',
      '"default"',
      []
    );

    expect(conditionPrecomputes).toEqual([]);
    expect(expression).toBe('CASE(_src IS NULL OR _src == "", "default", _src)');
  });

  it('sourceMatchesAny whenClause -> COALESCE with IN list, no precompute columns emitted', () => {
    const { expression, conditionPrecomputes } = buildDestinationFieldEsql(
      '_src',
      '_eval_dest',
      '"unknown"',
      [{ sourceMatchesAny: ['okta', 'entityanalytics_okta'], then: 'okta' }]
    );

    expect(conditionPrecomputes).toEqual([]);
    expect(expression).toBe(
      'COALESCE(' +
        'CASE(COALESCE(_src IN ("okta", "entityanalytics_okta"), FALSE), "okta"), ' +
        'CASE(_src IS NULL OR _src == "", "unknown"), ' +
        '_src' +
        ')'
    );
  });

  it('condition whenClause -> emits one precompute column and references it in the COALESCE arm', () => {
    const { expression, conditionPrecomputes } = buildDestinationFieldEsql(
      '_src',
      '_eval_dest',
      '"unknown"',
      [{ condition: { field: 'event.kind', eq: 'asset' }, then: 'local' }]
    );

    expect(conditionPrecomputes).toEqual([
      { colName: '_eval_dest_arm0', esql: 'TO_STRING(event.kind) == "asset"' },
    ]);
    expect(expression).toBe(
      'COALESCE(' +
        'CASE(COALESCE(_eval_dest_arm0, FALSE), "local"), ' +
        'CASE(_src IS NULL OR _src == "", "unknown"), ' +
        '_src' +
        ')'
    );
  });
});

describe('buildOneFieldEvaluationEsql', () => {
  it('single source, no whenClauses -> one source assignment then destination CASE', () => {
    const evaluation: FieldEvaluation = {
      destination: 'entity.source',
      sources: [{ field: 'event.module' }],
      fallbackValue: null,
      whenClauses: [],
    };

    const result = normalize(buildOneFieldEvaluationEsql(evaluation));

    expect(result).toBe(
      '_src_entity_source = MV_FIRST(TO_STRING(event.module)),\n' +
        'entity.source = CASE(_src_entity_source IS NULL OR _src_entity_source == "", NULL, _src_entity_source)'
    );
  });

  it('multiple sources -> per-source numbered assignments, a picker, then destination', () => {
    const evaluation: FieldEvaluation = {
      destination: 'entity.namespace',
      sources: [
        { field: 'event.module' },
        { firstChunkOfField: 'data_stream.dataset', splitBy: '.' },
      ],
      fallbackValue: 'unknown',
      whenClauses: [],
    };

    const result = normalize(buildOneFieldEvaluationEsql(evaluation));

    expect(result).toContain('_src_entity_namespace0 = MV_FIRST(TO_STRING(event.module))');
    expect(result).toContain(
      '_src_entity_namespace1 = MV_FIRST(SPLIT(MV_FIRST(TO_STRING(data_stream.dataset)), "."))'
    );
    expect(result).toContain(
      '_src_entity_namespace = COALESCE(CASE(_src_entity_namespace0 IS NOT NULL'
    );
    expect(result).toContain('entity.namespace = CASE(_src_entity_namespace IS NULL');
  });

  it('condition whenClause -> precompute boolean column appears before destination assignment', () => {
    const evaluation: FieldEvaluation = {
      destination: 'entity.namespace',
      sources: [{ field: 'event.module' }],
      fallbackValue: 'unknown',
      whenClauses: [{ condition: { field: 'event.kind', eq: 'asset' }, then: 'local' }],
    };

    const result = normalize(buildOneFieldEvaluationEsql(evaluation));
    const precomputePos = result.indexOf(
      '_eval_entity_namespace_arm0 = (TO_STRING(event.kind) == "asset")'
    );
    const destinationPos = result.indexOf('entity.namespace = COALESCE(');

    expect(precomputePos).toBeGreaterThan(-1);
    expect(destinationPos).toBeGreaterThan(precomputePos);
  });

  it('throws when sources is empty', () => {
    const evaluation: FieldEvaluation = {
      destination: 'entity.source',
      sources: [],
      fallbackValue: null,
      whenClauses: [],
    };

    expect(() => buildOneFieldEvaluationEsql(evaluation)).toThrow(
      'buildOneFieldEvaluationEsql: field evaluation "entity.source" has no sources'
    );
  });
});
