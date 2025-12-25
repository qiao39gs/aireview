
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

export async function evaluatePhotography(imagesBase64: string[], apiKey: string, baseUrl?: string): Promise<string> {
  if (!apiKey) {
    throw new Error('请先配置您的 Gemini API Key。');
  }

  // Google SDK 使用 apiEndpoint 而不是 baseUrl 来指定自定义域名
  // 移除末尾斜杠以防冲突
  const apiEndpoint = baseUrl?.trim().replace(/\/+$/, '') || undefined;

  const ai = new GoogleGenAI({ 
    apiKey,
    apiEndpoint
  });
  
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

    return response.text || "未能生成评审报告。";
  } catch (error: any) {
    console.error("Gemini SDK Error:", error);
    if (error.message?.includes('API_KEY_INVALID')) {
      throw new Error('API Key 无效，请检查配置。');
    }
    if (error.message?.includes('NOT_FOUND') || error.message?.includes('404')) {
      throw new Error('模型未找到或 API 地址错误。请注意：Base URL 应该是不带 /v1 的根地址（例如 https://api.yourproxy.com），SDK 会自动处理版本后缀。');
    }
    throw new Error(error.message || 'AI 评审过程中发生错误，请检查网络、Base URL 或 Key 权限。');
  }
}
