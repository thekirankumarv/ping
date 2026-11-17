// Small markdown subset for messages. Pure, so tests run under tsx.
export type Inline = { t: 'text'; v: string } | { t: 'code'; v: string } | { t: 'link'; v: string } | { t: 'b' | 'i' | 's' | 'spoiler'; c: Inline[] };

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3; c: Inline[] }
  | { t: 'quote'; c: Inline[] }
  | { t: 'code'; lang: string; v: string }
  | { t: 'li'; n?: number; depth: number; c: Inline[] }
  | { t: 'task'; done: boolean; line: number; c: Inline[] }
  | { t: 'gap' };

const SPANS: [RegExp, 'b' | 'i' | 's' | 'spoiler'][] = [
  [/^\*\*(.+?)\*\*/s, 'b'],
  [/^__(.+?)__/s, 'b'],
  [/^~~(.+?)~~/s, 's'],
  [/^\|\|(.+?)\|\|/s, 'spoiler'],
  [/^\*(?!\s)(.+?)(?<!\s)\*/s, 'i'],
  [/^_(?!\s)(.+?)(?<!\s)_(?!\w)/s, 'i'],
];
const LINK = /^https?:\/\/[^\s<>]+[^\s<>.,;:!?'")\]]/;

export function inline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', v: text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && /[*_~`|\\]/.test(src[i + 1])) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === 'h' && (i === 0 || /\s|\(/.test(src[i - 1]))) {
      const m = LINK.exec(rest);
      if (m) {
        flush();
        out.push({ t: 'link', v: m[0] });
        i += m[0].length;
        continue;
      }
    }
    if ('*_~|'.includes(ch)) {
      const hit = SPANS.find(([re]) => re.test(rest));
      if (hit) {
        const m = hit[0].exec(rest)!;
        flush();
        out.push({ t: hit[1], c: inline(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', c: inline(para.join('\n')) });
    para = [];
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const fence = /^\s*```(\S*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++n < lines.length && !/^\s*```\s*$/.test(lines[n])) body.push(lines[n]);
      out.push({ t: 'code', lang: fence[1], v: body.join('\n') });
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flush();
      out.push({ t: 'h', level: m[1].length as 1 | 2 | 3, c: inline(m[2]) });
    } else if ((m = /^\s*[-*]\s+\[([ xX])\]\s?(.*)$/.exec(line))) {
      flush();
      out.push({ t: 'task', done: m[1] !== ' ', line: n, c: inline(m[2]) });
    } else if ((m = /^(\s*)[-*•]\s+(.*)$/.exec(line))) {
      flush();
      out.push({ t: 'li', depth: Math.min(3, m[1].length >> 1), c: inline(m[2]) });
    } else if ((m = /^(\s*)(\d{1,3})[.)]\s+(.*)$/.exec(line))) {
      flush();
      out.push({ t: 'li', n: Number(m[2]), depth: Math.min(3, m[1].length >> 1), c: inline(m[3]) });
    } else if ((m = /^>\s?(.*)$/.exec(line))) {
      flush();
      const prev = out[out.length - 1];
      if (prev?.t === 'quote') prev.c.push({ t: 'text', v: '\n' }, ...inline(m[1]));
      else out.push({ t: 'quote', c: inline(m[1]) });
    } else if (!line.trim()) {
      flush();
      if (out.length && out[out.length - 1].t !== 'gap') out.push({ t: 'gap' });
    } else para.push(line);
  }
  flush();
  while (out[out.length - 1]?.t === 'gap') out.pop();
  return out;
}

// Ticks one checklist line; returns the new source.
export function toggleTask(src: string, line: number, done: boolean) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  lines[line] = lines[line]?.replace(/\[([ xX])\]/, done ? '[x]' : '[ ]');
  return lines.join('\n');
}

// Plain text for previews and notifications.
export function plain(src: string) {
  return src
    .replace(/```[^\n]*\n?/g, '')
    .replace(/^\s*[-*]\s+\[([ xX])\]\s?/gm, (_, x) => (x === ' ' ? '☐ ' : '☑ '))
    .replace(/^#{1,3}\s+|^>\s?/gm, '')
    .replace(/\|\|(.+?)\|\|/gs, '▒▒▒▒')
    .replace(/(\*\*|__|~~|`)(.+?)\1/gs, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export const hasMarkdown = (src: string) => /```|^#{1,3}\s|^\s*[-*]\s|^\s*\d+[.)]\s|^>|\*\*|~~|\|\||`|\*\S|_\S/m.test(src);
