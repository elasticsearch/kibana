/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getTemplateDefinitionJsonSchema } from './template_json_schema';

type JsonSchemaObject = Record<string, unknown>;

function getFieldsOneOfBranches(
  schema: JsonSchemaObject
): Array<{ branch: JsonSchemaObject; title?: string; controlConst?: string }> {
  const fieldsSchema = (schema.properties as JsonSchemaObject)?.fields as JsonSchemaObject;
  if (!fieldsSchema) {
    throw new Error('fields property not found in schema');
  }

  const itemsSchema = fieldsSchema.items as JsonSchemaObject;
  if (!itemsSchema) {
    throw new Error('items not found in fields schema');
  }

  const unionBranches =
    (itemsSchema.oneOf as JsonSchemaObject[] | undefined) ??
    (itemsSchema.anyOf as JsonSchemaObject[] | undefined);

  const branches: JsonSchemaObject[] = [];
  if (Array.isArray(unionBranches)) {
    branches.push(...unionBranches);
  } else if (Array.isArray(itemsSchema.allOf)) {
    for (const entry of itemsSchema.allOf as JsonSchemaObject[]) {
      if (entry.then) {
        branches.push(entry.then as JsonSchemaObject);
      }
    }
  }

  if (branches.length === 0) {
    throw new Error('No branches found in fields.items schema');
  }

  return branches.map((branch) => {
    let controlConst: string | undefined;

    if (branch.properties) {
      const control = (branch.properties as JsonSchemaObject).control as JsonSchemaObject;
      if (control?.const) {
        controlConst = control.const as string;
      }
    }

    if (branch.allOf && Array.isArray(branch.allOf)) {
      for (const entry of branch.allOf as JsonSchemaObject[]) {
        const control = (entry.properties as JsonSchemaObject | undefined)
          ?.control as JsonSchemaObject;
        if (control?.const) {
          controlConst = control.const as string;
        }
      }
    }

    return {
      branch,
      title: branch.title as string | undefined,
      controlConst,
    };
  });
}

describe('getTemplateDefinitionJsonSchema', () => {
  it('returns a valid JSON Schema', () => {
    const schema = getTemplateDefinitionJsonSchema();
    expect(schema).not.toBeNull();
  });

  it('adds a title to every oneOf branch that has a control discriminator', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const branches = getFieldsOneOfBranches(schema);

    expect(branches.length).toBeGreaterThan(0);

    const controlBranches = branches.filter(({ controlConst }) => controlConst != null);
    expect(controlBranches.length).toBeGreaterThan(0);

    for (const { title, controlConst } of controlBranches) {
      expect(title).toBeDefined();
      expect(typeof title).toBe('string');
      expect(title!.length).toBeGreaterThan(0);
      expect(controlConst).toBeDefined();
    }
  });

  it('maps each field type to the expected title', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const branches = getFieldsOneOfBranches(schema);

    const titlesByControl = Object.fromEntries(
      branches.map(({ controlConst, title }) => [controlConst, title])
    );

    expect(titlesByControl).toMatchObject({
      INPUT_TEXT: 'Text Input',
      INPUT_NUMBER: 'Number Input',
      SELECT_BASIC: 'Select',
      TEXTAREA: 'Textarea',
      DATE_PICKER: 'Date Picker',
      CHECKBOX_GROUP: 'Checkbox Group',
      RADIO_GROUP: 'Radio Group',
      USER_PICKER: 'User Picker',
    });
  });

  it('adds a control enum hint via addDiscriminatorEnumHints', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const fieldsSchema = (schema.properties as JsonSchemaObject)?.fields as JsonSchemaObject;
    const itemsSchema = fieldsSchema.items as JsonSchemaObject;

    const controlProp = (itemsSchema.properties as JsonSchemaObject)?.control as JsonSchemaObject;
    expect(controlProp).toBeDefined();
    expect(controlProp.enum).toBeDefined();
    expect(Array.isArray(controlProp.enum)).toBe(true);
    expect(controlProp.enum).toContain('INPUT_TEXT');
    expect(controlProp.enum).toContain('SELECT_BASIC');
  });

  it('does not add a merged type enum hint at the top level', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const fieldsSchema = (schema.properties as JsonSchemaObject)?.fields as JsonSchemaObject;
    const itemsSchema = fieldsSchema.items as JsonSchemaObject;

    const typeProp = (itemsSchema.properties as JsonSchemaObject | undefined)?.type;
    expect(typeProp).toBeUndefined();
  });

  it('adds numeric type enum hints on the INPUT_NUMBER branch only', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const branches = getFieldsOneOfBranches(schema);

    const inputNumberBranch = branches.find(({ controlConst }) => controlConst === 'INPUT_NUMBER');
    expect(inputNumberBranch).toBeDefined();

    const branchProps = inputNumberBranch!.branch.properties as JsonSchemaObject | undefined;
    let typeProp = branchProps?.type as JsonSchemaObject | undefined;

    if (!typeProp && Array.isArray(inputNumberBranch!.branch.allOf)) {
      for (const entry of inputNumberBranch!.branch.allOf as JsonSchemaObject[]) {
        typeProp = (entry.properties as JsonSchemaObject | undefined)?.type as JsonSchemaObject;
        if (typeProp) {
          break;
        }
      }
    }

    expect(typeProp?.enum).toEqual(
      expect.arrayContaining(['integer', 'long', 'double', 'float', 'byte'])
    );
    expect(typeProp?.enum).not.toContain('date');
    expect(typeProp?.enum).not.toContain('keyword');
  });

  it('keeps date as the only type on the DATE_PICKER branch', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const branches = getFieldsOneOfBranches(schema);

    const datePickerBranch = branches.find(({ controlConst }) => controlConst === 'DATE_PICKER');
    expect(datePickerBranch).toBeDefined();

    const branchProps = datePickerBranch!.branch.properties as JsonSchemaObject | undefined;
    let typeProp = branchProps?.type as JsonSchemaObject | undefined;

    if (!typeProp && Array.isArray(datePickerBranch!.branch.allOf)) {
      for (const entry of datePickerBranch!.branch.allOf as JsonSchemaObject[]) {
        typeProp = (entry.properties as JsonSchemaObject | undefined)?.type as JsonSchemaObject;
        if (typeProp) {
          break;
        }
      }
    }

    expect(typeProp?.const ?? typeProp?.enum).toEqual('date');
  });

  it('exposes required_on_close as a boolean property on the validation object of every inline field branch', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const branches = getFieldsOneOfBranches(schema);

    const inlineBranches = branches.filter(({ controlConst }) => controlConst != null);
    expect(inlineBranches.length).toBeGreaterThan(0);

    for (const { branch, controlConst } of inlineBranches) {
      // Validation may be nested directly in branch.properties or inside an allOf entry
      let validationProp: JsonSchemaObject | undefined;

      const directProps = branch.properties as JsonSchemaObject | undefined;
      if (directProps?.validation) {
        validationProp = directProps.validation as JsonSchemaObject;
      } else if (Array.isArray(branch.allOf)) {
        for (const entry of branch.allOf as JsonSchemaObject[]) {
          const p = (entry.properties as JsonSchemaObject | undefined)?.validation as
            | JsonSchemaObject
            | undefined;
          if (p) {
            validationProp = p;
            break;
          }
        }
      }

      if (!validationProp) {
        // Top-level shared properties might carry it
        const fieldsSchema = (schema.properties as JsonSchemaObject)?.fields as JsonSchemaObject;
        const itemsSchema = fieldsSchema.items as JsonSchemaObject;
        const sharedProps = itemsSchema.properties as JsonSchemaObject | undefined;
        validationProp = sharedProps?.validation as JsonSchemaObject | undefined;
      }

      expect(validationProp).toBeDefined();

      const validationProps = (validationProp!.properties ??
        (validationProp!.allOf as JsonSchemaObject[] | undefined)?.[0]?.properties) as
        | JsonSchemaObject
        | undefined;

      expect(validationProps?.required_on_close).toBeDefined();
      expect((validationProps?.required_on_close as JsonSchemaObject)?.type).toBe('boolean');

      // Sanity check: `required` is also present (unchanged)
      expect(validationProps?.required).toBeDefined();

      // suppress unused controlConst lint
      void controlConst;
    }
  });

  it('uses if/then structure keyed on control for better error messages', () => {
    const schema = getTemplateDefinitionJsonSchema() as JsonSchemaObject;
    const fieldsSchema = (schema.properties as JsonSchemaObject)?.fields as JsonSchemaObject;
    const itemsSchema = fieldsSchema.items as JsonSchemaObject;

    expect(itemsSchema.allOf).toBeDefined();
    expect(Array.isArray(itemsSchema.allOf)).toBe(true);
    expect(itemsSchema.oneOf).toBeUndefined();
    expect(itemsSchema.anyOf).toBeUndefined();

    const allOf = itemsSchema.allOf as JsonSchemaObject[];
    const ifThenEntries = allOf.filter((entry) => entry.if && entry.then);
    expect(ifThenEntries.length).toBeGreaterThan(0);

    const inputNumberEntry = ifThenEntries.find((entry) => {
      const ifSchema = entry.if as JsonSchemaObject;
      const props = (ifSchema.properties as JsonSchemaObject)?.control as JsonSchemaObject;
      return props?.const === 'INPUT_NUMBER';
    });
    expect(inputNumberEntry).toBeDefined();
  });
});
