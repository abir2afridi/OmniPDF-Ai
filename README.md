# OmniPDF AI - Advanced Document Intelligence Platform

<div align="center">
<img width="1200" height="475" alt="OmniPDF AI Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

<p align="center">
  <strong>🧠 AI-Powered PDF Analysis • 📄 Document Intelligence • 🎯 Smart Automation</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#api">API</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 🚀 Overview

**OmniPDF AI** is a cutting-edge document intelligence platform that transforms how you interact with PDF files. Built with modern web technologies and powered by advanced AI models, it offers seamless document analysis, intelligent chat, translation, and automation capabilities.

**Developer**: [Abir Hasan Siam](https://github.com/abir2afridi)  
**Tech Stack**: React, TypeScript, Supabase, AI APIs  
**License**: MIT

---

## ✨ Features

### 🤖 AI-Powered Capabilities

- **🧠 Intelligent Chat**: Context-aware conversations about your documents
- **🌍 Multi-Language Translation**: Support for 12+ languages
- **📝 Smart Document Analysis**: Extract insights and summaries
- **🎤 Text-to-Speech**: Convert text to natural speech
- **📄 Smart File Renaming**: AI-powered filename suggestions
- **✏️ Advanced Editor**: AI-enhanced text rewriting

### 🎛️ Advanced AI Model Management

- **Auto Mode**: Intelligent model selection based on task complexity
- **Manual Mode**: User control over model preferences
- **Dual Models**:
  - **GLM (Fast)**: `z-ai/glm-4.5-air:free` - Lightning-fast responses
  - **StepFun (Reasoning)**: `stepfun/step-3.5-flash:free` - Advanced reasoning

### 📊 Performance Features

- **Instant Responses**: Cached responses for common queries
- **Streaming Support**: Real-time response streaming
- **Fallback System**: Automatic model switching on failures
- **Rate Limit Handling**: Intelligent retry mechanisms

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno)
- **AI APIs**: OpenRouter API integration
- **State Management**: React Context + Hooks
- **UI Framework**: Custom design system with Framer Motion
- **Build Tool**: Vite

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Git**

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/abir2afridi/OmniPDF-Ai.git
   cd OmniPDF-Ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp .env.local.example .env.local
   ```

4. **Configure API Keys**
   Edit `.env.local` and add your API keys:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   OPENROUTER_API_KEY=sk-or-v1-your-api-key-here
   ```

5. **Run Development Server**
   ```bash
   npm run dev
   ```

6. **Open in Browser**
   ```
   http://localhost:3001
   ```

---

## 📁 Project Structure

```
OmniPDF-Ai/
├── components/           # React components
│   ├── AILab.tsx        # Main AI Lab interface
│   ├── Sidebar.tsx      # Navigation sidebar
│   └── ...
├── services/            # API services
│   ├── aiService.ts     # AI functionality
│   └── supabase.ts      # Database client
├── supabase/            # Backend functions
│   └── functions/       # Edge Functions
│       ├── ai-chat/     # Chat endpoint
│       ├── ai-translate/# Translation endpoint
│       └── ...
├── public/              # Static assets
├── .env.local           # Environment variables
└── package.json         # Dependencies
```

---

## 🔧 Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# AI API Configuration
OPENROUTER_API_KEY=sk-or-v1-your-api-key-here

# Development Settings
VITE_APP_ENV=development
VITE_DEBUG_MODE=true
```

---

## 🎯 AI Models & Capabilities

### Supported Models

| Model | Provider | Speed | Use Case |
|-------|----------|-------|----------|
| `z-ai/glm-4.5-air:free` | GLM | ⚡ Fast | General chat, translation, simple tasks |
| `stepfun/step-3.5-flash:free` | StepFun | 🧠 Smart | Complex reasoning, document analysis |

### Auto Model Selection

The system automatically selects the best model based on:

- **Query Complexity**: Simple → GLM, Complex → StepFun
- **Task Type**: Translation → GLM (faster)
- **Conversation Length**: Long chats → StepFun (reasoning)
- **Keywords**: Technical topics → StepFun

---

## 📚 API Reference

### AI Chat
```typescript
import { chatWithAI } from './services/aiService';

const response = await chatWithAI(messages, model, maxTokens, temperature);
```

### Translation
```typescript
import { translateText } from './services/aiService';

const result = await translateText(text, targetLang, model);
```

### Document Analysis
```typescript
import { chatWithPDF } from './services/aiService';

const insights = await chatWithPDF(pdfContent, question);
```

---

## 🚀 Deployment

### Supabase Deployment

1. **Install Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase**
   ```bash
   supabase login
   ```

3. **Deploy Functions**
   ```bash
   supabase functions deploy ai-chat
   supabase functions deploy ai-translate
   ```

### Vercel Deployment

1. **Connect Repository**
   ```bash
   vercel --prod
   ```

2. **Set Environment Variables**
   ```bash
   vercel env add OPENROUTER_API_KEY
   ```

---

## 🏗️ Architecture

### Clean Architecture Pattern

```
Presentation Layer (React Components)
         ↓
Domain Layer (Business Logic)
         ↓
Data Layer (Supabase + APIs)
```

### Key Components

- **AILab**: Main AI interface with model switching
- **AI Service**: Centralized AI functionality
- **Edge Functions**: Serverless backend processing
- **Caching System**: Intelligent response caching

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

### Development Guidelines

- Use TypeScript for type safety
- Follow React best practices
- Write meaningful commit messages
- Test your changes thoroughly
- Update documentation as needed

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Abir Hasan Siam** - Project Developer
- **Supabase** - Backend infrastructure
- **OpenRouter** - AI model aggregation
- **React Community** - UI framework

---

## 📞 Support

- **GitHub Issues**: [Report bugs](https://github.com/abir2afridi/OmniPDF-Ai/issues)
- **Discussions**: [Q&A](https://github.com/abir2afridi/OmniPDF-Ai/discussions)
- **Developer**: [@abir2afridi](https://github.com/abir2afridi)

---

<div align="center">

**Built with ❤️ by Abir Hasan Siam**

⭐ **Star this repo if you find it helpful!**

[🌐 Live Demo](https://omni2pdf-ai.vercel.app) • [📚 Documentation](#) • [🐛 Report Issues](https://github.com/abir2afridi/OmniPDF-Ai/issues)

</div>
