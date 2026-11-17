import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCameraPermissions } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { PAGE_HTML } from './src/page';

// An https origin makes the page a "secure context", which the camera API requires.
const SOURCE = { html: PAGE_HTML, baseUrl: 'https://localhost/' };

export default function App() {
  useKeepAwake();
  const [permission, requestPermission] = useCameraPermissions();

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message?.type === 'speak' && typeof message.text === 'string') {
        Speech.stop();
        Speech.speak(message.text, { language: 'en', rate: 1.0, volume: 1.0 });
      }
    } catch {
      // Not a message from our page; ignore.
    }
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        {permission?.granted ? (
          <WebView
            style={styles.webview}
            source={SOURCE}
            originWhitelist={['*']}
            onMessage={onMessage}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            mediaCapturePermissionGrantType="grant"
            bounces={false}
            overScrollMode="never"
          />
        ) : (
          <View style={styles.center}>
            <Text style={styles.title}>Ball Speed Detector</Text>
            <Text style={styles.body}>
              {permission == null
                ? 'Checking camera permission…'
                : 'The app watches the ball through the camera to measure its speed. Nothing is recorded or sent anywhere.'}
            </Text>
            {permission != null && (
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings()}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>
                  {permission.canAskAgain ? 'Allow camera' : 'Open settings'}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F14' },
  webview: { flex: 1, backgroundColor: '#0B0F14' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  title: { color: '#F2F5F8', fontSize: 24, fontWeight: '700' },
  body: { color: '#8A96A3', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  button: {
    backgroundColor: '#2DD4A7',
    borderRadius: 14,
    paddingHorizontal: 28,
    height: 54,
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#0B0F14', fontSize: 17, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
