# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-10

### Added

#### Initial Release

Qonvo is a minimal, intuitive voice SDK for React and React Native.

**Core Features:**

- **Text-to-Speech (TTS)**
  - `synthesis.start(text, options)` - Start Speech Synthesis
  - `synthesis.stop()` - Stop Speech Synthesis
  - `synthesis.pause()` - Pause Speech Synthesis
  - `synthesis.resume()` - Resume Speech Synthesis
  - `synthesis.isActive` - Active Speech Synthesis Status
  - `synthesis.isPaused` - Paused Speech Synthesis Status
  - `synthesis.isAvailable` - Speech Synthesis Availability

- **Speech-to-Text (STT)**
  - `recognition.start(options)` - Start Speech Recognition
  - `recognition.stop()` - Stop Speech Recognition
  - `recognition.isActive` - Active Speech Recognition Status
  - `recognition.isAvailable` - Speech Recognition Availability

- **Transcript Management**
  - `transcript.entries` - Transcript Entries
  - `transcript.caption` - Transcript Caption
  - `transcript.clear()` - Clear Transcript

- **Voice & Language Support**
  - `listVoices()` - List Voices
  - `listLanguages()` - List Languages

- **React Integration**
  - `useQonvo()` hook
  - Automatic state synchronization with React
  - SSR-safe with graceful degradation

- **Cross-Platform Support**
  - **Web**: Built on Web Speech API
  - **React Native**: Integrated with `expo-speech` (TTS) and `@react-native-voice/voice` (STT)
  - Automatic platform detection
  - Optional peer dependencies for clean installs

- **Developer Experience**
  - Full TypeScript support with comprehensive types
  - Consistent API across all platforms
  - Error handling with `qonvo.error` and `qonvo.clearError()`
  - State management: `qonvo.isReady`, `qonvo.isError`

**Architecture:**

- Session-based state management for accuracy
- Singleton pattern for voice engines
- React's `useSyncExternalStore` for optimal performance
- Focused snapshots prevent unnecessary re-renders

**Package:**

- ES Modules and CommonJS support
- Separate bundles for web and React Native
- Tree-shakeable exports
- Optional peer dependencies

[1.0.0]: https://github.com/QLangstaff/qonvo/releases/tag/v1.0.0
