const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const app = require("../app");
const deployedCaricatureRoute = require("../api/caricature/generate");

let server;
let baseUrl;
let originalFetch;
let openAIForm;
let openAIStatus = 200;
const previousApiKey = process.env.OPENAI_API_KEY;
const testImage = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64");

before(async () => {
  process.env.OPENAI_API_KEY = "test-key";
  originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url === "https://api.openai.com/v1/images/edits") {
      openAIForm = options.body;
      return new Response(JSON.stringify(openAIStatus === 200
        ? { data: [{ b64_json: testImage }] }
        : { error: { message: "test error" } }), {
        status: openAIStatus,
        headers: { "content-type": "application/json", "x-request-id": "test-request" },
      });
    }
    return originalFetch(url, options);
  };
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  global.fetch = originalFetch;
  if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousApiKey;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function pngForm({ style = "caricature", additionalRequest = "베이지 계열" } = {}) {
  const form = new FormData();
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append("image", new Blob([signature], { type: "image/png" }), "look.png");
  form.append("style", style);
  form.append("additionalRequest", additionalRequest);
  return form;
}

test("Vercel caricature route exports the Express app", () => {
  assert.equal(deployedCaricatureRoute, app);
});

test("health endpoint reports OpenAI mode", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true, status: "ok", mode: "openai" });
});

test("valid request calls image edit model and returns generated image", async () => {
  const response = await fetch(`${baseUrl}/api/caricature/generate`, {
    method: "POST",
    body: pngForm({ style: "animation", additionalRequest: "따뜻한 파스텔 톤" }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(payload.mode, "openai");
  assert.equal(payload.request.style, "animation");
  assert.equal(payload.request.additionalRequest, "따뜻한 파스텔 톤");
  assert.equal(payload.request.image.mimeType, "image/png");
  assert.equal(payload.result.mimeType, "image/png");
  assert.equal(payload.result.data, testImage);
  assert.equal(openAIForm.get("model"), "gpt-image-2.5-sunburst");
  assert.equal(openAIForm.get("output_format"), "png");
  assert.match(openAIForm.get("prompt"), /animated illustration/);
  assert.match(openAIForm.get("prompt"), /따뜻한 파스텔 톤/);
  assert.equal(openAIForm.get("image").type, "image/png");
});

test("request without an image is rejected", async () => {
  const form = new FormData();
  form.append("style", "caricature");
  const response = await fetch(`${baseUrl}/api/caricature/generate`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /이미지 파일/);
});

test("unsupported style is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/caricature/generate`, {
    method: "POST",
    body: pngForm({ style: "fantasy" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /스타일은/);
});

test("unsupported file type is rejected", async () => {
  const form = new FormData();
  form.append("image", new Blob(["not an image"], { type: "text/plain" }), "notes.txt");
  form.append("style", "caricature");
  const response = await fetch(`${baseUrl}/api/caricature/generate`, { method: "POST", body: form });
  assert.equal(response.status, 400);
});

test("image with mismatched content signature is rejected", async () => {
  const form = new FormData();
  form.append("image", new Blob(["not a png"], { type: "image/png" }), "look.png");
  form.append("style", "caricature");
  const response = await fetch(`${baseUrl}/api/caricature/generate`, { method: "POST", body: form });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /이미지 데이터/);
});

test("additional request over 500 characters is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/caricature/generate`, {
    method: "POST",
    body: pngForm({ additionalRequest: "요청".repeat(251) }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /500자/);
});

test("image over 10MB is rejected", async () => {
  const form = new FormData();
  const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
  oversized.set([137, 80, 78, 71, 13, 10, 26, 10]);
  form.append("image", new Blob([oversized], { type: "image/png" }), "large.png");
  form.append("style", "caricature");
  const response = await fetch(`${baseUrl}/api/caricature/generate`, { method: "POST", body: form });
  assert.equal(response.status, 413);
});
