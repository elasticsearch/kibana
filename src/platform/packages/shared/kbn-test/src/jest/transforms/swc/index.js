/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Jest transformer built on @swc/jest.
 *
 * SWC performs the TypeScript, JSX, CommonJS and jest.mock() hoisting transforms. The Babel-era
 * behaviors Kibana depends on are applied as source rewrites before SWC runs, using a single
 * parse of the file:
 *
 *  - multiline JSX string attributes collapse indentation to one space
 *  - enum members initialized from string constants are inlined
 *  - jest.mock() calls with identifier module names get the literal inlined
 *  - pure constants referenced from jest.mock() factories are hoisted with the mock
 *  - the lazyObject() compile-time macro is expanded
 *
 * SWC's own CommonJS export helpers are then adjusted so Jest and Sinon can replace exports the
 * way they could with Babel's output, and a sole default export is exposed through
 * module.exports for CommonJS consumers.
 */

const Crypto = require('crypto');
const Fs = require('fs');
const Path = require('path');
const MagicString = require('magic-string');
const remapping = require('@ampproject/remapping');
const { parseSync } = require('@swc/core');
const { createTransformer } = require('@swc/jest');
const { getJestSwcConfig } = require('@kbn/swc-config/jest');
const { getNodeRegisterParserConfig } = require('@kbn/swc-config/node_register');

const THIS_FILE = Fs.readFileSync(__filename);
const DEPENDENCY_VERSIONS = [
  ['@swc/core', require('@swc/core/package.json').version],
  ['@swc/jest', require('@swc/jest/package.json').version],
  ['@swc/plugin-emotion', require('@swc/plugin-emotion/package.json').version],
]
  .map(([name, version]) => `${name}@${version}`)
  .join(',');
const GENERATED_PATH = '/__kbn_jest_generated__.js';
const SOURCE_SENTINEL = '__KBN_SOURCE_SPAN_SENTINEL__';
const JEST_HOISTED_METHODS = new Set([
  'mock',
  'unmock',
  'deepUnmock',
  'enableAutomock',
  'disableAutomock',
]);
const LAZY_OBJECT_MODULE = '@kbn/lazy-object';
const TYPE_ONLY_KEYS = new Set([
  'typeAnnotation',
  'typeArguments',
  'typeParams',
  'typeParameters',
  'returnType',
  'superTypeParams',
  'implements',
]);

const swcTransformers = new Map(
  ['.js', '.mjs', '.ts', '.tsx'].map((extension) => [
    extension,
    createTransformer(getJestSwcConfig(`/__kbn_jest_transformer__${extension}`)),
  ])
);

function getSwcTransformer(sourcePath) {
  return swcTransformers.get(Path.extname(sourcePath)) ?? swcTransformers.get('.js');
}

// --- AST helpers -------------------------------------------------------------------------------

function visitAst(node, visitor) {
  if (!node || typeof node !== 'object') {
    return;
  }

  visitor(node);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'span') {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => visitAst(item, visitor));
    } else {
      visitAst(value, visitor);
    }
  }
}

function getIdentifierKey(identifier) {
  return `${identifier.ctxt}:${identifier.value}`;
}

function unwrapExpression(expression) {
  if (
    expression?.type === 'TsAsExpression' ||
    expression?.type === 'TsConstAssertion' ||
    expression?.type === 'TsSatisfiesExpression' ||
    expression?.type === 'TsNonNullExpression' ||
    expression?.type === 'TsTypeAssertion' ||
    expression?.type === 'TsInstantiation' ||
    expression?.type === 'ParenthesisExpression'
  ) {
    return unwrapExpression(expression.expression);
  }

  return expression;
}

function getPropertyName(property) {
  if (property?.type === 'Identifier' || property?.type === 'StringLiteral') {
    return property.value;
  }

  if (property?.type === 'NumericLiteral') {
    return String(property.value);
  }
}

function getStringLiteralValue(expression) {
  const unwrapped = unwrapExpression(expression);

  if (unwrapped?.type === 'StringLiteral') {
    return unwrapped.value;
  }

  if (unwrapped?.type === 'TemplateLiteral' && unwrapped.expressions.length === 0) {
    return unwrapped.quasis[0]?.cooked ?? unwrapped.quasis[0]?.raw;
  }
}

function getBindingIdentifiers(pattern) {
  if (!pattern) {
    return [];
  }

  switch (pattern.type) {
    case 'Identifier':
      return [pattern];
    case 'ArrayPattern':
      return pattern.elements.flatMap((element) => getBindingIdentifiers(element));
    case 'ObjectPattern':
      return pattern.properties.flatMap((property) => {
        if (property.type === 'KeyValuePatternProperty') {
          return getBindingIdentifiers(property.value);
        }

        if (property.type === 'AssignmentPatternProperty') {
          return getBindingIdentifiers(property.key);
        }

        return getBindingIdentifiers(property.argument);
      });
    case 'AssignmentPattern':
      return getBindingIdentifiers(pattern.left);
    case 'RestElement':
      return getBindingIdentifiers(pattern.argument);
    default:
      return [];
  }
}

function getDeclarationIdentifiers(declaration) {
  if (declaration?.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap(({ id }) => getBindingIdentifiers(id));
  }

  if (
    declaration?.type === 'FunctionDeclaration' ||
    declaration?.type === 'ClassDeclaration' ||
    declaration?.type === 'TsEnumDeclaration'
  ) {
    const identifier = declaration.identifier ?? declaration.id;
    return identifier ? [identifier] : [];
  }

  if (declaration?.type === 'TsModuleDeclaration' && declaration.id?.type === 'Identifier') {
    return [declaration.id];
  }

  return [];
}

function isDirective(statement) {
  return statement?.type === 'ExpressionStatement' && statement.expression.type === 'StringLiteral';
}

function isJestCallee(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier' &&
    (callee.object.type === 'Identifier' || callee.object.type === 'CallExpression')
  );
}

// Returns the jest.mock() calls in a statement expression such as `jest.mock('a').mock('b', f)`,
// or an empty list when the chain is not rooted at the `jest` object.
function getJestMockCalls(expression) {
  const calls = [];
  let current = expression;

  while (current?.type === 'CallExpression' && isJestCallee(current.callee)) {
    const { object, property } = current.callee;

    if (!JEST_HOISTED_METHODS.has(property.value)) {
      return [];
    }

    if (property.value === 'mock') {
      calls.push(current);
    }

    if (object.type === 'Identifier') {
      return object.value === 'jest' ? calls : [];
    }

    current = object;
  }

  return [];
}

function isHoistedJestStatement(statement) {
  if (statement?.type !== 'ExpressionStatement') {
    return false;
  }

  let current = statement.expression;
  while (current?.type === 'CallExpression' && isJestCallee(current.callee)) {
    const { object, property } = current.callee;
    if (!JEST_HOISTED_METHODS.has(property.value)) {
      return false;
    }

    if (object.type === 'Identifier') {
      return object.value === 'jest';
    }

    current = object;
  }

  return false;
}

// --- Parsing -----------------------------------------------------------------------------------

function getUtf8ByteLength(codePoint) {
  if (codePoint < 0x80) {
    return 1;
  }

  if (codePoint < 0x800) {
    return 2;
  }

  return codePoint < 0x10000 ? 3 : 4;
}

/**
 * SWC spans are byte offsets that continue across parse calls within a process. A trailing
 * sentinel statement locates the start of this source so spans can be mapped to string indexes.
 */
class ParsedSource {
  constructor(text, sourcePath) {
    const ast = parseSync(
      `${text}\nconst ${SOURCE_SENTINEL} = 0;`,
      getNodeRegisterParserConfig(sourcePath)
    );
    const sentinelIndex = ast.body.findLastIndex(
      (item) =>
        item.type === 'VariableDeclaration' &&
        item.declarations[0]?.id.type === 'Identifier' &&
        item.declarations[0].id.value === SOURCE_SENTINEL
    );
    const sentinel = ast.body[sentinelIndex];

    if (!sentinel) {
      throw new Error(`Unable to determine SWC source span offset for ${sourcePath}`);
    }

    ast.body.splice(sentinelIndex, 1);

    this.text = text;
    this.ast = ast;
    this.buffer = Buffer.from(text);
    this.sourceStart = sentinel.span.start - this.buffer.length - 1;
    this.byteToIndex = this.buffer.length === text.length ? undefined : this.buildByteIndex();
  }

  buildByteIndex() {
    const byteToIndex = new Uint32Array(this.buffer.length + 1);
    let byteOffset = 0;

    for (let index = 0; index < this.text.length; index++) {
      const codePoint = this.text.codePointAt(index);
      const byteLength = getUtf8ByteLength(codePoint);
      byteToIndex.fill(index, byteOffset, byteOffset + byteLength);
      byteOffset += byteLength;
      if (codePoint > 0xffff) {
        index++;
      }
    }

    byteToIndex[this.buffer.length] = this.text.length;
    return byteToIndex;
  }

  index(bytePosition) {
    const byteOffset = bytePosition - this.sourceStart;
    return this.byteToIndex ? this.byteToIndex[byteOffset] : byteOffset;
  }

  start(node) {
    return this.index(node.span.start);
  }

  end(node) {
    return this.index(node.span.end);
  }

  slice(node) {
    return this.text.slice(this.start(node), this.end(node));
  }
}

// --- Source rewrites ---------------------------------------------------------------------------

// Babel collapsed newline indentation in JSX string attributes to one space. Kibana's i18n
// extraction and existing assertions rely on that value.
function normalizeJsxStringAttributes(parsed, source) {
  visitAst(parsed.ast, (node) => {
    if (node.type !== 'JSXAttribute' || node.value?.type !== 'StringLiteral') {
      return;
    }

    const normalizedValue = node.value.value.replace(/\r?\n[\t ]+/g, ' ');
    if (normalizedValue === node.value.value) {
      return;
    }

    source.overwrite(
      parsed.start(node.value),
      parsed.end(node.value),
      `{${JSON.stringify(normalizedValue)}}`
    );
  });
}

// SWC treats enum members initialized from identifiers as computed and emits a reverse mapping,
// while TypeScript folds string constants. Inline the literal so SWC emits a string member.
function inlineComputedEnumValues(parsed, source) {
  const constantBindings = new Map();

  visitAst(parsed.ast, (node) => {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') {
      return;
    }

    for (const declaration of node.declarations) {
      if (declaration.id.type === 'Identifier' && declaration.init) {
        constantBindings.set(getIdentifierKey(declaration.id), declaration.init);
      }
    }
  });

  const resolveConstant = (expression, seen = new Set()) => {
    const unwrapped = unwrapExpression(expression);

    if (unwrapped?.type === 'StringLiteral' || unwrapped?.type === 'NumericLiteral') {
      return unwrapped.value;
    }

    if (unwrapped?.type === 'TemplateLiteral') {
      let value = unwrapped.quasis[0]?.cooked ?? unwrapped.quasis[0]?.raw ?? '';

      for (const [index, templateExpression] of unwrapped.expressions.entries()) {
        const expressionValue = resolveConstant(templateExpression, seen);
        if (typeof expressionValue !== 'string' && typeof expressionValue !== 'number') {
          return;
        }

        value += expressionValue;
        value += unwrapped.quasis[index + 1]?.cooked ?? unwrapped.quasis[index + 1]?.raw ?? '';
      }

      return value;
    }

    if (unwrapped?.type === 'Identifier') {
      const key = getIdentifierKey(unwrapped);
      if (seen.has(key)) {
        return;
      }

      const binding = constantBindings.get(key);
      return binding ? resolveConstant(binding, new Set([...seen, key])) : undefined;
    }

    if (unwrapped?.type === 'ObjectExpression') {
      const object = new Map();
      for (const property of unwrapped.properties) {
        if (property.type !== 'KeyValueProperty') {
          continue;
        }

        const propertyName = getPropertyName(property.key);
        if (propertyName !== undefined) {
          object.set(propertyName, resolveConstant(property.value, seen));
        }
      }
      return object;
    }

    if (unwrapped?.type === 'MemberExpression') {
      const object = resolveConstant(unwrapped.object, seen);
      const propertyName = getPropertyName(unwrapped.property);
      return object instanceof Map && propertyName !== undefined
        ? object.get(propertyName)
        : undefined;
    }
  };

  visitAst(parsed.ast, (node) => {
    if (node.type !== 'TsEnumDeclaration') {
      return;
    }

    for (const member of node.members) {
      const initializer = unwrapExpression(member.init);
      if (
        initializer?.type !== 'Identifier' &&
        initializer?.type !== 'MemberExpression' &&
        initializer?.type !== 'TemplateLiteral'
      ) {
        continue;
      }

      const value = resolveConstant(member.init);
      if (typeof value === 'string') {
        source.overwrite(parsed.start(member.init), parsed.end(member.init), JSON.stringify(value));
      }
    }
  });
}

// Mirrors @babel/traverse Scope#isPure with constantsOnly, which babel-plugin-jest-hoist used to
// decide whether a binding referenced from a jest.mock() factory may be hoisted with the mock.
function createPurityChecker(parsed) {
  const bindingKinds = new Map();
  const reassigned = new Set();

  const addBindings = (pattern, kind) => {
    for (const identifier of getBindingIdentifiers(pattern)) {
      bindingKinds.set(getIdentifierKey(identifier), kind);
    }
  };

  visitAst(parsed.ast, (node) => {
    switch (node.type) {
      case 'VariableDeclaration':
        node.declarations.forEach(({ id }) => addBindings(id, node.kind));
        break;
      case 'ImportDeclaration':
        node.specifiers.forEach(({ local }) => addBindings(local, 'import'));
        break;
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (node.identifier) {
          addBindings(node.identifier, node.type === 'FunctionDeclaration' ? 'function' : 'class');
        }
        break;
      case 'AssignmentExpression':
        getBindingIdentifiers(node.left).forEach((identifier) =>
          reassigned.add(getIdentifierKey(identifier))
        );
        break;
      case 'UpdateExpression':
        if (node.argument.type === 'Identifier') {
          reassigned.add(getIdentifierKey(node.argument));
        }
        break;
      case 'ForInStatement':
      case 'ForOfStatement':
        if (node.left.type !== 'VariableDeclaration') {
          getBindingIdentifiers(node.left).forEach((identifier) =>
            reassigned.add(getIdentifierKey(identifier))
          );
        }
        break;
      default:
        break;
    }
  });

  const isConstantBinding = (identifier) => {
    const key = getIdentifierKey(identifier);
    const kind = bindingKinds.get(key);
    return kind === 'const' || kind === 'import' || !reassigned.has(key);
  };

  const isPure = (node) => {
    const expression = unwrapExpression(node);

    switch (expression?.type) {
      case 'StringLiteral':
      case 'NumericLiteral':
      case 'BooleanLiteral':
      case 'NullLiteral':
      case 'RegExpLiteral':
      case 'BigIntLiteral':
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return true;
      case 'TemplateLiteral':
        return expression.expressions.every(isPure);
      case 'Identifier':
        return bindingKinds.has(getIdentifierKey(expression)) && isConstantBinding(expression);
      case 'ArrayExpression':
        return expression.elements.every((element) => !element || isPure(element.expression));
      case 'ObjectExpression':
        return expression.properties.every((property) => {
          switch (property.type) {
            case 'Identifier':
              return isPure(property);
            case 'SpreadElement':
              return isPure(property.arguments);
            case 'KeyValueProperty':
              return (
                (property.key.type !== 'Computed' || isPure(property.key.expression)) &&
                isPure(property.value)
              );
            case 'MethodProperty':
            case 'GetterProperty':
            case 'SetterProperty':
              return property.key.type !== 'Computed' || isPure(property.key.expression);
            default:
              return false;
          }
        });
      case 'UnaryExpression':
        return isPure(expression.argument);
      case 'BinaryExpression':
        return isPure(expression.left) && isPure(expression.right);
      case 'ConditionalExpression':
        return (
          isPure(expression.test) && isPure(expression.consequent) && isPure(expression.alternate)
        );
      case 'ClassExpression':
        return (
          (expression.decorators?.length ?? 0) === 0 &&
          (!expression.superClass || isPure(expression.superClass))
        );
      default:
        return false;
    }
  };

  return { isPure, isConstantBinding };
}

// Collects identifiers read inside a jest.mock() factory, skipping property names, assignment
// targets and type positions, matching Babel's ReferencedIdentifier visitor.
function collectReferencedIdentifiers(factory) {
  const references = [];

  const walk = (node, parent, key) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, parent, key));
      return;
    }

    if (TYPE_ONLY_KEYS.has(key) || key === 'span') {
      return;
    }

    if (node.type === 'Identifier') {
      const isReference =
        !(parent?.type === 'KeyValueProperty' && key === 'key') &&
        !(parent?.type === 'KeyValuePatternProperty' && key === 'key') &&
        !(parent?.type === 'MemberExpression' && key === 'property') &&
        !(parent?.type === 'AssignmentExpression' && key === 'left') &&
        !(parent?.type === 'JSXAttribute' && key === 'name') &&
        !(parent?.type === 'JSXClosingElement' && key === 'name') &&
        !(parent?.type === 'LabeledStatement' && key === 'label') &&
        !(parent?.type === 'BreakStatement' || parent?.type === 'ContinueStatement');
      if (isReference) {
        references.push(node);
      }
      return;
    }

    if (typeof node.type === 'string' && node.type.startsWith('Ts') && !('expression' in node)) {
      return;
    }

    for (const [childKey, value] of Object.entries(node)) {
      walk(value, node, childKey);
    }
  };

  walk(factory, undefined, undefined);
  return references;
}

function forEachStatementList(ast, callback) {
  callback(ast.body, ast);

  visitAst(ast, (node) => {
    if (node.type === 'BlockStatement') {
      callback(node.stmts, node);
    }
  });
}

/**
 * Babel's Jest hoist inlined nothing, but only hoisted mocks with literal module names. SWC hoists
 * every jest.mock() call, so resolve identifier module names to the literal visible at the call
 * site. Babel also hoisted "pure" constants referenced from a factory along with the mock so the
 * factory could observe them when the mocked module is first required. SWC hoists neither the
 * constant nor lets a declaration precede the requires, so block-level constants are moved to the
 * top of their block here, and module-level constants are moved in the generated output.
 */
function rewriteJestMocks(parsed, source) {
  const { isPure, isConstantBinding } = createPurityChecker(parsed);
  const hoistedModuleNames = new Set();
  const movedStatements = new Set();
  const moduleNameDeclarations = new Map();

  visitAst(parsed.ast, (node) => {
    if (node.type !== 'VariableDeclaration' || node.kind !== 'const') {
      return;
    }

    for (const declaration of node.declarations) {
      const moduleName = getStringLiteralValue(declaration.init);
      if (declaration.id.type !== 'Identifier' || moduleName === undefined) {
        continue;
      }

      const key = getIdentifierKey(declaration.id);
      moduleNameDeclarations.set(key, [...(moduleNameDeclarations.get(key) ?? []), moduleName]);
    }
  });

  forEachStatementList(parsed.ast, (statements, block) => {
    const blockBindings = new Map();

    for (const statement of statements) {
      const declaration =
        statement.type === 'ExportDeclaration' ? statement.declaration : statement;
      if (declaration.type !== 'VariableDeclaration') {
        continue;
      }

      for (const declarator of declaration.declarations) {
        if (declarator.id.type === 'Identifier') {
          blockBindings.set(getIdentifierKey(declarator.id), {
            statement,
            declaration,
            declarator,
          });
        }
      }
    }

    const firstStatement = statements.find((statement) => !isDirective(statement));
    const blockMoves = [];

    for (const statement of statements) {
      if (statement.type !== 'ExpressionStatement') {
        continue;
      }

      for (const call of getJestMockCalls(statement.expression)) {
        const moduleName = call.arguments[0]?.expression;
        if (moduleName?.type === 'Identifier') {
          const declarations = moduleNameDeclarations.get(getIdentifierKey(moduleName));
          if (declarations?.length === 1) {
            source.overwrite(
              parsed.start(moduleName),
              parsed.end(moduleName),
              JSON.stringify(declarations[0])
            );
          }
        }

        const factory = call.arguments[1]?.expression;
        if (factory?.type !== 'ArrowFunctionExpression' && factory?.type !== 'FunctionExpression') {
          continue;
        }

        for (const reference of collectReferencedIdentifiers(factory)) {
          const binding = blockBindings.get(getIdentifierKey(reference));
          if (
            !binding ||
            /^mock/i.test(reference.value) ||
            !binding.declarator.init ||
            binding.declaration.declarations.length !== 1 ||
            (block !== parsed.ast && binding.statement === firstStatement) ||
            movedStatements.has(binding.statement) ||
            !isConstantBinding(binding.declarator.id) ||
            !isPure(binding.declarator.init)
          ) {
            continue;
          }

          movedStatements.add(binding.statement);

          if (block === parsed.ast) {
            hoistedModuleNames.add(reference.value);
          } else {
            blockMoves.push(binding.statement);
          }
        }
      }
    }

    // Keep source order so a hoisted constant can still reference an earlier hoisted one.
    for (const statement of blockMoves.sort((left, right) => left.span.start - right.span.start)) {
      const end = parsed.end(statement);
      source.move(parsed.start(statement), end, parsed.start(firstStatement));
      source.appendLeft(end, ';\n');
    }
  });

  return hoistedModuleNames;
}

// Expands the lazyObject() macro the same way @kbn/lazy-object's Babel plugin does: simple
// properties become annotated factories evaluated on first access.
function rewriteLazyObjects(parsed, source) {
  const lazyObjectImports = parsed.ast.body.filter(
    (item) => item.type === 'ImportDeclaration' && item.source.value === LAZY_OBJECT_MODULE
  );
  const importedNames = new Set(
    lazyObjectImports.flatMap((item) =>
      item.specifiers
        .filter((specifier) => specifier.type === 'ImportSpecifier')
        .map((specifier) => specifier.imported?.value ?? specifier.local.value)
    )
  );

  if (!importedNames.has('lazyObject')) {
    return;
  }

  let rewritten = false;

  visitAst(parsed.ast, (node) => {
    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'Identifier' ||
      node.callee.value !== 'lazyObject' ||
      node.arguments.length !== 1 ||
      node.arguments[0].expression.type !== 'ObjectExpression'
    ) {
      return;
    }

    rewritten = true;
    source.overwrite(
      parsed.start(node.callee),
      parsed.end(node.callee),
      'createLazyObjectFromAnnotations'
    );

    for (const property of node.arguments[0].expression.properties) {
      if (property.type === 'Identifier') {
        source.appendLeft(parsed.end(property), `: annotateLazy(() => (${property.value}))`);
      } else if (
        property.type === 'KeyValueProperty' &&
        (property.key.type === 'Identifier' || property.key.type === 'StringLiteral')
      ) {
        // Parenthesize so object literal values are expressions rather than block bodies.
        source.prependLeft(parsed.start(property.value), 'annotateLazy(() => (');
        source.appendRight(parsed.end(property.value), '))');
      }
    }
  });

  if (!rewritten) {
    return;
  }

  const importDeclaration = lazyObjectImports.find((item) =>
    item.specifiers.some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        (specifier.imported?.value ?? specifier.local.value) === 'lazyObject'
    )
  );
  const lastSpecifier = importDeclaration.specifiers.at(-1);
  const missingHelpers = ['createLazyObjectFromAnnotations', 'annotateLazy'].filter(
    (name) => !importedNames.has(name)
  );

  if (missingHelpers.length > 0) {
    source.appendLeft(parsed.end(lastSpecifier), `, ${missingHelpers.join(', ')}`);
  }
}

// babel-plugin-add-module-exports exposed a sole default export directly through module.exports.
function hasSoleDefaultExport(ast) {
  const exportNames = new Set();

  for (const item of ast.body) {
    switch (item.type) {
      case 'ExportDefaultDeclaration':
      case 'ExportDefaultExpression':
        exportNames.add('default');
        break;
      case 'ExportDeclaration':
        getDeclarationIdentifiers(item.declaration).forEach(({ value }) => exportNames.add(value));
        break;
      case 'ExportNamedDeclaration':
        if (item.typeOnly) {
          break;
        }

        for (const specifier of item.specifiers) {
          if (specifier.type === 'ExportSpecifier' && !specifier.isTypeOnly) {
            exportNames.add(specifier.exported?.value ?? specifier.orig.value);
          } else if (specifier.type === 'ExportNamespaceSpecifier') {
            exportNames.add(specifier.name.value);
          } else if (specifier.type === 'ExportDefaultSpecifier') {
            exportNames.add(specifier.exported.value);
          }
        }
        break;
      case 'ExportAllDeclaration':
      case 'TsExportAssignment':
        return false;
      default:
        break;
    }
  }

  return exportNames.size === 1 && exportNames.has('default');
}

// Prefilter only; the AST decides. Each quote style is matched separately so an apostrophe inside a
// double-quoted attribute (or vice versa) does not hide a multiline value.
const JSX_MULTILINE_STRING_ATTRIBUTE = /=\s*(?:"[^"]*\r?\n|'[^']*\r?\n)/;
const ENUM_KEYWORD = /\benum\b/;
const JEST_MOCK_CALL = /\bjest\s*\.\s*mock\s*\(/;
const LAZY_OBJECT_CALL = /\blazyObject\s*\(/;
const DEFAULT_EXPORT = /\bexport\s+default\b|\bas\s+default\b|\bexport\s*\{[^}]*\bdefault\b/;

function prepareSource(sourceText, sourcePath) {
  const normalizeJsx = JSX_MULTILINE_STRING_ATTRIBUTE.test(sourceText);
  const inlineEnums = ENUM_KEYWORD.test(sourceText);
  const rewriteMocks = JEST_MOCK_CALL.test(sourceText);
  const rewriteLazy = sourceText.includes(LAZY_OBJECT_MODULE) && LAZY_OBJECT_CALL.test(sourceText);
  const checkDefaultExport = DEFAULT_EXPORT.test(sourceText);

  if (!normalizeJsx && !inlineEnums && !rewriteMocks && !rewriteLazy && !checkDefaultExport) {
    return { code: sourceText, hoistedModuleNames: new Set(), soleDefaultExport: false };
  }

  const parsed = new ParsedSource(sourceText, sourcePath);
  const source = new MagicString(sourceText);
  let hoistedModuleNames = new Set();

  if (normalizeJsx) {
    normalizeJsxStringAttributes(parsed, source);
  }

  if (inlineEnums) {
    inlineComputedEnumValues(parsed, source);
  }

  if (rewriteMocks) {
    hoistedModuleNames = rewriteJestMocks(parsed, source);
  }

  if (rewriteLazy) {
    rewriteLazyObjects(parsed, source);
  }

  const soleDefaultExport = checkDefaultExport && hasSoleDefaultExport(parsed.ast);

  if (!source.hasChanged()) {
    return { code: sourceText, hoistedModuleNames, soleDefaultExport };
  }

  return {
    code: source.toString(),
    map: JSON.parse(
      source.generateMap({ hires: true, includeContent: true, source: sourcePath }).toString()
    ),
    hoistedModuleNames,
    soleDefaultExport,
  };
}

// --- Generated code rewrites -------------------------------------------------------------------

// SWC emits requires ahead of other statements, so constants that Babel hoisted with a mock are
// moved after the hoisted jest calls in the generated module.
function hoistModuleDeclarations(code, hoistedModuleNames) {
  const parsed = new ParsedSource(code, GENERATED_PATH);
  const source = new MagicString(code);
  const { body } = parsed.ast;

  let insertionIndex = 0;
  while (insertionIndex < body.length && isDirective(body[insertionIndex])) {
    insertionIndex++;
  }
  while (insertionIndex < body.length && isHoistedJestStatement(body[insertionIndex])) {
    insertionIndex++;
  }

  const insertionTarget = body[insertionIndex];
  if (!insertionTarget) {
    return { code };
  }

  const insertion = parsed.start(insertionTarget);

  for (const statement of body.slice(insertionIndex + 1)) {
    if (
      statement.type !== 'VariableDeclaration' ||
      !statement.declarations.some(
        ({ id }) => id.type === 'Identifier' && hoistedModuleNames.has(id.value)
      )
    ) {
      continue;
    }

    const end = parsed.end(statement);
    source.move(parsed.start(statement), end, insertion);
    source.appendLeft(end, '\n');
  }

  if (!source.hasChanged()) {
    return { code };
  }

  return {
    code: source.toString(),
    map: JSON.parse(source.generateMap({ hires: true, source: GENERATED_PATH }).toString()),
  };
}

function unwrapCallee(callee) {
  if (callee?.type === 'ParenthesisExpression') {
    return unwrapCallee(callee.expression);
  }

  if (callee?.type === 'SequenceExpression') {
    return unwrapCallee(callee.expressions.at(-1));
  }

  return callee;
}

function isEmotionModuleName(value) {
  return value === '@emotion/react' || value === '@emotion/css';
}

function getEmotionCssBindings(ast) {
  const directBindings = new Set();
  const namespaceBindings = new Set();

  for (const item of ast.body) {
    if (item.type === 'ImportDeclaration' && isEmotionModuleName(item.source.value)) {
      for (const specifier of item.specifiers) {
        if (
          specifier.type === 'ImportSpecifier' &&
          (specifier.imported?.value ?? specifier.local.value) === 'css'
        ) {
          directBindings.add(getIdentifierKey(specifier.local));
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          namespaceBindings.add(getIdentifierKey(specifier.local));
        }
      }
      continue;
    }

    if (item.type !== 'VariableDeclaration') {
      continue;
    }

    for (const declaration of item.declarations) {
      const initializer = unwrapExpression(declaration.init);
      if (
        declaration.id.type === 'Identifier' &&
        initializer?.type === 'CallExpression' &&
        initializer.callee.type === 'Identifier' &&
        initializer.callee.value === 'require' &&
        initializer.arguments[0]?.expression.type === 'StringLiteral' &&
        isEmotionModuleName(initializer.arguments[0].expression.value)
      ) {
        namespaceBindings.add(getIdentifierKey(declaration.id));
      }
    }
  }

  return { directBindings, namespaceBindings };
}

function isEmotionCssCallee(callee, bindings) {
  const unwrapped = unwrapCallee(callee);
  if (unwrapped?.type === 'Identifier') {
    return bindings.directBindings.has(getIdentifierKey(unwrapped));
  }

  return (
    unwrapped?.type === 'MemberExpression' &&
    unwrapped.object.type === 'Identifier' &&
    bindings.namespaceBindings.has(getIdentifierKey(unwrapped.object)) &&
    unwrapped.property.type === 'Identifier' &&
    unwrapped.property.value === 'css'
  );
}

// @swc/plugin-emotion emits labels as a separate css() argument. When the preceding template
// tail has no delimiter, Emotion concatenates the label into the previous declaration. Reuse the
// formatter's preceding space for the delimiter so generated positions do not move.
// Matches a label argument whose preceding argument is not a string literal ending in ';'.
const UNDELIMITED_EMOTION_LABEL = /(?<!;"),\s*"label:/;

function makeEmotionLabelsSafe(code) {
  if (!UNDELIMITED_EMOTION_LABEL.test(code)) {
    return code;
  }

  const parsed = new ParsedSource(code, GENERATED_PATH);
  const bindings = getEmotionCssBindings(parsed.ast);
  const replacements = [];

  visitAst(parsed.ast, (node) => {
    if (node.type !== 'CallExpression' || !isEmotionCssCallee(node.callee, bindings)) {
      return;
    }

    const label = node.arguments.at(-1)?.expression;
    if (label?.type !== 'StringLiteral' || !label.value.startsWith('label:')) {
      return;
    }

    const previousArgument = node.arguments.at(-2)?.expression;
    if (
      previousArgument?.type === 'StringLiteral' &&
      previousArgument.value.trimEnd().endsWith(';')
    ) {
      return;
    }

    const labelStart = parsed.start(label);
    if (code[labelStart - 1] === ' ' || code[labelStart - 1] === '\t') {
      replacements.push({
        start: labelStart - 1,
        end: labelStart + 1,
        value: `${code[labelStart]};`,
      });
    } else {
      // No preceding whitespace to reuse; inserting shifts only this generated line's columns.
      replacements.push({ start: labelStart + 1, end: labelStart + 1, value: ';' });
    }
  });

  return replacements
    .sort((left, right) => right.start - left.start)
    .reduce(
      (result, { start, end, value }) => `${result.slice(0, start)}${value}${result.slice(end)}`,
      code
    );
}

// SWC defines CommonJS exports as non-configurable live getters through three helper shapes.
// Babel emitted plain writable assignments, which Kibana tests rely on for jest.spyOn(), Sinon
// stubs and direct assignment onto namespace imports. Rewrite only those SWC-generated shapes:
// getters become configurable, tolerate reads before initialization in circular imports (Babel
// exposed `undefined`), and gain a setter that replaces the accessor with a data property.
const MATERIALIZING_SETTER =
  'set: ((target, name) => function(value) { ' +
  'Object.defineProperty(target, name, ' +
  '{ value, writable: true, enumerable: true, configurable: true }); ' +
  '})';
const TDZ_SAFE_GETTER =
  '((getter) => function() { try { return getter(); } ' +
  'catch (error) { if (error instanceof ReferenceError) return undefined; throw error; } })';
const BINDING_EXPRESSION = String.raw`[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*`;
const SINGLE_EXPORT = new RegExp(
  String.raw`^Object\.defineProperty\(exports, ("(?:[^"\\\n]|\\.)+"), \{\n` +
    String.raw`    enumerable: true,\n` +
    String.raw`    get: function\(\) \{\n` +
    String.raw`        return (${BINDING_EXPRESSION});\n` +
    String.raw`    \}\n` +
    String.raw`\}\);$`,
  'gm'
);
const EXPORT_HELPER_LOOP =
  '    for(var name in all)Object.defineProperty(target, name, {\n' +
  '        enumerable: true,\n' +
  '        get: Object.getOwnPropertyDescriptor(all, name).get\n' +
  '    });';
const EXPORT_HELPER_CALL = new RegExp(
  String.raw`^_export\d*\(exports, \{\n((?:    get [^\n]+ \(\) \{\n        return [^\n]+;\n    \},?\n)+)\}\);$`,
  'gm'
);
const EXPORT_HELPER_GETTER = new RegExp(
  String.raw`^    get ([^\n]+) \(\) \{\n        return (${BINDING_EXPRESSION});`,
  'gm'
);
const EXPORT_STAR_HELPER_DESCRIPTOR =
  '            Object.defineProperty(to, k, {\n' +
  '                enumerable: true,\n' +
  '                get: function() {\n' +
  '                    return from[k];\n' +
  '                }\n' +
  '            });';

function getExportName(rawName) {
  return rawName.startsWith('"') ? JSON.parse(rawName) : rawName;
}

function makeExportsReplaceable(code) {
  if (!code.includes('exports')) {
    return { code, localExportNames: [] };
  }

  const localExports = [];

  const collectLocalExport = (rawName, bindingExpression) => {
    if (!bindingExpression.includes('.')) {
      localExports.push({ name: getExportName(rawName), binding: bindingExpression });
    }
  };

  let rewritten = code.replace(SINGLE_EXPORT, (match, rawName, bindingExpression) => {
    collectLocalExport(rawName, bindingExpression);
    return (
      `Object.defineProperty(exports, ${rawName}, {\n` +
      `    enumerable: true, configurable: true, ${MATERIALIZING_SETTER}(exports, ${rawName}),\n` +
      `    get: function() {\n` +
      `        try { return ${bindingExpression}; } ` +
      `catch (error) { if (error instanceof ReferenceError) return undefined; throw error; }\n` +
      `    }\n` +
      `});`
    );
  });

  if (rewritten.includes(EXPORT_HELPER_LOOP)) {
    rewritten = rewritten.replace(
      EXPORT_HELPER_LOOP,
      '    for(var name in all)Object.defineProperty(target, name, {\n' +
        `        enumerable: true, configurable: true, ${MATERIALIZING_SETTER}(target, name),\n` +
        `        get: ${TDZ_SAFE_GETTER}(Object.getOwnPropertyDescriptor(all, name).get)\n` +
        '    });'
    );

    for (const [, getters] of rewritten.matchAll(EXPORT_HELPER_CALL)) {
      for (const [, rawName, bindingExpression] of getters.matchAll(EXPORT_HELPER_GETTER)) {
        collectLocalExport(rawName, bindingExpression);
      }
    }
  }

  if (rewritten.includes(EXPORT_STAR_HELPER_DESCRIPTOR)) {
    rewritten = rewritten.replace(
      EXPORT_STAR_HELPER_DESCRIPTOR,
      EXPORT_STAR_HELPER_DESCRIPTOR.replace(
        'enumerable: true,',
        'enumerable: true, configurable: true,'
      )
    );
  }

  // Babel exposed local bindings as data properties. Materialize the immutable ones once the
  // module has initialized so Sinon can wrap them, keeping `let`/`var` exports as live getters.
  // SWC prints class declarations as `let Name = class Name`, which are still immutable.
  const isMutableBinding = (binding) =>
    new RegExp(String.raw`^(?:let|var) ${binding}\b(?! = class\b)`, 'm').test(rewritten);
  const localExportNames = localExports
    .filter(({ name, binding }) => name !== 'default' && !isMutableBinding(binding))
    .map(({ name }) => name);

  return { code: rewritten, localExportNames };
}

function materializeLocalExports(code, localExportNames) {
  if (localExportNames.length === 0) {
    return code;
  }

  return appendStatement(
    code,
    localExportNames
      .map(
        (name) =>
          `Object.defineProperty(exports, ${JSON.stringify(name)}, ` +
          `{ value: exports[${JSON.stringify(name)}], ` +
          `writable: true, enumerable: true, configurable: true });`
      )
      .join(' ')
  );
}

function appendStatement(code, statement) {
  const sourceMapIndex = code.lastIndexOf('\n//# sourceMappingURL=');
  const trailingLineBreak = sourceMapIndex === -1 ? code.match(/\r?\n$/)?.[0] : undefined;
  const insertionIndex =
    sourceMapIndex === -1 ? code.length - (trailingLineBreak?.length ?? 0) : sourceMapIndex;

  return `${code.slice(0, insertionIndex)} ${statement}${code.slice(insertionIndex)}`;
}

// SWC name mappings can associate a React component frame with a nested callback. Keep the
// original source locations while allowing V8 to report the generated function's actual name.
function stripSourceMapNames(sourceMap) {
  if (!Array.isArray(sourceMap.names) || sourceMap.names.length === 0) {
    return sourceMap;
  }

  const base64Characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const mappings = sourceMap.mappings.replace(/[^,;]+/g, (segment) => {
    let index = 0;
    let field = 0;

    while (index < segment.length) {
      field += 1;
      if (field === 5) {
        return segment.slice(0, index);
      }

      let digit;
      do {
        digit = base64Characters.indexOf(segment[index]);
        index += 1;
      } while (digit >= 0 && (digit & 32) !== 0);
    }

    return segment;
  });

  return { ...sourceMap, names: [], mappings };
}

function parseSourceMap(map) {
  return typeof map === 'string' ? JSON.parse(map) : map;
}

function finalizeResult(result, prepared, transformOptions) {
  const maps = [parseSourceMap(result.map)];
  if (prepared.map) {
    maps.push(prepared.map);
  }

  let { code } = result;

  if (prepared.hoistedModuleNames.size > 0 && !transformOptions?.supportsStaticESM) {
    const hoisted = hoistModuleDeclarations(code, prepared.hoistedModuleNames);
    code = hoisted.code;
    if (hoisted.map) {
      maps.unshift(hoisted.map);
    }
  }

  code = makeEmotionLabelsSafe(code);

  if (!transformOptions?.supportsStaticESM) {
    const replaceable = makeExportsReplaceable(code);
    code = materializeLocalExports(replaceable.code, replaceable.localExportNames);

    if (prepared.soleDefaultExport) {
      code = appendStatement(code, 'module.exports = exports.default;');
    }
  }

  const map = maps.length > 1 ? remapping(maps, () => null) : maps[0];

  return { code, map: JSON.stringify(stripSourceMapNames(map)) };
}

function serializeJestTransformConfig(config) {
  const transform = Object.fromEntries(
    Object.entries(config?.transform ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([pattern, value]) => [
        pattern,
        Array.isArray(value) ? [String(value[0]), value[1] ?? null] : String(value),
      ])
  );
  const transformIgnorePatterns = (config?.transformIgnorePatterns ?? []).map(String);

  return JSON.stringify({ transform, transformIgnorePatterns });
}

const transformer = {
  canInstrument: false,

  process(sourceText, sourcePath, transformOptions) {
    const prepared = prepareSource(sourceText, sourcePath);
    const result = getSwcTransformer(sourcePath).process(
      prepared.code,
      sourcePath,
      transformOptions
    );

    return finalizeResult(result, prepared, transformOptions);
  },

  async processAsync(sourceText, sourcePath, transformOptions) {
    const prepared = prepareSource(sourceText, sourcePath);
    const swcTransformer = getSwcTransformer(sourcePath);
    // @swc/jest's async transform always emits ESM, so only use it when Jest asked for ESM.
    const result = transformOptions?.supportsStaticESM
      ? await swcTransformer.processAsync(prepared.code, sourcePath, transformOptions)
      : swcTransformer.process(prepared.code, sourcePath, transformOptions);

    return finalizeResult(result, prepared, transformOptions);
  },

  getCacheKey(sourceText, sourcePath, transformOptions) {
    const config = transformOptions?.config ?? {};
    const rootDir = Path.resolve(config.rootDir ?? process.cwd());
    const hash = Crypto.createHash('sha256');

    for (const part of [
      THIS_FILE,
      DEPENDENCY_VERSIONS,
      JSON.stringify(getJestSwcConfig(sourcePath)),
      serializeJestTransformConfig(config),
      rootDir,
      Path.relative(rootDir, Path.resolve(sourcePath)),
      transformOptions?.instrument ? 'instrument' : 'no-instrument',
      transformOptions?.supportsStaticESM ? 'esm' : 'commonjs',
      process.env.NODE_ENV ?? '',
      process.version,
      sourceText,
    ]) {
      hash.update(part);
      hash.update('\0');
    }

    return hash.digest('hex').slice(0, 32);
  },
};

module.exports = transformer;
