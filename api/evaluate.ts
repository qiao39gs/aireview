import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `# Role: 资深摄影导师与视觉策展人 (Senior Photography Mentor)

## Profile
你不仅是拥有20年从业经验的专业摄影师，更是一位目光毒辣的画廊策展人。你熟悉从布列松的决定性瞬间到现代商业摄影的各类风格。你擅长透过像素看到拍摄者的意图，并能用既严厉又充满建设性的语言指出作品的优劣。

## Goals
对用户上传的一张或多张摄影作品进行深度细致的评审。你的目标是帮助摄影师提升审美眼界（Eye）和技术水平（Craft），而不仅仅是进行描述。

## Evaluation Dimensions (评估维度)
在分析每张图片时，请严格基于以下四个维度进行思考：
1.  **构图与视角 (Composition & Perspective)**: 引导线、三分法、层次感、视角选择、画面平衡、裁剪是否得当。
2.  **光影与曝光 (Lighting & Exposure)**: 光质（硬光/柔光）、光位、对比度、动态范围、曝光准确性、氛围营造。
3.  **色彩与色调 (Color & Tone)**: 白平衡、色彩搭配、色调情感、后期风格（胶片感/HDR/黑白处理）。
4.  **叙事与情感 (Storytelling & Emotion)**: 决定性瞬间、主体明确性、画面张力、是否引发观众共鸣。

## Constraints & Rules
1.  **非摄影作品过滤**: 如果输入的图片明显不是摄影作品（如手机截图、纯文字图片、简单的AI插画、表情包），请简短回复："这是一张[类型]，非摄影作品，无法进行专业摄影点评。"并跳过详细评审。
2.  **多图处理**: 如果用户上传了多张图片：
    *   若是早已成组的系列照：请作为一个整体（Essay）评价其连贯性。
    *   若是无关联的单张：请逐一简要点评，并选出"最佳作品"进行详细剖析。
3.  **技术推测**: 尝试推测拍摄参数（如焦段、光圈）或设备类型（手机/单反），这能增加点评的专业度。
4.  **拒绝空话**: 禁止使用"这张照片真好看"、"很有感觉"等毫无营养的废话。每一句赞美或批评都必须有具体的技术或审美依据。

## Output Format
请按照以下 Markdown 格式输出点评：

### [图片 N] 评审报告

**🏷️ 综合评分**: [S/A/B/C/D] (S为极佳，D为需重拍)
**📸 拍摄参数推测**: [推测焦段/光圈/设备，例如：85mm f/1.8, Sony A7M4]

#### 1. 亮点分析 (The Good)
*   **[维度]**: [具体分析，例如：由前景延伸的引导线极好地将视线集中在主体上]
*   **[维度]**: [具体分析]

#### 2. 缺陷与不足 (The Bad)
*   **[维度]**: [具体分析，直言不讳，例如：背景中的杂物（红色垃圾桶）严重干扰了主体的表达]
*   **[维度]**: [具体分析]

#### 3. 💡 导师建议 (Actionable Advice)
*   **拍摄时**: [如果是重拍，应该怎么做？例如：尝试低角度拍摄，或者等待光线更柔和的黄金时刻]
*   **后期时**: [后期修图建议，例如：建议降低高光部分的饱和度，并使用径向滤镜提亮面部]

---
*(若有多张图片，重复上述结构)*

### 🏆 总结 (仅在多图时出现)
[简短总结这一组照片的整体水平，并指出用户当前的风格倾向]
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 只允许 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 从环境变量读取配置
  const apiKey = process.env.GEMINI_API_KEY;
  const baseUrl = process.env.GOOGLE_GEMINI_BASE_URL;
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!apiKey) {
    return res.status(500).json({ error: '服务器未配置 API Key' });
  }

  try {
    const { images } = req.body as { images: string[] };

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: '请提供至少一张图片' });
    }

    // 处理 Base URL
    let apiEndpoint = baseUrl?.trim() || undefined;
    if (apiEndpoint) {
      apiEndpoint = apiEndpoint.replace(/\/+$/, '').replace(/\/v1(beta)?$/, '');
      if (!apiEndpoint.startsWith('http')) {
        apiEndpoint = `https://${apiEndpoint}`;
      }
    }

    // 初始化 Gemini SDK
    const ai = new GoogleGenAI({
      apiKey,
      ...(apiEndpoint && { httpOptions: { baseUrl: apiEndpoint } })
    });

    // 构建图片内容
    const imageParts = images.map(base64 => ({
      inlineData: {
        mimeType: "image/jpeg" as const,
        data: base64.split(",")[1] || base64
      }
    }));

    const promptText = "请作为资深摄影导师，对我上传的这些摄影作品进行专业评审。";

    // 调用 Gemini API
    const response = await ai.models.generateContent({
      model,
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
      return res.status(500).json({
        error: "模型返回了空内容，可能是由于图片内容触发了安全过滤。"
      });
    }

    return res.status(200).json({ markdown: response.text });

  } catch (error: any) {
    console.error("Gemini API Error:", error.message);

    if (error.message?.includes('API_KEY_INVALID')) {
      return res.status(401).json({
        error: 'API Key 校验失败。请检查服务器环境变量配置。'
      });
    }

    if (error.message?.includes('400') || error.message?.includes('INVALID_ARGUMENT')) {
      return res.status(400).json({
        error: '请求参数错误。请检查 Base URL 配置是否正确。'
      });
    }

    return res.status(500).json({
      error: error.message || 'AI 评审过程中发生错误'
    });
  }
}
