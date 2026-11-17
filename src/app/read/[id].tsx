import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Markdown } from '../../components/Markdown';
import { copy, goBack, IconBtn } from '../../components/ui';
import * as core from '../../lib/core';
import { useLive } from '../../lib/db';
import { clock, dayLabel } from '../../lib/time';
import { useT } from '../../lib/theme';

export default function Reader() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const ins = useSafeAreaInsets();
  const m = useLive(() => core.message(id), id);
  const who = m && (m.mine ? 'You' : core.contact(m.chat)?.label);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 6 }}>
        <IconBtn name="chevron-back" label="Back" onPress={goBack} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 17, fontWeight: '800' }}>{who}</Text>
          {m && <Text style={{ color: t.sub, fontSize: 12.5 }}>{`${dayLabel(m.ts)} · ${clock(m.ts)}`}</Text>}
        </View>
        {m && <IconBtn name="copy-outline" label="Copy" onPress={() => copy(m.body)} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: ins.bottom + 40 }}>
        {m ? (
          <Markdown src={m.body} color={t.text} sub={t.sub} onToggle={(line, done) => core.toggleCheck(m.id, line, done)} />
        ) : (
          <Text style={{ color: t.sub }}>This message is no longer available.</Text>
        )}
      </ScrollView>
    </View>
  );
}
