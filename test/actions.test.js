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
    assert.strictEqual(response.lastModified, fs.statSync(path.join(allowed, 'note.txt')).mtime.getTime());
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

const create = (folder, name, data) => call({ type: 'createFileInFolder', folder: folder, name: name, data: data });

test('creates a new file in a configured folder', async () => {
    const response = await create(allowed, 'fresh.txt', 'brand new');
    assert.strictEqual(response.status, 0);
    assert.strictEqual(fs.readFileSync(path.join(allowed, 'fresh.txt'), 'utf8'), 'brand new');
    fs.unlinkSync(path.join(allowed, 'fresh.txt'));
});

test('refuses to create in a folder that is not configured', async () => {
    assert.strictEqual((await create(outside, 'fresh.txt', 'x')).status, -1);
    assert.strictEqual(fs.existsSync(path.join(outside, 'fresh.txt')), false);
});

test('refuses to create in a subfolder, even of a configured one', async () => {
    assert.strictEqual((await create(path.join(allowed, 'sub'), 'fresh.txt', 'x')).status, -1);
});

test('refuses a file name that tries to walk out', async () => {
    assert.strictEqual((await create(allowed, '../escape.txt', 'x')).status, -1);
    assert.strictEqual((await create(allowed, 'sub/escape.txt', 'x')).status, -1);
    assert.strictEqual(fs.existsSync(path.join(sandbox, 'escape.txt')), false);
});

test('refuses to create a file with an extension that is not allowed', async () => {
    assert.strictEqual((await create(allowed, 'keys2.pem', 'x')).status, -1);
    assert.strictEqual(fs.existsSync(path.join(allowed, 'keys2.pem')), false);
});

test('refuses to overwrite an existing file through create', async () => {
    const response = await create(allowed, 'note.txt', 'clobbered');
    assert.strictEqual(response.status, -1);
    assert.strictEqual(fs.readFileSync(path.join(allowed, 'note.txt'), 'utf8'), 'hello from a configured folder');
});

test('a write with the timestamp it read goes through, and returns the new one', async () => {
    const target = path.join(allowed, 'conflict.txt');
    fs.writeFileSync(target, 'first');

    const opened = await read(target);
    const saved = await call({ type: 'updateFileFromPath', data: 'second', path: target, lastModified: opened.lastModified });

    assert.strictEqual(saved.status, 0);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'second');
    assert.strictEqual(saved.lastModified, fs.statSync(target).mtime.getTime());
    fs.unlinkSync(target);
});

test('a write with a stale timestamp is refused and the file is left alone', async () => {
    const target = path.join(allowed, 'conflict.txt');
    fs.writeFileSync(target, 'what the editor opened');

    const opened = await read(target);
    fs.writeFileSync(target, 'what somebody else wrote');
    fs.utimesSync(target, new Date(), new Date(opened.lastModified + 5000));

    const saved = await call({ type: 'updateFileFromPath', data: 'from the editor', path: target, lastModified: opened.lastModified });

    assert.strictEqual(saved.status, -1);
    assert.strictEqual(saved.code, 'CONFLICT');
    assert.strictEqual(saved.lastModified, fs.statSync(target).mtime.getTime());
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'what somebody else wrote');
    fs.unlinkSync(target);
});

test('overwriting on purpose, with no timestamp sent, still works', async () => {
    const target = path.join(allowed, 'conflict.txt');
    fs.writeFileSync(target, 'somebody else');

    const saved = await call({ type: 'updateFileFromPath', data: 'forced', path: target });

    assert.strictEqual(saved.status, 0);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'forced');
    fs.unlinkSync(target);
});

test('saving twice in a row does not raise a false conflict', async () => {
    const target = path.join(allowed, 'conflict.txt');
    fs.writeFileSync(target, 'first');

    let stamp = (await read(target)).lastModified;
    let saved = await call({ type: 'updateFileFromPath', data: 'second', path: target, lastModified: stamp });
    assert.strictEqual(saved.status, 0);

    saved = await call({ type: 'updateFileFromPath', data: 'third', path: target, lastModified: saved.lastModified });
    assert.strictEqual(saved.status, 0);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), 'third');
    fs.unlinkSync(target);
});

test.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
