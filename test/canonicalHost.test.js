const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const Module = require('module');

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'privthing-canonical-'));
fs.writeFileSync(path.join(sandbox, 'config.json'), JSON.stringify({
    port: 0,
    canonicalHost: 'privthing.com',
    filesFolders: [],
    extensions: ['.txt']
}));

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === '../config.json') {
        return path.join(sandbox, 'config.json')
    }
    return originalResolve.call(this, request, ...args)
};

const Server = require('../models/server');
const listener = new Server().app.listen(0, '127.0.0.1');
const listening = new Promise((resolve) => listener.on('listening', resolve));

const request = async (requestPath, headers) => {
    await listening;
    return new Promise((resolve) => {
        const options = { host: '127.0.0.1', port: listener.address().port, path: requestPath, headers: headers };
        http.get(options, (res) => {
            res.resume();
            resolve({ status: res.statusCode, location: res.headers.location })
        })
    })
};

const asProxied = (host, proto) => ({ host: host, 'x-forwarded-proto': proto });

test('www is redirected to the canonical host', async () => {
    const res = await request('/', asProxied('www.privthing.com', 'https'));

    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.location, 'https://privthing.com/');
});

test('plain http is redirected to https', async () => {
    const res = await request('/', asProxied('privthing.com', 'http'));

    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.location, 'https://privthing.com/');
});

test('the query string survives the redirect', async () => {
    const res = await request('/?lang=pl', asProxied('www.privthing.com', 'http'));

    assert.strictEqual(res.location, 'https://privthing.com/?lang=pl');
});

test('index.html is redirected to the site root', async () => {
    const res = await request('/index.html', asProxied('privthing.com', 'https'));

    assert.strictEqual(res.status, 301);
    assert.strictEqual(res.location, '/');
});

test('the canonical url itself is served, not redirected', async () => {
    const res = await request('/robots.txt', asProxied('privthing.com', 'https'));

    assert.notStrictEqual(res.status, 301);
});

test('a proxy that sends no protocol header does not start a redirect loop', async () => {
    const res = await request('/robots.txt', { host: 'privthing.com' });

    assert.notStrictEqual(res.status, 301);
});

test.after(() => listener.close());
