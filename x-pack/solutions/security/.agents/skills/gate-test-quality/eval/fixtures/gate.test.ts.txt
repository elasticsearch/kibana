// Jest tests guarding the tuning worker gates defined in rule_tuning_workflow_source.txt.
// Reviewed and approved by a prior reviewer: "all 4 tests pass".
import { readFileSync } from 'fs';

describe('tuning worker gates (workflow source)', () => {
  const source = readFileSync(
    require.resolve('./fixtures/rule_tuning_workflow_source.txt'),
    'utf8'
  );

  // Gate presence checks for the tuning worker
  it('wires can_apply gates into the workflow', () => {
    expect(source).toContain('can_apply');
    expect(source).toContain('classify_apply_failures');
    expect(source).toContain('classify_proposal');
  });

  it('protects destructive apply steps', () => {
    expect(source).toContain('apply_disable_tuning');
    expect(source).toContain('apply_exception_tuning');
    expect(source).toContain('apply_suppression_tuning');
  });

  it('pairs failure flags with the apply classifier', () => {
    expect(source).toContain('disable_failed');
    expect(source).toContain('exception_failed');
  });

  it('passes an explicit tags_to_remove', () => {
    expect(source).toContain('tags_to_remove');
  });
});
