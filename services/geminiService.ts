
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

export async function evaluatePhotography(imagesBase64: string[], apiKey: string, baseUrl?: string): Promise<string> {
  // 即使 UI 传参，也优先确保使用系统环境变量
  const effectiveKey = process.env.API_KEY || apiKey;
  
  if (!effectiveKey) {
    throw new Error('系统未配置 API Key，请检查环境变量设置。');
  }

  // 深度清洗 Base URL
  // 移除末尾斜杠及常见的版本路径后缀，因为 SDK 会自动添加 /v1beta
  let apiEndpoint = baseUrl?.trim() || undefined;
  if (apiEndpoint) {
    apiEndpoint = apiEndpoint.replace(/\/+$/, '').replace(/\/v1(beta)?$/, '');
    // 确保包含协议头
    if (!apiEndpoint.startsWith('http')) {
      apiEndpoint = `https://${apiEndpoint}`;
    }
  }

  // 重新实例化，确保 endpoint 生效
  const ai = new GoogleGenAI({ 
    apiKey: effectiveKey,
    apiEndpoint: apiEndpoint,
    // 兼容性注入：某些环境可能通过构造函数直接识别 baseUrl
    baseUrl: apiEndpoint 
  } as any);
  
  const imageParts = imagesBase64.map(base64 => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64.split(",")[1] || base64
    }
  }));

  const promptText = "请作为资深摄影导师，对我上传的这些摄影作品进行专业评审。";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{
        parts: [
          ...imageParts,
          { text: promptText }
        ]
      }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.7,
        topP: 0.95,
        topK: 64,
      }
    });

    if (!response.text) {
      throw new Error("模型返回了空内容，可能是由于图片内容触发了安全过滤。");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini SDK Error Log:", {
      message: error.message,
      endpointUsed: apiEndpoint || 'default'
    });

    if (error.message?.includes('API_KEY_INVALID')) {
      throw new Error('API Key 校验失败。请确保您使用的是有效的 Google Gemini API Key。');
    }
    
    if (error.message?.includes('400') || error.message?.includes('INVALID_ARGUMENT')) {
      throw new Error('请求参数错误。如果是自定义地址，请确保 Base URL 格式正确（不包含 /v1/beta 等后缀）。');
    }

    throw new Error(error.message || 'AI 评审过程中发生错误，请检查网络或 API 配置。');
  }
}
