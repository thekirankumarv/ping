import { useEffect } from 'react';
import { AppState, Modal, Text, View } from 'react-native';
import { unlock, useAppLock } from '../lib/applock';
import { useT } from '../lib/theme';
import { Mark } from './Mark';
import { Btn, useS } from './ui';

export function AppLockHost() {
  const locked = useAppLock((st) => st.locked);
  const t = useT();
  const s = useS();
  useEffect(() => {
    if (!locked) return;
    if (AppState.currentState === 'active') unlock();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && unlock());
    return () => sub.remove();
  }, [locked]);
  if (!locked) return null;
  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <Mark size={84} />
        <Text style={[s.dialogTitle, { fontSize: 24, marginTop: 12 }]}>PING is locked</Text>
        <Text style={s.dialogText}>Unlock with your fingerprint, face or screen lock.</Text>
        <View style={{ alignSelf: 'stretch', marginTop: 14 }}>
          <Btn label="Unlock" icon="finger-print" onPress={unlock} />
        </View>
      </View>
    </Modal>
  );
}
