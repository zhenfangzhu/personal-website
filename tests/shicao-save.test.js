const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = readFileSync(join(__dirname, "../shicao/index.html"), "utf8");
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(script => script.includes("const KEY='shicao-journal-v1'"));
assert.ok(source, "The application inline script must be present");
const storageKey = "shicao-journal-v1";
const decode = value => value.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"
}[entity]));
const camel = value => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// Only DOM APIs used by this application are modeled. All rendering and event handlers run unmodified.
class MemoryElement {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase();
        this.ownerDocument = document;
        this.attributes = new Map();
        this.dataset = {};
        this.childNodes = [];
        this.listeners = new Map();
        this.parentNode = null;
        this.hidden = false;
        this.disabled = false;
        this.checked = false;
        this._value = "";
        this.selected = false;
        this.selectionSet = false;
        this.classList = {
            add: name => this.attributes.set("class", [...new Set([...this.classes(), name])].join(" ")),
            remove: name => this.attributes.set("class", this.classes().filter(value => value !== name).join(" ")),
            toggle: (name, force) => (force ?? !this.classes().includes(name)) ? this.classList.add(name) : this.classList.remove(name),
            contains: name => this.classes().includes(name)
        };
    }

    get value() {
        if (this.tagName === "OPTION") return this.attributes.has("value") ? this.attributes.get("value") : this.textContent;
        if (this.tagName === "SELECT") {
            const options = this.querySelectorAll("option");
            return (options.find(option => option.selected) || (!this.selectionSet && options[0]))?.value ?? "";
        }
        return this._value;
    }
    set value(value) {
        value = String(value);
        if (this.tagName === "OPTION") this.attributes.set("value", value);
        else if (this.tagName === "SELECT") {
            this.selectionSet = true;
            this.querySelectorAll("option").forEach(option => { option.selected = option.value === value; });
        } else this._value = value;
    }
    classes() { return (this.attributes.get("class") || "").split(/\s+/).filter(Boolean); }
    get children() { return this.childNodes.filter(node => node instanceof MemoryElement); }
    get textContent() { return this.childNodes.map(node => typeof node === "string" ? node : node.textContent).join(""); }
    set textContent(value) { this.childNodes = [String(value)]; }
    set innerHTML(value) { this.childNodes = []; this.insertAdjacentHTML("beforeend", value); }
    setAttribute(name, value) {
        value = String(value);
        this.attributes.set(name, value);
        if (name.startsWith("data-")) this.dataset[camel(name.slice(5))] = value;
        if (["hidden", "disabled", "checked", "selected"].includes(name)) this[name] = true;
        if (["id", "value", "name", "type"].includes(name)) this[name] = value;
    }
    getAttribute(name) { return name.startsWith("data-") ? this.dataset[camel(name.slice(5))] : this.attributes.get(name); }
    removeAttribute(name) {
        this.attributes.delete(name);
        if (name.startsWith("data-")) delete this.dataset[camel(name.slice(5))];
        if (["hidden", "disabled", "checked", "selected"].includes(name)) this[name] = false;
    }
    matches(selector) {
        const tag = selector.match(/^[\w-]+/)?.[0];
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        const id = selector.match(/#([\w-]+)/)?.[1];
        if (id && this.id !== id) return false;
        for (const [, name] of selector.matchAll(/\.([\w-]+)/g)) if (!this.classes().includes(name)) return false;
        for (const [, name, expected] of selector.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)) {
            const value = this.getAttribute(name);
            if (value === undefined || (expected !== undefined && value !== expected)) return false;
        }
        return true;
    }
    querySelectorAll(selector) {
        const selectors = selector.split(",").map(value => value.trim());
        const result = [];
        const visit = node => {
            for (const child of node.children) {
                if (selectors.some(value => {
                    const parts = value.split(/\s+(?=[.#\[])/);
                    if (!child.matches(parts.pop())) return false;
                    let parent = child.parentNode;
                    while (parts.length) {
                        const part = parts.pop();
                        while (parent && !parent.matches(part)) parent = parent.parentNode;
                        if (!parent) return false;
                        parent = parent.parentNode;
                    }
                    return true;
                })) result.push(child);
                visit(child);
            }
        };
        visit(this);
        return result;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    appendChild(node) { node.remove(); node.parentNode = this; this.childNodes.push(node); return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    prepend(node) { node.remove(); node.parentNode = this; this.childNodes.unshift(node); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() {
        if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this);
        this.parentNode = null;
    }
    insertAdjacentHTML(position, value) {
        assert.equal(position, "beforeend");
        const stack = [this];
        for (const token of value.matchAll(/<\/?([a-z][\w:-]*)\b([^>]*?)>|([^<]+)/gi)) {
            if (token[3] !== undefined) { stack.at(-1).childNodes.push(decode(token[3])); continue; }
            const tag = token[1].toLowerCase();
            if (token[0].startsWith("</")) {
                const node = stack.pop();
                if (tag === "textarea") node.value = node.textContent;
                continue;
            }
            const node = new MemoryElement(tag, this.ownerDocument);
            for (const [, name, double, single, bare] of token[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
                node.setAttribute(name, decode(double ?? single ?? bare ?? ""));
            }
            stack.at(-1).appendChild(node);
            if (!["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"].includes(tag) && !token[0].endsWith("/>")) stack.push(node);
        }
    }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(listener);
    }
    emit(type, event = {}) {
        event.target ||= this;
        event.preventDefault ||= () => { event.defaultPrevented = true; };
        this[`on${type}`]?.(event);
        (this.listeners.get(type) || []).forEach(listener => listener(event));
        return event;
    }
    click() {
        if (this.disabled) return;
        if (this.tagName === "A" && this.download) this.ownerDocument.downloads.push({ name: this.download, blob: this.ownerDocument.blobs.get(this.href) });
        else this.emit("click");
    }
    focus() { this.ownerDocument.activeElement = this; }
    scrollIntoView() {}
}


const fixtureState = (overrides = {}) => ({
    date: "2026-10-03T04:00:00.000Z", mode: "virtual", auto: true,
    firstStalk: null, virtual: null, step: 0, records: [], left: null, right: null,
    question: "原有问题", purpose: "原有所求", questionLocked: false, notes: "原有手记", ...overrides
});
const initialFixture = JSON.stringify({ state: fixtureState(), undo: [fixtureState({ question: "原有撤销记录" })], archive: [fixtureState({ question: "原有历史记录" })] });
function storageError(name) { const error = new Error(name); error.name = name; return error; }

function setup(options = {}) {
    const storage = {
        value: Object.hasOwn(options, "storedValue") ? options.storedValue : initialFixture,
        attempts: [], readError: options.readError || null, writeError: options.writeError || null,
        getItem(key) { assert.equal(key, storageKey); if (this.readError) throw this.readError; return this.value; },
        setItem(key, value) { assert.equal(key, storageKey); this.attempts.push(value); if (this.writeError) throw this.writeError; this.value = value; }
    };
    const document = new MemoryElement("document");
    document.ownerDocument = document;
    document.blobs = new Map(); document.downloads = [];
    document.body = new MemoryElement("body", document);
    document.appendChild(document.body);
    document.body.innerHTML = html.split("<body>")[1].split("<script")[0];
    document.getElementById = id => document.querySelector(`#${id}`);
    document.createElement = tag => {
        const element = new MemoryElement(tag, document);
        if (tag === "canvas") {
            element.getContext = () => ({
                measureText: value => ({ width: value.length * 20 }),
                scale() {}, fillRect() {}, strokeRect() {}, fillText() {},
                beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}
            });
            element.toDataURL = () => "data:image/png;base64,fixture";
        }
        return element;
    };
    const window = new MemoryElement("window", document);
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    const timers = [];
    const context = vm.createContext({
        document, window, localStorage: storage, Blob, Uint32Array,
        setTimeout: callback => timers.push(callback),
        URL: { createObjectURL(blob) { const url = `blob:memory-${document.blobs.size}`; document.blobs.set(url, blob); return url; }, revokeObjectURL(url) { document.blobs.delete(url); } },
        // The separate focus.js handles only layout. Persistence, rendering and application inputs run unmodified.
        captureReadingFocus() { return null; }, restoreReadingFocus() {},
        arrangeReadingSurface() {},
        fetch() { throw new Error("Network access is forbidden in these tests"); }
    });
    vm.runInContext(source, context);
    const get = selector => { const element = document.querySelector(selector); assert.ok(element, `Missing UI element: ${selector}`); return element; };
    const run = code => vm.runInContext(code, context);
    return {
        document, window, storage, get, run,
        input(selector, value) { const element = get(selector); element.value = value; element.emit("input"); },
        retry() { return run("retryJournal()"); },
        snapshot() { return JSON.parse(run("journalJSON()")); },
        leave() { return window.emit("beforeunload", { defaultPrevented: false }); },
        async exportCurrent() { run("exportCurrentJournal()"); return JSON.parse(await document.downloads.at(-1).blob.text()); },
        async exportOriginal() { run("exportStoredJournal()"); return document.downloads.at(-1).blob.text(); }
    };
}

test("loading and rendering a valid journal do not rewrite stored history or undo", () => {
    const app = setup();
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.get("#intentionInput").value, "原有问题");
    app.run("render()");
    assert.equal(app.storage.value, initialFixture);
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.get("#saveWarning").hidden, true);
});

test("an initial read failure cannot replace an unknown journal on startup or later edits", async () => {
    const app = setup({ readError: storageError("SecurityError") });
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.get("#saveWarning").hidden, false);
    assert.equal(app.get("#retryJournal").textContent, "重试读取");
    app.input("#intentionInput", "临时输入的问题");
    app.input("#purposeInput", "临时输入的所求");
    app.run("takeFirstStalk(7)");
    app.run("render()");
    assert.equal(app.storage.value, initialFixture);
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.leave().defaultPrevented, true);
    const backup = await app.exportCurrent();
    assert.equal(backup.state.question, "临时输入的问题");
    assert.equal(backup.state.purpose, "临时输入的所求");
    assert.equal(backup.state.firstStalk, 7);
    assert.equal(backup.undo.length, 1);
});

for (const storedValue of ["{ broken json", "null", JSON.stringify({ state: { records: [] } }), JSON.stringify({ state: fixtureState(), undo: {}, archive: [] }), JSON.stringify({ state: fixtureState(), undo: [], archive: [null] })]) {
    test(`an unreadable or invalid journal remains untouched: ${storedValue.slice(0, 55)}`, async () => {
        const app = setup({ storedValue });
        assert.equal(app.storage.value, storedValue);
        assert.equal(app.storage.attempts.length, 0);
        assert.equal(app.get("#saveWarning").hidden, false);
        assert.match(app.get("#saveWarningText").textContent, /无法解析/);
        assert.equal(app.get("#exportStoredJournal").hidden, false);
        app.input("#intentionInput", "损坏后暂记的问题");
        assert.equal(app.retry(), false);
        assert.equal(app.storage.attempts.length, 0);
        assert.equal(await app.exportOriginal(), storedValue);
        assert.equal((await app.exportCurrent()).state.question, "损坏后暂记的问题");
    });
}

test("retry after a read failure restores an existing journal only when there are no temporary edits", () => {
    const app = setup({ readError: storageError("SecurityError") });
    app.storage.readError = null;
    assert.equal(app.retry(), true);
    assert.deepEqual(app.snapshot(), JSON.parse(initialFixture));
    assert.equal(app.get("#intentionInput").value, "原有问题");
    assert.equal(app.get("#saveWarning").hidden, true);
    assert.equal(app.storage.attempts.length, 0);
});

test("a recovered existing journal and temporary edits are both kept and can be exported separately", async () => {
    const app = setup({ readError: storageError("SecurityError") });
    app.input("#intentionInput", "读取失败时写下的草稿");
    app.storage.readError = null;
    assert.equal(app.retry(), false);
    assert.equal(app.storage.value, initialFixture);
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.get("#intentionInput").value, "读取失败时写下的草稿");
    assert.match(app.get("#saveWarningText").textContent, /分别导出/);
    assert.equal(await app.exportOriginal(), initialFixture);
    assert.equal((await app.exportCurrent()).state.question, "读取失败时写下的草稿");
    assert.equal(app.leave().defaultPrevented, true);
    assert.equal(setup({ storedValue: app.storage.value }).snapshot().state.question, "原有问题");
});

test("retry can persist the current draft when the recovered read confirms storage is empty", () => {
    const app = setup({ storedValue: null, readError: storageError("SecurityError") });
    app.input("#intentionInput", "存储为空时的草稿");
    app.storage.readError = null;
    assert.equal(app.retry(), true);
    assert.equal(JSON.parse(app.storage.value).state.question, "存储为空时的草稿");
    assert.equal(app.get("#saveWarning").hidden, true);
    assert.equal(app.leave().defaultPrevented, false);
});

for (const errorName of ["QuotaExceededError", "SecurityError"]) {
    test(`${errorName} keeps the latest editing in memory and can retry after storage recovers`, async () => {
        const app = setup({ writeError: storageError(errorName) });
        app.input("#intentionInput", "保存失败时的最新问题");
        app.input("#purposeInput", "保存失败时的最新所求");
        assert.equal(app.storage.value, initialFixture);
        app.run("render()");
        assert.equal(app.get("#saveWarning").hidden, false);
        assert.equal(app.get("#retryJournal").textContent, "重试保存");
        assert.equal(app.leave().defaultPrevented, true);
        const backup = await app.exportCurrent();
        assert.equal(backup.state.question, "保存失败时的最新问题");
        assert.equal(backup.state.purpose, "保存失败时的最新所求");
        assert.equal(backup.archive[0].question, "原有历史记录");
        app.storage.writeError = null;
        assert.equal(app.retry(), true);
        assert.equal(JSON.parse(app.storage.value).state.question, "保存失败时的最新问题");
        assert.equal(app.leave().defaultPrevented, false);
    });
}

test("normal edits, undo and starting a new reading still retain their journal", () => {
    const app = setup();
    app.input("#intentionInput", "新的问题");
    app.run("takeFirstStalk(3)");
    assert.equal(JSON.parse(app.storage.value).state.firstStalk, 3);
    app.run("back()");
    assert.equal(JSON.parse(app.storage.value).state.firstStalk, null);
    assert.equal(JSON.parse(app.storage.value).state.question, "新的问题");
    app.run("newReading()");
    const saved = JSON.parse(app.storage.value);
    assert.equal(saved.state.question, "");
    assert.equal(saved.archive[0].question, "新的问题");
    assert.equal(saved.archive[1].question, "原有历史记录");
});


test("an empty browser shows readiness without claiming an unsaved journal is stored", () => {
    const app = setup({ storedValue: null });
    assert.equal(app.storage.attempts.length, 0);
    assert.match(app.get("#status").textContent, /尚未起筮/);
    assert.equal(app.leave().defaultPrevented, false);
    app.input("#intentionInput", "开始记下的问题");
    assert.match(app.get("#status").textContent, /已记/);
});

for (const mode of ["virtual-manual", "virtual-auto", "physical"]) {
    test(`${mode} saves and reloads every stage of all 18 rounds, completion, and archiving`, () => {
        const app = setup({ storedValue: null });
        app.input("#intentionInput", "完整起筮的问题");
        app.input("#purposeInput", "完整起筮的所求");
        if (mode === "physical") {
            app.run("setMode('physical'); stepTo(1)");
        } else {
            app.run(`setAutomatic(${mode === "virtual-auto"}); takeFirstStalk(8); beginReading()`);
        }
        for (let round = 0; round < 18; round++) {
            if (mode === "physical") {
                app.run("stepTo(2); stepTo(3); choose('left', 1)");
                app.run(`choose('right', ${round % 3 === 0 ? 3 : 2}); confirmRemainders(); record()`);
            } else {
                const split = 1 + round % 6;
                app.get("#splitRange").value = String(split);
                app.run(`previewSplit(${split}); updateSplitReady(true, '分堆已定'); settleSplit()`);
                if (mode === "virtual-manual") app.run("hangVirtual(); countVirtual('left', true); countVirtual('right', true); finishCount(); record()");
            }
            const saved = JSON.parse(app.storage.value);
            assert.equal(saved.state.records.length, round + 1);
            if (mode !== "virtual-auto" && (round + 1) % 3 === 0) app.run("nextLine()");
        }
        assert.equal(app.snapshot().state.step, 6);
        assert.equal(app.snapshot().state.question, "完整起筮的问题");
        for (const value of new Set(app.storage.attempts)) {
            const restored = setup({ storedValue: value });
            assert.equal(restored.get("#saveWarning").hidden, true, "A valid generated snapshot must not be blocked");
            assert.equal(restored.storage.attempts.length, 0, "Reloading a legitimate intermediate stage must not rewrite it");
            assert.deepEqual(restored.snapshot(), JSON.parse(value));
        }
        app.run("newReading()");
        assert.equal(app.snapshot().archive[0].records.length, 18);
        assert.equal(setup({ storedValue: app.storage.value }).snapshot().archive[0].question, "完整起筮的问题");
    });
}

test("older journals missing optional fields keep their readings and are normalized without a rewrite", () => {
    const old = fixtureState();
    for (const key of ["mode", "auto", "firstStalk", "questionLocked", "purpose", "notes"]) delete old[key];
    const storedValue = JSON.stringify({ state: old, archive: [old] });
    const app = setup({ storedValue });
    assert.equal(app.storage.value, storedValue);
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.get("#saveWarning").hidden, true);
    assert.equal(app.snapshot().state.question, "原有问题");
    assert.equal(app.snapshot().state.mode, "virtual");
    assert.equal(app.snapshot().archive[0].notes, "");
});
