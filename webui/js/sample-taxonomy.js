/* ==========================================================================
   研究样本的两轴分类（ADR-0028）

   两条**正交**的轴，各自单值互斥：

     表现媒介（medium）  怎么画 —— 写实 / 二次元 / 插画 / 3D / 平面 / 抽象 / 未声明
     画面主体（subject） 画什么 —— 人像 / 动物 / 静物食物 / 建筑室内 / 自然风景 / 科幻奇幻 / 未判定

   为什么不是树：用户举的例子「写实、二次元下面都有人像」本质是矩阵的两个格子，
   不是父子分支。做成树（选了写实才展开人像）就无法一次看「所有人像（不分媒介）」，
   而那正是筛选要回答的问题。

   ## 分类从哪来

   规则推算，**不是人工标注**。数据里没有任何内容标签字段（detail 见 ADR-0028），
   只能从已有文本推：拆解出的 tags / segments / summary 与原始 prompt。

   判定顺序固定为三层，前一层命中就不再往下：

     medium  : tags.style  →  summary  →  全部段落 + prompt
     subject : 主体段（第 1 段） →  summary  →  全部段落 + prompt

   层次内按档位表顺序取第一个命中 —— 顺序即优先级，故档位表是有意排序的。

   ## 为什么未声明 / 未判定要独立成档

   默认归入写实会把推断写成事实，且一旦「写实 65%」进了研究结论就纠不回来；
   不设这一档则会让「写实」永远少几百条而用户不知道它们去哪了。
   「没有结论」和「有结论但不确定」必须分开显示 —— 与拆解来源分三档同一条原则。

   ## 为什么运行时现算而不烘焙

   与 job-key.js / phrase-index.js 同一取舍：规则词表会反复调，烘焙进 3 MB 产物
   会让「改一条正则」变成「重建生成物」。缓存用 WeakMap（按作业对象），
   视图首渲算一次即可；首页计数不调用本模块，避免重演 viewCount 白付 690ms 的事故。
   ========================================================================== */

const SAMPLE_TAXONOMY = (() => {
  /** 分类来源。将来换成 LLM 打标时把这里改成 'llm' 并给每档带置信度。 */
  const SOURCE = 'rule';

  /* ── 档位表 ─────────────────────────────────────────────────────────
     value 进 URL 与导出（ASCII、稳定，不随改名漂移）；
     label 只用于界面显示。顺序 = 优先级 = 界面选项顺序。 */

  const MEDIUMS = [
    { value: 'anime', label: '二次元 / 动漫' },
    { value: 'cg3d', label: '3D / CG' },
    { value: 'graphic', label: '平面 / 设计' },
    { value: 'abstract', label: '抽象 / 实验' },
    { value: 'illustration', label: '插画 / 绘画' },
    { value: 'realistic', label: '写实 / 摄影' },
    { value: 'undeclared', label: '未声明媒介' },
  ];

  const SUBJECTS = [
    { value: 'person', label: '人像 / 人物' },
    { value: 'animal', label: '动物' },
    { value: 'still', label: '静物 / 食物' },
    { value: 'architecture', label: '建筑 / 室内' },
    { value: 'nature', label: '自然 / 风景' },
    { value: 'scifi', label: '科幻 / 奇幻' },
    { value: 'unknown', label: '未判定主体' },
  ];

  const MEDIUM_VALUES = new Set(MEDIUMS.map((m) => m.value));
  const SUBJECT_VALUES = new Set(SUBJECTS.map((s) => s.value));

  /* ── 词表 ───────────────────────────────────────────────────────────
     每档两条：en 走正则（带词边界，避免 pain 命中 painting），
     zh 走 includes（汉字的 \b 不可靠：中文字符不是 \w，边界会误判）。

     不映射的词（刻意）：cinematic —— 它可以是实拍也可以是动画，
     只知道「电影感」不足以定媒介；让下一层去判。 */

  const MEDIUM_RULES = [
    /* ── 强信号：本身就是媒介 / 制作工艺的名词 ──────────────────────
       这些词单独出现就回答了「怎么画」，不需要别的证据。 */
    {
      value: 'anime', tier: 'strong',
      en: /\b(anime|manga|niji|cel[-\s]?shad(?:ed|ing)?|ghibli|chibi)\b/i,
      zh: ['动漫', '二次元', '漫画', '赛璐璐', '吉卜力', '动画风'],
    },
    {
      value: 'cg3d', tier: 'strong',
      en: /\b(3d|three[-\s]dimensional|cgi|cg|octane|blender|unreal\s+engine|voxel|isometric|claymation|stop[-\s]?motion)\b/i,
      zh: ['三维', '建模', '3d渲染', '渲染图', '定格动画', '黏土'],
    },
    {
      value: 'graphic', tier: 'strong',
      en: /\b(graphic\s+design|typography|typeface|logo|packaging|flat\s+design|infographic|branding|editorial\s+design)\b/i,
      zh: ['平面设计', '字体', '标志', '包装', '品牌设计'],
    },
    {
      value: 'abstract', tier: 'strong',
      en: /\b(abstract|abstraction|non[-\s]?representational)\b/i,
      zh: ['抽象'],
    },
    {
      value: 'illustration', tier: 'strong',
      en: /\b(watercolo?r|oil\s+painting|gouache|acrylic|ink\s+(?:painting|wash|drawing)|illustration|painting|sketch|drawing|line\s+art|charcoal|pastel|crayon|risograph|linocut|screen\s+print|woodcut|etching|mural|fresco|paper\s+cutout|stained\s+glass|embroidery)\b/i,
      zh: ['插画', '绘画', '水彩', '油画', '素描', '手绘', '版画', '壁画', '剪纸', '刺绣', '彩铅', '钢笔画'],
    },
    {
      value: 'realistic', tier: 'strong',
      en: /\b(photorealistic|photograph\w*|photo|shot\s+on|35mm|50mm|85mm|film\s+grain|film\s+still|kodak|polaroid|lomo\w*|analog|dslr|editorial\s+photo\w*|portrait\s+photo\w*)\b/i,
      zh: ['写实', '摄影', '照片', '胶片', '实拍', '纪实', '肖像照'],
    },

    /* ── 弱信号：可能只是风格修饰，不足以单独定媒介 ────────────────
       实测踩到的坑：一条作业的 tags.style 是 ["collage","cinematic"]，
       而 prompt 明写 "Full body cinematic photograph" —— 两者平权时
       档位顺序会把它判成「抽象」。弱信号只在整条作业的强信号
       全部落空时才采用（判定顺序见 decideTiered）。 */
    {
      value: 'graphic', tier: 'weak',
      en: /\b(poster|flyer|banner|layout|grid\s+system)\b/i,
      zh: ['海报', '版式', '排版'],
    },
    {
      value: 'abstract', tier: 'weak',
      en: /\b(surreal(?:ism|ist)?|collage|glitch|psychedelic|kaleidoscop\w*|geometric\s+abstraction)\b/i,
      zh: ['超现实', '拼贴', '故障艺术', '几何构成'],
    },
  ];

  /* 主体轴的强弱之分只为两件事：一是 `figure` / `silhouette` 这类
     可能指人也可能指物形的词；二是 `space` —— 它在摄影语境里
     高频出现于 "negative space"（留白），若不限定短语，
     人像与静物会被大批判成科幻。故只认 outer/deep space 与 space station。 */
  const SUBJECT_RULES = [
    {
      value: 'person', tier: 'strong',
      /* 刻意不含 face / faces：实测 19 条凭它判成人像，其中「画面中央是一张贴纸」
         「银质粉盒特写」这类并不是人物照。宁可漏判（落到未判定）也不要把
         静物与平面设计算进人像 —— 与人物的 `portrait` 已能覆盖真正的肖像。
         刻意不含 kid / kids：「Animals for kids」「kids drawing」「for kids」
         这类修饰语会把插画与素材集判成人像；真正的儿童主体走 child / children。 */
      en: /\b(woman|women|man|men|girl|girls|boy|boys|portrait|portraits|model|person|people|female|male|character|child|children|bride|groom|dancer|human|selfie|guy|lady|soldier|warrior|knight|queen|king|princess|sage|nun|monk|athlete|biker|surfer|chef|barista|couple|couples|cowboy|cowgirl|jockey|outlaw|horseback|rider|riders)\b/i,
      zh: ['人像', '人物', '女性', '男性', '女孩', '男孩', '女人', '男人', '肖像', '模特', '少女', '女子', '男子', '孩子', '儿童', '老人', '婴儿', '舞者', '士兵', '骑士', '女王', '公主', '情侣', '夫妻', '牛仔', '骑手', '设计师', '摄影师', '画家', '厨师'],
    },
    {
      value: 'person', tier: 'weak',
      en: /\b(figure|silhouette|character\s+design)\b/i,
      zh: ['剪影', '背影'],
    },
    {
      value: 'animal', tier: 'strong',
      /* zh 一律写两字以上：单字「马」会命中「马路」、单字「猫」会命中音译词，
         单字在中文里误命中率太高（自然 14 / 海 21 / 花 12 那次教训）。 */
      en: /\b(cat|cats|dog|dogs|bird|birds|horse|horses|lion|tiger|fox|wolf|rabbit|hare|fish|bear|insect|butterfly|owl|elephant|deer|puppy|kitten|animal|animals|whale|shark|panda|dragon|snake|frog|turtle|penguin|eagle|sparrow|crow|bee|spider|octopus|jellyfish|crab|dolphin)\b/i,
      zh: ['动物', '猫咪', '小狗', '鸟儿', '马匹', '狮子', '老虎', '狐狸', '狼群', '兔子', '鱼类', '熊类', '蝴蝶', '猫头鹰', '大象', '鹿群', '鲸鱼', '鲨鱼', '熊猫', '蛇类', '青蛙', '乌龟', '企鹅', '蜜蜂', '蜘蛛', '章鱼'],
    },
    {
      value: 'still', tier: 'strong',
      /* 刻意不含 book / coffee / tea：实测它们多数来自「children book
         illustration」「coffee shop interior」这类场景与媒介描述，
         会把书封插画与咖啡馆内景误算成静物。 */
      en: /\b(still\s+life|bottle|perfume|watch|shoe|shoes|sneaker|sneakers|handbag|food|dish|meal|cup|mug|jewelry|jewellery|cosmetic|cosmetics|packaging|vase|fruit|drink|cocktail|dessert|cake|wine)\b/i,
      zh: ['静物', '瓶子', '香水', '手表', '鞋子', '食物', '杯子', '甜点', '蛋糕', '珠宝', '化妆品', '花瓶', '水果', '饮料', '餐具'],
    },
    {
      value: 'architecture', tier: 'strong',
      en: /\b(architecture|architectural|building|buildings|interior|room|house|home|city|cityscape|street|streets|temple|church|cathedral|castle|kitchen|bedroom|bathroom|living\s+room|office|store|shop|cafe|café|restaurant|station|airport|bridge|tower|facade|hallway|museum|library|hotel|apartment|warehouse|factory|staircase|corridor)\b/i,
      zh: ['建筑', '室内', '房间', '房屋', '城市', '城市景', '街道', '寺庙', '教堂', '城堡', '厨房', '卧室', '浴室', '客厅', '办公室', '商店', '咖啡馆', '餐厅', '车站', '机场', '桥梁', '塔楼', '博物馆', '图书馆', '酒店', '公寓', '走廊', '楼梯'],
    },
    {
      value: 'nature', tier: 'strong',
      /* zh 全部两字以上：单字「自然」命中「自然长发」14 条、「海」命中「金色云海」
         以外的 chibi 小猫 21 条、「花」命中速写咖啡馆与静物蜡烛 12 条（实测）。
         风景类的中文单字（山海花树云雪雨）在中文提示词里几乎都是修饰语，
         不能当主体证据；英文侧 landscape / mountain / flower 等仍是词边界匹配。 */
      en: /\b(landscape|mountains?|forest|woodland|jungle|ocean|sea|beach|coast|river|lake|pond|desert|dune|sky|sunset|sunrise|field|meadow|garden|flower|flowers|tree|trees|waterfall|cloud|clouds|snow|rain|fog|mist|island|canyon|valley|glacier|volcano|nature|waves?|horizon|aurora|starry\s+sky)\b/i,
      zh: ['自然风光', '自然景观', '风景', '山脉', '山峰', '森林', '丛林', '海洋', '海面', '海滩', '海岸', '海景', '河流', '湖泊', '沙漠', '天空', '日落', '日出', '田野', '花园', '花朵', '花瓣', '花海', '树木', '树林', '树枝', '瀑布', '云海', '云层', '雪山', '雪景', '积雪', '雨夜', '雨景', '雾气', '岛屿', '峡谷', '冰川', '火山', '星空'],
    },
    {
      value: 'scifi', tier: 'strong',
      en: /\b(cyberpunk|sci[-\s]?fi|science\s+fiction|spaceship|galaxy|nebula|alien|aliens|robot|robots|mecha|android|cyborg|astronaut)\b/i,
      zh: ['赛博', '科幻', '星系', '星云', '外星', '机器人', '机甲', '宇航员'],
    },
    {
      value: 'scifi', tier: 'weak',
      en: /\b((?:outer|deep)\s+space|space\s+(?:station|craft|ship)|futuristic|steampunk|dystopian|apocalypse|wizard|witch|magic|fantasy|elf|dwarf|orc|goblin|demon|angel|mythical|legendary)\b/i,
      zh: ['太空', '未来', '蒸汽朋克', '末日', '魔法', '奇幻', '精灵', '巫师', '神话', '巨龙'],
    },
  ];

  /* ── 文本取值 ─────────────────────────────────────────────────────── */

  /** 拆解对象（可能缺）。 */
  const decompOf = (job) => (job && typeof job.decomposition === 'object' && job.decomposition) || null;

  /** tags.style 的词串。第二个来源是整份 tags —— 若将来拆解多出 kind 之类的键，
      这里也会顺带带上，不额外维护。 */
  function styleText(job) {
    const d = decompOf(job);
    if (!d) return '';
    const style = Array.isArray(d.tags?.style) ? d.tags.style : [];
    return style.join(' ');
  }

  function summaryText(job) {
    const d = decompOf(job);
    return d ? String(d.summary || '') : '';
  }

  /** 主体段 = 第 1 段（code 为 '1'，模块名「主体」）。
      实测这一段常被截断成 `A close-up`，故只作第一层尝试，不指望它总能判出。 */
  function subjectSegmentText(job) {
    const d = decompOf(job);
    const segs = Array.isArray(d?.segments) ? d.segments : [];
    const seg = segs.find((s) => String(s?.code ?? '') === '1')
      || segs.find((s) => String(s?.module ?? '').includes('主体'));
    return seg ? String(seg.text || '') : '';
  }

  /** 全部段落 + 原始 prompt。 */
  function bodyText(job) {
    const d = decompOf(job);
    const segs = Array.isArray(d?.segments) ? d.segments : [];
    const segText = segs.map((s) => String(s?.text || '')).join(' ');
    return `${segText} ${String(job?.prompt || '')}`.trim();
  }

  /* ── 判定 ─────────────────────────────────────────────────────────── */

  /** 一条规则在某段文本里的命中词（没有则 null）。返回词而不是布尔，
      是为了 explain() 能如实说出「凭哪个词判的」—— 研究工具必须可复核。 */
  function hitWord(rule, text) {
    if (!text) return null;
    const m = rule.en ? rule.en.exec(text) : null;
    if (m) return m[0];
    for (const k of rule.zh || []) if (text.includes(k)) return k;
    return null;
  }

  /** 在某层文本里，按档位表顺序找指定强度的第一个命中。 */
  function firstHit(rules, text, tier) {
    for (const r of rules) {
      if (r.tier !== tier) continue;
      const word = hitWord(r, text);
      if (word) return { value: r.value, word, tier };
    }
    return null;
  }

  /**
   * 两层嵌套：**强度优先于来源层**。
   *
   * 先跨三层找强信号（层序仍是 style → summary → body），整条作业没有
   * 强信号时，再跨三层找弱信号。反过来（层优先）会让 tags.style 里的
   * 一个 `collage` 压掉正文里明写的 `photograph` —— 实测确有这类样本。
   */
  function decideTiered(rules, tiers, fallback) {
    for (const tier of ['strong', 'weak']) {
      for (const t of tiers) {
        const h = firstHit(rules, t, tier);
        if (h) return h;
      }
    }
    return { value: fallback, word: '', tier: '' };
  }

  /* 缓存：WeakMap 以作业对象为键 —— 不复制、不泄漏，作业对象换了缓存自然失效。 */
  const cache = new WeakMap();

  /**
   * 一条作业的两轴分类。
   * @returns {{medium: string, subject: string, source: string}}
   */
  function classify(job) {
    if (!job || typeof job !== 'object') {
      return { medium: 'undeclared', subject: 'unknown', source: SOURCE };
    }
    const cached = cache.get(job);
    if (cached) return cached;
    const result = {
      medium: decideTiered(MEDIUM_RULES, [styleText(job), summaryText(job), bodyText(job)], 'undeclared').value,
      subject: decideTiered(SUBJECT_RULES, [subjectSegmentText(job), summaryText(job), bodyText(job)], 'unknown').value,
      source: SOURCE,
    };
    cache.set(job, result);
    return result;
  }

  const mediumOf = (job) => classify(job).medium;
  const subjectOf = (job) => classify(job).subject;

  /** 档位中文名。未知值原样返回（不吞掉，便于发现漂移）。 */
  function labelOf(axis, value) {
    const list = axis === 'subject' ? SUBJECTS : MEDIUMS;
    const found = list.find((x) => x.value === value);
    return found ? found.label : String(value ?? '');
  }

  /** 两轴的分布计数（测试与研究用，界面走筛选引擎的分面计数）。 */
  function distribution(jobs) {
    const medium = new Map();
    const subject = new Map();
    for (const j of jobs || []) {
      const c = classify(j);
      medium.set(c.medium, (medium.get(c.medium) || 0) + 1);
      subject.set(c.subject, (subject.get(c.subject) || 0) + 1);
    }
    return { medium, subject };
  }

  /**
   * 判定依据（可复核用）：这条作业凭哪个词、落在哪一层、是什么强度。
   * 界面暂未展示，但规则调参与人复核都靠它 —— 没有它就只能看到结论。
   * @returns {{medium: object, subject: object}}
   */
  function explain(job) {
    if (!job || typeof job !== 'object') {
      return {
        medium: { value: 'undeclared', word: '', tier: '', layer: 'none' },
        subject: { value: 'unknown', word: '', tier: '', layer: 'none' },
      };
    }
    const withLayer = (rules, tiers, fallback) => {
      const names = ['style', 'summary', 'body'];
      const subjectNames = ['主体段', 'summary', 'body'];
      const layerNames = rules === SUBJECT_RULES ? subjectNames : names;
      for (const tier of ['strong', 'weak']) {
        for (let i = 0; i < tiers.length; i++) {
          const h = firstHit(rules, tiers[i], tier);
          if (h) return { ...h, layer: layerNames[i] };
        }
      }
      return { value: fallback, word: '', tier: '', layer: 'none' };
    };
    return {
      medium: withLayer(MEDIUM_RULES, [styleText(job), summaryText(job), bodyText(job)], 'undeclared'),
      subject: withLayer(SUBJECT_RULES, [subjectSegmentText(job), summaryText(job), bodyText(job)], 'unknown'),
    };
  }

  return {
    SOURCE,
    MEDIUMS,
    SUBJECTS,
    MEDIUM_VALUES,
    SUBJECT_VALUES,
    /* 词表原样导出，只给测试与审计遍历用（例如「中文词条必须两字以上」）。
       UI 逻辑不要依赖它 —— 判定一律走 classify / mediumOf / subjectOf。 */
    MEDIUM_RULES,
    SUBJECT_RULES,
    classify,
    mediumOf,
    subjectOf,
    labelOf,
    distribution,
    explain,
  };
})();

if (typeof window !== 'undefined') window.SAMPLE_TAXONOMY = SAMPLE_TAXONOMY;
