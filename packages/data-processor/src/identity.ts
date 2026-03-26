import {
  type Candidate,
  type GitHubProfile,
  type IdentityResult,
  type IdentitySignal,
} from '@talent-scout/shared';

// ── Reference Data ──

const CHINA_LOCATIONS = [
  'beijing',
  '北京',
  'shanghai',
  '上海',
  'guangzhou',
  '广州',
  'shenzhen',
  '深圳',
  'hangzhou',
  '杭州',
  'chengdu',
  '成都',
  'nanjing',
  '南京',
  'wuhan',
  '武汉',
  "xi'an",
  '西安',
  'suzhou',
  '苏州',
  'changsha',
  '长沙',
  'zhengzhou',
  '郑州',
  'dongguan',
  '东莞',
  'qingdao',
  '青岛',
  'tianjin',
  '天津',
  'ningbo',
  '宁波',
  'hefei',
  '合肥',
  'shenyang',
  '沈阳',
  'dalian',
  '大连',
  'fuzhou',
  '福州',
  'xiamen',
  '厦门',
  'kunming',
  '昆明',
  'guiyang',
  '贵阳',
  'nanning',
  '南宁',
  'haikou',
  '海口',
  'jinan',
  '济南',
  'harbin',
  '哈尔滨',
  'changchun',
  '长春',
  'china',
  '中国',
  'mainland china',
  "people's republic of china",
  'prc',
];

const CHINA_EXCLUDE = ['hong kong', '香港', 'macau', '澳门', 'taiwan', '台湾'];

const CHINA_EMAIL_DOMAINS = [
  'qq.com',
  '163.com',
  '126.com',
  'yeah.net',
  'foxmail.com',
  'sina.com',
  'sina.cn',
  'sohu.com',
  '139.com',
  '189.cn',
  'wo.cn',
  '21cn.com',
  'tom.com',
  'aliyun.com',
  'bytedance.com',
  'tencent.com',
  'alibaba-inc.com',
  'baidu.com',
  'meituan.com',
  'jd.com',
  'xiaomi.com',
  'huawei.com',
  'oppo.com',
  'didi.com',
  'bilibili.com',
  'kuaishou.com',
  'pinduoduo.com',
  'edu.cn',
];

const CHINA_COMPANIES = [
  'bytedance',
  '字节跳动',
  'tiktok',
  'tencent',
  '腾讯',
  'alibaba',
  '阿里',
  'baidu',
  '百度',
  'meituan',
  '美团',
  'jd.com',
  '京东',
  'xiaomi',
  '小米',
  'huawei',
  '华为',
  'didi',
  '滴滴',
  'pinduoduo',
  '拼多多',
  'netease',
  '网易',
  'bilibili',
  'b站',
  'kuaishou',
  '快手',
  'shopee',
  'ant group',
  '蚂蚁',
  'zhihu',
  '知乎',
  'douyu',
  '斗鱼',
  'ximalaya',
  '喜马拉雅',
  'shein',
  'sensetime',
  '商汤',
  'megvii',
  '旷视',
  'cloudwalk',
  '云从',
];

const CHINA_SOCIAL_PATTERNS = [
  /weibo\.com/,
  /zhihu\.com/,
  /juejin\.cn/,
  /bilibili\.com/,
  /csdn\.net/,
  /cnblogs\.com/,
  /segmentfault\.com/,
  /mp\.weixin\.qq\.com/,
  /okjike\.com|jike\.city/,
  /sspai\.com/,
  /xiaohongshu\.com/,
  /v2ex\.com/,
];

// Common Chinese surname syllables for pinyin detection (Tier 4)
const PINYIN_SURNAMES = [
  'wang',
  'li',
  'zhang',
  'liu',
  'chen',
  'yang',
  'huang',
  'zhao',
  'wu',
  'zhou',
  'xu',
  'sun',
  'ma',
  'zhu',
  'hu',
  'guo',
  'lin',
  'he',
  'gao',
  'luo',
  'zheng',
  'liang',
  'xie',
  'han',
  'tang',
  'feng',
  'deng',
  'cao',
  'peng',
  'zeng',
  'xiao',
  'tian',
  'dong',
  'pan',
  'yuan',
  'cai',
  'jiang',
  'yu',
  'du',
  'ye',
  'cheng',
  'wei',
  'su',
  'lu',
  'ding',
  'ren',
  'shen',
  'yao',
  'lv',
  'song',
  'qin',
  'cui',
];

// Common pinyin given name fragments
const PINYIN_GIVEN = [
  'wei',
  'fang',
  'na',
  'min',
  'jing',
  'li',
  'qiang',
  'lei',
  'jun',
  'yong',
  'jie',
  'ping',
  'chao',
  'xin',
  'hua',
  'guang',
  'ming',
  'hong',
  'hai',
  'bo',
  'yan',
  'lin',
  'tao',
  'gang',
  'hao',
  'kai',
  'peng',
  'long',
  'rui',
  'xiang',
  'zhi',
  'wen',
  'yi',
  'ning',
  'sheng',
  'ting',
  'yu',
  'yang',
  'chun',
  'qiu',
];

// CJK Unified Ideographs range for simplified Chinese detection
const CJK_RANGE = /[\u4e00-\u9fff]/;
// Japanese kana ranges (hiragana + katakana)
const JAPANESE_KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
// Common simplified-unique characters (not used in traditional Chinese)
const SIMPLIFIED_UNIQUE =
  /[这国与为从个们对来时经过对还进种没点问头边远运达选办设讲许让说认读边车关实节处报场务]/g;

const CITY_MAP: Record<string, string> = {
  beijing: 'Beijing',
  北京: 'Beijing',
  shanghai: 'Shanghai',
  上海: 'Shanghai',
  guangzhou: 'Guangzhou',
  广州: 'Guangzhou',
  shenzhen: 'Shenzhen',
  深圳: 'Shenzhen',
  hangzhou: 'Hangzhou',
  杭州: 'Hangzhou',
  chengdu: 'Chengdu',
  成都: 'Chengdu',
  nanjing: 'Nanjing',
  南京: 'Nanjing',
  wuhan: 'Wuhan',
  武汉: 'Wuhan',
  "xi'an": "Xi'an",
  西安: "Xi'an",
  suzhou: 'Suzhou',
  苏州: 'Suzhou',
  changsha: 'Changsha',
  长沙: 'Changsha',
  zhengzhou: 'Zhengzhou',
  郑州: 'Zhengzhou',
  dongguan: 'Dongguan',
  东莞: 'Dongguan',
  qingdao: 'Qingdao',
  青岛: 'Qingdao',
  tianjin: 'Tianjin',
  天津: 'Tianjin',
  ningbo: 'Ningbo',
  宁波: 'Ningbo',
  hefei: 'Hefei',
  合肥: 'Hefei',
  shenyang: 'Shenyang',
  沈阳: 'Shenyang',
  dalian: 'Dalian',
  大连: 'Dalian',
  fuzhou: 'Fuzhou',
  福州: 'Fuzhou',
  xiamen: 'Xiamen',
  厦门: 'Xiamen',
  kunming: 'Kunming',
  昆明: 'Kunming',
  guiyang: 'Guiyang',
  贵阳: 'Guiyang',
  nanning: 'Nanning',
  南宁: 'Nanning',
  haikou: 'Haikou',
  海口: 'Haikou',
  jinan: 'Jinan',
  济南: 'Jinan',
  harbin: 'Harbin',
  哈尔滨: 'Harbin',
  changchun: 'Changchun',
  长春: 'Changchun',
};

// ── Tier 1 Detectors ──

function matchExplicitLocation(profile: GitHubProfile): IdentitySignal | null {
  if (!profile.location) return null;
  const loc = profile.location.toLowerCase();

  // Check exclusions first
  if (CHINA_EXCLUDE.some((ex) => loc.includes(ex))) return null;

  for (const keyword of CHINA_LOCATIONS) {
    if (loc.includes(keyword)) {
      return {
        tier: 1,
        type: 'location:explicit',
        confidence: 0.92,
        evidence: `Location "${profile.location}" contains "${keyword}"`,
      };
    }
  }
  return null;
}

function matchEmailDomain(email: string | null): IdentitySignal | null {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;

  for (const d of CHINA_EMAIL_DOMAINS) {
    if (domain === d || domain.endsWith(`.${d}`)) {
      return {
        tier: 1,
        type: 'email:domain',
        confidence: 0.9,
        evidence: `Email domain "${domain}" is a known China domain`,
      };
    }
  }
  return null;
}

// ── Tier 2 Detectors ──

function matchBio(bio: string | null): IdentitySignal | null {
  if (!bio) return null;
  if (containsSimplifiedChinese(bio)) {
    return {
      tier: 2,
      type: 'bio:simplified-chinese',
      confidence: 0.75,
      evidence: 'Bio contains simplified Chinese characters',
    };
  }
  return null;
}

function matchCompany(company: string | null): IdentitySignal | null {
  if (!company) return null;
  const c = company.toLowerCase().replace(/^@/, '');
  for (const name of CHINA_COMPANIES) {
    if (c.includes(name.toLowerCase())) {
      return {
        tier: 2,
        type: 'company:china',
        confidence: 0.8,
        evidence: `Company "${company}" matches known China company "${name}"`,
      };
    }
  }
  return null;
}

function matchBlogDomain(blog: string | null): IdentitySignal | null {
  if (!blog) return null;
  const lower = blog.toLowerCase();
  if (lower.endsWith('.cn') || lower.includes('.com.cn') || lower.includes('.cn/')) {
    return {
      tier: 2,
      type: 'blog:cn-domain',
      confidence: 0.7,
      evidence: `Blog "${blog}" uses a .cn domain`,
    };
  }
  return null;
}

function matchSocialLinks(blog: string | null, bio: string | null): IdentitySignal | null {
  const text = `${blog ?? ''} ${bio ?? ''}`;
  for (const pattern of CHINA_SOCIAL_PATTERNS) {
    if (pattern.test(text)) {
      return {
        tier: 2,
        type: 'social:china-platform',
        confidence: 0.75,
        evidence: `Profile references a Chinese social platform`,
      };
    }
  }
  return null;
}

function matchProfileReadme(candidate: Candidate): IdentitySignal | null {
  const profile = candidate.profile;
  if (!profile) return null;
  const profileRepo = profile.recent_repos.find(
    (r) => r.full_name.toLowerCase() === `${profile.login}/${profile.login}`.toLowerCase()
  );
  if (!profileRepo) return null;
  if (profileRepo.description && containsSimplifiedChinese(profileRepo.description)) {
    return {
      tier: 2,
      type: 'readme:profile-chinese',
      confidence: 0.75,
      evidence: `Profile repo "${profileRepo.full_name}" description contains simplified Chinese`,
    };
  }
  return null;
}

// ── Tier 3 Detectors ──

function matchRepoDescriptions(candidate: Candidate): IdentitySignal | null {
  const repos = candidate.profile?.recent_repos;
  if (!repos || repos.length === 0) return null;
  let chineseCount = 0;
  for (const repo of repos.slice(0, 10)) {
    if (repo.description && containsSimplifiedChinese(repo.description)) {
      chineseCount++;
    }
  }
  if (chineseCount >= 2) {
    return {
      tier: 3,
      type: 'repo:description-chinese',
      confidence: 0.55,
      evidence: `${String(chineseCount)} of recent repos have simplified Chinese descriptions`,
    };
  }
  return null;
}

function matchCommitChinese(candidate: Candidate): IdentitySignal | null {
  const commitSignals = candidate.signals.filter((s) => s.type.startsWith('commit:'));
  if (commitSignals.length === 0) return null;
  let chineseCount = 0;
  for (const s of commitSignals) {
    if (s.detail && containsSimplifiedChinese(s.detail)) {
      chineseCount++;
    }
  }
  if (chineseCount >= 3) {
    return {
      tier: 3,
      type: 'commit:message-chinese',
      confidence: 0.5,
      evidence: `${String(chineseCount)} commit messages contain simplified Chinese`,
    };
  }
  return null;
}

// ── Tier 4 Detectors ──

function matchPinyinName(candidate: Candidate): IdentitySignal | null {
  const name = candidate.profile?.name;
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  const parts = normalized.split(/[\s-]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return null;

  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];
  if (!firstPart || !lastPart) return null;
  const hasSurname = PINYIN_SURNAMES.includes(firstPart);
  const hasGivenInAny = parts.slice(1).some((p) => PINYIN_GIVEN.includes(p));

  // Also check reverse order (some people write given name first)
  const hasSurnameReverse = PINYIN_SURNAMES.includes(lastPart);
  const hasGivenReverse = parts.slice(0, -1).some((p) => PINYIN_GIVEN.includes(p));

  if ((hasSurname && hasGivenInAny) || (hasSurnameReverse && hasGivenReverse)) {
    return {
      tier: 4,
      type: 'name:pinyin',
      confidence: 0.25,
      evidence: `Name "${name}" matches Chinese pinyin pattern`,
    };
  }
  return null;
}

function matchCommitTimezone(candidate: Candidate): IdentitySignal | null {
  const timestamps = candidate.signals
    .filter((s) => s.occurred_at)
    .map((s) => new Date(s.occurred_at as string));

  if (timestamps.length < 10) return null;

  // Check if most activity falls in UTC+8 working hours (09:00-23:00 UTC+8 = 01:00-15:00 UTC)
  let utcPlus8Count = 0;
  for (const ts of timestamps) {
    const utcHour = ts.getUTCHours();
    // UTC+8 active hours: 9am-11pm local = 1am-3pm UTC
    if (utcHour >= 1 && utcHour <= 15) {
      utcPlus8Count++;
    }
  }

  const ratio = utcPlus8Count / timestamps.length;
  if (ratio >= 0.7) {
    return {
      tier: 4,
      type: 'timezone:utc-plus-8',
      confidence: 0.2,
      evidence: `${(ratio * 100).toFixed(0)}% of activity timestamps align with UTC+8 active hours`,
    };
  }
  return null;
}

// ── Confidence Computation ──

export function computeChinaConfidence(signals: IdentitySignal[]): number {
  if (signals.length === 0) return 0;
  if (signals.some((s) => s.tier === 1)) return 0.95;

  // noisy-or model for Tier 2+
  let productNotChina = 1.0;
  for (const signal of signals) {
    productNotChina *= 1 - signal.confidence;
  }
  return Math.min(1 - productNotChina, 0.95);
}

// ── City Inference ──

function inferCity(location: string | null): string | null {
  if (!location) return null;
  const lower = location.toLowerCase();
  for (const [keyword, city] of Object.entries(CITY_MAP)) {
    if (lower.includes(keyword)) return city;
  }
  return null;
}

// ── Simplified Chinese Detection ──

export function containsSimplifiedChinese(text: string): boolean {
  if (!CJK_RANGE.test(text)) return false;
  // If Japanese kana present, likely Japanese, not Chinese
  if (JAPANESE_KANA.test(text)) return false;
  // Check for simplified-unique characters
  const matches = text.match(SIMPLIFIED_UNIQUE);
  return matches !== null && matches.length >= 2;
}

// ── Main Entry ──

export function identifyCandidate(candidate: Candidate): IdentityResult {
  const profile = candidate.profile;
  if (!profile) {
    return {
      china_confidence: 0,
      city: null,
      signals: [],
      ai_assisted: false,
      inferred_at: new Date().toISOString(),
    };
  }

  const signals: IdentitySignal[] = [];

  // Tier 1
  const locationSignal = matchExplicitLocation(profile);
  if (locationSignal) signals.push(locationSignal);

  const emailSignal = matchEmailDomain(profile.email);
  if (emailSignal) signals.push(emailSignal);

  // Tier 2
  const bioSignal = matchBio(profile.bio);
  if (bioSignal) signals.push(bioSignal);

  const companySignal = matchCompany(profile.company);
  if (companySignal) signals.push(companySignal);

  const blogSignal = matchBlogDomain(profile.blog);
  if (blogSignal) signals.push(blogSignal);

  const socialSignal = matchSocialLinks(profile.blog, profile.bio);
  if (socialSignal) signals.push(socialSignal);

  const profileReadmeSignal = matchProfileReadme(candidate);
  if (profileReadmeSignal) signals.push(profileReadmeSignal);

  // Only proceed to Tier 3/4 if conclusion is still uncertain
  const earlyConfidence = computeChinaConfidence(signals);
  if (earlyConfidence < 0.8) {
    // Tier 3
    const repoDescSignal = matchRepoDescriptions(candidate);
    if (repoDescSignal) signals.push(repoDescSignal);

    const commitChineseSignal = matchCommitChinese(candidate);
    if (commitChineseSignal) signals.push(commitChineseSignal);

    // Tier 4
    const pinyinSignal = matchPinyinName(candidate);
    if (pinyinSignal) signals.push(pinyinSignal);

    const timezoneSignal = matchCommitTimezone(candidate);
    if (timezoneSignal) signals.push(timezoneSignal);
  }

  return {
    china_confidence: computeChinaConfidence(signals),
    city: inferCity(profile.location),
    signals,
    ai_assisted: false,
    inferred_at: new Date().toISOString(),
  };
}
