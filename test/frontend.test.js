const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function createHarness(responseOk = true) {
  const listeners = new Map();
  const nodes = new Map();
  const styleOptions = ["caricature", "animation", "poster"].map((style) => ({
    dataset: { style },
    attributes: {},
    classList: createClassList(),
    addEventListener(name, callback) { listeners.set(`style-${style}-${name}`, callback); },
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const downloads = [];
  const fetchCalls = [];
  let objectUrlIndex = 0;

  function node(selector) {
    if (!nodes.has(selector)) {
      const item = {
        value: selector === "#compareRange" ? "50" : "",
        files: [],
        disabled: selector === "#downloadButton",
        style: {},
        classList: createClassList(),
        addEventListener(name, callback) { listeners.set(`${selector}-${name}`, callback); },
        querySelector() { return { textContent: "", style: {} }; },
        focus() {},
        scrollIntoView() {},
      };
      nodes.set(selector, item);
    }
    return nodes.get(selector);
  }

  const document = {
    querySelector: node,
    querySelectorAll() { return styleOptions; },
    createElement() {
      return {
        click() { downloads.push({ href: this.href, download: this.download }); },
        remove() {},
      };
    },
    body: { append() {} },
  };
  const fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (!responseOk) {
      return { ok: false, status: 502, json: async () => ({ error: "모의 변환 오류" }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        mode: "openai",
        message: "변환 완료",
        request: { style: "animation" },
        result: { mimeType: "image/png", data: Buffer.from("test-image").toString("base64") },
      }),
    };
  };
  const URL = {
    createObjectURL() { objectUrlIndex += 1; return `blob:test-${objectUrlIndex}`; },
    revokeObjectURL() {},
  };
  const window = { addEventListener() {} };
  const context = {
    document,
    window,
    URL,
    Blob,
    FormData,
    Uint8Array,
    atob,
    fetch,
    Date,
    console,
  };
  const source = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  vm.runInNewContext(source, context);
  return { listeners, nodes, styleOptions, fetchCalls, downloads };
}

function createClassList() {
  const classes = new Set();
  return {
    add(value) { classes.add(value); },
    remove(value) { classes.delete(value); },
    toggle(value, force) {
      if (force === undefined ? !classes.has(value) : force) classes.add(value);
      else classes.delete(value);
    },
    contains(value) { return classes.has(value); },
  };
}

test("frontend uploads a photo, selects style, displays API result, and downloads PNG", async () => {
  const harness = createHarness();
  const imageInput = harness.nodes.get("#imageInput");
  const imageFile = new File([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], "portrait.png", { type: "image/png" });
  imageInput.files = [imageFile];
  harness.listeners.get("#imageInput-change")();

  assert.match(harness.nodes.get("#fileInfo").textContent, /portrait\.png/);
  assert.equal(harness.nodes.get("#beforeImage").src, "blob:test-1");

  harness.listeners.get("style-animation-click")();
  assert.equal(harness.nodes.get("#resultStyle").textContent, "애니메이션");
  harness.nodes.get("#additionalRequest").value = "파스텔 색감";
  await harness.listeners.get("#generateButton-click")();

  assert.equal(harness.fetchCalls[0].url, "/api/caricature/generate");
  assert.equal(harness.fetchCalls[0].options.body.get("image").name, "portrait.png");
  assert.equal(harness.fetchCalls[0].options.body.get("style"), "animation");
  assert.equal(harness.fetchCalls[0].options.body.get("additionalRequest"), "파스텔 색감");
  assert.equal(harness.nodes.get("#afterImage").src, "blob:test-2");
  assert.equal(harness.nodes.get("#resultStatus").textContent, "생성 완료");
  assert.equal(harness.nodes.get("#downloadButton").disabled, false);

  harness.listeners.get("#downloadButton-click")();
  assert.equal(harness.downloads.length, 1);
  assert.equal(harness.downloads[0].href, "blob:test-2");
  assert.match(harness.downloads[0].download, /^caricature-animation-.*\.png$/);
});

test("frontend shows API errors and clears loading state", async () => {
  const harness = createHarness(false);
  const imageInput = harness.nodes.get("#imageInput");
  imageInput.files = [new File([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], "portrait.png", { type: "image/png" })];
  harness.listeners.get("#imageInput-change")();
  await harness.listeners.get("#generateButton-click")();

  assert.equal(harness.nodes.get("#formMessage").textContent, "모의 변환 오류");
  assert.equal(harness.nodes.get("#resultStatus").textContent, "변환 실패");
  assert.equal(harness.nodes.get("#generateButton").disabled, false);
  assert.equal(harness.nodes.get("#downloadButton").disabled, true);
});
