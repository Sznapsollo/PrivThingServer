const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'privthing-test-'));
const allowed = path.join(sandbox, 'notes');
const outside = path.join(sandbox, 'outside');
fs.mkdirSync(allowed);
fs.mkdirSync(outside);
fs.writeFileSync(path.join(allowed, 'note.txt'), 'hello from a configured folder');
fs.writeFileSync(path.join(allowed, 'keys.pem'), 'PRIVATE KEY');
fs.writeFileSync(path.join(outside, 'secret.txt'), 'MUST NOT BE READABLE');

const decoy = path.join(sandbox, 'decoy', allowed);
fs.mkdirSync(decoy, { recursive: true });
fs.writeFileSync(path.join(decoy, 'secret.txt'), 'MUST NOT BE READABLE EITHER');
fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(allowed, 'escape.txt'));

fs.writeFileSync(path.join(sandbox, 'config.json'), JSON.stringify({
    port: 0,
    filesFolders: [allowed + path.sep],
    extensions: ['.txt', '.prvthng']
}));

const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === '../config.json') {
        return path.join(sandbox, 'config.json')
    }
    return originalResolve.call(this, request, ...args)
};

const { handleAction } = require('../controllers/actions');

const call = (body) => new Promise((resolve) => handleAction({ body: body }, { json: resolve }));
const read = (filePath) => call({ type: 'retrieveFileFromPath', data: filePath });
const write = (filePath, data) => call({ type: 'updateFileFromPath', data: data, path: filePath });

test('reads a normal file inside a configured folder', async () => {
    const response = await read(path.join(allowed, 'note.txt'));
    assert.strictEqual(response.status, 0);
    assert.strictEqual(response.data, 'hello from a configured folder');
});

test('writes a normal file inside a configured folder', async () => {
    const target = path.join(allowed, 'note.txt');
    assert.strictEqual((await write(target, 'updated')).status, 0);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'updated');
    fs.writeFileSync(target, 'hello from a configured folder');
});

test('refuses to read through ..', async () => {
    const traversal = allowed + '/../outside/secret.txt';
    const response = await read(traversal);
    assert.strictEqual(response.status, -1);
    assert.strictEqual(response.data, 'Access to file denied.');
});

test('refuses to write through ..', async () => {
    const traversal = allowed + '/../outside/secret.txt';
    assert.strictEqual((await write(traversal, 'OVERWRITTEN')).status, -1);
    assert.strictEqual(fs.readFileSync(path.join(outside, 'secret.txt'), 'utf8'), 'MUST NOT BE READABLE');
});

test('refuses a path that merely contains a configured folder as a substring', async () => {
    const lookalike = path.join(decoy, 'secret.txt');
    assert.ok(lookalike.includes(allowed + path.sep));
    assert.strictEqual((await read(lookalike)).status, -1);
    assert.strictEqual((await read(allowed + '-evil/secret.txt')).status, -1);
});

test('refuses an extension that is not in the allowlist', async () => {
    assert.strictEqual((await read(path.join(allowed, 'keys.pem'))).status, -1);
    assert.strictEqual((await write(path.join(allowed, 'keys.pem'), 'x')).status, -1);
});

test('refuses a symlink that points outside a configured folder', async () => {
    const response = await read(path.join(allowed, 'escape.txt'));
    assert.strictEqual(response.status, -1);
    assert.strictEqual(response.data, 'Access to file denied.');
});

test('search does not compile the phrase as a regex', async () => {
    const started = Date.now();
    const response = await call({ type: 'getListOfFiles', searchPhrase: '(a+)+$' });
    assert.strictEqual(response.status, 0);
    assert.ok(Date.now() - started < 2000);
    assert.strictEqual(response.data.files.length, 0);
});

test('search survives a phrase with an unbalanced bracket', async () => {
    const response = await call({ type: 'getListOfFiles', searchPhrase: 'foo(' });
    assert.strictEqual(response.status, 0);
});

test('search finds content case-insensitively and lists only allowed extensions', async () => {
    const response = await call({ type: 'getListOfFiles', searchPhrase: 'CONFIGURED' });
    assert.strictEqual(response.data.files.length, 1);
    assert.strictEqual(response.data.files[0].name, 'note.txt');
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
