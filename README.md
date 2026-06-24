# OmniPDF AI — The Ultimate PDF Workspace

All-in-one PDF management and analysis platform with AI-powered features.

## Features

### PDF Tools
- Merge, Split, Compress PDFs
- PDF to Word / Excel / PowerPoint / JPG
- Word / Excel / PowerPoint / JPG to PDF
- OCR, E-Sign, Protect, Rotate, Delete Pages
- Extract Images

### AI Lab
- **PDF Chat** — Ask questions about your documents (OpenRouter)
- **Translator** — Translate text between 12+ languages
- **Voice LAB** — Text-to-speech synthesis
- **Smart Name** — AI-generated filenames
- **Editor AI** — Rewrite text with tone/length control

### AI Summary
- 7 summary types (TL;DR, Bullet Points, Key Insights, etc.)
- 4 tones, 3 lengths, model selection

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS, Motion (Framer Motion) |
| Auth | Firebase Authentication |
| AI | OpenRouter API (GLM, StepFun, free models) |
| PDF | pdf-lib, pdfjs-dist, jszip, tesseract.js |
| Hosting | Render |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_OPENROUTER_API_KEY` | Yes | OpenRouter API key for AI features |
| `OPENROUTER_API_KEY` | Yes | Fallback for summary service |
| `VITE_APP_ENV` | No | `development` or `production` |
| `VITE_API_URL` | No | API base URL |
| `VITE_APP_URL` | No | App URL |
| `VITE_DEBUG_MODE` | No | Toggle debug logging |

Firebase config is hardcoded in `src/lib/firebase.ts` (public identifiers).

## Getting Started

```bash
npm install
cp .env.local.example .env.local  # add your OpenRouter API key
npm run dev
```

## Deployment

Render auto-deploys from `main` branch.

```bash
npm run build    # vite build
npm run start    # vite preview --port $PORT --host 0.0.0.0
```

## Project Structure

```
src/
├── components/    # React components (AILab, Sidebar, Dashboard, etc.)
├── services/      # AI & PDF service layer
├── lib/           # Firebase, config, supabase compat
├── public/        # Static assets
└── types/         # TypeScript types & enums
```
