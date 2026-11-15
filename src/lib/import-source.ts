export type ImportProvider = 'X' | 'Midjourney' | 'Grok Imagine';
export type ImportTarget = { provider: ImportProvider; url: string; id: string; index?: number; direct: boolean };
export type SourceMedia = { url: string; kind: 'IMAGE' | 'VIDEO'; creator?: string; caption?: string };
export type PageMediaSnapshot = { title: string; text: string; images: { src: string; width: number; height: number }[]; videos: string[]; metadata: Record<string, string>; downloads: string[] };
type XVideoVariant = { content_type?: string; url?: string; bitrate?: number };
type XMedia = { type?: string; media_url_https?: string; video_info?: { duration_millis?: number; variants?: XVideoVariant[] } };
type XTweet = {
  rest_id?: string;
  legacy?: { full_text?: string; extended_entities?: { media?: XMedia[] } };
  core?: { user_results?: { result?: { core?: { screen_name?: string }; legacy?: { screen_name?: string } } } };
};

const mediaHosts = new Set(['pbs.twimg.com', 'video.twimg.com', 'cdn.midjourney.com', 'assets.grok.com', 'imagine-public.x.ai', 'assets.x.ai']);
export function isImportMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !mediaHosts.has(url.hostname)) return false;
    if (url.hostname === 'pbs.twimg.com') return url.pathname.startsWith('/media/');
    return !/profile[_-]?(?:picture|image)|avatar|favicon|\.svg$/i.test(url.pathname);
  } catch { return false; }
}

export function parseImportTarget(value: string): ImportTarget {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Paste an X post, Midjourney job, or Grok Imagine share link.');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Enter a complete HTTPS link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Use an HTTPS link without login details or a custom port.');
  url.hash = '';
  if (isImportMediaUrl(url.href)) {
    const provider = url.hostname === 'cdn.midjourney.com' ? 'Midjourney' : ['pbs.twimg.com', 'video.twimg.com'].includes(url.hostname) ? 'X' : 'Grok Imagine';
    return { provider, url: url.href, id: url.pathname, direct: true };
  }
  if (['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.x.com'].includes(url.hostname)) {
    const post = url.pathname.match(/^\/(?:[A-Za-z0-9_]+|i)\/status\/(\d+)(?:\/(?:photo|video)\/(\d+))?\/?$/);
    if (post) return { provider: 'X', url: `https://x.com${url.pathname}`, id: post[1], index: post[2] ? Number(post[2]) - 1 : undefined, direct: false };
    if (/^\/i\/grok\/share\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return { provider: 'Grok Imagine', url: `https://x.com${url.pathname}`, id: url.pathname.split('/').filter(Boolean).at(-1)!, direct: false };
  }
  if (['midjourney.com', 'www.midjourney.com'].includes(url.hostname)) {
    const job = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})\/?$/i);
    const index = url.searchParams.get('index') ?? '0';
    if (job && /^[0-3]$/.test(index)) return { provider: 'Midjourney', url: `https://www.midjourney.com/jobs/${job[1]}?index=${index}`, id: job[1], index: Number(index), direct: false };
  }
  if (['grok.com', 'www.grok.com'].includes(url.hostname) && /^\/(?:imagine\/(?:post|share)|share)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) {
    return { provider: 'Grok Imagine', url: `https://grok.com${url.pathname}`, id: url.pathname.split('/').filter(Boolean).at(-1)!, direct: false };
  }
  throw new Error('Use an individual X post, Midjourney job, or Grok Imagine share link rather than a gallery or subscription page.');
}

export function extractXMedia(data: unknown, target: ImportTarget): SourceMedia[] {
  let result: SourceMedia[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object' || result.length) return;
    const object = value as Record<string, unknown>;
    const tweet = value as XTweet;
    if (tweet.rest_id === target.id && Array.isArray(tweet.legacy?.extended_entities?.media) && tweet.legacy.extended_entities.media.length) {
      const user = tweet.core?.user_results?.result;
      const creator = user?.core?.screen_name || user?.legacy?.screen_name;
      const caption = String(tweet.legacy.full_text || '').slice(0, 12000);
      result = tweet.legacy.extended_entities.media.flatMap((media): SourceMedia[] => {
        if (!media || typeof media !== 'object') return [];
        if (media.type === 'photo' && media.media_url_https && isImportMediaUrl(media.media_url_https)) {
          const url = new URL(media.media_url_https);
          const ext = url.pathname.match(/\.(jpe?g|png|webp)$/i)?.[1]?.replace('jpeg', 'jpg') || 'jpg';
          url.pathname = url.pathname.replace(/\.(jpe?g|png|webp)$/i, '');
          url.searchParams.set('format', ext); url.searchParams.set('name', 'orig');
          return [{ url: url.href, kind: 'IMAGE', creator, caption }];
        }
        const variants = (Array.isArray(media.video_info?.variants) ? media.video_info.variants : []).filter((v): v is XVideoVariant & { url: string } => !!v && v.content_type === 'video/mp4' && typeof v.url === 'string' && isImportMediaUrl(v.url));
        const duration = (media.video_info?.duration_millis || 10000) / 1000;
        const bounded = variants.filter(v => (v.bitrate || 0) * duration / 8 < 42 * 1024 * 1024);
        const chosen = (bounded.length ? bounded : variants).sort((a,b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
        return chosen ? [{ url: chosen.url, kind: 'VIDEO', creator, caption }] : [];
      });
      return;
    }
    for (const child of Object.values(object)) if (child && typeof child === 'object') walk(child);
  };
  walk(data);
  return target.index === undefined ? result : result.slice(target.index, target.index + 1);
}

export function extractPageMedia(page: PageMediaSnapshot, target: ImportTarget): SourceMedia[] {
  const caption = target.provider === 'Grok Imagine' ? page.metadata['og:description'] || page.title : page.text.slice(0, 12000);
  const result: SourceMedia[] = [];
  const belongsToPost = (url: string) => target.provider !== 'Grok Imagine' || url.includes(`/${target.id}/`) || url.includes(`/${target.id}.`);
  const postVideos = page.videos.filter(url => isImportMediaUrl(url) && belongsToPost(url));
  // Ignore personal-history tiles behind Grok's post viewer; use only this post's media.
  const videoUrls = postVideos.length ? postVideos : [page.metadata['og:video'], page.metadata['og:video:url'], page.metadata['og:video:secure_url']].filter(Boolean);
  for (const url of videoUrls) {
    if (!belongsToPost(url)) continue;
    if (isImportMediaUrl(url) && (!target.url.includes('midjourney.com') || url.includes(`/${target.id}/`))) result.push({ url, kind: 'VIDEO', caption });
  }
  const images = [...page.images.map(i => i.src), ...page.downloads, page.metadata['og:image']].filter(Boolean);
  if (target.provider === 'Midjourney') {
    if (result.length) return unique(result);
    const original = images.find(url => isImportMediaUrl(url) && url.includes(`/${target.id}/0_${target.index}.`) && !/_\d+_N\./.test(url));
    return original ? [{ url: original, kind: 'IMAGE', caption }] : [];
  }
  // A video's poster is not a separate artwork. Image-only shared posts retain their images.
  if (!result.length) for (const image of page.images) {
    if (isImportMediaUrl(image.src) && belongsToPost(image.src) && (image.width >= 256 || image.height >= 256)) result.push({ url: image.src, kind: 'IMAGE', caption });
  }
  if (!result.length && isImportMediaUrl(page.metadata['og:image']) && belongsToPost(page.metadata['og:image'])) result.push({ url: page.metadata['og:image'], kind: 'IMAGE', caption });
  return unique(result);
}

function unique(items: SourceMedia[]) { return items.filter((item, index) => items.findIndex(other => other.url === item.url) === index); }
