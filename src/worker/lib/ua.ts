export interface ParsedUA {
  browser: string;
  os: string;
  device: 'Desktop' | 'Mobile' | 'Tablet';
}

const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|embedly|quora link preview|whatsapp|telegram|discord|preview|headless|phantom|puppeteer|playwright|selenium|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|httpclient|vercel|chatgpt-user|gptbot|claudebot|claude-user|perplexity|bytespider|ahrefs|semrush|mj12|dotbot/i;

export function isBot(ua: string): boolean {
  return !ua || BOT_RE.test(ua);
}

// Hosting networks. A browser-looking UA coming from here is almost always a scraper
// or a headless crawler (they inflate "Direct", Singapore/US and the bounce rate).
// Real people on a VPN hosted in a datacenter are dropped too: an accepted trade-off.
const DATACENTER_RE =
  /amazon|aws|google cloud|google llc|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|alibaba|tencent|huawei cloud|oracle|vultr|choopa|contabo|leaseweb|m247|scaleway|online s\.a\.s|hostinger|datacamp|cdn77|zenlayer|psychz|colocrossing|g-core|byteplus|bytedance/i;

/** Does the request come from a hosting provider rather than a consumer ISP? `asOrg` is Cloudflare's `cf.asOrganization`. */
export function isDatacenter(asOrg: string | null | undefined): boolean {
  return !!asOrg && DATACENTER_RE.test(asOrg);
}

// Order matters: in-app browsers and Chromium forks before Chrome, Chrome before Safari.
const BROWSERS: [RegExp, string][] = [
  [/Instagram/i, 'Instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'Facebook'],
  [/Twitter/i, 'Twitter'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Threads/i, 'Threads'],
  [/TikTok|musical_ly|Bytedance/i, 'TikTok'],
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/YaBrowser/, 'Yandex'],
  [/Vivaldi/, 'Vivaldi'],
  [/Brave/, 'Brave'],
  [/DuckDuckGo/, 'DuckDuckGo'],
  [/Arc\//, 'Arc'],
  [/Firefox|FxiOS/, 'Firefox'],
  [/; wv\)/, 'Chrome WebView'],
  [/Chrome|CriOS/, 'Chrome'],
  [/Mobile\/\w+ Safari|Version\/[\d.]+ Mobile/, 'Mobile Safari'],
  [/Safari/, 'Safari'],
  [/AppleWebKit/, 'WebKit'],
];

const OSES: [RegExp, string][] = [
  [/iPhone|iPod/, 'iOS'],
  [/iPad/, 'iPadOS'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/CrOS/, 'Chrome OS'],
  [/Mac OS X|Macintosh/, 'Mac OS'],
  [/Linux/, 'Linux'],
];

export function parseUA(ua: string, screenWidth?: number): ParsedUA {
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? 'Other';
  const os = OSES.find(([re]) => re.test(ua))?.[1] ?? 'Other';
  let device: ParsedUA['device'] = 'Desktop';
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) device = 'Tablet';
  else if (/Mobi|iPhone|iPod|Android/.test(ua)) device = 'Mobile';
  if (device === 'Desktop' && screenWidth && screenWidth < 600) device = 'Mobile';
  return { browser, os, device };
}
