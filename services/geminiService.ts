
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

export async function evaluatePhotography(imagesBase64: string[], apiKey: string, baseUrl?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('请先配置您的 Gemini API Key。');
  }

  // 初始化时允许传入自定义 baseUrl (适配代理或中转接口)
  const ai = new GoogleGenAI({ 
    apiKey,
    baseUrl: baseUrl?.trim() || undefined 
  });
  
  const imageParts = imagesBase64.map(base64 => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64.split(",")[1] || base64
    }
  }));

  const promptText = "请作为资深摄影导师，对我上传的这些摄影作品进行专业评审。";

  try {
    // 使用 gemini-3-flash-preview 以获得更稳定的多模态支持并修复 404 错误
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

    return response.text || "未能生成评审报告。";
  } catch (error: any) {
    console.error("Gemini SDK Error:", error);
    if (error.message?.includes('API_KEY_INVALID')) {
      throw new Error('API Key 无效，请检查配置。');
    }
    if (error.message?.includes('NOT_FOUND') || error.message?.includes('404')) {
      throw new Error('模型未找到或 API 地址错误，请检查您的 Base URL 是否配置正确。');
    }
    throw new Error(error.message || 'AI 评审过程中发生错误，请检查网络、Base URL 或 Key 权限。');
  }
}
