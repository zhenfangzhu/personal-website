const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const html = readFileSync(join(__dirname, "../founder-dna/index.html"), "utf8");
const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(script => script.includes("const STORAGE_KEY='founder-dna-v2'"));
assert.ok(source, "The application inline script must be present");
const storageKey = "founder-dna-v2";
const translationContext = { window: {} };
vm.runInNewContext(readFileSync(join(__dirname, "../static/js/founder-i18n.js"), "utf8"), translationContext);
const translations = translationContext.window.SITE_TEXT_TRANSLATIONS;
const stressValues = ["立即行动并试错", "先分析信息", "主动寻找用户反馈", "组织其他人协作", "亲自把问题解决", "等待方向更清晰"];
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

let initialFixture;

function setup(options = {}) {
    const initial = initialFixture;
    const storage = {
        value: Object.hasOwn(options, "storedValue") ? options.storedValue : initial,
        attempts: [], readError: options.readError || null, writeError: null,
        getItem(key) { assert.equal(key, storageKey); if (this.readError) throw this.readError; return this.value; },
        setItem(key, value) {
            assert.equal(key, storageKey);
            this.attempts.push(value);
            if (this.writeError) throw this.writeError;
            this.value = value;
        }
    };
    const document = new MemoryElement("document");
    document.ownerDocument = document;
    document.blobs = new Map();
    document.downloads = [];
    document.documentElement = new MemoryElement("html", document);
    document.documentElement.dataset.language = options.language || "zh";
    document.appendChild(document.documentElement);
    document.body = new MemoryElement("body", document);
    document.documentElement.appendChild(document.body);
    document.body.innerHTML = '<div id="app"></div><div id="toast"></div><input id="file-import" type="file">';
    document.getElementById = id => document.querySelector(`#${id}`);
    document.createElement = tag => new MemoryElement(tag, document);
    const timers = new Map();
    let nextTimer = 0;
    const window = new MemoryElement("window", document);
    window.scrollTo = () => {};
    window.print = () => {};
    const originalOptionText = new WeakMap();
    window.siteLanguage = {
        translate(root) {
            if (!options.translateOptions) return;
            root.querySelectorAll("option").forEach(option => {
                if (!originalOptionText.has(option)) originalOptionText.set(option, option.textContent);
                const original = originalOptionText.get(option);
                option.textContent = document.documentElement.dataset.language === "en" ? translations[original] || original : original;
            });
        },
        current: () => document.documentElement.dataset.language
    };
    const setTimeout = (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; };
    const clearTimeout = id => timers.delete(id);
    window.setTimeout = setTimeout;
    window.clearTimeout = clearTimeout;
    const confirmations = [];
    const context = vm.createContext({
        window, document, localStorage: storage, Blob, setTimeout, clearTimeout,
        URL: { createObjectURL(blob) { const url = `blob:memory-${document.blobs.size}`; document.blobs.set(url, blob); return url; }, revokeObjectURL(url) { document.blobs.delete(url); } },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        confirm(message) { confirmations.push(message); return options.confirmResult ?? false; },
        FileReader: class { readAsText(file) { this.result = file.contents; this.onload(); } },
        fetch() { throw new Error("Network access is forbidden in these tests"); }
    });
    vm.runInContext(source, context);
    const get = selector => {
        const element = document.querySelector(selector);
        assert.ok(element, `Missing UI element: ${selector}`);
        return element;
    };
    return {
        document, window, storage, initial, timers, confirmations, get,
        click(selector) { get(selector).click(); },
        input(selector, value) { const element = get(selector); element.value = value; element.emit("input"); },
        change(selector, value) { const element = get(selector); element.value = value; element.emit("change"); },
        import(contents) { const element = get("#file-import"); element.files = [{ contents }]; element.emit("change"); },
        state() { return get("#save-state").dataset.state; },
        language(value) { document.documentElement.dataset.language = value; window.siteLanguage.translate(document); },
        leave() { return window.emit("beforeunload", { defaultPrevented: false }); },
        tick() { const scheduled = [...timers.values()]; timers.clear(); scheduled.forEach(timer => timer.fn()); },
        async export() {
            this.click('[data-nav="settings"]');
            this.click('[data-action="export-json"]');
            const exported = document.downloads.at(-1);
            assert.ok(exported?.name.endsWith(".json"), "Export must create a JSON download");
            return JSON.parse(await exported.blob.text());
        }
    };
}

function storageError(name) { const error = new Error(name); error.name = name; return error; }

test.before(async () => {
    const app = setup({ storedValue: null });
    app.click('[data-founder-id="C"] [data-welcome-remove]');
    app.input("#welcome-project", "Formal original");
    app.input("#welcome-founder-a", "Alice");
    app.input("#welcome-founder-b", "Bob");
    app.click('[data-welcome="formal"]');
    initialFixture = JSON.stringify(await app.export());
});

for (const errorName of ["QuotaExceededError", "SecurityError"]) {
    test(`${errorName} preserves edits in memory and keeps the failure visible after navigation`, async () => {
        const app = setup();
        app.storage.writeError = storageError(errorName);
        app.click('[data-nav="tasks"]');
        app.click('[data-eval="A-A"]');
        assert.doesNotThrow(() => app.change('[data-answer="explore-1"][value="5"]', "5"));
        assert.equal(app.state(), "error");
        app.click('[data-nav="dashboard"]');
        assert.equal(app.state(), "error");
        assert.equal(app.get("#save-warning").hidden, false);
        assert.equal(app.leave().defaultPrevented, true);
        const exported = await app.export();
        assert.equal(exported.formal.evaluations.find(evaluation => evaluation.id === "A-A").answers["explore-1"], 5);
        assert.equal(app.storage.value, app.initial);
    });
}

test("manual retry saves the latest in-memory root after storage recovers", async () => {
    const app = setup();
    app.storage.writeError = storageError("QuotaExceededError");
    app.click('[data-nav="settings"]');
    app.input('[data-project="type"]', "First unsaved title");
    app.change('[data-project="type"]', "First unsaved title");
    app.input('[data-project="type"]', "Latest unsaved title");
    app.change('[data-project="type"]', "Latest unsaved title");
    app.tick();
    assert.equal(app.state(), "error");
    app.storage.writeError = null;
    app.click('[data-action="retry-save"]');
    assert.equal(JSON.parse(app.storage.value).formal.project.type, "Latest unsaved title");
    assert.equal(app.state(), "saved");
    assert.equal(app.leave().defaultPrevented, false);
});

test("JSON export works while every storage write fails and contains the latest input", async () => {
    const app = setup();
    app.storage.writeError = storageError("SecurityError");
    app.click('[data-nav="calibration"]');
    app.input('[data-cal="consensus"]', "Final words typed just before export");
    const exported = await app.export();
    assert.equal(exported.formal.calibration.consensus, "Final words typed just before export");
    assert.equal(app.storage.value, app.initial);
    assert.equal(app.leave().defaultPrevented, true);
});

test("an event's final keystrokes survive immediate navigation and export without advancing timers", async () => {
    const app = setup();
    app.click('[data-nav="tasks"]');
    app.click('[data-eval="A-A"]');
    app.click('[data-step="9"]');
    app.input('[data-event-field="context"]', "Situation typed immediately before leaving");
    app.input('[data-event-field="action"]', "Latest action");
    app.input('[data-event-field="result"]', "Latest result");
    const exported = await app.export();
    const event = exported.formal.evaluations.find(evaluation => evaluation.id === "A-A").events[0];
    assert.equal(event.context, "Situation typed immediately before leaving");
    assert.equal(event.action, "Latest action");
    assert.equal(event.result, "Latest result");
});

test("calibration consensus and experiment text survive immediate navigation without advancing timers", async () => {
    const app = setup();
    app.click('[data-nav="calibration"]');
    app.input('[data-cal="consensus"]', "Latest consensus");
    app.input('[data-cal-founder="A"] [data-cal-experiment]', "Latest 30-day experiment");
    const exported = await app.export();
    assert.equal(exported.formal.calibration.consensus, "Latest consensus");
    assert.equal(exported.formal.calibration.founders.A.experiment, "Latest 30-day experiment");
});

test("leaving flushes pending input and prompts only if that save fails", () => {
    const app = setup();
    app.click('[data-nav="calibration"]');
    app.input('[data-cal="consensus"]', "Saved during leave");
    assert.equal(app.state(), "unsaved");
    assert.equal(app.leave().defaultPrevented, false);
    assert.equal(JSON.parse(app.storage.value).formal.calibration.consensus, "Saved during leave");
    app.storage.writeError = storageError("QuotaExceededError");
    app.input('[data-cal="consensus"]', "Kept after canceled leave");
    assert.equal(app.leave().defaultPrevented, true);
    assert.equal(app.get('[data-cal="consensus"]').value, "Kept after canceled leave");
    assert.equal(app.state(), "error");
});

test("normal saves keep formal and Demo data separate across mode switches", async () => {
    const app = setup();
    app.click('[data-nav="settings"]');
    app.input('[data-project="type"]', "Formal updated");
    app.change('[data-project="type"]', "Formal updated");
    app.tick();
    app.click('[data-action="switch-mode"]');
    app.click('[data-nav="settings"]');
    app.input('[data-project="type"]', "Demo updated");
    app.change('[data-project="type"]', "Demo updated");
    app.tick();
    app.click('[data-action="switch-mode"]');
    const stored = JSON.parse(app.storage.value);
    assert.equal(stored.activeMode, "formal");
    assert.equal(stored.formal.project.type, "Formal updated");
    assert.equal(stored.demo.project.type, "Demo updated");
    assert.equal(app.state(), "saved");
    assert.equal(app.leave().defaultPrevented, false);
});

test("a failed initial read cannot silently overwrite unknown existing storage", async () => {
    const app = setup({ readError: storageError("SecurityError") });
    assert.equal(app.state(), "read-error");
    assert.equal(app.document.querySelector("#welcome"), null);
    app.click('[data-nav="settings"]');
    app.input('[data-project="type"]', "Temporary in-memory team");
    assert.equal(app.storage.value, app.initial);
    const exported = await app.export();
    assert.equal(exported.formal.project.type, "Temporary in-memory team");
    assert.equal(app.storage.attempts.length, 0);
    app.storage.readError = null;
    app.click('[data-action="retry-save"]');
    assert.equal(app.storage.value, app.initial, "Existing data must remain until the user explicitly chooses replacement");
    assert.equal(app.leave().defaultPrevented, true);
});

test("retry can save a temporary draft when a recovered read confirms storage is empty", async () => {
    const app = setup({ readError: storageError("SecurityError"), storedValue: null });
    app.click('[data-nav="settings"]');
    app.click('[data-action="switch-mode"]');
    assert.equal(app.state(), "read-error");
    assert.equal(app.storage.attempts.length, 0);
    app.storage.readError = null;
    app.click('[data-action="retry-save"]');
    assert.equal(JSON.parse(app.storage.value).activeMode, "demo");
    assert.equal(app.state(), "saved");
    assert.equal(app.leave().defaultPrevented, false);
});

test("malformed stored data is treated as an unreadable backup and is not replaced", async () => {
    const malformed = '{"version":2,"formal":';
    const app = setup({ storedValue: malformed });
    assert.equal(app.state(), "read-error");
    app.click('[data-action="export-stored"]');
    assert.equal(await app.document.downloads.at(-1).blob.text(), malformed);
    app.click('[data-nav="settings"]');
    app.click('[data-action="switch-mode"]');
    const exported = await app.export();
    assert.equal(exported.activeMode, "demo");
    app.click('[data-action="retry-save"]');
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.storage.value, malformed);
    assert.equal(app.state(), "read-error");
});

for (const invalidName of ["Alice", ""]) {
    test(`an invalid name ${invalidName ? "matching another founder" : "left blank"} restores the committed name after partial input was saved`, async () => {
        const app = setup();
        app.click('[data-nav="settings"]');
        const partials = invalidName ? ["A", "Al", "Ali", "Alic"] : ["B", "Bo", "Bobby"];
        for (const partial of partials) {
            app.input('[data-founder-name="B"]', partial);
            app.tick();
            assert.equal(JSON.parse(app.storage.value).formal.founders.find(founder => founder.id === "B").name, partial);
        }
        app.input('[data-founder-name="B"]', invalidName);
        app.change('[data-founder-name="B"]', invalidName);
        assert.equal(app.get('[data-founder-name="B"]').value, "Bob");
        assert.equal(JSON.parse(app.storage.value).formal.founders.find(founder => founder.id === "B").name, "Bob");
        assert.equal((await app.export()).formal.founders.find(founder => founder.id === "B").name, "Bob");
        assert.equal(app.state(), "saved");
    });
}

test("retrying a failed read without edits reloads the original data without writing", async () => {
    const app = setup({ readError: storageError("SecurityError") });
    assert.equal(app.document.querySelector("#welcome"), null);
    assert.equal(app.get("#save-warning").hidden, false);
    app.storage.readError = null;
    app.click('[data-action="retry-save"]');
    assert.equal(app.state(), "saved");
    assert.equal(app.get("#save-warning").hidden, true);
    assert.deepEqual(await app.export(), JSON.parse(app.initial));
    assert.equal(app.storage.attempts.length, 0);
    assert.equal(app.storage.value, app.initial);
    assert.equal(app.leave().defaultPrevented, false);
});

test("invalid imported backup structures cannot replace the current memory or stored data", async () => {
    const app = setup({ confirmResult: true });
    const invalidCandidates = [JSON.parse(app.initial), JSON.parse(app.initial)];
    invalidCandidates[0].formal.calibration = null;
    invalidCandidates[1].formal.evaluations[0].answers["explore-1"] = 6;
    for (const candidate of invalidCandidates) {
        app.import(JSON.stringify(candidate));
        assert.match(app.get("#toast").textContent, /导入失败/);
        assert.equal(app.storage.value, app.initial);
        assert.equal(app.storage.attempts.length, 0);
        assert.deepEqual(await app.export(), JSON.parse(app.initial));
    }
    assert.equal(app.confirmations.length, 0, "Invalid data must be rejected before any replacement confirmation");
});


test("select options keep explicit values when their visible labels are translated", () => {
    const select = new MemoryElement("select");
    select.innerHTML = '<option value="">请选择</option><option value="stable" selected>中文</option><option>Implicit value</option>';
    const [, explicit, implicit] = select.querySelectorAll("option");
    assert.equal(select.value, "stable");
    explicit.textContent = "English";
    implicit.textContent = "Translated implicit value";
    assert.equal(explicit.value, "stable");
    assert.equal(implicit.value, "Translated implicit value");
    assert.equal(select.value, "stable");
});

for (const canonical of stressValues) {
    test(`English stress response ${translations[canonical]} survives navigation, language changes, and export`, async () => {
        const app = setup({ language: "en", translateOptions: true });
        app.click('[data-nav="tasks"]');
        app.click('[data-eval="A-A"]');
        app.click('[data-step="8"]');
        const option = app.get("#stress").querySelectorAll("option").find(option => option.textContent === translations[canonical]);
        assert.ok(option, "The selected stress response must have its English label");
        app.change("#stress", option.value);
        app.click('[data-step="9"]');
        app.click('[data-step="8"]');
        assert.equal(app.get("#stress").value, canonical);
        app.language("zh");
        assert.equal(app.get("#stress").value, canonical);
        app.language("en");
        assert.equal(app.get("#stress").value, canonical);
        const exported = await app.export();
        assert.equal(exported.formal.evaluations.find(evaluation => evaluation.id === "A-A").stress, canonical);
    });

    test(`previously saved English stress response ${translations[canonical]} restores without an initial storage write`, async () => {
        const stored = JSON.parse(initialFixture);
        for (const team of [stored.formal, stored.demo]) team.evaluations[0].stress = translations[canonical];
        const raw = JSON.stringify(stored);
        const app = setup({ storedValue: raw, language: "en", translateOptions: true });
        app.click('[data-nav="tasks"]');
        app.click('[data-eval="A-A"]');
        app.click('[data-step="8"]');
        assert.equal(app.get("#stress").value, canonical);
        const exported = await app.export();
        for (const team of [exported.formal, exported.demo]) assert.equal(team.evaluations[0].stress, canonical);
        assert.equal(app.storage.value, raw);
        assert.equal(app.storage.attempts.length, 0);
    });
}

test("JSON import and a recovered storage read normalize old English stress answers in both data spaces", async () => {
    const stored = JSON.parse(initialFixture);
    for (const team of [stored.formal, stored.demo]) team.evaluations.forEach((evaluation, index) => { evaluation.stress = translations[stressValues[index % stressValues.length]]; });
    const raw = JSON.stringify(stored);
    const imported = setup({ confirmResult: true });
    imported.import(raw);
    const recovered = setup({ readError: storageError("SecurityError"), storedValue: raw });
    recovered.storage.readError = null;
    recovered.click('[data-action="retry-save"]');
    for (const app of [imported, recovered]) {
        const exported = await app.export();
        for (const team of [exported.formal, exported.demo]) team.evaluations.forEach((evaluation, index) => { assert.equal(evaluation.stress, stressValues[index % stressValues.length]); });
    }
    assert.equal(recovered.storage.value, raw);
    assert.equal(recovered.storage.attempts.length, 0);
});

function assertNoImportedMarkup(app) {
    const injected = app.get("#app").querySelectorAll("img, script, iframe, [onerror], [onload], [onfocus], [data-audit-injected]");
    assert.equal(injected.length, 0, "Imported strings must not create executable elements or attributes");
}

test("untrusted JSON names, event IDs, narratives, and calibration data stay literal through every app page", async () => {
    const candidate = JSON.parse(initialFixture);
    candidate.formal = structuredClone(candidate.demo);
    candidate.activeMode = "formal";
    const payload = '<img src="x" onerror="window.auditInjected=true" data-audit-injected="yes"> & "quoted"';
    candidate.formal.founders.forEach(founder => { founder.name = `${founder.id} ${payload}`; });
    for (const key of Object.keys(candidate.formal.project)) candidate.formal.project[key] = `${key}: </textarea>${payload}`;
    for (const evaluation of candidate.formal.evaluations) evaluation.events.forEach(event => {
        event.id += `" data-audit-injected="attribute">${payload}`;
        event.context = `Context: </textarea>${payload}`;
        event.action = `Action: </textarea>${payload}`;
        event.result = `Result: </textarea>${payload}`;
    });
    candidate.formal.calibration.date = `" autofocus onfocus="window.auditInjected=true">${payload}`;
    candidate.formal.calibration.consensus = `Consensus: </textarea>${payload}`;
    candidate.formal.calibration.founders = Object.fromEntries(candidate.formal.founders.map(founder => [founder.id, { confirmedTop: [], verify: "", experiment: `Experiment ${founder.id}: </textarea>${payload}` }]));
    const app = setup({ confirmResult: true });
    app.import(JSON.stringify(candidate));
    assert.equal(app.state(), "saved", "The backup's text fields are valid data and should not be rejected");
    assertNoImportedMarkup(app);
    assert.ok(app.get("#app").textContent.includes(candidate.formal.founders[0].name));
    app.click('[data-nav="tasks"]');
    assertNoImportedMarkup(app);
    assert.ok(app.get('[data-eval="A-A"]').textContent.includes(candidate.formal.founders[0].name));
    app.click('[data-eval="A-A"]');
    assertNoImportedMarkup(app);
    assert.ok(app.get(".page-title").textContent.includes(candidate.formal.founders[0].name));
    app.click('[data-step="9"]');
    assertNoImportedMarkup(app);
    const event = candidate.formal.evaluations.find(evaluation => evaluation.id === "A-A").events[0];
    assert.equal(app.get("[data-event-id]").dataset.eventId, event.id);
    assert.equal(app.get("[data-remove-event]").dataset.removeEvent, event.id);
    assert.equal(app.get('[data-event-field="context"]').value, event.context);
    for (const page of ["profile", "team", "calibration", "report", "settings"]) {
        app.click(`[data-nav="${page}"]`);
        assertNoImportedMarkup(app);
        assert.ok(app.get("#app").textContent.includes(candidate.formal.founders[0].name) || app.get('[data-founder-name="A"]').value === candidate.formal.founders[0].name);
        if (page === "report") assert.ok(app.get("#app").textContent.includes(candidate.formal.calibration.founders.A.experiment));
    }
    const exported = await app.export();
    assert.deepEqual(exported, candidate, "Escaping must not change the imported data or its backup");
});

test("locally typed names and experiment text render literally and keep their original saved values", async () => {
    const payload = '<img src=x onerror="window.auditInjected=true">';
    const app = setup();
    app.click('[data-nav="settings"]');
    app.input('[data-founder-name="A"]', payload);
    app.change('[data-founder-name="A"]', payload);
    app.click('[data-nav="tasks"]');
    assertNoImportedMarkup(app);
    assert.ok(app.get('[data-eval="A-A"]').textContent.includes(payload));
    app.click('[data-nav="calibration"]');
    app.input('[data-cal-founder="A"] [data-cal-experiment]', payload);
    app.click('[data-nav="report"]');
    assertNoImportedMarkup(app);
    assert.ok(app.get("#app").textContent.includes(payload));
    const exported = await app.export();
    assert.equal(exported.formal.founders[0].name, payload);
    assert.equal(exported.formal.calibration.founders.A.experiment, payload);
});
