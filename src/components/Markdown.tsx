import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View, type TextStyle } from 'react-native';
import { parse, type Block, type Inline } from '../lib/md';
import { MONO, useLook, useT } from '../lib/theme';
import { copy, tap } from './ui';

type Props = { src: string; color: string; sub: string; onToggle?: (line: number, done: boolean) => void };

function Spans({ items, color, sub }: { items: Inline[]; color: string; sub: string }) {
  const t = useT();
  return (
    <>
      {items.map((x, i) => {
        switch (x.t) {
          case 'text':
            return x.v;
          case 'code':
            return (
              <Text key={i} style={{ fontFamily: MONO, fontSize: 13.5, backgroundColor: color + '1A', color }}>
                {` ${x.v} `}
              </Text>
            );
          case 'link':
            return (
              <Text key={i} style={{ textDecorationLine: 'underline', color }} onPress={() => Linking.openURL(x.v)}>
                {x.v}
              </Text>
            );
          case 'spoiler':
            return <Spoiler key={i} items={x.c} color={color} sub={sub} />;
          default: {
            const st: TextStyle =
              x.t === 'b'
                ? { fontWeight: '800' }
                : x.t === 'i'
                  ? { fontStyle: 'italic' }
                  : { textDecorationLine: 'line-through', color: t.dark ? sub : undefined };
            return (
              <Text key={i} style={st}>
                <Spans items={x.c} color={color} sub={sub} />
              </Text>
            );
          }
        }
      })}
    </>
  );
}

const textOf = (items: Inline[]): string => items.map((x) => ('v' in x ? x.v : textOf(x.c))).join('');

// Hidden spoilers render blank figure spaces: Android ignores a transparent color on nested Text.
function Spoiler({ items, color, sub }: { items: Inline[]; color: string; sub: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <Spans items={items} color={color} sub={sub} />;
  return (
    <Text onPress={() => (tap(), setOpen(true))} style={{ backgroundColor: color + '4D' }}>
      {'\u2007'.repeat(Math.min(textOf(items).length, 40))}
    </Text>
  );
}

function Code({ lang, v, color }: { lang: string; v: string; color: string }) {
  const t = useT();
  return (
    <View style={{ backgroundColor: t.dark ? '#00000059' : '#0B0D120F', borderRadius: 12, overflow: 'hidden', marginVertical: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 }}>
        <Text style={{ flex: 1, color, opacity: 0.6, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>
          {lang || 'code'}
        </Text>
        <Pressable hitSlop={10} onPress={() => copy(v, 'Code')} accessibilityLabel="Copy code">
          <Ionicons name="copy-outline" size={15} color={color} style={{ opacity: 0.7 }} />
        </Pressable>
      </View>
      <Text selectable style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color, padding: 12, paddingTop: 6 }}>
        {v}
      </Text>
    </View>
  );
}

function render(b: Block, i: number, p: Props, fs: number, t: ReturnType<typeof useT>) {
  const text: TextStyle = { color: p.color, fontSize: 15.5 * fs, lineHeight: 21.5 * fs };
  switch (b.t) {
    case 'gap':
      return <View key={i} style={{ height: 6 }} />;
    case 'p':
      return (
        <Text key={i} style={text}>
          <Spans items={b.c} color={p.color} sub={p.sub} />
        </Text>
      );
    case 'h':
      return (
        <Text
          key={i}
          style={[text, { fontWeight: '800', fontSize: [0, 21, 18.5, 16.5][b.level] * fs, lineHeight: [0, 27, 24, 22][b.level] * fs, letterSpacing: -0.3 }]}
        >
          <Spans items={b.c} color={p.color} sub={p.sub} />
        </Text>
      );
    case 'quote':
      return (
        <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: p.color, opacity: 0.4 }} />
          <Text style={[text, { flexShrink: 1, opacity: 0.85 }]}>
            <Spans items={b.c} color={p.color} sub={p.sub} />
          </Text>
        </View>
      );
    case 'code':
      return <Code key={i} lang={b.lang} v={b.v} color={p.color} />;
    case 'li':
      return (
        <View key={i} style={{ flexDirection: 'row', gap: 8, paddingLeft: b.depth * 16 }}>
          <Text style={[text, { minWidth: b.n ? 18 : 10, opacity: 0.7 }]}>{b.n ? `${b.n}.` : b.depth ? '◦' : '•'}</Text>
          <Text style={[text, { flexShrink: 1 }]}>
            <Spans items={b.c} color={p.color} sub={p.sub} />
          </Text>
        </View>
      );
    case 'task':
      return (
        <Pressable
          // Keyed on state: Android won't repaint a changed textDecorationLine on a reused Text.
          key={`${i}-${b.done}`}
          disabled={!p.onToggle}
          onPress={() => (tap(), p.onToggle?.(b.line, !b.done))}
          style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 2 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: b.done }}
        >
          <View
            style={{
              width: 20 * fs,
              height: 20 * fs,
              borderRadius: 6,
              marginTop: 1,
              borderWidth: 2,
              borderColor: b.done ? t.green : p.color + '80',
              backgroundColor: b.done ? t.green : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {b.done && <Ionicons name="checkmark" size={14 * fs} color={t.dark ? '#07080C' : '#FFFFFF'} />}
          </View>
          <Text style={[text, { flexShrink: 1 }, b.done && { textDecorationLine: 'line-through', opacity: 0.55 }]}>
            <Spans items={b.c} color={p.color} sub={p.sub} />
          </Text>
        </Pressable>
      );
  }
}

export const Markdown = memo(function Markdown(p: Props) {
  const t = useT();
  const fs = useLook((l) => l.font);
  const blocks = useMemo(() => parse(p.src), [p.src]);
  return <View style={{ gap: 4 }}>{blocks.map((b, i) => render(b, i, p, fs, t))}</View>;
});
