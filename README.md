# AI 캐리커처 생성기

Stitch 산출물을 바탕으로 만든 한국어 AI 캐리커처 생성 웹 앱입니다. Node.js/Express 백엔드가 JPG/PNG 사진과 선택한 캐리커처·애니메이션·영화 포스터 스타일을 OpenAI 이미지 편집 API에 전달합니다.

## 실행

Node.js 20 이상이 필요합니다. 서버는 먼저 앱 폴더의 `.env`, 이어서 상위 프로젝트 폴더의 `.env`를 읽습니다. 현재 저장된 `OPENAI_API_KEY`를 그대로 사용합니다. 키를 새로 설정해야 한다면 해당 `.env`에 넣으세요.

```bash
npm install
npm start
```

브라우저에서 <http://localhost:3000>을 열고 사진 업로드 → 스타일 선택 → 이미지 변환 순서로 사용합니다. 변환 중에는 버튼과 상태 표시가 바뀌며, 오류가 나면 화면에 안내가 나타납니다. 변환 결과는 비교 슬라이더에서 원본과 함께 확인하고 PNG로 다운로드할 수 있습니다.

## API

- `GET /api/health`: 서버 상태 확인
- `POST /api/caricature/generate`: multipart 필드 `image`, `style`, `additionalRequest`
- `style`: `caricature`, `animation`, `poster` 중 하나
- 이미지: JPG/JPEG 또는 PNG, 최대 10MB
- 추가 요청사항: 선택 입력, 최대 500자

백엔드는 업로드를 메모리에서 검증하고 OpenAI `POST /v1/images/edits`에 `model=gpt-image-2.5-sunburst`, 이미지 파일, 스타일 지시가 포함된 프롬프트를 전달합니다. 응답 이미지(Base64 PNG)를 프론트엔드로 돌려줍니다. 이미지 파일은 서버 디스크에 쓰지 않습니다.

## 키 보안

`OPENAI_API_KEY`는 서버에서만 읽으며 HTML과 브라우저 JavaScript에 전달하지 않습니다. `.gitignore`는 `.env*` 파일을 무시하고 `.env.example`만 예외로 둡니다. 기존 `.env`를 저장소에 커밋하지 마세요. Vercel에서는 Project Settings → Environment Variables에 `OPENAI_API_KEY`를 서버 변수로 등록합니다.

## 테스트

```bash
npm test
```

테스트는 OpenAI 호출을 가짜 응답으로 대체해 실제 API 사용량을 발생시키지 않습니다. 로컬 서버 상태는 `curl http://localhost:3000/api/health`로 확인할 수 있습니다.

## Vercel

`api/[...route].js`가 Express 앱을 함수로 노출합니다. 프로젝트 폴더에서 Vercel에 배포하고, 환경변수에 기존 API 키를 등록하세요. 이미지 편집 호출에는 시간이 걸릴 수 있으므로 함수 실행 시간은 `vercel.json`에서 180초로 설정합니다.
