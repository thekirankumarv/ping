import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { busy, haptic, IconBtn, notify, Row, Sheet, toast } from '../../components/ui';
import * as core from '../../lib/core';
import { postPhotoStory } from '../../lib/media';
import { DISPLAY, PRESETS, presetTheme, useT, type Preset } from '../../lib/theme';

const BGS = Object.keys(PRESETS) as Preset[];

export default function NewStory() {
  const t = useT();
  const ins = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [bg, setBg] = useState<Preset>('aurora');
  const [photo, setPhoto] = useState<string | null>(null);
  const [who, setWho] = useState(false);
  const [, redraw] = useState(0);
  const ready = photo || text.trim();
  const people = core.connected().map((id) => core.contact(id)!);
  const seen = people.filter((c) => !c.hide).length;
  const audience = seen === people.length ? 'All your contacts' : `${seen} of ${people.length} contacts`;

  const pick = async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return notify('Camera needed', 'Allow camera access in Settings.');
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 1 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!r.canceled) setPhoto(r.assets[0].uri);
  };
  const post = async () => {
    if (!ready) return;
    haptic.light();
    try {
      if (photo) await busy('Posting story…', () => postPhotoStory(photo, text.trim()));
      else core.addStory('text', text.trim(), { bg });
      toast('Story posted · visible for 24 hours', 'sparkles');
      router.back();
    } catch {
      notify('Couldn’t post', 'Check your internet connection and try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar style="light" />
      {photo ? (
        <Animated.View entering={FadeIn} style={{ position: 'absolute', inset: 0 }}>
          <Image source={{ uri: photo }} contentFit="contain" style={{ flex: 1 }} />
        </Animated.View>
      ) : (
        <LinearGradient colors={presetTheme(bg).grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', inset: 0 }} />
      )}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, paddingTop: ins.top + 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 }}>
          <IconBtn name="close" color="#fff" label="Close" onPress={() => router.back()} />
          <View style={{ flex: 1 }} />
          {photo ? (
            <IconBtn name="text" color="#fff" label="Text story instead" onPress={() => setPhoto(null)} />
          ) : (
            <IconBtn
              name="color-palette"
              color="#fff"
              label="Change background"
              onPress={() => (haptic.light(), setBg(BGS[(BGS.indexOf(bg) + 1) % BGS.length]))}
            />
          )}
          <IconBtn name="people" color="#fff" label="Who can see" onPress={() => setWho(true)} />
          <IconBtn name="images" color="#fff" label="Pick a photo" onPress={() => pick(false)} />
          <IconBtn name="camera" color="#fff" label="Take a photo" onPress={() => pick(true)} />
        </View>
        {photo ? (
          <View style={{ flex: 1 }} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 28 }}>
            <TextInput
              autoFocus
              value={text}
              onChangeText={setText}
              placeholder="Type a status"
              placeholderTextColor="rgba(255,255,255,0.65)"
              multiline
              maxLength={300}
              selectionColor="#fff"
              style={{
                color: '#fff',
                fontSize: text.length > 120 ? 26 : 36,
                fontFamily: DISPLAY,
                textAlign: 'center',
                textShadowColor: 'rgba(0,0,0,0.2)',
                textShadowRadius: 10,
              }}
            />
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            paddingHorizontal: 14,
            paddingTop: 10,
            paddingBottom: ins.bottom + 12,
            backgroundColor: photo ? 'rgba(0,0,0,0.45)' : 'transparent',
          }}
        >
          {photo ? (
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a caption"
              placeholderTextColor="rgba(255,255,255,0.7)"
              multiline
              maxLength={300}
              selectionColor={t.accent}
              style={{
                flex: 1,
                color: '#fff',
                fontSize: 16,
                maxHeight: 110,
                minHeight: 48,
                borderRadius: 24,
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: 'rgba(255,255,255,0.12)',
              }}
            />
          ) : (
            <Pressable onPress={() => setWho(true)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 48 }}>
              <Ionicons name="people" size={16} color="rgba(255,255,255,0.85)" />
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '700' }}>{audience} · 24 hours</Text>
              <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.85)" />
            </Pressable>
          )}
          <Pressable
            onPress={post}
            disabled={!ready}
            accessibilityLabel="Post story"
            style={({ pressed }) => ({
              height: 48,
              paddingHorizontal: 20,
              borderRadius: 24,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: ready ? '#fff' : 'rgba(255,255,255,0.25)',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            })}
          >
            <Text style={{ color: '#07080C', fontWeight: '900', fontSize: 15 }}>Post</Text>
            <Ionicons name="send" size={16} color="#07080C" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* Hidden contacts stay hidden for later stories too, like WhatsApp's "My contacts except…". */}
      <Sheet visible={who} onClose={() => setWho(false)} title="Who can see your stories">
        <ScrollView style={{ maxHeight: 420 }}>
          {people.map((c) => (
            <Row
              key={c.id}
              title={c.label}
              sub={c.hide ? 'Hidden' : 'Can see'}
              onPress={() => (core.setStoryHidden(c.id, !c.hide), redraw((n) => n + 1))}
              right={<Ionicons name={c.hide ? 'eye-off-outline' : 'checkmark-circle'} size={22} color={c.hide ? t.dim : t.accent} />}
            />
          ))}
          {!people.length && <Text style={{ color: t.sub, paddingVertical: 12 }}>No contacts yet.</Text>}
        </ScrollView>
      </Sheet>
    </View>
  );
}
