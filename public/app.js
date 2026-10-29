const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png"]);
const styleNames = {
  caricature: "캐리커처",
  animation: "애니메이션",
  poster: "영화 포스터",
};

const imageInput = document.querySelector("#imageInput");
const dropZone = document.querySelector("#dropZone");
const fileInfo = document.querySelector("#fileInfo");
const uploadTitle = document.querySelector("#uploadTitleText");
const generateButton = document.querySelector("#generateButton");
const formMessage = document.querySelector("#formMessage");
const requestInput = document.querySelector("#additionalRequest");
const charCount = document.querySelector("#charCount");
const beforeImage = document.querySelector("#beforeImage");
const afterImage = document.querySelector("#afterImage");
const beforeLayer = document.querySelector("#beforeLayer");
const beforeLayerImage = beforeLayer.querySelector("img");
const comparisonImage = document.querySelector(".comparison-image");
const compareRange = document.querySelector("#compareRange");
const compareDivider = document.querySelector("#compareDivider");
const emptyResult = document.querySelector("#emptyResult");
const resultTag = document.querySelector("#resultTag");
const resultStyle = document.querySelector("#resultStyle");
const resultStatus = document.querySelector("#resultStatus");
const resultNotice = document.querySelector("#mockNotice");
const downloadButton = document.querySelector("#downloadButton");

let selectedFile = null;
let selectedStyle = "caricature";
let previewUrl = null;
let resultUrl = null;
let hasResult = false;

function syncComparisonImageWidth() {
  beforeLayerImage.style.width = `${comparisonImage.clientWidth}px`;
}

syncComparisonImageWidth();
window.addEventListener("resize", syncComparisonImageWidth);

function showMessage(message) {
  formMessage.textContent = message;
}

function validateFile(file) {
  if (!file) return "사진 파일을 선택해 주세요.";
  if (!allowedTypes.has(file.type)) return "JPG 또는 PNG 이미지 파일만 업로드할 수 있습니다.";
  if (file.size > MAX_FILE_SIZE) return "파일 크기는 10MB 이하여야 합니다.";
  return "";
}

function setFile(file) {
  const error = validateFile(file);
  if (error) {
    showMessage(error);
    return;
  }

  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (resultUrl && resultUrl !== previewUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  selectedFile = file;
  previewUrl = URL.createObjectURL(file);
  fileInfo.textContent = `${file.name} · ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
  fileInfo.classList.remove("hidden");
  uploadTitle.textContent = "사진이 준비됐어요";
  beforeImage.src = previewUrl;
  beforeLayerImage.src = previewUrl;
  hasResult = false;
  emptyResult.classList.remove("hidden");
  resultTag.textContent = "생성 전";
  resultStatus.textContent = "대기 중";
  resultStatus.classList.remove("mock-status");
  downloadButton.disabled = true;
  showMessage("");
}

imageInput.addEventListener("change", () => {
  if (imageInput.files?.[0]) setFile(imageInput.files[0]);
});

for (const eventName of ["dragenter", "dragover"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}
dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) setFile(file);
});

document.querySelectorAll(".style-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".style-option").forEach((option) => {
      const selected = option === button;
      option.classList.toggle("selected", selected);
      option.setAttribute("aria-pressed", String(selected));
    });
    selectedStyle = button.dataset.style;
    resultStyle.textContent = styleNames[selectedStyle];
  });
});

requestInput.addEventListener("input", () => {
  charCount.textContent = requestInput.value.length;
});

compareRange.addEventListener("input", () => {
  const split = `${compareRange.value}%`;
  beforeLayer.style.width = split;
  compareDivider.style.left = split;
});

async function generateCaricature() {
  if (!selectedFile) {
    showMessage("먼저 변환할 사진을 업로드해 주세요.");
    imageInput.focus();
    return;
  }

  generateButton.disabled = true;
  generateButton.querySelector("span:nth-child(2)").textContent = "이미지 변환 중...";
  showMessage("AI가 이미지를 변환하고 있습니다. 잠시만 기다려 주세요.");
  resultNotice.textContent = "선택한 스타일로 이미지를 변환하고 있습니다.";
  resultStatus.textContent = "변환 중";
  resultStatus.classList.remove("mock-status");

  const body = new FormData();
  body.append("image", selectedFile);
  body.append("style", selectedStyle);
  body.append("additionalRequest", requestInput.value.trim());

  try {
    const response = await fetch("/api/caricature/generate", { method: "POST", body });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `요청에 실패했습니다. (${response.status})`);
    }

    if (!payload?.result?.data || !payload.result.mimeType) {
      throw new Error("변환 결과를 표시할 수 없습니다. 다시 시도해 주세요.");
    }
    if (resultUrl && resultUrl !== previewUrl) URL.revokeObjectURL(resultUrl);
    const imageBytes = Uint8Array.from(atob(payload.result.data), (character) => character.charCodeAt(0));
    resultUrl = URL.createObjectURL(new Blob([imageBytes], { type: payload.result.mimeType }));
    afterImage.src = resultUrl;
    emptyResult.classList.add("hidden");
    hasResult = true;
    resultTag.textContent = "변환 완료";
    resultStyle.textContent = styleNames[payload.request.style] || styleNames[selectedStyle];
    resultStatus.textContent = "생성 완료";
    resultStatus.classList.remove("mock-status");
    resultNotice.textContent = payload.message;
    downloadButton.disabled = false;
    showMessage(payload.message);
    document.querySelector("#resultTitle").scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "이미지를 변환하지 못했습니다.";
    showMessage(message);
    resultNotice.textContent = message;
    resultStatus.textContent = "변환 실패";
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector("span:nth-child(2)").textContent = "이미지 변환";
  }
}

generateButton.addEventListener("click", generateCaricature);

downloadButton.addEventListener("click", () => {
  if (!hasResult || !resultUrl) return;
  const link = document.createElement("a");
  link.href = resultUrl;
  link.download = `caricature-${selectedStyle}-${Date.now()}.png`;
  document.body.append(link);
  link.click();
  link.remove();
});

window.addEventListener("beforeunload", () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  if (resultUrl && resultUrl !== previewUrl) URL.revokeObjectURL(resultUrl);
});
