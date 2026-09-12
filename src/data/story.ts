import type { CampaignState } from '../systems/CampaignProgressionManager';

export type StoryId = 'prologue' | 'letter-forest' | 'letter-lake' | 'letter-mountain'
  | 'letter-desert' | 'letter-snow' | 'epilogue';
export type StoryMotif = 'post' | 'forest' | 'lake' | 'mountain' | 'desert' | 'snow';
export interface StoryPage {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly signature: string;
  readonly motif: StoryMotif;
}
export interface StoryDef {
  readonly id: StoryId;
  readonly title: string;
  /** The existing campaign boundary, not a claim that its future region is implemented. */
  readonly chapter: number | null;
  readonly unlockAfterStage: number;
  readonly recipient: string | null;
  readonly pages: readonly StoryPage[];
}
export interface LetterRecipient {
  readonly chapter: number;
  readonly name: string;
  readonly species: string;
  readonly region: string;
  readonly wish: string;
  readonly nextAddress: string;
  readonly companionLesson: string;
  readonly storyId: StoryId;
}

/** These are the letter writers' homes. World maps will migrate separately. */
export const LETTER_RECIPIENTS: readonly LetterRecipient[] = [
  { chapter: 1, name: '栗笺', species: '松鼠', region: '风铃森林', wish: '再邀请老朋友一起野餐，不必先准备一场完美的聚会。',
    nextAddress: '圆镜湖，第三片大荷叶旁，泡芙收', companionLesson: '学着跟随，也学着等一等。', storyId: 'letter-forest' },
  { chapter: 2, name: '泡芙', species: '鱼', region: '圆镜湖', wish: '让岸上的朋友知道，自己一直记得那次约定。',
    nextAddress: '云阶山，挂着两只铜铃的小屋，岚角收', companionLesson: '站在不同的地方，也可以互相帮忙。', storyId: 'letter-lake' },
  { chapter: 3, name: '岚角', species: '山羊', region: '云阶山', wish: '把“有空再联系”变成一张现在就寄出的短笺。',
    nextAddress: '晒被沙原，条纹遮阳棚下，团刺收', companionLesson: '不必每一步都一样，一起完成就好。', storyId: 'letter-mountain' },
  { chapter: 4, name: '团刺', species: '仙人掌', region: '晒被沙原', wish: '告诉大家，自己欢迎拥抱，也欢迎隔着一块软垫的拥抱。',
    nextAddress: '晴雪湾，画着太阳的蓝信箱，芝麻收', companionLesson: '照顾伙伴的节奏，也说出自己需要什么。', storyId: 'letter-desert' },
  { chapter: 5, name: '芝麻', species: '企鹅', region: '晴雪湾', wish: '让分别住在远处的朋友，共同开始下一封信。',
    nextAddress: '晴日邮局，门廊第二张小凳子，棉棉和小暖收', companionLesson: '不是谁替代谁，而是多了一个会写回信的朋友。', storyId: 'letter-snow' },
];

export const STORIES: readonly StoryDef[] = [
  {
    id: 'prologue', title: '序章 · 邮袋里的一点暖', chapter: null, unlockAfterStage: 0, recipient: null,
    pages: [
      { eyebrow: '晴日邮局 · 一个适合出门的早晨', title: '有些回信，绕了远路', motif: 'post',
        body: '布偶猫棉棉把围巾系好时，老邮差柏叔正在修补旧信。那些地址不全的回信，在抽屉里等了许多年。\n\n一阵爱折纸的风钻过窗缝，把信封、叶片和半个饼干袋卷成了一团。柏叔捧住茶杯：“它倒是很会打包。”',
        signature: '“今天，我们把地址一点点找回来。”' },
      { eyebrow: '第一条地址 · 风铃森林，栗笺收', title: '把“还记得你”送出去', motif: 'forest',
        body: '最上面的信写着：“野餐垫还留着你的位置。”落款旁，藏着下一位朋友的旧地址。\n\n棉棉背起邮袋。柏叔会留在邮局整理线索、接收新的回信；路上的叶团和纸片，只要轻轻拨散，让风歇一会儿就好。',
        signature: '这一程，要找回的是朋友之间的联系。' },
      { eyebrow: '同行者 · 小暖', title: '邮袋多走了一步', motif: 'post',
        body: '门廊上，棉棉停住脚，身旁却又响起轻轻的一步。邮袋记住的脚步与善意，攒成了一个软乎乎的回声。\n\n棉棉抬爪，它也抬爪；棉棉摆摆耳朵，它慢了半拍。“叫你小暖吧。先一起走，别的慢慢学。”',
        signature: '一只小猫，一袋回信，和一位刚刚学会同行的朋友。' },
    ],
  },
  {
    id: 'letter-forest', title: '远方回信 · 栗笺的空位', chapter: 1, unlockAfterStage: 10, recipient: '栗笺',
    pages: [
      { eyebrow: '来自风铃森林 · 松鼠栗笺', title: '野餐垫不必铺得很整齐', motif: 'forest',
        body: '“棉棉，你整理出的字迹，我认得。我总想等坚果饼烤得更好一点，再寄那张邀请。等着等着，连自己都以为朋友们忘了。\n\n今天这炉还是有点焦。我决定照样寄信，并且诚实地多带一点果酱。”',
        signature: '栗笺 · 已经把邀请放进信封' },
      { eyebrow: '信封里的线索 · 圆镜湖', title: '给岸边留一个位置', motif: 'lake',
        body: '“请帮我找找泡芙。她住在圆镜湖第三片大荷叶旁。以前我们把野餐垫铺到岸边，这样谁也不用勉强自己。\n\n另附两片叶子书签，一片给你，一片给小暖。等朋友的时候，也可以先读两页书。”',
        signature: '下一位收信人：泡芙，不是湖里所有会冒泡的朋友。' },
    ],
  },
  {
    id: 'letter-lake', title: '远方回信 · 泡芙的岸边', chapter: 2, unlockAfterStage: 20, recipient: '泡芙',
    pages: [
      { eyebrow: '来自圆镜湖 · 鱼泡芙', title: '水面这边，一直有人记得', motif: 'lake',
        body: '“我还留着栗笺的果酱瓶，已经改成水草花盆了。以前我以为，大家走得越来越远，就不需要一个走不了陆路的朋友。\n\n原来岸边的那个位置还在。请告诉栗笺：焦一点没关系，我会带一整湖的水——好吧，一小瓶。”',
        signature: '泡芙 · 请把回信夹在岸边的木夹上' },
      { eyebrow: '信封里的线索 · 云阶山', title: '各站一边，也算一起', motif: 'mountain',
        body: '“岚角给我寄过铜铃的拓印。他住在云阶山，两只铃铛挂在门口，其中一只总比另一只慢半拍。\n\n小暖不必永远踩着你的脚印呀。一个人读地址，另一个人扶住信封，就是很好的分工。”',
        signature: '下一位收信人：岚角，爱把天气画在信纸边上。' },
    ],
  },
  {
    id: 'letter-mountain', title: '远方回信 · 岚角的现在', chapter: 3, unlockAfterStage: 30, recipient: '岚角',
    pages: [
      { eyebrow: '来自云阶山 · 山羊岚角', title: '“等有空”也该歇一歇了', motif: 'mountain',
        body: '“我写了很多开头：等有空，等天气好，等我有件值得说的大事。可是今天，我只是把两只铜铃擦亮了。\n\n泡芙说，这也可以写。于是这封信只有一件小事：铃声很好听，我想让你们也听见。”',
        signature: '岚角 · 今天就寄出，不等明天的大事' },
      { eyebrow: '信封里的线索 · 晒被沙原', title: '不一样的步子，同一封信', motif: 'desert',
        body: '“团刺住在晒被沙原的条纹遮阳棚下。我一直欠他一句谢谢：那顶歪歪的帽子，替我挡了好多次太阳。\n\n附一段铃谱。棉棉读前半，小暖接后半；不用一起响，每一段都有人接住就很好。”',
        signature: '下一位收信人：团刺，帽檐上缝着一颗纽扣。' },
    ],
  },
  {
    id: 'letter-desert', title: '远方回信 · 团刺的软垫', chapter: 4, unlockAfterStage: 40, recipient: '团刺',
    pages: [
      { eyebrow: '来自晒被沙原 · 仙人掌团刺', title: '拥抱也可以有别的样子', motif: 'desert',
        body: '“听说那顶帽子还在，我开心得差点把遮阳棚顶起来。我以前不敢邀请大家，怕自己的刺把野餐变成补衣服大会。\n\n现在我做了五块软垫。想抱一抱，就垫一块；想坐在旁边喝果茶，也很欢迎。”',
        signature: '团刺 · 第六块小软垫留给小暖' },
      { eyebrow: '信封里的线索 · 晴雪湾', title: '说出需要，不会打扰朋友', motif: 'snow',
        body: '“请把一块软垫捎给芝麻。她住在晴雪湾，蓝信箱上画着太阳。她总说自己什么都能搬，其实最想有人帮忙扶一下箱盖。\n\n你和小暖也一样。累了就说，我们可以轮流拿着这一小片阴凉。”',
        signature: '下一位收信人：芝麻，晒太阳时会把围巾晾成旗子。' },
    ],
  },
  {
    id: 'letter-snow', title: '远方回信 · 芝麻的新地址', chapter: 5, unlockAfterStage: 50, recipient: '芝麻',
    pages: [
      { eyebrow: '来自晴雪湾 · 企鹅芝麻', title: '原来大家都留着一点位置', motif: 'snow',
        body: '“软垫收到了！我终于请邻居扶着箱盖，把里面的旧明信片重新摆好了。森林、湖边、山上、沙原，一张也没丢。\n\n我们不用搬到同一个地方，才算没有走散。下次写信，我准备从‘今天晒到了太阳’开始。”',
        signature: '芝麻 · 正在认真挑选一张并不完美的邮票' },
      { eyebrow: '最后一条地址 · 晴日邮局', title: '这一封，写给两位邮差', motif: 'post',
        body: '“请送到晴日邮局，门廊第二张小凳子：棉棉和小暖收。\n\n五个人各写了一小段，连起来有点歪，请别介意。以前我们总在等回信。这次，我们想先写给你们。小暖也有自己的名字，所以信封上当然要写两个。”',
        signature: '收信人：棉棉与小暖。地址：你们可以一起坐下的地方。' },
    ],
  },
  {
    id: 'epilogue', title: '终章 · 今天轮到我们收信', chapter: null, unlockAfterStage: 50, recipient: null,
    pages: [
      { eyebrow: '晴日邮局 · 门廊的第二张小凳子', title: '茶还是温的', motif: 'post',
        body: '柏叔把修好的信盒放到桌边：“回来得正好。今天有一封，地址写得特别清楚。”\n\n棉棉把邮袋放下，小暖先扶住被风掀起的一角。这次，它没有等棉棉抬爪。两位小邮差挤在同一张凳子上，认真看了看自己的名字。',
        signature: '老邮差还在；门廊上，只是多了两个等信的位置。' },
      { eyebrow: '来自五位朋友 · 以及一些果酱指印', title: '谢谢你，把“后来”变成了今天', motif: 'forest',
        body: '“栗笺开始寄出邀请；泡芙在岸边装了新木夹；岚角写满了一页小事；团刺添了软垫；芝麻肯请人扶箱盖了。\n\n谢谢你们送来的，不只是旧回信。原来问一句‘最近好吗’，随时都可以开始。”',
        signature: '附言：野餐没有截止日期，等大家方便的时候。' },
      { eyebrow: '棉棉与小暖 · 我们的第一封回信', title: '明天，还是一起走', motif: 'post',
        body: '棉棉写下“今天邮局的茶很香”。小暖扶稳信纸，又在旁边留下一个小小的爪印。柏叔递来第二支笔。\n\n调皮的折纸风趴在窗边，这次只折了一只信封角。邮袋明天还会装进新信；小暖也会在，带着自己的步子，一起出门。',
        signature: '故事可以先合上。朋友之间，还有下一封信。' },
    ],
  },
];

export type StoryProgress = Pick<CampaignState, 'stageResults'> | null | undefined;
export interface StoryLibraryEntry {
  id: StoryId; title: string; chapter: number | null; unlockAfterStage: number;
  pageCount: number; unlocked: boolean; recipient: string | null;
}

export function getStory(id: unknown): StoryDef | undefined {
  return typeof id === 'string' ? STORIES.find(story => story.id === id) : undefined;
}

/** Derive access from the consecutive completed route, never a cached unlock counter. */
export function getStoryProgressStage(campaign: StoryProgress): number {
  const records = campaign?.stageResults;
  if (!records || typeof records !== 'object' || Array.isArray(records)) return 0;
  let completed = 0;
  while (completed < 50) {
    const stars = records[completed + 1]?.stars;
    if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 3) break;
    completed++;
  }
  return completed;
}

export function isStoryUnlocked(id: unknown, campaign: StoryProgress, postalDelivered = false): boolean {
  const story = getStory(id);
  return Boolean(story && (story.unlockAfterStage <= getStoryProgressStage(campaign)
    || (story.id === 'letter-forest' && postalDelivered === true)));
}

export function getStoryLibrary(campaign: StoryProgress, postalDelivered = false): StoryLibraryEntry[] {
  const completed = getStoryProgressStage(campaign);
  return STORIES.map(story => ({ id: story.id, title: story.title, chapter: story.chapter,
    unlockAfterStage: story.unlockAfterStage, pageCount: story.pages.length,
    unlocked: story.unlockAfterStage <= completed || (story.id === 'letter-forest' && postalDelivered === true), recipient: story.recipient }));
}

export function getStoryForChapter(chapter: number): StoryDef | undefined {
  return STORIES.find(story => story.chapter === chapter);
}

/** Event suggestions only. StoryScene still checks the saved route before opening. */
export function getStoriesForCompletedStage(stageId: number): StoryDef[] {
  return STORIES.filter(story => story.unlockAfterStage > 0 && story.unlockAfterStage === stageId);
}

export type StoryReturnScene = 'MenuScene' | 'CampaignScene' | 'LoadoutScene' | 'WorkshopScene' | 'LetterBookScene' | 'DeliveryScene';
export interface StoryReturnRoute {
  scene: StoryReturnScene;
  data: Record<string, string | number>;
}
export interface StoryRequest {
  storyId: StoryId;
  returnTo: StoryReturnRoute;
  fallback: 'unknown-story' | 'locked-story' | null;
}

const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** No combat/result routes: revisiting a book must not award a run or resume an unsafe snapshot. */
export function sanitizeStoryReturnRoute(input: unknown): StoryReturnRoute {
  const raw = object(input);
  if (!raw || typeof raw.scene !== 'string' || !['MenuScene', 'CampaignScene', 'LoadoutScene', 'WorkshopScene', 'LetterBookScene', 'DeliveryScene'].includes(raw.scene)) {
    return { scene: 'MenuScene', data: {} };
  }
  const scene = raw.scene as StoryReturnScene;
  const source = object(raw.data) ?? {};
  const data: StoryReturnRoute['data'] = {};
  if (scene === 'CampaignScene') {
    if (integer(source.stageId, 1, 50)) data.stageId = source.stageId;
    // A selected stage owns its chapter; reject contradictory routing hints.
    else if (integer(source.chapter, 1, 5)) data.chapter = source.chapter;
  } else if (scene === 'LoadoutScene') {
    if (typeof source.mode === 'string' && ['campaign', 'endless', 'shadow'].includes(source.mode)) data.mode = source.mode;
    if (integer(source.stageId, 1, 50)) data.stageId = source.stageId;
    if (integer(source.trialTier, 1, 5)) data.trialTier = source.trialTier;
    if (typeof source.operativeId === 'string' && ['ranger', 'gunner', 'warden', 'engineer'].includes(source.operativeId)) data.operativeId = source.operativeId;
  }
  return { scene, data };
}

export function resolveStoryRequest(input: unknown, campaign: StoryProgress, postalDelivered = false): StoryRequest {
  const raw = object(input);
  const story = getStory(raw?.storyId);
  const unlocked = story && isStoryUnlocked(story.id, campaign, postalDelivered);
  return {
    storyId: unlocked ? story.id : 'prologue',
    returnTo: sanitizeStoryReturnRoute(raw?.returnTo),
    fallback: !story ? 'unknown-story' : unlocked ? null : 'locked-story',
  };
}

/** Bounded paging is shared by mouse and keyboard. The final next action exits the book. */
export function turnStoryPage(pageCount: number, current: number, action: 'previous' | 'next' | 'restart'):
  { index: number; finished: boolean } {
  const count = integer(pageCount, 1, 100) ? pageCount : 1;
  const index = typeof current === 'number' && Number.isFinite(current) ? Math.max(0, Math.min(count - 1, Math.floor(current))) : 0;
  if (action === 'restart') return { index: 0, finished: false };
  if (action === 'previous') return { index: Math.max(0, index - 1), finished: false };
  return { index: Math.min(count - 1, index + 1), finished: index === count - 1 };
}
