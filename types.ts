
export interface ImageFile {
  id: string;
  file?: File;
  preview: string;
  base64: string;
}

export interface EvaluationResult {
  markdown: string;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  images: ImageFile[];
  result: EvaluationResult;
  mainRating: string; // 提取 S/A/B/C/D 用于预览
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
