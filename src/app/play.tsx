import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { IconBtn } from '../components/ui';
import { embed } from '../lib/links';

// YouTube requires WebView embeds to identify the app as the referrer.
const ORIGIN = 'https://com.kiran.ping';
const page = (src: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;

export default function Play() {
  const { url } = useLocalSearchParams<{ url: string }>();
  const ins = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const e = url ? embed(url) : null;
  if (!url || !e) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  const yt = e.type === 'youtube';
  const boxH = yt ? (e.tall ? Math.min(height * 0.82, width * (16 / 9)) : (width * 9) / 16) : height * 0.82;
  const source = yt
    ? { html: page(`https://www.youtube.com/embed/${e.id}?autoplay=1&playsinline=1&rel=0&origin=${ORIGIN}`), baseUrl: ORIGIN }
    : { uri: `https://www.instagram.com/${e.kind}/${e.id}/embed/` };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingTop: ins.top }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, height: 52 }}>
        <IconBtn name="close" color="#fff" label="Close" onPress={() => router.back()} />
        <Text style={{ flex: 1, color: '#fff', fontWeight: '800', fontSize: 16 }}>{yt ? (e.tall ? 'YouTube Shorts' : 'YouTube') : 'Instagram'}</Text>
        <Pressable onPress={() => Linking.openURL(url)} style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontWeight: '700' }}>Open app</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <View style={{ height: boxH, width: '100%' }}>
          <WebView
            source={source}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            onLoadEnd={() => setLoading(false)}
            onShouldStartLoadWithRequest={(r) =>
              !r.isTopFrame || r.url.startsWith(ORIGIN) || r.url.startsWith(yt ? 'https://www.youtube.com' : 'https://www.instagram.com')
            }
          />
          {loading && <ActivityIndicator color="#fff" style={{ position: 'absolute', alignSelf: 'center', top: boxH / 2 - 10 }} />}
        </View>
      </View>
    </View>
  );
}
