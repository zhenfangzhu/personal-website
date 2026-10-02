const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const root = join(__dirname, '..');

function homepage(path, previousLanguage, storageBlocked = false) {
    const html = readFileSync(join(root, path), 'utf8');
    const bootstrap = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map(match => match[1]).find(script => script.includes('const routeLanguage'));
    const route = html.match(/<meta name="site-language-route" content="([^"]+)"/)?.[1];
    const listeners = new Map();
    const writes = [];
    let saved = previousLanguage;
    const storage = {
        getItem() { if (storageBlocked) throw new Error('Unavailable'); return saved; },
        setItem(key, value) { if (storageBlocked) throw new Error('Unavailable'); writes.push([key, value]); saved = value; }
    };
    const document = {
        documentElement: { dataset: {} }, body: { dataset: {} },
        querySelector: () => route ? { content: route } : null,
        querySelectorAll: () => [], addEventListener() {}
    };
    const window = { localStorage: storage, addEventListener: (type, listener) => listeners.set(type, listener) };
    const context = vm.createContext({ document, window, localStorage: storage, navigator: { language: 'en-US' } });
    vm.runInContext(bootstrap, context);
    vm.runInContext(readFileSync(join(root, 'static/js/language.js'), 'utf8'), context);
    listeners.get('DOMContentLoaded')();
    return {
        language: document.documentElement.lang, saved, writes,
        restoreAfterPreference(language) {
            saved = language;
            listeners.get('pageshow')({ persisted: true });
            return saved;
        }
    };
}

test('direct English homepage overrides a Chinese preference for subsequent pages', () => {
    const page = homepage('en/index.html', 'zh');
    assert.equal(page.language, 'en');
    assert.equal(page.saved, 'en');
    assert.deepEqual(page.writes, [['site-language', 'en']]);
});

test('direct Chinese homepage overrides an English preference for subsequent pages', () => {
    const page = homepage('zh/index.html', 'en');
    assert.equal(page.language, 'zh-CN');
    assert.equal(page.saved, 'zh');
});

test('fresh English route remembers English, while root preserves existing preference', () => {
    assert.equal(homepage('en/index.html', null).saved, 'en');
    const page = homepage('index.html', 'zh');
    assert.equal(page.language, 'zh-CN');
    assert.deepEqual(page.writes, []);
});

test('restored explicit routes keep subsequent navigation in their displayed language', () => {
    assert.equal(homepage('en/index.html', 'en').restoreAfterPreference('zh'), 'en');
    assert.equal(homepage('zh/index.html', 'zh').restoreAfterPreference('en'), 'zh');
    assert.equal(homepage('index.html', 'en').restoreAfterPreference('zh'), 'zh');
});

test('explicit language routes still load when storage is unavailable', () => {
    assert.equal(homepage('en/index.html', 'zh', true).language, 'en');
    assert.equal(homepage('zh/index.html', 'en', true).language, 'zh-CN');
});

function dreams({ nativeTransition = false, reducedMotion = false } = {}) {
    const classes = new Set();
    const events = new Map();
    const documentEvents = new Map();
    const navigations = [];
    const timers = [];
    const document = {
        querySelectorAll: () => [],
        documentElement: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
        addEventListener: (type, listener) => documentEvents.set(type, listener)
    };
    if (nativeTransition) document.startViewTransition = () => {};
    const window = {
        addEventListener: (type, listener) => events.set(type, listener),
        matchMedia: () => ({ matches: reducedMotion }),
        location: { origin: 'https://example.test', assign: url => navigations.push(url) },
        setTimeout: callback => timers.push(callback)
    };
    vm.runInNewContext(readFileSync(join(root, 'static/js/dream-navigation.js'), 'utf8'), { document, window });
    const link = { origin: window.location.origin, href: 'https://example.test/dreams/entry/' };
    return {
        classes, navigations,
        click() {
            const event = { button: 0, target: { closest: () => link }, preventDefault() { this.defaultPrevented = true; } };
            documentEvents.get('click')(event);
            timers.forEach(callback => callback());
            return event;
        },
        restore() { events.get('pageshow')({ persisted: true }); }
    };
}

test('back-forward cache restores visible dream content after fallback navigation', () => {
    const page = dreams();
    assert.equal(page.click().defaultPrevented, true);
    assert.equal(page.classes.has('dream-is-leaving'), true);
    assert.deepEqual(page.navigations, ['https://example.test/dreams/entry/']);
    page.restore();
    assert.equal(page.classes.has('dream-is-leaving'), false);
});

test('native transitions and reduced-motion links retain normal navigation', () => {
    for (const options of [{ nativeTransition: true }, { reducedMotion: true }]) {
        const page = dreams(options);
        assert.equal(page.click().defaultPrevented, undefined);
        assert.equal(page.classes.size, 0);
        assert.deepEqual(page.navigations, []);
    }
});
