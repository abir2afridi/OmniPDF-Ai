# OmniPDF AI — The Ultimate PDF Workspace

All-in-one PDF management and analysis platform with AI-powered features.
100% client-side processing — your files never leave your browser.

## Features

### PDF Tools
| Tool | Description |
|---|---|
| Merge PDF | Combine multiple PDFs into one |
| Split PDF | Extract pages or split into separate files |
| Delete Pages | Remove unwanted pages |
| Rotate PDF | Rotate pages permanently |
| Compress PDF | Reduce file size |
| Protect PDF | Password-protect with AES encryption |
| Unlock PDF | Remove password from protected PDFs |
| Edit PDF | Modify text, add images, shapes, annotations |
| OCR PDF | Extract text from scanned documents (Tesseract.js) |
| Sign PDF | Add digital signatures and initials |
| Summary PDF | AI-powered document summarization |
| Translate PDF | Translate entire PDFs preserving layout |

### Converters
| From → To | Format |
|---|---|
| PDF → | Word (.docx), Excel, PowerPoint, JPG |
| Word → | PDF |
| Excel → | PDF |
| PowerPoint → | PDF |
| JPG → | PDF |
| OpenOffice/LibreOffice → | PDF |
| Extract Images | Pull all embedded images from PDF |

### AI Lab
- **PDF Chat** — Ask questions about your documents (OpenRouter)
- **Translate** — Translate text between 12+ languages
- **Voice LAB** — Text-to-speech synthesis
- **Smart Name** — AI-generated filenames
- **Editor AI** — Rewrite text with tone/length control

### Automata Theory Solver
- **DFA** — Design and visualize Deterministic Finite Automata
- **NFA** — Build Nondeterministic Finite Automata
- **Regex → NFA** — Convert regular expressions to NFA
- **NFA → DFA** — Convert NFA to DFA (subset construction)
- **DFA Minimize** — Minimize DFA using Hopcroft's algorithm
- **AI Solve** — Upload problems, get AI-generated state diagrams

### Other
- **History** — Download history stored for 7 days (Firebase Firestore)
- **About** — PWA install, developer info
- **Contact** — Developer profile

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS, Motion (Framer Motion) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore |
| AI | OpenRouter API |
| PDF | pdf-lib, pdfjs-dist, docx, exceljs, pptxgenjs |
| OCR | Tesseract.js |
| Automata | Custom SVG renderer, OpenRouter AI |
| PWA | Vite PWA, Workbox |
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

Firebase config is hardcoded in `lib/supabase.ts` (public identifiers only).

## Getting Started

```bash
npm install
cp .env.local.example .env.local  # add your OpenRouter API key
npm run dev
```

## Deployment

Render auto-deploys from `main` branch.

```bash
npm run build    # vite build --mode production
npm run start    # vite preview --port $PORT --host 0.0.0.0
```

## Project Structure

```
├── components/      # React UI components
│   ├── Dashboard.tsx       # Main tool grid & navigation
│   ├── MergePDF.tsx        # Drag-reorder merge with page grid
│   ├── PDFToWord.tsx       # PDF → DOCX with page size selector
│   ├── EditPDF.tsx         # Full PDF editor
│   ├── AILab.tsx           # AI tools hub (Chat, Translate, TTS, Rename, Rewrite)
│   ├── AutomataSolver.tsx  # Automata theory solver with AI Solve
│   ├── History.tsx         # Download history (Firestore)
│   ├── Sidebar.tsx         # Navigation sidebar
│   └── ...
├── services/        # Business logic layer
│   ├── pdfService.ts       # Core PDF utilities (thumbnails, merge, split, rotate)
│   ├── pdfToWordService.ts # PDF → DOCX with image preservation
│   ├── aiService.ts        # OpenRouter API integration
│   ├── ocrService.ts       # Tesseract.js OCR
│   ├── automataAiService.ts # Automata AI solver service
│   ├── historyService.ts   # Firestore history CRUD
│   └── ...
├── lib/             # Firebase config, utilities
└── types/           # TypeScript types & enums
```

## Key Architecture Decisions

- **Dynamic pdfjs-dist imports** — All PDF processing services use `await import('pdfjs-dist')` instead of static imports to ensure the worker loads correctly under Vite bundling.
- **Client-side only** — All PDF operations run in the browser using pdf-lib and pdfjs-dist. No server uploads.
- **Image preservation** — PDF → Word always embeds the full page image so embedded graphics are never lost.
- **Download history** — Every download auto-saves to Firestore with 7-day retention, tied to authenticated users.
- **AI diagrams** — Automata solver uses custom SVG renderer from AI-generated JSON, no external API dependency.

## License

Private — All rights reserved.
