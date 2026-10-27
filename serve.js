#!/usr/bin/env node
/*
 * Dev server for AFDG2025 -- zero dependencies, plain Node.
 *
 *     node serve.js            # http://localhost:8080
 *     node serve.js 3000       # pick a port
 *     node --watch serve.js    # also restart the server when serve.js itself changes
 *
 * The game is a browser app: Node cannot run it (there is no `document', no
 * `window', and no `localStorage' here). What Node *can* do is serve the files
 * over HTTP -- which the game needs anyway, because frankenstein.js fetches
 * pics/*.json and fetch() is blocked under file://.
 *
 * Two injections below are done at serve time, so index.html on disk stays
 * untouched.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const RELOAD_PATH = '/__livereload';
const STAGE_KEY = 'afdg2025_stage';
const IGNORE = /(^|[\\/])(\.git|node_modules|\.vscode|\.idea)([\\/]|$)/;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.mp3':  'audio/mpeg',
    '.wav':  'audio/wav',
    '.woff': 'font/woff',
    '.woff2':'font/woff2',
};

// Runs at the top of <head>, before the game's own <script src> tags, so
// LoadStage() sees empty storage and boots into stage 0.
const RESET_SNIPPET = `
<script>
/* dev server only: open /?reset=1 to wipe the saved stage and start over.
   Stage is one-way in-game, so this is the only way back to stage 0. */
if (new URLSearchParams(location.search).has('reset')) {
    try { localStorage.removeItem(${JSON.stringify(STAGE_KEY)}); } catch (e) {}
    // Stripping the param matters: if it stayed, every later reload would wipe
    // the stage again and look like the save had never worked.
    try { history.replaceState(null, '', location.pathname); }
    catch (e) { console.warn('AFDG2025 dev server: could not strip ?reset from the URL ' +
                             '- remove it by hand or each reload will reset the stage.'); }
}
</script>`;

// Runs at the end of <body>. EventSource reconnects by itself, so a server
// restart does not need a manual browser refresh.
const RELOAD_SNIPPET = `
<script>
(function () {
    var source = new EventSource(${JSON.stringify(RELOAD_PATH)});
    source.onmessage = function (e) { if (e.data === 'reload') location.reload(); };
})();
</script>`;

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

function inject(html, snippet, tag) {
    const re = tag === 'head' ? /<head[^>]*>/i : /<\/body>/i;
    const m = re.exec(html);
    if (!m) return html + snippet;
    const at = tag === 'head' ? m.index + m[0].length : m.index;
    return html.slice(0, at) + snippet + html.slice(at);
}

// ------------------------------------------------------------------ livereload
const clients = new Set();

function handleReload(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
    });
    res.write('retry: 500\n\n');           // reconnect fast if the server bounces
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);   // SSE comment: keeps idle sockets open
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

// Not every fs event is an edit. Opening a file for a read can update its access
// time, and a recursive watch on Windows reports that metadata change as an event --
// so the first browser request for a picture would reload the page, while later
// requests (served from the browser's image cache) would not. A real edit changes the
// file's mtime or size; an access does not. Remember each file's signature at startup
// and compare against it before calling something an edit.
const signatures = new Map();

function signature(file) {
    try {
        const st = fs.statSync(file);
        return st.mtimeMs + ':' + st.size;
    } catch (e) {
        return null;                       // gone, or not stat-able
    }
}

function primeSignatures(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORE.test(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) primeSignatures(full);
        else signatures.set(full, signature(full));
    }
}

function editedOnDisk(name) {
    const full = path.resolve(ROOT, name);
    const now = signature(full);
    if (now === null) return signatures.delete(full);   // deleted: reload if we knew it
    const before = signatures.get(full);
    signatures.set(full, now);
    return before === undefined || before !== now;      // new file, or really changed
}

let debounce = null;
let lastChange = '';
function onFsEvent(event, filename) {
    const name = filename ? String(filename) : '';
    if (name && IGNORE.test(name)) return;
    if (name && path.basename(name) === path.basename(__filename)) return;  // the server editing itself
    // No filename means we cannot tell an access from an edit; assume the latter.
    if (name && !editedOnDisk(name)) return;
    lastChange = name || '(unknown)';
    clearTimeout(debounce);
    debounce = setTimeout(() => {
        for (const c of clients) c.write('data: reload\n\n');
        log('reload -> ' + lastChange + '  (' + clients.size + ' tab' + (clients.size === 1 ? '' : 's') + ')');
    }, 80);                                 // one save fires several fs events
}

function watch() {
    try {
        fs.watch(ROOT, { recursive: true }, onFsEvent);
    } catch (e) {
        // Recursive watching is not supported everywhere (older Linux); fall
        // back to watching each file individually.
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (IGNORE.test(entry.name)) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else try { fs.watch(full, () => onFsEvent('change', full)); } catch (e2) {}
            }
        })(ROOT);
    }
}

// ---------------------------------------------------------------------- server
function serve(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        return res.end('method not allowed');
    }
    if (pathname === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
    }

    // Never let a request escape ROOT.
    const safe = path.normalize(pathname).replace(/^[\\/]+/, '').replace(/^(\.\.[\\/])+/, '');
    let file = path.resolve(ROOT, safe);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('forbidden');
    }

    fs.stat(file, (err, st) => {
        if (!err && st.isDirectory()) file = path.join(file, 'index.html');

        fs.readFile(file, (err2, buf) => {
            if (err2) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('404 ' + pathname);
                return log('404     ' + pathname);
            }

            const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
            if (type.startsWith('text/html')) {
                let html = buf.toString('utf8');
                html = inject(html, RESET_SNIPPET, 'head');
                html = inject(html, RELOAD_SNIPPET, 'body');
                buf = Buffer.from(html, 'utf8');
            }

            res.writeHead(200, {
                'Content-Type': type,
                'Content-Length': buf.length,
                // Edits must always win over the browser cache.
                'Cache-Control': 'no-store, must-revalidate',
            });
            res.end(req.method === 'HEAD' ? undefined : buf);

            // Only log what you actually edit -- a reload pulls ~25 images.
            if (/html|javascript|css|json/.test(type)) log('200     ' + pathname);
        });
    });
}

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === RELOAD_PATH) return handleReload(req, res);
    serve(req, res, pathname);
});

server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
        console.error('port ' + PORT + ' is already in use -- try:  node serve.js ' + (PORT + 1));
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, () => {
    // Snapshot every file first, so the watcher can tell an edit from an access.
    try { primeSignatures(ROOT); }
    catch (e) { log('could not snapshot file mtimes: ' + e.message); }
    watch();
    log('serving ' + ROOT);
    log('open    http://localhost:' + PORT + '/');
    log('reset   http://localhost:' + PORT + '/?reset=1   (wipes the saved stage)');
    log('watching for changes -- saving any file reloads every open tab');
});
