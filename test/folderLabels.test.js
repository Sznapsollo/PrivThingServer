const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'privthing-labels-'));
const labelled = path.join(sandbox, 'notes');
const plain = path.join(sandbox, 'scripts');
fs.mkdirSync(labelled);
fs.mkdirSync(plain);
fs.writeFileSync(path.join(labelled, 'note.txt'), 'hello');
fs.writeFileSync(path.join(plain, 'deploy.txt'), 'hello');

fs.writeFileSync(path.join(sandbox, 'config.json'), JSON.stringify({
    port: 0,
    filesFolders: [
        { path: labelled + path.sep, label: 'My notes' },
        plain + path.sep
    ],
    extensions: ['.txt']
}));

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === '../config.json') {
        return path.join(sandbox, 'config.json')
    }
    return originalResolve.call(this, request, ...args)
};

const { handleAction } = require('../controllers/actions');
const call = (body) => new Promise((resolve) => handleAction({ body: body }, { json: resolve }));

test('a folder configured as {path, label} is served with its label', async () => {
    const files = (await call({ type: 'getListOfFiles' })).data.files;
    const note = files.find((file) => file.name === 'note.txt');

    assert.strictEqual(note.folderLabel, 'My notes');
    assert.strictEqual(note.folder, labelled + path.sep);
});

test('a folder configured as a plain string still has no label', async () => {
    const files = (await call({ type: 'getListOfFiles' })).data.files;
    const deploy = files.find((file) => file.name === 'deploy.txt');

    assert.strictEqual(deploy.folderLabel, null);
    assert.strictEqual(deploy.folder, plain + path.sep);
});

test('both shapes are still access-checked the same way', async () => {
    assert.strictEqual((await call({ type: 'retrieveFileFromPath', data: path.join(labelled, 'note.txt') })).status, 0);
    assert.strictEqual((await call({ type: 'retrieveFileFromPath', data: path.join(plain, 'deploy.txt') })).status, 0);
    assert.strictEqual((await call({ type: 'retrieveFileFromPath', data: labelled + '/../../etc/hosts' })).status, -1);
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
