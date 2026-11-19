import { Round, Report } from '@/types';
import { AIConfig, callAI } from './aiProvider';

const EXPLORATION_SYSTEM = `你是一位富有温柔好奇心的探索引导者，陪伴用户通过投射图片探索内心深处的感受。

探索分为三个自然阶段，请根据当前阶段调整提问方向：

【第一阶段：展开所见】
用户刚开始描述他们看到的东西。帮助他们把画面说得更具体、更丰富。
- 追问细节："那个…是什么样子的？"、"你注意到了什么？"
- 不引导、不解读，只是好奇地问更多

【第二阶段：故事化】
帮助用户把所见编织成一个故事，赋予人物关系和情感。
- "他们之间发生了什么？"、"这个人此刻在想什么？"
- "接下来会发生什么？"、"如果这是一个故事，它叫什么名字？"
- 跟随用户的隐喻，不引入新概念

【第三阶段：感受与联结】
将故事与用户自己的内心世界连接起来。
- "这个故事让你想起了什么？"、"你有没有也曾有过这样的感觉？"
- "当你说…的时候，你身体里有什么感觉？"
- "在这个感觉里，还有什么？"

通用原则：
- 每次只问一个问题，20字左右，简洁而有温度
- 用用户自己说过的词和意象追问，不引入新概念
- 不评判、不解释、不给结论

只输出问题本身，不要引号，不要任何解释或铺垫。`;

const REPORT_SYSTEM = `你是一位温柔、有洞察力的心理探索报告撰写者。
基于用户的探索对话，生成一份启发性的自我探索报告。

写作风格：
- 使用推测语气（"似乎"、"可能"、"也许"、"从本次探索来看"）
- 不做绝对判断，不做心理诊断
- 聚焦于资源、可能性和用户自身的觉察力
- 温暖而有洞察力
- 不使用"一定"、"证明"、"真实潜意识"、"人格类型"等绝对表达

只输出有效JSON，不要markdown代码块。`;

export async function generateFirstQuestion(
  _config: AIConfig,
  _imageDescription: string
): Promise<string> {
  return '看着这张图片，你首先注意到了什么？';
}

export async function generateNextQuestion(
  config: AIConfig,
  imageDescription: string,
  rounds: Round[],
  roundIndex: number
): Promise<{ question: string; isComplete: boolean }> {
  const minRounds = 3;
  const maxRounds = 6;

  if (roundIndex >= maxRounds) return { question: '', isComplete: true };

  const conversationHistory = rounds.flatMap((r) => [
    { role: 'assistant' as const, content: r.question },
    { role: 'user' as const, content: r.answer },
  ]);

  const canEnd = roundIndex >= minRounds;
  const phaseNote =
    roundIndex <= 1
      ? '【当前阶段：展开所见】追问用户看到了什么，帮助他们把画面说得更具体、更有细节。'
      : roundIndex <= 3
      ? '【当前阶段：故事化】帮助用户把所见编成故事，探索图中的关系、情感和走向。'
      : '【当前阶段：感受与联结】将故事连接到用户自身的感受和生命经验，问题要足够深入。';
  const decisionNote = canEnd
    ? `已完成${roundIndex}轮对话。如果用户的感受已经充分展开，请只输出"[结束]"来结束探索。否则继续追问。`
    : '';

  const result = await callAI(
    config,
    EXPLORATION_SYSTEM,
    [
      {
        role: 'user',
        content: `图片描述（用户不可见）：${imageDescription}\n\n${phaseNote}${decisionNote ? '\n' + decisionNote : ''}`,
      },
      ...conversationHistory,
    ],
    // deepseek-reasoner、Claude Opus 5 等模型会先生成推理内容占用 token 预算，
    // 而 max_tokens 是「推理 + 可见回答」的总上限。预算过小会导致可见答案被截断
    // 甚至为空。这里给足空间——问题本身只有 20 字，多出的预算是留给推理的。
    2000
  );

  if (result === '[结束]' || result.includes('[结束]')) {
    return { question: '', isComplete: true };
  }
  return { question: result, isComplete: false };
}

/**
 * 从 AI 回复里提取 JSON。
 * 即使提示词写了「不要 markdown 代码块」，多数模型仍会套上围栏或加一句开场白，
 * 所以直接 JSON.parse 会真实地失败——这是必须处理的常态，不是边缘情况。
 */
function extractJson(raw: string): unknown {
  let text = raw.trim();

  // 剥掉 ```json ... ``` 或 ``` ... ``` 围栏
  const fence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fence) text = fence[1].trim();

  // 仍不是以 { 开头，说明前后有多余的话，退一步取第一个 { 到最后一个 }
  if (!text.startsWith('{')) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);
  }

  return JSON.parse(text);
}

/** 调 AI 并要求 JSON 结果，解析失败重试一次；两次都失败则抛错，绝不编造内容。 */
async function callAIForJson(
  config: AIConfig,
  system: string,
  prompt: string,
  maxTokens: number
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callAI(config, system, [{ role: 'user', content: prompt }], maxTokens);
    try {
      return extractJson(raw);
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `AI 返回的内容无法解析为 JSON${lastError instanceof Error ? `：${lastError.message}` : ''}`
  );
}

/** 报告至少要有主题和核心观察，否则界面上会出现大片空白区块。 */
function assertUsableReport(data: unknown): asserts data is Partial<Report> {
  if (!data || typeof data !== 'object') {
    throw new Error('AI 返回的报告格式不正确');
  }
  const d = data as Record<string, unknown>;
  const hasThemes = Array.isArray(d.themes) && d.themes.length > 0;
  const hasObservations =
    typeof d.coreObservations === 'string' && d.coreObservations.trim().length > 0;

  if (!hasThemes || !hasObservations) {
    throw new Error('AI 返回的报告内容不完整');
  }
}

export async function generateReport(
  config: AIConfig,
  imageDescription: string,
  rounds: Round[]
): Promise<Report> {
  const conversationText = rounds
    .map((r, i) => `问题${i + 1}：${r.question}\n回答：${r.answer}`)
    .join('\n\n');

  // 原先这里是两次串行调用：先产出一份用户永远看不到的分析 JSON，再拿它写报告。
  // 那份中间产物本质是「思维链外置」，而现在的模型自己就会推理——把分析要求写进
  // 提示词，一次调用即可。省一半时间和 token，也少一个失败点。
  const reportPrompt = `基于以下投射探索对话，生成一份温柔、有洞察力的自我探索报告。

图片场景：${imageDescription}

对话内容：
${conversationText}

请先在心里完成分析（高频词、情绪走向、时间取向、内在冲突、可见资源），
不要输出分析过程，只输出下面这份基于分析的报告。

输出严格JSON格式：
{
  "themes": ["主题1", "主题2", "主题3"],
  "coreObservations": "从本次探索来看，你的表达中...(2-3句话，具体引用用户表达)",
  "currentFocus": "你似乎更加关注...(1-2句话)",
  "possibleExperience": "也许你最近正在经历...(1-2句话，推测语气)",
  "innerConflicts": "在表达中，可以感受到...(1-2句话，关于内心的张力)",
  "needs": "你的回答中透露出对...的渴望或需要...(1-2句话)",
  "resources": "值得关注的是，你展现出...(1-2句话，关于内在资源)",
  "innerStrengths": "...(2-3句话，具体指出用户回答中体现的内在优势，如共情力、觉察力等)",
  "reflectionQuestion": "如果...(一个开放式问题，帮助用户继续思考)",
  "weeklyPractice": "...(一个简单具体的行动建议，15字以内)"
}`;

  // 解析失败会重试一次，仍失败则抛错。
  // 这里绝不返回写死的兜底报告——用户分辨不出那是假的，而且假主题会污染成长轨迹统计。
  // 对一个正在认真自省的人，宁可诚实报错让他重试，也不能编一份心理报告给他。
  const reportData = await callAIForJson(config, REPORT_SYSTEM, reportPrompt, 4000);
  assertUsableReport(reportData);

  return {
    themes: (reportData.themes as string[]) || [],
    coreObservations: reportData.coreObservations || '',
    currentFocus: reportData.currentFocus || '',
    possibleExperience: reportData.possibleExperience || '',
    innerConflicts: reportData.innerConflicts || '',
    needs: reportData.needs || '',
    resources: reportData.resources || '',
    innerStrengths: reportData.innerStrengths || '',
    reflectionQuestion: reportData.reflectionQuestion || '',
    weeklyPractice: reportData.weeklyPractice || '',
    generatedAt: new Date().toISOString(),
  };
}
