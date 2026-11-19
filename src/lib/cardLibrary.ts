export interface CardEntry {
  path: string;        // public 目录下的 URL 路径
  description: string; // 场景描述，供 AI 引导提问用（用户不可见）
}

export const CARD_LIBRARY: CardEntry[] = [
  {
    path: '/cards/Gemini_Generated_Image_1a9nqf1a9nqf1a9n.webp',
    description: 'two people standing back to back, their shadows extending away from each other in opposite directions, surrounded by misty fog',
  },
  {
    path: '/cards/Gemini_Generated_Image_e1ku1de1ku1de1ku.webp',
    description: 'a person standing still in calm water up to their waist, gazing forward in a quiet misty lake landscape, neither moving in nor out',
  },
  {
    path: '/cards/Gemini_Generated_Image_g879m3g879m3g879.webp',
    description: 'two silhouettes standing on opposite cliff edges across a deep chasm, each holding one end of a thin red thread that connects them',
  },
  {
    path: '/cards/Gemini_Generated_Image_ihjjpbihjjpbihjj.webp',
    description: 'a figure wearing a blank white mask holds a hand mirror; the reflection in the mirror shows a real unmasked face with a melancholy expression',
  },
  {
    path: '/cards/Gemini_Generated_Image_pmrzvvpmrzvvpmrz.webp',
    description: 'a figure dissolving into smoke and mist, one arm still reaching outward toward something unseen, against a dim night sky with a faint moon',
  },
  {
    path: '/cards/Gemini_Generated_Image_rbcombrbcombrbco.webp',
    description: 'two hands reaching toward each other through clouds, fingertips almost but not quite touching',
  },
  {
    path: '/cards/Gemini_Generated_Image_xa00r6xa00r6xa00.webp',
    description: 'a small lone figure standing before a towering open birdcage in a vast empty landscape, the cage door wide open',
  },
  {
    path: '/cards/Gemini_Generated_Image_z4sgb6z4sgb6z4sg.webp',
    description: 'a small wooden house nestled among churning dark storm clouds, a single window glowing with warm amber light',
  },
  {
    path: '/cards/Gemini_Generated_Image_2m9pvq2m9pvq2m9p.webp',
    description: 'person facing multiple mirrors showing fragmented versions of themselves in different expressions',
  },
  {
    path: '/cards/Gemini_Generated_Image_7eullr7eullr7eul.webp',
    description: 'person standing in heavy rain under porch, watching warm light from inside house',
  },
  {
    path: '/cards/Gemini_Generated_Image_7zyf7s7zyf7s7zyf.webp',
    description: 'two people sitting across chess board with pieces frozen in tense silence',
  },
  {
    path: '/cards/Gemini_Generated_Image_821n8e821n8e821n.webp',
    description: 'bird inside cage looking at key dangling just beyond its reach',
  },
  {
    path: '/cards/Gemini_Generated_Image_8a5m6o8a5m6o8a5m.webp',
    description: 'person with backpack standing at fork in forest path, unsure which way to go',
  },
  {
    path: '/cards/Gemini_Generated_Image_faexayfaexayfaex.webp',
    description: 'vibrant butterfly resting on partially withered flower in peaceful garden',
  },
  {
    path: '/cards/Gemini_Generated_Image_gnrbncgnrbncgnrb.webp',
    description: 'child holding leg of tall figure whose face is blurred and indistinct',
  },
  {
    path: '/cards/Gemini_Generated_Image_gqlp12gqlp12gqlp.webp',
    description: 'stone bridge connecting two mist-covered mountain peaks across foggy valley',
  },
  {
    path: '/cards/Gemini_Generated_Image_gqng35gqng35gqng.webp',
    description: 'ornate hourglass with golden sand pouring from top to bottom chamber',
  },
  {
    path: '/cards/Gemini_Generated_Image_mt31dtmt31dtmt31.webp',
    description: 'person in empty white room looking through hole in wall revealing bright light',
  },
  {
    path: '/cards/Gemini_Generated_Image_ohl4yzohl4yzohl4.webp',
    description: 'person walking toward distant light through thick fog, barely visible path ahead',
  },
  {
    path: '/cards/Gemini_Generated_Image_rqnvilrqnvilrqnv.webp',
    description: 'two figures standing on opposite sides of glass wall, touching the same spot from different sides',
  },
  {
    path: '/cards/Gemini_Generated_Image_snx5esnx5esnx5es.webp',
    description: 'shadow of person reaching toward light while real person stands back in darkness',
  },
  {
    path: '/cards/Gemini_Generated_Image_u9dod2u9dod2u9do.webp',
    description: 'person standing at edge of high diving board, looking down into empty swimming pool',
  },
  {
    path: '/cards/Gemini_Generated_Image_ulkkp9ulkkp9ulkk.webp',
    description: 'tangled thread of yarn being held by two hands from opposite directions, pulling apart',
  },
  {
    path: '/cards/Gemini_Generated_Image_uvy8obuvy8obuvy8.webp',
    description: 'person sitting alone at dinner table with many empty chairs around, dim lighting',
  },
  {
    path: '/cards/Gemini_Generated_Image_we1jenwe1jenwe1j.webp',
    description: 'locked door with key visible through keyhole, person trying to open from outside',
  },
  {
    path: '/cards/Gemini_Generated_Image_wknw9awknw9awknw.webp',
    description: 'bird soaring freely above person standing with arms outstretched in open field',
  },
  {
    path: '/cards/Gemini_Generated_Image_xvm42gxvm42gxvm4.webp',
    description: 'maze of hedges with person standing at center, looking around at towering walls',
  },
  {
    path: '/cards/Gemini_Generated_Image_z6mkl1z6mkl1z6mk.webp',
    description: 'hourglass running backward against flow of sand in normal hourglass, time reversal',
  },
];

/**
 * 随机抽一张卡，尽量避开最近抽过的。
 *
 * 纯随机的问题：28 张卡里连做 7 次，按生日悖论算约有一半概率碰到重复，
 * 而「又是这张」会明显削弱投射体验。这里排除最近抽过的若干张再随机。
 *
 * @param recentPaths 最近抽过的卡片路径（越靠前越新）
 * @param avoidCount  最多回避几张
 */
export function getRandomCard(
  recentPaths: string[] = [],
  avoidCount = 8
): CardEntry | null {
  if (CARD_LIBRARY.length === 0) return null;

  const avoid = new Set(recentPaths.slice(0, avoidCount));
  const pool = CARD_LIBRARY.filter((c) => !avoid.has(c.path));

  // 回避集合可能覆盖全部卡片（卡库很小时），这时退回全量池，
  // 否则会抽不出任何卡。
  const candidates = pool.length > 0 ? pool : CARD_LIBRARY;
  return candidates[Math.floor(Math.random() * candidates.length)];
}
