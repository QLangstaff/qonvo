// Type definitions for React Native voice modules
// These types are exported for internal use and also augment the actual npm packages

// ===== Exported Types (for internal use) =====

export interface SpeechResultsEvent {
  value?: string[]
}

export interface SpeechErrorEvent {
  error?: {
    code?: string
    message?: string
  }
}

export interface Voice {
  onSpeechStart: ((e: any) => void) | null
  onSpeechEnd: ((e: any) => void) | null
  onSpeechResults: ((e: SpeechResultsEvent) => void) | null
  onSpeechPartialResults: ((e: SpeechResultsEvent) => void) | null
  onSpeechError: ((e: SpeechErrorEvent) => void) | null

  start(locale: string): Promise<void>
  stop(): Promise<void>
  cancel(): Promise<void>
  destroy(): Promise<void>
  removeAllListeners(): void
  // Note: isAvailable() is not included - package returns Promise<0|1> which is poor API design
  // We use our own availability() method in STTEngine interface instead
}

export interface SpeechOptions {
  language?: string
  pitch?: number
  rate?: number
  voice?: string
  volume?: number
  onStart?: () => void
  onDone?: () => void
  onStopped?: () => void
  onError?: (error: Error) => void
}

export interface VoiceInfo {
  identifier: string
  name: string
  quality: string
  language: string
}

export interface ExpoSpeech {
  speak(text: string, options?: SpeechOptions): void
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  isSpeakingAsync(): Promise<boolean>
  getAvailableVoicesAsync(): Promise<VoiceInfo[]>
}

export type DynamicModule<T> = T | { default: T }

// ===== Module Augmentations (for npm packages) =====

declare module '@react-native-voice/voice' {
  import type { SpeechResultsEvent, SpeechErrorEvent, Voice } from './native-types'

  const voice: Voice
  export default voice
  export { SpeechResultsEvent, SpeechErrorEvent, Voice }
}

declare module 'expo-speech' {
  import type { SpeechOptions, VoiceInfo, ExpoSpeech } from './native-types'

  const speech: ExpoSpeech
  export default speech
  export { SpeechOptions, VoiceInfo, ExpoSpeech }
}
