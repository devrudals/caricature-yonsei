const path = require("node:path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
const express = require("express");
const multer = require("multer");

const app = express();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const stylePrompts = {
  caricature: "Create a polished caricature portrait. Exaggerate distinctive facial features gently and playfully while keeping the person recognizable, with clean illustration lines and an expressive finish.",
  animation: "Transform the photo into a high-quality animated illustration with appealing character design, expressive eyes, rich colors, and cinematic lighting. Preserve the person's recognizable identity.",
  poster: "Transform the photo into a dramatic original movie poster portrait with cinematic lighting, a compelling color grade, and refined poster composition. Preserve the person's recognizable identity and do not add text or logos.",
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 2, fieldSize: 2000, parts: 4 },
  fileFilter(_req, file, callback) {
    if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png") {
      callback(new Error("JPG 또는 PNG 이미지 파일만 업로드할 수 있습니다."));
      return;
    }
    callback(null, true);
  },
});

const publicDirectory = path.join(__dirname, "public");
app.disable("x-powered-by");
app.use(express.static(publicDirectory, { index: "index.html" }));

app.get("/api/health", (_req, res) => {
  res.json({ success: true, status: "ok", mode: "openai" });
});

app.post(["/api/caricature/generate", "/api/style/generate"], (req, res) => {
  upload.single("image")(req, res, async (error) => {
    if (error) {
      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ success: false, error: "파일 크기는 10MB 이하여야 합니다." });
        return;
      }
      if (error instanceof multer.MulterError) {
        const message = error.code === "LIMIT_FIELD_VALUE"
          ? "추가 요청사항은 500자 이내로 입력해 주세요."
          : "업로드 요청 형식이 올바르지 않습니다.";
        res.status(400).json({ success: false, error: message });
        return;
      }
      res.status(400).json({ success: false, error: error.message });
      return;
    }

    const { file } = req;
    const fields = req.body || {};
    if (Object.keys(fields).some((name) => !["style", "additionalRequest"].includes(name))) {
      res.status(400).json({ success: false, error: "지원하지 않는 요청 필드가 포함되어 있습니다." });
      return;
    }
    const { style, additionalRequest = "" } = fields;
    if (!file) {
      res.status(400).json({ success: false, error: "이미지 파일을 첨부해 주세요." });
      return;
    }
    if (typeof style !== "string" || !Object.hasOwn(stylePrompts, style)) {
      res.status(400).json({ success: false, error: "스타일은 caricature, animation, poster 중 하나여야 합니다." });
      return;
    }
    if (typeof additionalRequest !== "string" || additionalRequest.length > 500) {
      res.status(400).json({ success: false, error: "추가 요청사항은 500자 이내로 입력해 주세요." });
      return;
    }
    if (!isAllowedImage(file)) {
      res.status(400).json({ success: false, error: "파일 확장자, 형식 또는 이미지 데이터가 올바르지 않습니다." });
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(503).json({ success: false, error: "서버에 OpenAI API 키가 설정되지 않았습니다. 환경변수를 확인해 주세요." });
      return;
    }

    const prompt = [
      stylePrompts[style],
      "Use the uploaded photo as the visual reference. Keep the same person, recognizable facial identity, age, and defining features. Return only the edited image.",
      additionalRequest.trim() ? `Additional user request: ${additionalRequest.trim()}` : "",
    ].filter(Boolean).join("\n\n");
    const openAIForm = new FormData();
    openAIForm.append("model", "gpt-image-2.5-sunburst");
    openAIForm.append("prompt", prompt);
    openAIForm.append("output_format", "png");
    openAIForm.append("image", new Blob([file.buffer], { type: file.mimetype }), file.originalname);

    try {
      const openAIResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: openAIForm,
        signal: AbortSignal.timeout(120_000),
      });
      const result = await openAIResponse.json().catch(() => null);
      if (!openAIResponse.ok) {
        console.error("OpenAI image edit failed:", openAIResponse.status, openAIResponse.headers.get("x-request-id") || "no request id");
        const message = openAIResponse.status === 429
          ? "이미지 변환 요청이 많습니다. 잠시 후 다시 시도해 주세요."
          : "OpenAI 이미지 변환에 실패했습니다. API 키, 사용량 한도 또는 요청 설정을 확인해 주세요.";
        res.status(openAIResponse.status === 429 ? 429 : 502).json({ success: false, error: message });
        return;
      }

      const imageData = result?.data?.[0]?.b64_json;
      if (typeof imageData !== "string" || !imageData) {
        console.error("OpenAI image edit returned no image data");
        res.status(502).json({ success: false, error: "이미지 변환 결과를 받지 못했습니다. 다시 시도해 주세요." });
        return;
      }

      res.json({
        success: true,
        mode: "openai",
        message: "이미지 변환이 완료되었습니다.",
        request: {
          style,
          additionalRequest: additionalRequest.trim(),
          image: { name: file.originalname, mimeType: file.mimetype, size: file.size },
        },
        result: { mimeType: "image/png", data: imageData },
      });
    } catch (requestError) {
      if (requestError?.name === "TimeoutError" || requestError?.name === "AbortError") {
        res.status(504).json({ success: false, error: "이미지 변환 시간이 초과되었습니다. 다시 시도해 주세요." });
        return;
      }
      console.error("OpenAI image edit request failed:", requestError?.message || "unknown error");
      res.status(502).json({ success: false, error: "OpenAI 이미지 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ success: false, error: "요청한 API를 찾을 수 없습니다." });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled request error:", error);
  res.status(500).json({ success: false, error: "서버에서 요청을 처리하지 못했습니다." });
});

function isAllowedImage(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const isJpeg = file.mimetype === "image/jpeg"
    && [".jpg", ".jpeg"].includes(extension)
    && file.buffer[0] === 0xff
    && file.buffer[1] === 0xd8
    && file.buffer[2] === 0xff;
  const isPng = file.mimetype === "image/png"
    && extension === ".png"
    && file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return isJpeg || isPng;
}

module.exports = app;
