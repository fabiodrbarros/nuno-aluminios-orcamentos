'use strict';
// Cada ficheiro de teste usa uma pasta de dados temporária própria.
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nuno-orc-test-'));
