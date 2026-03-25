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

  const locationSignal = matchExplicitLocation(profile);
  if (locationSignal) signals.push(locationSignal);

  const emailSignal = matchEmailDomain(profile.email);
  if (emailSignal) signals.push(emailSignal);

  const bioSignal = matchBio(profile.bio);
  if (bioSignal) signals.push(bioSignal);

  const companySignal = matchCompany(profile.company);
  if (companySignal) signals.push(companySignal);

  const blogSignal = matchBlogDomain(profile.blog);
  if (blogSignal) signals.push(blogSignal);

  const socialSignal = matchSocialLinks(profile.blog, profile.bio);
  if (socialSignal) signals.push(socialSignal);

  return {
    china_confidence: computeChinaConfidence(signals),
    city: inferCity(profile.location),
    signals,
    ai_assisted: false,
    inferred_at: new Date().toISOString(),
  };
}
