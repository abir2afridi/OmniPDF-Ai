import { LucideIcon } from 'lucide-react';

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  WORKSPACE = 'WORKSPACE',
  SETTINGS = 'SETTINGS',
  AI_LAB = 'AI_LAB',
  ANALYTICS = 'ANALYTICS',
  E_SIGN = 'E_SIGN'
}

export enum ToolCategory {
  ORGANIZE = 'Organize',
  CONVERT = 'Convert',
  EDIT = 'Edit',
  SECURITY = 'Security',
  AI = 'AI Magic'
}

export interface PDFTool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  color: string;
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadDate: number;
  previewUrl?: string;
  status: 'queued' | 'processing' | 'ready' | 'error' | 'locked';
  progress?: number;
  originalFile?: File;
  rotation?: number; // Rotation in degrees
  // Added pageRotations to support per-page rotation state
  pageRotations?: Record<number, number>;
  // Added pagesToDelete to support per-file deletion ranges
  pagesToDelete?: string;
}

export interface AIResponse {
  text?: string;
  audioData?: string; // Base64
  error?: string;
}