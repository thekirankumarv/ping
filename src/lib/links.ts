// Link detection and previews, built on the sender's phone so the recipient never contacts the site.
import type { Link } from './core';

export const firstUrl = (text: string) => /https?:\/\/[^\s<>"'`)\]]+/i.exec(text)?.[0]?.replace(/[.,!?;:]+$/, '');

export type Embed = { type: 'youtube'; id: string; tall: boolean } | { type: 'instagram'; id: string; kind: string };

export function embed(url: string): Embed | null {
  let m = /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)([\w-]{11})/i.exec(url);
  if (m) return { type: 'youtube', id: m[1], tall: /\/shorts\//i.test(url) };
  m = /^https?:\/\/youtu\.be\/([\w-]{11})/i.exec(url);
  if (m) return { type: 'youtube', id: m[1], tall: false };
  m = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i.exec(url);
  if (m) return { type: 'instagram', id: m[2], kind: m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase() };
  return null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();

export function parseOg(html: string) {
  const head = html.slice(0, 200_000);
  const meta = (name: string) => {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i');
    const tag = re.exec(head)?.[0];
    const c = tag && /content=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const v = c && (c[1] ?? c[2]);
    return v ? decode(v) : undefined;
  };
  const tag = /<title[^>]*>([^<]*)<\/title>/i.exec(head)?.[1];
  const title = meta('og:title') ?? meta('twitter:title') ?? (tag ? decode(tag) : undefined);
  return {
    title: title?.slice(0, 200),
    desc: (meta('og:description') ?? meta('description'))?.slice(0, 300),
    site: meta('og:site_name'),
    image: meta('og:image') ?? meta('twitter:image'),
  };
}

const host = (url: string) => /^https?:\/\/(?:www\.)?([^/:?#]+)/i.exec(url)?.[1] ?? url;

export async function fetchPreview(url: string, get: typeof fetch = fetch): Promise<(Link & { image?: string }) | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const e = embed(url);
    if (e?.type === 'youtube') {
      const r = await get(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: ctl.signal });
      const j = r.ok ? await r.json() : {};
      return { url, title: j.title, site: j.author_name ? `YouTube · ${j.author_name}` : 'YouTube' };
    }
    const r = await get(url, { signal: ctl.signal, headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Linux; Android 15) PING link preview' } });
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('html')) return { url, site: host(url) };
    const og = parseOg(await r.text());
    const image = og.image ? new URL(og.image, url).toString() : undefined;
    return { url, title: og.title, desc: og.desc, site: og.site ?? host(url), image };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
