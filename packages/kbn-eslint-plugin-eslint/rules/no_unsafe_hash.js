/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const path = require('path');
const findKibanaRoot = require('../helpers/find_kibana_root');

const KIBANA_ROOT = findKibanaRoot();

// Allowlist (most temporary) of files permitted to use non-FIPS algorithms.
const ALLOWED_UNSAFE_HASHES = [
  { path: 'packages/kbn-optimizer/src/common/dll_manifest.ts', algorithms: ['sha1'] },
  {
    path: 'src/core/packages/test-helpers/so-type-serializer/src/get_migration_hash.ts',
    algorithms: ['sha1'],
  },
  {
    path: 'x-pack/platform/test/cases_api_integration/common/plugins/cases/server/routes.ts',
    algorithms: ['sha1'],
  },
];

const allowedAlgorithms = ['sha256', 'sha3-256', 'sha512'];

module.exports = {
  allowedAlgorithms,
  meta: {
    type: 'problem',
    docs: {
      description: 'Allow usage of createHash only with allowed algorithms.',
      category: 'FIPS',
      recommended: false,
    },
    messages: {
      noDisallowedHash:
        'Usage of {{functionName}} with "{{algorithm}}" is not allowed. Only the following algorithms are allowed: [{{allowedAlgorithms}}]. If you need to use a different algorithm, please contact the Kibana security team.',
    },
    schema: [],
  },
  create(context) {
    let isCreateHashImported = false;
    let createHashName = 'createHash';
    let cryptoLocalName = 'crypto';
    let usedFunctionName = '';
    const sourceCode = context.getSourceCode();

    const disallowedAlgorithmNodes = new Set();

    const filename = context.getFilename();
    const relativeFilename = path.relative(KIBANA_ROOT, filename);
    const fileAllowlistEntry = ALLOWED_UNSAFE_HASHES.find(
      (entry) => entry.path === relativeFilename
    );
    const fileScopedAllowedAlgorithms = fileAllowlistEntry
      ? [...allowedAlgorithms, ...fileAllowlistEntry.algorithms]
      : allowedAlgorithms;

    function isAllowedAlgorithm(algorithm) {
      return fileScopedAllowedAlgorithms.includes(algorithm);
    }

    function isHashOrCreateHash(value) {
      if (value === 'hash' || value === 'createHash') {
        usedFunctionName = value;
        return true;
      }
      return false;
    }

    function getIdentifierValue(node) {
      const scope = sourceCode.getScope(node);
      if (!scope) {
        return;
      }
      const variable = scope.variables.find((variable) => variable.name === node.name);
      if (variable && variable.defs.length > 0) {
        const def = variable.defs[0];
        if (
          def.node.init &&
          def.node.init.type === 'Literal' &&
          !isAllowedAlgorithm(def.node.init.value)
        ) {
          disallowedAlgorithmNodes.add(node.name);
          return def.node.init.value;
        }
      }
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value === 'crypto' || node.source.value === 'node:crypto') {
          node.specifiers.forEach((specifier) => {
            if (
              specifier.type === 'ImportSpecifier' &&
              isHashOrCreateHash(specifier.imported.name)
            ) {
              isCreateHashImported = true;
              createHashName = specifier.local.name; // Capture local name (renamed or not)
            } else if (specifier.type === 'ImportDefaultSpecifier') {
              cryptoLocalName = specifier.local.name;
            }
          });
        }
      },
      VariableDeclarator(node) {
        if (node.init && node.init.type === 'Literal' && !isAllowedAlgorithm(node.init.value)) {
          disallowedAlgorithmNodes.add(node.id.name);
        }
      },
      AssignmentExpression(node) {
        if (
          node.right.type === 'Literal' &&
          node.right.value === 'md5' &&
          node.left.type === 'Identifier'
        ) {
          disallowedAlgorithmNodes.add(node.left.name);
        }
      },
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee.type === 'MemberExpression' &&
          callee.object.name === cryptoLocalName &&
          isHashOrCreateHash(callee.property.name)
        ) {
          const arg = node.arguments[0];
          if (arg) {
            if (arg.type === 'Literal' && !isAllowedAlgorithm(arg.value)) {
              context.report({
                node,
                messageId: 'noDisallowedHash',
                data: {
                  algorithm: arg.value,
                  allowedAlgorithms: allowedAlgorithms.join(', '),
                  functionName: usedFunctionName,
                },
              });
            } else if (arg.type === 'Identifier') {
              const identifierValue = getIdentifierValue(arg);
              if (disallowedAlgorithmNodes.has(arg.name) && identifierValue) {
                context.report({
                  node,
                  messageId: 'noDisallowedHash',
                  data: {
                    algorithm: identifierValue,
                    allowedAlgorithms: allowedAlgorithms.join(', '),
                    functionName: usedFunctionName,
                  },
                });
              }
            }
          }
        }

        if (isCreateHashImported && callee.name === createHashName) {
          const arg = node.arguments[0];
          if (arg) {
            if (arg.type === 'Literal' && !isAllowedAlgorithm(arg.value)) {
              context.report({
                node,
                messageId: 'noDisallowedHash',
                data: {
                  algorithm: arg.value,
                  allowedAlgorithms: allowedAlgorithms.join(', '),
                  functionName: usedFunctionName,
                },
              });
            } else if (arg.type === 'Identifier') {
              const identifierValue = getIdentifierValue(arg);
              if (disallowedAlgorithmNodes.has(arg.name) && identifierValue) {
                context.report({
                  node,
                  messageId: 'noDisallowedHash',
                  data: {
                    algorithm: identifierValue,
                    allowedAlgorithms: allowedAlgorithms.join(', '),
                    functionName: usedFunctionName,
                  },
                });
              }
            }
          }
        }
      },
    };
  },
};
