/* ============================================================
 * 向克苏鲁许愿 · game2.0 占卜流程
 * 问卜面板 → 【亲手摇签】仪式 → 六十四签签卡解读
 *
 * 2.0 变更（仅 UI 交互方向）：
 *   1. 心情系统补全：阴翳六 + 微光四，且心情真正驱动解读语料
 *      （1.5 缺陷：currentMood 从未参与结果生成，结果只按 lot.theme 取料）
 *   2. 摇签从「看动画」变为「亲手摇」：按住晃动蓄力，能量满则签出
 *   3. 反馈层：Web Audio 音效、心情色联动场景、首访引导、快捷键
 * 2.5.7 变更：
 *   1. 每签带 2~3 个心情标签（lot.moods）：你选的心情会决定签池，
 *      只会抽到与此刻心情共鸣的签；签卡上也会显示这三个标签
 *   2. 微光新增「勇气 / 释然」，心情扩为 阴翳六 + 微光六
 * 依赖：lots.js（LOTS / VERDICTS / SAN_RANGE）
 *       audio.js（window.__audio）、main.js（window.__ritual）
 * ============================================================ */

/* ============ 心情语料库（阴翳六 + 微光六） ============ */
const MOODS = {
  /* ---------- 心有阴翳 ---------- */
  lost: {
    name: '迷茫', group: 'shade', color: '#9d7bff',
    empathy: [
      '你不是没有方向。你是站在太多方向的中间，而没有一个方向向你保证过结果。',
      '你反复问「我该往哪走」，其实你怕的不是走错，是走了之后没有人告诉你那是对的。',
      '迷茫不是缺陷。它是你还没愿意用一个假的答案，把自己糊弄过去。'
    ],
    abyss: [
      '深渊不指引方向。它只是深，深到任何方向都显得一样。克苏鲁在梦里翻身，整片海就换了形状——可它从未想过要告诉你该去哪。',
      '群星并不为你排列。它们只是燃烧、坍缩、沉默。你把它们连成线，是因为你不肯承认天空本来没有图。',
      '旧日从不解答。它存在的全部意义，就是提醒你：宇宙没有义务给你一个意义。'
    ],
    rebirth: [
      '但你可以选一个方向，然后让它变成对的。方向不是被找到的，是被走出来的。',
      '承认没有答案之后，你才第一次真正拥有了选择权——因为没有哪个选择是「命中注定」的，所以你选的每一个都算数。',
      '向死而生不是找到路，是明知没有终点，仍然抬脚。'
    ],
    actions: [
      '今天只做一件小事：写下三个选项，划掉那个你最怕别人失望的。剩下的两个里，随便选一个，走三天。',
      '给自己七天，不许问「这是不是对的」。七天后再说。',
      '找一个安静的地方，把问题说出口。不用有人听，说出口就够了。'
    ]
  },
  tired: {
    name: '疲惫', group: 'shade', color: '#7f8fc9',
    empathy: [
      '你已经走了很久，久到忘了当初为什么出发。',
      '你不是不想努力。你是不知道这些努力最后会被谁记住。',
      '撑住这件事本身，就已经很费力了。'
    ],
    abyss: [
      '克苏鲁睡了亿万年，从不觉得这是浪费。它不生产，不进步，不打卡，只是存在着。存在本身就够了。',
      '宇宙的尽头是热寂。所有恒星都会熄灭，所有努力都会被抹平。这不是悲观，这是事实——而事实不欠你一个安慰。',
      '深渊不会夸你坚强，也不会怪你软弱。它只是在那里。'
    ],
    rebirth: [
      '正因为一切终将归零，此刻的疲惫才是真的。你不是在为一个永恒的结果受苦，你是在过一个只属于你的、有限的过程。',
      '停下来不是投降。是在无意义的海里，给自己抛下一个锚。',
      '你不需要一个宇宙级的理由才能休息。你是有限的，这本身就是休息的理由。'
    ],
    actions: [
      '今晚做一件不需要向任何人解释的事。不为效率，不为成长，只为你想做。',
      '把明天的待办划掉一半。不是偷懒，是承认你是有限的存在。',
      '给自己煮点热的，然后早点睡。深渊不会因此塌陷。'
    ]
  },
  lonely: {
    name: '孤独', group: 'shade', color: '#6fb6cf',
    empathy: [
      '最难受的不是没有人陪，是你在人群里也没被看见。',
      '你发的消息没人回，你就开始怀疑自己是不是不值得被回应。',
      '孤独是一种很安静的疼，别人看不出来，你自己也常常不敢承认。'
    ],
    abyss: [
      '克苏鲁是宇宙里最孤独的存在。它一醒，所有人就疯了。所以它选择睡。有时候不被理解，是因为你太大了，或者只是太不一样了。',
      '星与星之间隔着几十光年。它们从不拥抱，只是互相照着。那也算一种陪伴。',
      '深渊里没有回声。但你在那里待久了，会听见自己的声音变得清楚。'
    ],
    rebirth: [
      '你无法被完全理解，这是所有人的宿命。但你可以选择把一部分自己交出去——这是冒险，也是唯一的连接方式。',
      '孤独不是要被消灭的东西。它是你确认「我存在」的方式。会疼，说明你还在。',
      '被理解是运气，去表达是选择。前者你控制不了，后者你可以。'
    ],
    actions: [
      '给一个你想起、但很久没联系的人发一句话。不用等回复，发出去本身就是连接。',
      '去一个有人但不认识你的地方待一会儿：咖啡馆、图书馆、江边。存在感有时候不需要靠交流。',
      '写下三件今天让你觉得「还行」的小事。哪怕只是水是热的。'
    ]
  },
  fear: {
    name: '恐惧', group: 'shade', color: '#6a7fd8',
    empathy: [
      '你怕的不是那件事，是那件事之后，你不再是现在的你。',
      '你在深夜里反复预演最坏的结果，好像这样就能提前承受一遍。',
      '恐惧是身体在提醒你：你在乎。'
    ],
    abyss: [
      '旧日支配者不可名状，因为你一看它，你的认知框架就碎了。你现在的恐惧也一样——它之所以巨大，是因为你还没看清它。看清之后，它会变小。',
      '深渊不怕黑。它本身就是黑。你走进去了，才发现里面没有怪物，只有你自己。',
      '宇宙里最可怕的东西，从来不会在意你。你在怕的那个东西，多半也懒得看你。'
    ],
    rebirth: [
      '恐惧的对面不是勇敢，是承认。承认你怕，然后照样走。',
      '你无法控制会发生什么，但你永远可以控制「面对它的姿势」。这是存在主义唯一允许的确定。',
      '把最坏的结果写下来，看着它。你会发现它没有你想象中那么无法承受。人比自己想的耐活。'
    ],
    actions: [
      '拿一张纸，写下你最怕的那件事。然后写：如果它发生了，我会怎么办。写完就收起来。',
      '把大事拆成今天能做的最小一步，只做那一步。',
      '深呼吸四次，每次比上一次长。身体先安静，脑子才跟得上。'
    ]
  },
  angry: {
    name: '愤怒', group: 'shade', color: '#e07856',
    empathy: [
      '你不是脾气差，你是被消耗得太久了。',
      '你的愤怒是有道理的，只是没有人愿意承认这一点。',
      '生气不丢人。把它压下去才伤自己。'
    ],
    abyss: [
      '拉莱耶升起的时候，海水不会问它该不该。有些力量本来就不需要许可。',
      '宇宙不在乎你公不公平。它既不公平，也不不公平，它只是不参与。',
      '旧日不道歉。它只是存在，然后让所有试图理解它的人崩溃。你不必变成它。'
    ],
    rebirth: [
      '愤怒是一种能量，问题是往哪放。它可以毁掉你，也可以变成你划的边界。',
      '你不需要赢过谁，你只需要不再允许那件事发生第二次。',
      '把火用来点亮边界，而不是烧掉自己。前者是选择，后者只是消耗。'
    ],
    actions: [
      '写一封不发的信，把所有想说的写出来。写完删掉或者撕掉。',
      '今天先不解决，去走一段路，走到心跳平下来。',
      '想清楚你要的是道歉、改变、还是离开。选一个，然后只做那个。'
    ]
  },
  hollow: {
    name: '空洞', group: 'shade', color: '#9d95b0',
    empathy: [
      '不是难过，也不是开心。是感觉自己隔着一层玻璃在生活。',
      '你对什么都提不起兴趣，然后又因为提不起兴趣而更讨厌自己。',
      '这不是矫情。这是一种很真实的空。'
    ],
    abyss: [
      '阿撒托斯没有意志，没有目的，只是盲目地存在。宇宙本质上是空的，你的空，只是和它同频了一小会儿。',
      '虚无不是敌人。它是底色。所有颜色都得画在它上面。',
      '深渊之所以是深渊，不是因为它装了什么，而是因为它什么都没装。空，本身就是一种容量。'
    ],
    rebirth: [
      '意义不是被发现的，是被制造的。你先动，感觉才会跟上来。',
      '不要等热情回来才去做事。做点小事，热情常常是跟在行动后面的。',
      '存在先于本质。你先存在着，然后才决定自己是什么。这个顺序不能反。'
    ],
    actions: [
      '今天做一件身体上的事：走路、洗澡、晒太阳。先照顾身体，情绪会慢半拍跟上。',
      '选一件十五分钟能做完的小事，做完它。不要让一天完全空着。',
      '如果这种空持续很久，去看看医生。这不是软弱，是清醒。'
    ]
  },

  /* ---------- 心有微光（2.0 新增） ---------- */
  joy: {
    name: '欢喜', group: 'light', color: '#f0b45c',
    empathy: [
      '你有好事发生了。别压着，高兴是可以出声的。',
      '这一刻的亮，是你从很深的日子里捞上来的。',
      '你不习惯开心太久，总怕惊动什么。放心，此刻没有人来收走它。'
    ],
    abyss: [
      '宇宙不提供奖励机制。所以你的欢喜没有来历、没有批文，是完全的私酿——也因此完全属于你。',
      '恒星燃烧不需要观众。你高兴的时候，和恒星是同类。',
      '深渊从不庆祝，所以它永远是深渊。你会庆祝，这是你和它之间最体面的距离。'
    ],
    rebirth: [
      '让高兴充分地发生。别折算成「也就那样」，别提前排练失去。',
      '快乐不会稀释深刻。一个能笑的人，悲伤起来才更有分量。',
      '记住此刻身体的姿势：肩是松的，气是满的。这份肌肉记忆，以后救得了你。'
    ],
    actions: [
      '把这件好事讲给一个人听。分享不会分走它，会把它变成双份。',
      '给今天留个证物：一张照片、一张票根、一句写在备忘录里的话。',
      '趁这股劲做一件平时不敢的小事。高兴时的胆子是借来的，免息。'
    ]
  },
  calm: {
    name: '平和', group: 'light', color: '#8fd0a8',
    empathy: [
      '你没有非要解决什么。这样的时刻不常有，值得被多看一眼。',
      '平静不是空白，是你和世界暂时停了火。',
      '此刻的你像无风的海。不是没有深度，是深度不需要证明。'
    ],
    abyss: [
      '深渊的大部分时间也是静的。它不靠咆哮证明自己在那里。',
      '群星不争吵，潮汐不邀功。宇宙的常态不是戏剧，是运行。',
      '在深海底层，没有光也没有风暴，水只是缓缓地流。那样的地方，已经存在了四十亿年。'
    ],
    rebirth: [
      '平静不是故事的空白页，是你终于读到了写自己的那页。',
      '不必给这份安静找用途。它不生产什么，它就是你。',
      '能安静下来，说明你已经从某些战场上撤了下来。这本身就是凯旋。'
    ],
    actions: [
      '今天不安排任何「提升」。发呆、散步、看云，都算数。',
      '把这份平静存档：睡前写三行此刻的感受，留给以后兵荒马乱的自己。',
      '做一顿不赶时间的饭，细嚼慢咽。平静需要被身体记住。'
    ]
  },
  hope: {
    name: '期待', group: 'light', color: '#e8d078',
    empathy: [
      '你心里挂着一件还没发生的事，像窗台在等一封信。',
      '期待是甜的，也是悬着的。那个画面，你已经在心里过了很多遍。',
      '你在等一个回声。这说明，你已经先喊出了一嗓子。'
    ],
    abyss: [
      '群星不回应期待，但它们确实在移动。你等的那个变化，可能已经在路上。',
      '你此刻看到的星光，都是很久以前出发的。等待在宇宙里，是一种正经状态。',
      '旧日支配者沉睡，不是放弃苏醒，是时辰未到。'
    ],
    rebirth: [
      '期待本身就值得尊敬：它意味着你相信，未来会比现在多一点什么。',
      '把期待的事拆成两半：你能做的那半，今天就做；天意的那半，交给天意。',
      '等待不是空转。你是在给一件好事，提前腾出位置。'
    ],
    actions: [
      '为期待的事做个小小的实物准备：收好桌面、列个清单、买一件用得上的东西。',
      '给它设一个「不查岗」时段：每天有一段故意不想它，让它自己发酵。',
      '写下「如果成了，我先做什么」。给好消息一条能走进来的路。'
    ]
  },
  gratitude: {
    name: '感念', group: 'light', color: '#e8a0b8',
    empathy: [
      '有什么人，或什么事，接住了你。你想把这份暖意说出口。',
      '感激是一种清醒的温柔：你知道得到过什么，也知道那并非理所当然。',
      '你心里存着一份「幸好」。幸好那天，幸好那个人在。'
    ],
    abyss: [
      '宇宙不施恩。所以每一份好意都来自具体的、有限的存在——这让它比神恩更重。',
      '星光照到你是物理，有人照亮你是选择。深渊分得清这两者的区别。',
      '在冷漠的深空里，「被接住」是极小概率事件。你手里正握着一个。'
    ],
    rebirth: [
      '感激最好的去处不是收藏，是传递。找个人，把暖意转手。',
      '承认「我受过恩惠」不丢人。这不削弱你，恰恰证明你活着、并且连着。',
      '把感激说具体。不说「谢谢有你」，说「那天你做了什么，我一直记得」。'
    ],
    actions: [
      '今天就把谢谢说出口，别等合适的时机——此刻就是。',
      '做一件匿名的小事：帮一个不会知道是你的人。让好意继续流动。',
      '写下三件此刻感激的事，存好。低落的日子，这是你的火种清单。'
    ]
  },
  courage: {
    name: '勇气', group: 'light', color: '#e0894a',
    empathy: [
      '你不是不怕。你是怕着，还愿意往前挪一步。',
      '勇气不是心里的火，是手心的汗——你攥着它，却还是伸了出去。',
      '你已经把最坏的结果在心里演过一遍了。还留在这里，本身就是答案。'
    ],
    abyss: [
      '深渊不奖励勇敢。它只是看着，看你在没有回音的地方，还走不走下一步。',
      '克苏鲁醒来时，没有谁因恐惧而伟大；但每次潮水退去，总有人重新站上礁石。',
      '群星不为勇者让路。它们是黑暗里先亮起来的那几颗，好让你知道路不止脚下这一寸。'
    ],
    rebirth: [
      '勇气不是把恐惧消灭掉，是让恐惧坐副驾，方向盘还在你手里。',
      '你不需要等到不怕了再出发。怕着出发的人，才是一路把路照亮的人。',
      '旧日不可战胜，但你可以选择以什么姿势站在它面前。那就是勇气全部的定义。'
    ],
    actions: [
      '把最怕的那件事拆出最小的一步，今天只做这一步。做完就收工。',
      '写下你害怕的那个结果，再写下「如果它真的发生，我会怎么做」。恐惧一旦具体，就小了一半。',
      '找一个人说出你的怕。被听见的恐惧，会分走一部分重量。'
    ]
  },
  relief: {
    name: '释然', group: 'light', color: '#7cc7b4',
    empathy: [
      '你不是不在乎了。你是终于允许有些事，不必由你来结局。',
      '那些反复想不通的事，有天忽然就不想了——不是想通了，是手松开了。',
      '你累了很久，今天终于肯把「必须有个答案」这件事，放下。'
    ],
    abyss: [
      '深渊从不解释。它收下所有说不出口的事，然后继续沉默——原来有些重量，沉默也接得住。',
      '潮水退去时带走了沙上的字。不是字不重要，是海觉得该翻页了。',
      '旧日会醒来，也会重新睡去。没有哪种执念，能比宇宙的呼吸更长。'
    ],
    rebirth: [
      '放下不是认输，是你终于舍得把力气，从已经结束的事里收回来。',
      '你不用为「早该释怀」而自责。有些结松开的时辰，本来就不归你定。',
      '释然不是空白，是腾出来的那双手——现在你可以拿新的东西了。'
    ],
    actions: [
      '写一句「这件事到此为止」，不必给别人看，写完撕掉也好。',
      '今天绕开那个反复回放的旧场景：换条路走，换家店坐。',
      '对自己说一次「我已经尽力了」。不是安慰，是结案。'
    ]
  }
};

const MOOD_GROUPS = [
  { key: 'shade', label: '心 有 阴 翳', order: ['lost', 'tired', 'lonely', 'fear', 'angry', 'hollow'] },
  { key: 'light', label: '心 有 微 光', order: ['joy', 'calm', 'hope', 'gratitude', 'courage', 'relief'] },
];

const GLYPHS = ['🜏','🜂','🜃','🜄','🜁','🜍','🜔','🜚','🝳','⚶','☍','🜛'];

/* 系统的“减少动态效果”偏好：签诗不再逐字打 */
const REDUCED_UI = !!(window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const IS_MOBILE_UI = !!(window.__device && window.__device.mobile);
const RITUAL_DOM_FPS = IS_MOBILE_UI ? 30 : 0;

/* ============ 工具 ============ */
const pick = a => a[Math.floor(Math.random() * a.length)];

/* 2.5.7：心情决定签池——只抽带该心情标签的签；同池里尽量不连抽同一签 */
function pickLotForMood(moodKey) {
  const fit = LOTS.filter((l) => Array.isArray(l.moods) && l.moods.indexOf(moodKey) >= 0);
  const base = fit.length ? fit : LOTS;
  const pool = (currentLot && base.length > 1)
    ? base.filter((l) => l.n !== currentLot.n)
    : base;
  return pick(pool.length ? pool : base);
}

const CN_D = '零一二三四五六七八九';
function cnNum(n) {
  if (n < 10) return CN_D[n];
  if (n === 10) return '十';
  if (n < 20) return '十' + CN_D[n % 10];
  const t = Math.floor(n / 10), o = n % 10;
  return CN_D[t] + '十' + (o ? CN_D[o] : '');
}

function makeSan(grade) {
  const [lo, hi] = SAN_RANGE[grade] || [30, 50];
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* 卦名 → 六爻（下→上，1 阳 0 阴）。如「水雷屯」= 坎上震下 */
const TRIG = {
  '天': [1,1,1], '乾': [1,1,1], '泽': [1,1,0], '兑': [1,1,0],
  '火': [1,0,1], '离': [1,0,1], '雷': [1,0,0], '震': [1,0,0],
  '风': [0,1,1], '巽': [0,1,1], '水': [0,1,0], '坎': [0,1,0],
  '山': [0,0,1], '艮': [0,0,1], '地': [0,0,0], '坤': [0,0,0],
};
function hexLines(name) {
  let up, lo;
  if (name[1] === '为') { up = TRIG[name[0]]; lo = TRIG[name[2]]; }
  else { up = TRIG[name[0]]; lo = TRIG[name[1]]; }
  if (!up || !lo) return null;
  return lo.concat(up);
}
function hexHtml(name) {
  const lines = hexLines(name);
  if (!lines) return '';
  const rows = lines.slice().reverse()
    .map(y => `<span class="yao ${y ? 'yang' : 'yin'}"></span>`).join('');
  return `<span class="hexagram" title="${escapeHtml(name)}">${rows}</span>`;
}

/* ============ DOM ============ */
const stageHome = document.getElementById('stage-home');
const stageRitual = document.getElementById('stage-ritual');
const stageResult = document.getElementById('stage-result');
const moodsEl = document.getElementById('moods');
const questionEl = document.getElementById('question');
const qcountEl = document.getElementById('qcount');
const askBtn = document.getElementById('ask');
const whispersEl = document.getElementById('whispers');
const tubeWrap = document.getElementById('tube-wrap');
const sticksEl = document.getElementById('sticks');
const drawnEl = document.getElementById('drawn');
const drawnCard = document.getElementById('drawn-card');
const drawnNo = document.getElementById('drawn-no');
const drawnGd = document.getElementById('drawn-gd');
const cardEl = document.getElementById('card');
const promptEl = document.getElementById('ritual-prompt');
const ringFg = document.getElementById('ring-fg');
const energyWrap = document.getElementById('energy');
const skipBtn = document.getElementById('skip-ritual');
const coachEl = document.getElementById('coach');

/* ============ 心情选择（分组 + 色彩联动） ============ */
let currentMood = 'lost';

MOOD_GROUPS.forEach((g) => {
  const wrap = document.createElement('div');
  wrap.className = 'mood-group';
  const lab = document.createElement('span');
  lab.className = 'mood-group-label';
  lab.textContent = g.label;
  const row = document.createElement('div');
  row.className = 'mood-row';
  g.order.forEach((k) => {
    const m = MOODS[k];
    const b = document.createElement('button');
    b.className = 'mood' + (k === currentMood ? ' sel' : '');
    b.style.setProperty('--c', m.color);
    b.dataset.mood = k;
    b.setAttribute('aria-pressed', k === currentMood ? 'true' : 'false');
    b.innerHTML = '<i class="dot"></i>' + m.name;
    b.onclick = () => selectMood(k);
    row.appendChild(b);
  });
  wrap.appendChild(lab);
  wrap.appendChild(row);
  moodsEl.appendChild(wrap);
});

function selectMood(k) {
  currentMood = k;
  [...moodsEl.querySelectorAll('.mood')].forEach((c) => {
    const on = c.dataset.mood === k;
    c.classList.toggle('sel', on);
    c.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const m = MOODS[k];
  document.documentElement.style.setProperty('--mood', m.color);
  if (window.__ritual && window.__ritual.setMood) window.__ritual.setMood(m.color);
  else window.__pendingMood = m.color;
  if (window.__audio) window.__audio.tick();
}
selectMood(currentMood);

/* ============ 2.6 手机端许愿抽屉（半展 / 展开 / 完全收起） ============ */
(function () {
  const homeSheet = document.getElementById('stage-home');
  const sheetToggle = document.getElementById('sheet-toggle');
  if (!homeSheet || !sheetToggle) return;
  const gripLabel = sheetToggle.querySelector('.grip-label');
  const minimizeBtn = document.getElementById('sheet-minimize');
  const reopenBtn = document.getElementById('sheet-reopen');
  const sheetMQ = window.matchMedia('(max-width: 820px), (max-height: 560px) and (pointer: coarse)');
  const mobileLayout = () => sheetMQ.matches;
  let gripTouchY = null;
  let gripSwiped = false;

  function updateSheetChrome() {
    const open = homeSheet.classList.contains('sheet-open');
    const closed = homeSheet.classList.contains('sheet-closed');
    sheetToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    sheetToggle.setAttribute('aria-label', open ? '收起许愿面板' : '展开许愿面板');
    if (gripLabel) gripLabel.textContent = open ? '收 起' : '展 开';
    if (reopenBtn) reopenBtn.classList.toggle('on', closed && mobileLayout());
  }
  function showSheet(expanded) {
    homeSheet.classList.remove('sheet-closed');
    homeSheet.classList.toggle('sheet-open', !!expanded);
    updateSheetChrome();
  }
  function hideSheet() {
    homeSheet.classList.remove('sheet-open');
    homeSheet.classList.add('sheet-closed');
    updateSheetChrome();
  }
  function toggleSheet() {
    if (homeSheet.classList.contains('sheet-closed')) showSheet(false);
    else if (homeSheet.classList.contains('sheet-open')) hideSheet();   /* 展开态点“收起”→ 完全收起 */
    else showSheet(true);
  }
  function sheetTick() {
    if (window.__audio && window.__audio.tick) window.__audio.tick();
  }

  sheetToggle.addEventListener('click', (e) => {
    e.preventDefault();
    if (gripSwiped) { gripSwiped = false; return; }
    toggleSheet();
    sheetTick();
  });

  if (minimizeBtn) {
    minimizeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideSheet();
      sheetTick();
    });
  }
  if (reopenBtn) {
    reopenBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showSheet(false);
      sheetTick();
    });
  }

  /* 触屏抽屉手感：手柄上滑展开、下滑完全收起；轻点仍走 click */
  sheetToggle.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    gripTouchY = e.touches[0].clientY;
  }, { passive: true });
  sheetToggle.addEventListener('touchend', (e) => {
    if (gripTouchY == null) return;
    const t = e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : null;
    const dy = (t ? t.clientY : gripTouchY) - gripTouchY;
    gripTouchY = null;
    if (Math.abs(dy) < 14) return;
    gripSwiped = true;
    setTimeout(() => { gripSwiped = false; }, 500);
    if (dy < 0) showSheet(true);
    else hideSheet();
    sheetTick();
  }, { passive: false });

  /* 叩问后完全收起；回到主页只剩“许愿”浮标，把画面完整让给神像 */
  askBtn.addEventListener('click', () => hideSheet());

  /* 手机端聚焦输入时自动展开，避免软键盘遮住输入区域 */
  questionEl.addEventListener('focus', () => {
    if (mobileLayout()) showSheet(true);
  });

  /* 点场景或面板外任意处：展开态直接完全收起；半展态保留，避免抢场景拖拽 */
  document.addEventListener('pointerdown', (e) => {
    if (homeSheet.classList.contains('sheet-closed')) return;
    if (homeSheet.contains(e.target)) return;
    if (homeSheet.classList.contains('sheet-open')) hideSheet();
  }, { passive: true });

  if (sheetMQ.addEventListener) sheetMQ.addEventListener('change', updateSheetChrome);
  updateSheetChrome();
})();

/* ============ 声音 ============ */
const unlockAudio = () => { if (window.__audio) window.__audio.unlock(); };
const keepAudioAlive = () => { if (window.__audio && window.__audio.resume) window.__audio.resume(); };
/* 不用 once：移动端切后台/来电后 AudioContext 会被挂起，
   下一次触摸/按键继续保活，避免「手机端音效丢失」。 */
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pageshow', keepAudioAlive);
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAudioAlive(); });

const sndBtn = document.getElementById('snd');
function syncSndBtn() {
  if (!sndBtn || !window.__audio) return;
  sndBtn.classList.toggle('muted', window.__audio.muted);
  sndBtn.setAttribute('aria-pressed', window.__audio.muted ? 'true' : 'false');
}
if (sndBtn) {
  sndBtn.onclick = () => {
    if (!window.__audio) return;
    window.__audio.unlock();
    window.__audio.setMuted(!window.__audio.muted);
    syncSndBtn();
  };
  syncSndBtn();
}

/* ============ 困惑输入 ============ */
questionEl.maxLength = 120;
questionEl.addEventListener('input', () => {
  qcountEl.textContent = questionEl.value.length + ' / 120';
});
questionEl.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    askBtn.click();
  }
});

/* ============ 所问之日（game2.5）：可向明天/后天/过去求签 ============ */
let targetDate = window.__dex ? window.__dex.todayStr() : null;
const dateLabelEl = document.getElementById('date-label');
const dateJumpEl = document.getElementById('date-jump');
const DATE_RANGE = 90;   /* 前后各九十日可问 */

function renderDateLabel() {
  if (!window.__dex || !targetDate || !dateLabelEl) return;
  dateLabelEl.innerHTML =
    '<b>' + escapeHtml(window.__dex.dateLabel(targetDate)) + '</b>' +
    '<span class="rel">' + escapeHtml(window.__dex.relLabel(targetDate)) + '</span>';
}
function setTargetDate(s) {
  if (!window.__dex) return;
  const d = window.__dex.diffFromToday(s);
  if (d > DATE_RANGE) s = window.__dex.addDays(window.__dex.todayStr(), DATE_RANGE);
  if (d < -DATE_RANGE) s = window.__dex.addDays(window.__dex.todayStr(), -DATE_RANGE);
  targetDate = s;
  renderDateLabel();
  if (window.__audio) window.__audio.tick();
}
document.getElementById('date-prev').onclick = () => setTargetDate(window.__dex.addDays(targetDate, -1));
document.getElementById('date-next').onclick = () => setTargetDate(window.__dex.addDays(targetDate, 1));
dateLabelEl.onclick = () => {
  try {
    dateJumpEl.value = targetDate;
    if (dateJumpEl.showPicker) dateJumpEl.showPicker();
    else dateJumpEl.focus();
  } catch (e) { dateJumpEl.focus(); }
};
dateJumpEl.addEventListener('change', () => { if (dateJumpEl.value) setTargetDate(dateJumpEl.value); });
renderDateLabel();

/* ============ 筒内签枝（示意 21 支） ============ */
(function buildSticks() {
  for (let i = 0; i < 21; i++) {
    const s = document.createElement('div');
    s.className = 'stick';
    const x = (i / 20 - 0.5) * 108;
    const rot = (i / 20 - 0.5) * 26;
    const h = 138 + Math.sin(i * 1.7) * 10;
    s.style.left = `calc(50% + ${x.toFixed(1)}px - 2.5px)`;
    s.style.height = `${h.toFixed(0)}px`;
    s.style.transform = `rotate(${rot.toFixed(1)}deg)`;
    s.style.opacity = (0.55 + Math.random() * 0.45).toFixed(2);
    sticksEl.appendChild(s);
  }
})();

/* ============ 交互式摇签 ============ */
const RING_R = 118;
const RING_C = 2 * Math.PI * RING_R;
ringFg.style.strokeDasharray = RING_C.toFixed(1);

let currentQuestion = '';
let currentLot = null;
let asking = false;

let ritualState = 'idle';        // idle | charging | revealing
let energy = 0;
let grabbing = false;
let pointerVel = 0;
let pointerOffsetX = 0;
let lastPX = 0, lastPY = 0;
let ritualRaf = 0;
let swayT = 0;
let idleTimer = 0;
let autoMode = false;
let energyResolve = null;

function updateRing() {
  ringFg.style.strokeDashoffset = (RING_C * (1 - energy / 100)).toFixed(1);
}
function updatePrompt(ratio) {
  if (autoMode) return;
  const t = ratio >= 0.8 ? '就 差 一 点'
    : ratio >= 0.35 ? '继续 · 签在松动'
    : '按住签筒 · 快速晃动';
  if (promptEl.textContent !== t) promptEl.textContent = t;
}
function addEnergy(v) {
  if (ritualState !== 'charging') return;
  energy = Math.min(100, energy + v);
}

function startRitualLoop() {
  cancelAnimationFrame(ritualRaf);
  let last = performance.now();
  let lastVisual = 0;
  const minVisual = RITUAL_DOM_FPS ? 1000 / RITUAL_DOM_FPS - 2 : 0;
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    swayT += dt;
    if (ritualState === 'charging') {
      if (autoMode) addEnergy(30 * dt);
      const ratio = energy / 100;
      let rot, dx = 0;
      if (grabbing) {
        rot = pointerVel * 1.1 + Math.sin(swayT * 26) * (3 + ratio * 9);
        dx = pointerOffsetX * 0.1;
      } else {
        rot = Math.sin(swayT * (2 + ratio * 22)) * (2 + ratio * 10);
      }
      pointerVel *= 0.86;
      pointerOffsetX *= 0.92;
      /* 签筒跟随每帧更新（触感优先）；能量环/文字/3D 联动在移动端仍以
         30fps 写入，避免 SVG repaint 抢主线程。 */
      tubeWrap.style.transform =
        `translate3d(calc(-50% + ${dx.toFixed(1)}px), 0, 0) rotate(${rot.toFixed(2)}deg)`;
      if (!minVisual || now - lastVisual >= minVisual) {
        lastVisual = now;
        updateRing();
        updatePrompt(ratio);
        if (window.__ritual && window.__ritual.energy) window.__ritual.energy(ratio);
      }
      if (energy >= 100 && energyResolve) {
        const r = energyResolve; energyResolve = null;
        r();
      }
    }
    ritualRaf = requestAnimationFrame(step);
  };
  ritualRaf = requestAnimationFrame(step);
}

stageRitual.addEventListener('pointerdown', (e) => {
  if (ritualState !== 'charging') return;
  if (e.target.closest('#skip-ritual')) return;   // 按钮点击不接管，否则 pointer capture 会吞掉 click
  grabbing = true;
  stageRitual.classList.add('grabbing');
  lastPX = e.clientX; lastPY = e.clientY;
  try { stageRitual.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  clearTimeout(idleTimer);   // 用户接管，不再代摇
});
stageRitual.addEventListener('pointermove', (e) => {
  if (!grabbing || ritualState !== 'charging') return;
  const dx = e.clientX - lastPX, dy = e.clientY - lastPY;
  lastPX = e.clientX; lastPY = e.clientY;
  const dist = Math.min(50, Math.abs(dx) + Math.abs(dy));
  if (dist > 2) {
    addEnergy(dist * 0.14);
    pointerVel = pointerVel * 0.7 + dx * 0.3;
    pointerOffsetX = e.clientX - window.innerWidth / 2;
    if (window.__audio) window.__audio.rustle(Math.min(1, dist / 34));
  }
});
const endGrab = () => {
  grabbing = false;
  stageRitual.classList.remove('grabbing');
};
stageRitual.addEventListener('pointerup', endGrab);
stageRitual.addEventListener('pointercancel', endGrab);

/* 旧安卓/小红书内置 WebView 可能没有 PointerEvent：补一套 Touch 摇签。
   现代浏览器走上面的 PointerEvent 分支，不会重复触发。 */
if (!window.PointerEvent) {
  stageRitual.addEventListener('touchstart', (e) => {
    if (ritualState !== 'charging') return;
    var target = e.target;
    if (target && target.closest && target.closest('#skip-ritual')) return;
    if (window.__audio) window.__audio.unlock();
    var t = e.touches[0];
    if (!t) return;
    grabbing = true;
    stageRitual.classList.add('grabbing');
    lastPX = t.clientX; lastPY = t.clientY;
    clearTimeout(idleTimer);
    e.preventDefault();
  }, { passive: false });
  stageRitual.addEventListener('touchmove', (e) => {
    if (!grabbing || ritualState !== 'charging') return;
    var t = e.touches[0];
    if (!t) return;
    var dx = t.clientX - lastPX, dy = t.clientY - lastPY;
    lastPX = t.clientX; lastPY = t.clientY;
    var dist = Math.min(50, Math.abs(dx) + Math.abs(dy));
    if (dist > 2) {
      addEnergy(dist * 0.14);
      pointerVel = pointerVel * 0.7 + dx * 0.3;
      pointerOffsetX = t.clientX - window.innerWidth / 2;
      if (window.__audio) window.__audio.rustle(Math.min(1, dist / 34));
    }
    e.preventDefault();
  }, { passive: false });
  stageRitual.addEventListener('touchend', endGrab);
  stageRitual.addEventListener('touchcancel', endGrab);
}


skipBtn.onclick = () => {
  if (ritualState !== 'charging') return;
  clearTimeout(idleTimer);
  autoMode = true;
  energy = Math.max(energy, 92);
  promptEl.textContent = '深渊亲自摇签……';
};

/* ============ 流程 ============ */
askBtn.onclick = () => {
  if (asking) return;
  currentQuestion = questionEl.value.trim() || '我不知道该往哪里走。';
  startRitual(true);
};

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    /* 2.5：先收浮层，再谈其他 */
    if (window.__dexUi && window.__dexUi.anyVeilOpen()) {
      window.__dexUi.closeTopVeil();
      return;
    }
    if (stageResult.classList.contains('on')) {
      const b = document.getElementById('back');
      if (b) b.click();
    } else if (coachEl.classList.contains('on')) {
      closeCoach();
    }
  } else if (e.code === 'Space' && ritualState === 'charging') {
    e.preventDefault();
    clearTimeout(idleTimer);
    addEnergy(7);
    if (window.__audio) window.__audio.rustle(0.5);
  }
});

async function startRitual(pushCamera) {
  asking = true;
  document.body.classList.add('ritual-mode');
  stageResult.classList.remove('on');

  // 抽签（结果先定，仪式后揭）：签池由当前心情决定
  currentLot = pickLotForMood(currentMood);

  // 重置仪式 DOM
  whispersEl.innerHTML = '';
  drawnEl.classList.remove('rise');
  drawnCard.classList.remove('on');
  tubeWrap.style.transform = '';
  stageRitual.classList.add('on');

  const M = MOODS[currentMood];
  const lines = M.group === 'light'
    ? ['星轨今夜格外亮……', '深渊也愿意听好事……', '有东西在靠近……', '签，要落下来了。']
    : ['正在校准星轨……', '深渊正在翻身……', '有东西在听……', '签，要落下来了。'];
  /* 2.5：隔空问日（非今日时，首句点明所问之日） */
  if (window.__dex && targetDate && targetDate !== window.__dex.todayStr()) {
    lines[0] = '向着 ' + window.__dex.dateLabel(targetDate) +
      '（' + window.__dex.relLabel(targetDate) + '）伸手……';
  }
  lines.forEach((t, i) => {
    const p = document.createElement('p');
    p.textContent = t;
    p.style.animationDelay = (i * 0.7) + 's';
    whispersEl.appendChild(p);
  });

  // 进入「亲手摇」阶段
  energy = 0; grabbing = false; autoMode = false;
  pointerVel = 0; pointerOffsetX = 0;
  ritualState = 'charging';
  promptEl.textContent = '按住签筒 · 快速晃动';
  promptEl.classList.add('show');
  skipBtn.classList.add('show');
  energyWrap.classList.add('show');
  updateRing();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (ritualState === 'charging') {
      autoMode = true;
      promptEl.textContent = '深渊亲自摇签……';
    }
  }, 12000);
  startRitualLoop();

  const energyDone = new Promise((r) => { energyResolve = r; });
  const cam = pushCamera && window.__ritual ? window.__ritual.awaken() : Promise.resolve();

  await Promise.all([cam, energyDone]);
  await releaseAndDraw();
}

async function releaseAndDraw() {
  ritualState = 'revealing';
  clearTimeout(idleTimer);
  promptEl.classList.remove('show');
  skipBtn.classList.remove('show');
  energyWrap.classList.remove('show');
  endGrab();

  // 蓄满后的最后一荡
  const t0 = performance.now();
  const swing = (now) => {
    const k = (now - t0) / 430;
    if (k >= 1) { tubeWrap.style.transform = ''; return; }
    const a = (1 - k) * 17;
    tubeWrap.style.transform =
      `translate3d(-50%, 0, 0) rotate(${(Math.sin(k * Math.PI * 4) * a).toFixed(2)}deg)`;
    requestAnimationFrame(swing);
  };
  requestAnimationFrame(swing);
  if (window.__ritual && window.__ritual.energy) window.__ritual.energy(0);

  await sleep(380);

  // 一签出筒
  drawnEl.classList.add('rise');
  drawnNo.textContent = `第 ${cnNum(currentLot.n)} 签`;
  drawnGd.textContent = currentLot.grade;
  drawnGd.className = 'gd g-' + currentLot.grade;
  drawnCard.classList.add('on');
  if (window.__ritual) window.__ritual.flash();
  if (window.__audio) window.__audio.bell();

  await sleep(1500);
  if (window.__ritual) await window.__ritual.aside();
  if (window.__audio) window.__audio.riser();
  renderResult();

  cancelAnimationFrame(ritualRaf);
  ritualState = 'idle';
  asking = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function renderResult() {
  const lot = currentLot;
  const M = MOODS[currentMood];           // 2.0：解读由「你选的心情」驱动
  const glyph = GLYPHS[(lot.n * 7 + 3) % GLYPHS.length];
  const verdict = pick(VERDICTS[lot.grade]);
  const empathy = pick(M.empathy);
  const abyss = pick(M.abyss);
  const rebirth = pick(M.rebirth);
  const action = pick(M.actions);
  const san = makeSan(lot.grade);

  /* 2.5.7：签卡显示这签共鸣的三个心情；当前所问心情高亮 */
  const moodTagsHtml = (lot.moods || []).map((k) => {
    const mm = MOODS[k];
    if (!mm) return '';
    return `<span class="ltag${k === currentMood ? ' on' : ''}" style="--c:${mm.color}">${mm.name}</span>`;
  }).join('');

  /* ===== 2.5：签入曜方（时间×次数两个维度在此交汇） ===== */
  let rec = null;
  let cubeNoteHtml = '';
  if (window.__dex && targetDate) {
    rec = window.__dex.recordDraw({
      lot, moodKey: currentMood, question: currentQuestion, targetDate,
      card: { verdict, empathy, abyss, rebirth, action, san },
    });
    const cm = window.__dex.BY_KEY[rec.cubeKey];
    if (rec.isNewCube) {
      cubeNoteHtml += '<div style="margin:26px 0 4px;font-size:12px;letter-spacing:.3em;color:#f0d8a0;text-shadow:0 0 18px rgba(240,216,160,.5),var(--sh)">✦ ' +
        escapeHtml(cm.name) + '方 坠入祭坛 · 曜列新添</div>';
    } else {
      cubeNoteHtml += '<div style="margin:26px 0 4px;font-size:11px;letter-spacing:.26em;color:var(--dim);text-shadow:var(--sh)">' +
        escapeHtml(cm.name) + '方 · 第 ' + rec.countForCube + ' 次收录</div>';
    }
    if (rec.gemDropped) {
      cubeNoteHtml += '<div style="margin:8px 0 4px;font-size:12px;letter-spacing:.3em;color:#f0d8a0;text-shadow:0 0 22px rgba(240,216,160,.65),var(--sh)">✦✦ 深渊的私藏 · 星宝石 随签而落</div>';
    }
    window.__dex.refreshStats();
  }
  const dateLine = (window.__dex && targetDate)
    ? '<div class="question-line">所问之日：<em>' +
      escapeHtml(window.__dex.dateLabel(targetDate)) +
      '（' + escapeHtml(window.__dex.relLabel(targetDate)) + '）</em></div>'
    : '';

  cardEl.innerHTML = `
    <div class="head">
      <span class="lot-no">第 ${cnNum(lot.n)} 签 · 六十四签</span>
      <span class="grade-pill g-${lot.grade}">${lot.grade}</span>
    </div>
    <div class="hex-name">${lot.name}${hexHtml(lot.name)}</div>
    <div class="glyph">${glyph}</div>
    <div class="question-line">你问：<em>${escapeHtml(currentQuestion)}</em>（${M.name}之问）</div>
    ${dateLine}
    ${moodTagsHtml ? `<div class="lot-tags"><span class="lt-cap">签 心 相 应</span>${moodTagsHtml}</div>` : ''}

    <div class="poem" id="poem" title="点击可直接显示全诗"></div>

    <div class="block verdict" style="animation-delay:.2s"><h3>断 曰</h3><p>${verdict}</p></div>
    <div class="block" style="animation-delay:.45s"><h3>回 响</h3><p>${empathy}</p></div>
    <div class="block" style="animation-delay:.7s"><h3>深 渊</h3><p>${abyss}</p></div>
    <div class="block" style="animation-delay:.95s"><h3>向 死 而 生</h3><p>${rebirth}</p></div>
    <div class="block act" style="animation-delay:1.2s"><h3>指 引</h3><p>${action}</p></div>

    <div class="san">理 智 消 耗 <b>−${san}</b></div>
    ${cubeNoteHtml}

    <div class="again-date-row">
      <span class="ad-cap">再 问 之 日</span>
      <button class="date-step" id="again-prev" aria-label="前一天">‹</button>
      <button class="date-label" id="again-label" title="点开择日"></button>
      <button class="date-step" id="again-next" aria-label="后一天">›</button>
      <input type="date" id="again-jump" aria-label="选择日期">
    </div>

    <div class="btns">
      <button class="primary" id="again">再 求 一 签</button>
      <button id="copy">抄 录 谶 言</button>
      <button id="back">回 到 神 像 前</button>
    </div>
  `;

  /* ===== 2.5：3D 侧——新方坠落 / 旧方脉动 / 宝石降临 ===== */
  if (rec && window.__cubes) {
    if (rec.isNewCube) window.__cubes.spawn(rec.cubeKey, { fanfare: true });
    else window.__cubes.pulse(rec.cubeKey, M.color);
    if (rec.gemDropped) {
      window.__cubes.spawn('gem', { fanfare: true });
      if (window.__audio && window.__audio.shimmer) window.__audio.shimmer();
    }
    if (rec.isNewCube && window.__dex.stats().cubes === 1) {
      showToast('曜方已入列 · 拖动可堆叠 点按可翻阅');
    } else if (rec.gemDropped) {
      showToast('星宝石 · 曜外之石');
    }
  }

  stageRitual.classList.remove('on');
  stageResult.classList.add('on');
  stageResult.scrollTop = 0;

  requestAnimationFrame(() => typePoem(lot.poem));

  /* 2.5.1：结果页择日续问——不再锁死当天，可 ±90 天另择再问 */
  const againLabelEl = document.getElementById('again-label');
  const againJumpEl = document.getElementById('again-jump');
  const renderAgainDate = () => {
    if (window.__dex && targetDate && againLabelEl) {
      againLabelEl.innerHTML =
        '<b>' + escapeHtml(window.__dex.dateLabel(targetDate)) + '</b>' +
        '<span class="rel">' + escapeHtml(window.__dex.relLabel(targetDate)) + '</span>';
    }
  };
  renderAgainDate();
  document.getElementById('again-prev').onclick = () => { setTargetDate(window.__dex.addDays(targetDate, -1)); renderAgainDate(); };
  document.getElementById('again-next').onclick = () => { setTargetDate(window.__dex.addDays(targetDate, 1)); renderAgainDate(); };
  againLabelEl.onclick = () => {
    try {
      againJumpEl.value = targetDate;
      if (againJumpEl.showPicker) againJumpEl.showPicker();
      else againJumpEl.focus();
    } catch (e) { againJumpEl.focus(); }
  };
  againJumpEl.addEventListener('change', () => {
    if (againJumpEl.value) { setTargetDate(againJumpEl.value); renderAgainDate(); }
  });

  document.getElementById('again').onclick = () => { if (!asking) startRitual(false); };
  document.getElementById('back').onclick = () => {
    stageResult.classList.remove('on');
    document.body.classList.remove('ritual-mode');
    if (window.__ritual) {
      window.__ritual.calm().then(() => {
        /* 2.5：已有曜方时，回到祭坛顺势俯看积木阵 */
        if (window.__cubes && window.__cubes.count() > 0 && window.__ritual.toGarden) {
          window.__ritual.toGarden();
        }
      });
    }
  };
  document.getElementById('copy').onclick = () => {
    const dateInfo = (window.__dex && targetDate)
      ? '\n所问之日：' + window.__dex.dateLabel(targetDate) + '（' + window.__dex.relLabel(targetDate) + '）'
      : '';
    const tagNames = (lot.moods || []).map((k) => (MOODS[k] ? MOODS[k].name : k)).join(' · ');
    const txt = `《向克苏鲁许愿 · 六十四签》\n\n第${cnNum(lot.n)}签 ${lot.name} 【${lot.grade}】 ${glyph}\n你所问的：${currentQuestion}（${M.name}之问）${dateInfo}\n共鸣心境：${tagNames}\n\n${lot.poem.join('\n')}\n\n【断曰】${verdict}\n【回响】${empathy}\n【深渊】${abyss}\n【向死而生】${rebirth}\n【指引】${action}\n\n理智消耗 −${san}`;
    navigator.clipboard.writeText(txt).then(() => {
      showToast('已 抄 录');
    }).catch(() => {});
  };
}

/* 通用吐司（2.5 也用它报喜） */
let toastTimer = 0;
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
}

/* 2.5.1 触屏花园模式：没有 hover，面板常暗淡但控件始终可点；
   轻点面板空白处切换 .peek 全亮，点画布（转视角/拖方块）自动收起 */
if (window.__device && window.__device.touch) {
  const sh = document.getElementById('stage-home');
  if (sh) {
    sh.addEventListener('pointerdown', (e) => {
      if (!document.body.classList.contains('garden-mode')) return;
      if (e.target.closest('button,textarea,input')) return;
      sh.classList.toggle('peek');
    });
    document.addEventListener('pointerdown', (e) => {
      if (!sh.contains(e.target)) sh.classList.remove('peek');
    });
  }
}

/* 2.5.3 花园模式显式退出：桌面/触屏通用，修「求签后回不到主页」 */
(function () {
  const el = document.getElementById('exit-garden');
  if (!el) return;
  el.onclick = () => {
    document.body.classList.remove('garden-mode');
    const sh = document.getElementById('stage-home');
    if (sh) sh.classList.remove('peek');
    if (window.__ritual && window.__ritual.calm) window.__ritual.calm();
    if (window.__audio && window.__audio.tick) window.__audio.tick();
  };
})();

/* 打字机签诗（点击诗行可直接显示全文） */
function typePoem(lines) {
  const el = document.getElementById('poem');
  if (!el) return;
  el.innerHTML = '';
  const text = lines.join('\n');
  if (REDUCED_UI) {   /* 减少动态效果：直接给全文，不逐字打 */
    el.textContent = text;
    return;
  }
  let i = 0;
  let done = false;
  const timers = [];
  const textNode = document.createTextNode('');
  const cur = document.createElement('span');
  cur.className = 'cursor';
  cur.textContent = '▌';

  function finish() {
    if (done) return;
    done = true;
    timers.forEach(clearTimeout);
    cur.remove();
    textNode.data = text;
    el.onclick = null;
  }
  el.onclick = finish;

  function step() {
    if (done) return;
    if (i >= text.length) { finish(); return; }
    const ch = text[i++];
    textNode.data = text.slice(0, i);
    timers.push(setTimeout(step, ch === '\n' ? 300 : 90));
  }
  el.appendChild(textNode);
  el.appendChild(cur);
  step();
}

/* ============ 首访引导 ============ */
let coachSeen = false;
try { coachSeen = localStorage.getItem('cth_coach') === '1'; } catch (e) { /* ignore */ }
function closeCoach() {
  coachEl.classList.remove('on');
  try { localStorage.setItem('cth_coach', '1'); } catch (e) { /* ignore */ }
}
document.getElementById('coach-ok').onclick = closeCoach;
coachEl.addEventListener('click', (e) => { if (e.target === coachEl) closeCoach(); });
document.getElementById('help').onclick = () => coachEl.classList.add('on');

/* 场景 ready 时由 main.js 立即广播：不用等 readyPoll 轮询，
   回归脚本和移动端首访都能稳定看到引导层。 */
function showCoachIfNeeded() {
  if (!coachSeen && window.__ready) coachEl.classList.add('on');
}
window.addEventListener('cth-ready', showCoachIfNeeded);

const readyPoll = setInterval(() => {
  if (window.__ready) {
    clearInterval(readyPoll);
    showCoachIfNeeded();
  }
}, 300);
