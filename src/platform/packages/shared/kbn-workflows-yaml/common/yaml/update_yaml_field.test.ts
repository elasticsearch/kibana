/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { updateYamlField } from './update_yaml_field';

describe('updateYamlField', () => {
  it('should update enabled field while preserving formatting', () => {
    const yaml = `name: Test Workflow
enabled: true
steps: []`;

    const result = updateYamlField(yaml, 'enabled', false);

    expect(result).toContain('enabled: false');
    expect(result).not.toContain('enabled: true');
    expect(result).toContain('name: Test Workflow');
    expect(result).toContain('steps: []');
  });

  it('should preserve comments when updating fields', () => {
    const yaml = `# This is a comment
name: Test Workflow
# Another comment
enabled: true

# Steps section
steps: []`;

    const result = updateYamlField(yaml, 'enabled', false);

    expect(result).toContain('# This is a comment');
    expect(result).toContain('# Another comment');
    expect(result).toContain('# Steps section');
    expect(result).toContain('enabled: false');
    expect(result).not.toContain('enabled: true');
  });

  it('should preserve blank lines when updating fields', () => {
    const yaml = `name: Test Workflow

enabled: true

steps: []`;

    const result = updateYamlField(yaml, 'enabled', false);

    expect(result).toContain('\n\n'); // Blank lines should be preserved
    expect(result).toContain('enabled: false');
  });

  it('should add field if it does not exist', () => {
    const yaml = `name: Test Workflow
steps: []`;

    const result = updateYamlField(yaml, 'enabled', true);

    expect(result).toContain('enabled: true');
    expect(result).toContain('name: Test Workflow');
    expect(result).toContain('steps: []');
  });

  it('should update name field', () => {
    const yaml = `name: Old Name
steps: []`;

    const result = updateYamlField(yaml, 'name', 'New Name');

    expect(result).toContain('name: New Name');
    expect(result).not.toContain('name: Old Name');
  });

  it('should update description field', () => {
    const yaml = `name: Test Workflow
steps: []`;

    const result = updateYamlField(yaml, 'description', 'A test workflow');

    expect(result).toContain('description: A test workflow');
    expect(result).toContain('name: Test Workflow');
  });

  it('should update tags field', () => {
    const yaml = `name: Test Workflow
steps: []`;

    const result = updateYamlField(yaml, 'tags', ['tag1', 'tag2']);

    expect(result).toContain('tags:');
    expect(result).toContain('tag1');
    expect(result).toContain('tag2');
  });

  it('should handle multiple field updates', () => {
    const yaml = `name: Old Name
enabled: true
steps: []`;

    let result = updateYamlField(yaml, 'name', 'New Name');
    result = updateYamlField(result, 'enabled', false);

    expect(result).toContain('name: New Name');
    expect(result).toContain('enabled: false');
    expect(result).not.toContain('name: Old Name');
    expect(result).not.toContain('enabled: true');
  });

  it('should return original YAML if parsing fails', () => {
    const invalidYaml = 'invalid: yaml: content: [';

    const result = updateYamlField(invalidYaml, 'enabled', false);

    // Should return original YAML as fallback
    expect(result).toBe(invalidYaml);
  });

  it('should preserve complex formatting with nested structures', () => {
    const yaml = `name: Test Workflow
# Comment before enabled
enabled: true

steps:
  # Step comment
  - name: step1
    type: console`;

    const result = updateYamlField(yaml, 'enabled', false);

    expect(result).toContain('# Comment before enabled');
    expect(result).toContain('# Step comment');
    expect(result).toContain('enabled: false');
    expect(result).toContain('steps:');
    expect(result).toContain('- name: step1');
  });

  it('should preserve comments, blank lines, and formatting when toggling enabled', () => {
    const yaml = `# Workflow configuration
name: Test Workflow
description: A workflow that does things

# Whether the workflow is active
enabled: false

steps:
  # Create a Jira ticket
  - name: step1
    type: jira
    params:
      summary: test

  # Notify the user
  - name: step2
    type: slack
    params:
      channel: general`;

    const result = updateYamlField(yaml, 'enabled', true);

    // Only the enabled value should change
    expect(result).toContain('enabled: true');
    expect(result).not.toContain('enabled: false');

    // All comments preserved
    expect(result).toContain('# Workflow configuration');
    expect(result).toContain('# Whether the workflow is active');
    expect(result).toContain('# Create a Jira ticket');
    expect(result).toContain('# Notify the user');

    // Blank lines preserved
    const blankLineCount = (result.match(/\n\n/g) || []).length;
    expect(blankLineCount).toBeGreaterThanOrEqual(3);

    // Rest of content unchanged
    expect(result).toContain('name: Test Workflow');
    expect(result).toContain('description: A workflow that does things');
    expect(result).toContain('channel: general');
  });

  it('should preserve template expressions like {{ inputs.comment }}', () => {
    const yaml = `name: Test Workflow
enabled: false
steps:
  - name: step1
    type: jira
    params:
      comment: "{{ inputs.comment }}"`;

    const result = updateYamlField(yaml, 'enabled', true);

    expect(result).toContain('enabled: true');
    expect(result).toContain('comment: "{{ inputs.comment }}"');
  });

  it('should handle nested field paths with dot notation', () => {
    const yaml = `metadata:
  version: 1.0
  author: Old Author
steps: []`;

    const result = updateYamlField(yaml, 'metadata.author', 'New Author');

    expect(result).toContain('author: New Author');
    expect(result).not.toContain('author: Old Author');
    expect(result).toContain('version: 1.0');
    expect(result).toContain('steps: []');
  });

  // The .toContain() checks above let the previous doc.toString()-based
  // implementation pass while it silently reformatted the rest of the source.
  // These tests assert byte-exact equality.
  describe('byte-exact preservation', () => {
    it('flips enabled without touching anything else', () => {
      const yaml = `name: Test Workflow
enabled: true
steps: []`;
      expect(updateYamlField(yaml, 'enabled', false)).toBe(
        `name: Test Workflow
enabled: false
steps: []`
      );
    });

    it('preserves 4-space indentation', () => {
      const yaml = `name: Test
enabled: true
steps:
    - name: step1
      type: console
      with:
          message: hello`;
      expect(updateYamlField(yaml, 'enabled', false)).toBe(
        `name: Test
enabled: false
steps:
    - name: step1
      type: console
      with:
          message: hello`
      );
    });

    it('preserves blank lines, comments, and sequence formatting', () => {
      const yaml = `# Workflow configuration
name: Test Workflow
description: A workflow that does things

# Whether the workflow is active
enabled: false

steps:
  # Create a Jira ticket
  - name: step1
    type: jira
    params:
      summary: test

  # Notify the user
  - name: step2
    type: slack
    params:
      channel: general`;
      expect(updateYamlField(yaml, 'enabled', true)).toBe(
        `# Workflow configuration
name: Test Workflow
description: A workflow that does things

# Whether the workflow is active
enabled: true

steps:
  # Create a Jira ticket
  - name: step1
    type: jira
    params:
      summary: test

  # Notify the user
  - name: step2
    type: slack
    params:
      channel: general`
      );
    });

    it('preserves single-quoted scalars elsewhere in the document', () => {
      const yaml = `name: Test
enabled: false
steps:
  - name: step1
    type: jira
    with:
      summary: 'plain text'
      comment: "{{ inputs.comment }}"`;
      expect(updateYamlField(yaml, 'enabled', true)).toBe(
        `name: Test
enabled: true
steps:
  - name: step1
    type: jira
    with:
      summary: 'plain text'
      comment: "{{ inputs.comment }}"`
      );
    });

    it('preserves block scalars', () => {
      const yaml = `name: Test
enabled: false
steps:
  - name: step1
    type: console
    with:
      message: |
        line one
        line two
      footer: >
        folded
        scalar`;
      expect(updateYamlField(yaml, 'enabled', true)).toBe(
        `name: Test
enabled: true
steps:
  - name: step1
    type: console
    with:
      message: |
        line one
        line two
      footer: >
        folded
        scalar`
      );
    });

    it('preserves a trailing newline', () => {
      const yaml = `name: Test
enabled: true
steps: []
`;
      expect(updateYamlField(yaml, 'enabled', false)).toBe(
        `name: Test
enabled: false
steps: []
`
      );
    });

    it('updates name while preserving the rest byte-exact', () => {
      const yaml = `name: Old Name
enabled: true
steps: []`;
      expect(updateYamlField(yaml, 'name', 'New Name')).toBe(
        `name: New Name
enabled: true
steps: []`
      );
    });

    it('updates a nested scalar byte-exact', () => {
      const yaml = `metadata:
  version: 1.0
  author: Old Author
steps: []`;
      expect(updateYamlField(yaml, 'metadata.author', 'New Author')).toBe(
        `metadata:
  version: 1.0
  author: New Author
steps: []`
      );
    });

    it('round-trips a string that needs quoting', () => {
      const yaml = `name: Old
enabled: true`;
      const result = updateYamlField(yaml, 'name', 'has: colon');
      expect(parse(result)).toEqual({ name: 'has: colon', enabled: true });
      expect(result.endsWith('\nenabled: true')).toBe(true);
    });
  });
});
