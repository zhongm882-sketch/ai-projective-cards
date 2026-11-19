import { getRandomCard } from './cardLibrary';

/**
 * 取一张投射卡片。
 *
 * 早期版本会调用 Replicate / DALL-E 在线生成图片，现在改为从 public/cards/
 * 下预生成的卡库里抽取——快、免费、且画面质量可控。因此这里不再需要任何
 * AI 配置或 token，也不再是异步的。
 *
 * @param recentCards 最近抽过的卡片路径，用于避免连续重复
 */
export function generateProjectiveImage(recentCards: string[] = []): {
  url: string | null;
  description: string;
  error?: string;
} {
  const card = getRandomCard(recentCards);
  if (card) {
    return { url: card.path, description: card.description };
  }
  return {
    url: null,
    description: '',
    error: '图片库暂无图片，请先向 public/cards/ 目录添加图片并在 cardLibrary.ts 中登记。',
  };
}
