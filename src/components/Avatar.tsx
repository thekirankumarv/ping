import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import * as core from '../lib/core';
import { useLive } from '../lib/db';
import { avatarColors, useT } from '../lib/theme';

export const useRing = (id: string) => useLive(() => core.storyRing(id), id, core.STORIES);

type Props = {
  seed: string;
  label: string;
  size?: number;
  online?: boolean;
  self?: boolean;
  ring?: 'new' | 'seen' | null;
  story?: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
};

// With `story` set, an active story draws a ring and a tap opens it.
export function Avatar({ seed, label, size = 48, online, self, ring, story, icon = 'bookmark' }: Props) {
  const t = useT();
  const dot = Math.max(10, size * 0.26);
  const inner = ring ? size - Math.max(8, size * 0.12) : size;
  const face = (
    <LinearGradient
      colors={self ? t.grad : avatarColors(seed)}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: inner, height: inner, borderRadius: inner / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      {self ? (
        <Ionicons name={icon} size={inner * 0.42} color={t.onAccent} />
      ) : (
        <Text style={{ color: '#fff', fontSize: inner * 0.4, fontWeight: '800', letterSpacing: -0.5 }}>{label.trim()[0]?.toUpperCase() ?? '?'}</Text>
      )}
    </LinearGradient>
  );
  const body = (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ring && (
        <LinearGradient
          colors={ring === 'new' ? t.grad : [t.dim, t.dim]}
          start={{ x: 0, y: 1 }}
          end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2 }}
        >
          <View style={{ flex: 1, margin: ring === 'new' ? 2.5 : 1.5, borderRadius: size / 2, backgroundColor: t.bg }} />
        </LinearGradient>
      )}
      {face}
      {online && (
        <Animated.View
          entering={ZoomIn.duration(220)}
          exiting={ZoomOut.duration(180)}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: t.green,
            borderWidth: 2.5,
            borderColor: t.bg,
          }}
        />
      )}
    </View>
  );
  if (!story || !ring) return body;
  return (
    <Pressable onPress={() => router.push({ pathname: '/story/[id]', params: { id: story } })} hitSlop={4} accessibilityLabel={`View ${label}'s story`}>
      {body}
    </Pressable>
  );
}
