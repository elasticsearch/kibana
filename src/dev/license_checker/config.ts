/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// The following list applies to packages both
// used as dependencies or dev dependencies
export const LICENSE_ALLOWED = [
  'Elastic-License',
  'Elastic License 2.0',
  'Elastic License 2.0 OR AGPL-3.0-only OR SSPL-1.0',
  '0BSD',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(BSD-2-Clause OR MIT)',
  '(BSD-3-Clause AND Apache-2.0)',
  '(GPL-2.0 OR MIT)',
  '(MIT AND CC-BY-3.0)',
  '(MIT AND Zlib)',
  '(MIT OR Apache-2.0)',
  '(MIT OR GPL-3.0)',
  '(MIT OR GPL-3.0-or-later)',
  '(WTFPL OR MIT)',
  '(MIT OR WTFPL)',
  '(Unlicense OR Apache-2.0)',
  'AFLv2.1',
  '(AFL-2.1 OR BSD-3-Clause)',
  'Apache 2.0',
  'Apache License, v2.0',
  'Apache License, Version 2.0',
  'Apache',
  'Apache*',
  'Apache, Version 2.0',
  'Apache-2.0',
  'BSD 3-Clause',
  'BSD New',
  'BSD',
  'BSD*',
  'BSD-2-Clause',
  'BSD-3-Clause AND MIT',
  '(MIT AND BSD-3-Clause)',
  'BSD-3-Clause OR MIT',
  'BSD-3-Clause',
  '(BSD-3-Clause OR GPL-2.0)',
  'BSD-like',
  'CC0-1.0',
  'CC-BY',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'Eclipse Distribution License - v 1.0',
  'FreeBSD',
  'ISC',
  'ISC*',
  'MIT OR GPL-2.0',
  '(MIT OR CC0-1.0)',
  'MIT',
  'MIT*',
  'MIT-0',
  'MIT/X11',
  'new BSD, and MIT',
  '(OFL-1.1 AND MIT)',
  'PSF',
  'Public Domain',
  'Unlicense',
  'WTFPL OR ISC',
  'WTFPL',
  'Nuclide software',
  'Python-2.0',
  '(Apache-2.0 AND MIT)',
  'Apache-2.0 AND MIT',
  'BlueOak-1.0.0',
  'WTFPL OR CC0-1.0',
];

// The following list only applies to licenses that
// we wanna allow in packages only used as dev dependencies
export const DEV_ONLY_LICENSE_ALLOWED = ['MPL-2.0', '(MPL-2.0 OR Apache-2.0)'];

// there are some licenses which should not be globally allowed
// but can be brought in on a per-package basis
export const PER_PACKAGE_ALLOWED_LICENSES = {
  'openpgp@5.11.3': ['LGPL-3.0+'],
  '@img/sharp-libvips-darwin-arm64@1.2.4': ['LGPL-3.0-or-later'],
  '@img/sharp-libvips-linuxmusl-x64@1.2.4': ['LGPL-3.0-or-later'],
  '@img/sharp-libvips-linux-x64@1.2.4': ['LGPL-3.0-or-later'],
  'dompurify@3.4.11': ['(MPL-2.0 OR Apache-2.0)'],
  'node-liblzma@2.2.0': ['LGPL-3.0'],
};
// Globally overrides a license for a given package@version
export const LICENSE_OVERRIDES = {
  'jsts@1.6.2': ['Eclipse Distribution License - v 1.0'], // cf. https://github.com/bjornharrtell/jsts
  '@mapbox/jsonlint-lines-primitives@2.0.2': ['MIT'], // license in readme https://github.com/tmcw/jsonlint
  '@elastic/ems-client@8.7.0': ['Elastic License 2.0'],
  '@elastic/esql': ['Elastic License 2.0'],
  '@elastic/eui': ['Elastic License 2.0 OR AGPL-3.0-only OR SSPL-1.0'],
  '@elastic/eui-theme-borealis': ['Elastic License 2.0 OR AGPL-3.0-only OR SSPL-1.0'],
  'language-subtag-registry@0.3.21': ['CC-BY-4.0'], // retired ODC‑By license https://github.com/mattcg/language-subtag-registry
  'buffers@0.1.1': ['MIT'], // license in importing module https://www.npmjs.com/package/binary
  '@bufbuild/protobuf@2.5.2': ['Apache-2.0'], // license (Apache-2.0 AND BSD-3-Clause)
  '@arizeai/phoenix-client@4.2.0': ['Elastic License 2.0'], // see https://github.com/Arize-ai/phoenix/blob/main/LICENSE
};
