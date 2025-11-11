# Qonvo - Voice SDK for React and React Native

Give your app a voice in minutes.

## Installation

```bash
npm install qonvo
```

### React Native Setup (Optional)

```bash
npm install @react-native-voice/voice expo-speech
npx pod-install # iOS only
```

**Permissions:**

- iOS: Add `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription` to Info.plist
- Android: Add `<uses-permission android:name="android.permission.RECORD_AUDIO" />` to AndroidManifest.xml

---

## API Reference

### `useQonvo()` Hook

```typescript
const qonvo = useQonvo()

// Text-to-Speech
await qonvo.synthesis.start(text)
await qonvo.synthesis.stop()
await qonvo.synthesis.pause()
await qonvo.synthesis.resume()
qonvo.synthesis.isActive
qonvo.synthesis.isPaused

// Speech-to-Text
await qonvo.recognition.start()
await qonvo.recognition.stop()
qonvo.recognition.isActive

// Transcript
qonvo.transcript.entries
qonvo.transcript.caption
qonvo.transcript.clear()

// General state
qonvo.isReady
qonvo.synthesis.isAvailable
qonvo.recognition.isAvailable

// Error handling
qonvo.error
qonvo.isError
qonvo.clearError()
```

---

## License

MIT

---

## Links

- [npm](https://www.npmjs.com/package/qonvo)
- [GitHub](https://github.com/QLangstaff/qonvo)
- [Issues](https://github.com/QLangstaff/qonvo/issues)
