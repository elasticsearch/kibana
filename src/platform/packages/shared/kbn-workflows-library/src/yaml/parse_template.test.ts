/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseTemplateYaml, TemplateParseError } from './parse_template';

const VALID_TEMPLATE = `
template-metadata:
  slug: ip-reputation-check
  version: "1.1.0"
  availability: ">=9.5.0 <9.6.0"
  name: "IP Reputation Check (AbuseIPDB)"
  description: "Assess the reputation of an IP address using AbuseIPDB."
  solutions: [security]
  categories: [enrichment, threat-intel]
  install:
    form:
      - name: abuseipdb-connector
        label: "AbuseIPDB connector"
        inputType: connector
        connectorType: .abuseipdb

consts:
  abuseipdb_api_key: ""
inputs:
  - name: ip_address
    type: string
    required: true
triggers:
  - type: manual
steps:
  - name: query_abuseipdb
    type: abuseipdb.checkIp
    connector-id: __install__.abuseipdb-connector
    with:
      ipAddress: "{{ inputs.ip_address }}"
`;

describe('parseTemplateYaml', () => {
  it('should parse metadata and body when given a valid template', () => {
    const result = parseTemplateYaml(VALID_TEMPLATE);

    expect(result.metadata.slug).toBe('ip-reputation-check');
    expect(result.metadata.version).toBe('1.1.0');
    expect(result.metadata.availability).toBe('>=9.5.0 <9.6.0');
    expect(result.metadata.categories).toEqual(['enrichment', 'threat-intel']);
    expect(result.metadata.install?.form).toHaveLength(1);
    expect(result.metadata.install?.form[0]).toMatchObject({
      name: 'abuseipdb-connector',
      inputType: 'connector',
      connectorType: '.abuseipdb',
    });
  });

  it('should expose the workflow body without the template-metadata block', () => {
    const result = parseTemplateYaml(VALID_TEMPLATE);

    expect(result.body).toHaveProperty('consts');
    expect(result.body).toHaveProperty('inputs');
    expect(result.body).toHaveProperty('triggers');
    expect(result.body).toHaveProperty('steps');
    expect(result.body).not.toHaveProperty('template-metadata');
  });

  it('should preserve the raw YAML for preview', () => {
    const result = parseTemplateYaml(VALID_TEMPLATE);
    expect(result.raw).toBe(VALID_TEMPLATE);
  });

  it('should reject unknown fields in the template-metadata block (strict mode)', () => {
    const raw = `
template-metadata:
  slug: future-template
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "Future template"
  description: "Has a field this Kibana version does not know about yet."
  categories: [utility]
  someFutureField: hello
`;
    expect.assertions(2);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
    }
  });

  it('should strip unknown `template-metadata` fields in lenient mode (forward-compat)', () => {
    const raw = `
template-metadata:
  slug: future-template
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "Future template"
  description: "Has a field this Kibana version does not know about yet."
  categories: [utility]
  someFutureField: hello
`;
    const result = parseTemplateYaml(raw, { lenient: true });

    expect(result.metadata.slug).toBe('future-template');
    expect(result.metadata).not.toHaveProperty('someFutureField');
  });

  it('should throw `invalid-yaml` when the YAML is malformed', () => {
    expect.assertions(2);
    try {
      parseTemplateYaml('::not valid yaml::\n  - [');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-yaml');
    }
  });

  it('should throw `invalid-root` when the YAML root is not a mapping', () => {
    expect.assertions(2);
    try {
      parseTemplateYaml('- just\n- a\n- list');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-root');
    }
  });

  it('should throw `missing-metadata` when `template-metadata` is absent', () => {
    expect.assertions(2);
    try {
      parseTemplateYaml('steps:\n  - name: noop\n    type: noop');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('missing-metadata');
    }
  });

  it('should throw `invalid-metadata` when `version` is not valid semver', () => {
    const raw = `
template-metadata:
  slug: bad-version
  version: not-a-semver
  availability: ">=9.5.0"
  name: "Bad version"
  description: "Version is not semver."
  categories: [utility]
`;
    expect.assertions(3);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
      expect((err as TemplateParseError).message).toMatch(/version/);
    }
  });

  it('should throw `invalid-metadata` when `availability` is not a valid semver range', () => {
    const raw = `
template-metadata:
  slug: bad-range
  version: "1.0.0"
  availability: "not a range"
  name: "Bad range"
  description: "Availability is not a semver range."
  categories: [utility]
`;
    expect.assertions(3);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
      expect((err as TemplateParseError).message).toMatch(/availability/);
    }
  });

  it('should throw `invalid-metadata` when `slug` violates the slug pattern', () => {
    const raw = `
template-metadata:
  slug: BAD_SLUG
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "Bad slug"
  description: "Slug has uppercase letters and an underscore."
  categories: [utility]
`;
    expect.assertions(3);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
      expect((err as TemplateParseError).message).toMatch(/slug/);
    }
  });

  it('should throw `invalid-metadata` when a required field is missing', () => {
    const raw = `
template-metadata:
  slug: no-name
  version: "1.0.0"
  availability: ">=9.5.0"
  description: "Missing name."
  categories: [utility]
`;
    expect.assertions(3);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
      expect((err as TemplateParseError).message).toMatch(/name/);
    }
  });

  it('should throw `invalid-metadata` when `categories` is empty', () => {
    const raw = `
template-metadata:
  slug: no-categories
  version: "1.0.0"
  availability: ">=9.5.0"
  name: "No categories"
  description: "Empty categories array."
  categories: []
`;
    expect.assertions(3);
    try {
      parseTemplateYaml(raw);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateParseError);
      expect((err as TemplateParseError).reason).toBe('invalid-metadata');
      expect((err as TemplateParseError).message).toMatch(/categor/);
    }
  });
});
