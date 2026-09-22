const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'privthing-noslash-'));
const withSlash = path.join(sandbox, 'notes');
const withoutSlash = path.join(sandbox, 'scripts');
fs.mkdirSync(withSlash);
fs.mkdirSync(withoutSlash);
fs.writeFileSync(path.join(withSlash, 'note.txt'), 'hello');
fs.writeFileSync(path.join(withoutSlash, 'deploy.txt'), 'hello');

fs.writeFileSync(path.join(sandbox, 'config.json'), JSON.stringify({
    port: 0,
    filesFolders: [withSlash + path.sep, withoutSlash],
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

test('a folder configured with a trailing slash keeps the exact paths it always had', async () => {
    const files = (await call({ type: 'getListOfFiles' })).data.files;
    const note = files.find((file) => file.name === 'note.txt');

    assert.strictEqual(note.path, withSlash + path.sep + 'note.txt');
    assert.strictEqual(note.folder, withSlash + path.sep);
});

test('a folder configured without a trailing slash lists paths that can actually be opened', async () => {
    const files = (await call({ type: 'getListOfFiles' })).data.files;
    const deploy = files.find((file) => file.name === 'deploy.txt');

    assert.strictEqual(deploy.path, path.join(withoutSlash, 'deploy.txt'));
    assert.strictEqual((await call({ type: 'retrieveFileFromPath', data: deploy.path })).status, 0);
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
