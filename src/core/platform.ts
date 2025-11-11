// Shared platform initialization for web and native

import type { STTEngine, TTSEngine } from './types'
import {
  setEngines,
  refreshAvailability,
  listVoices as listVoicesEngine,
  listLanguages as listLanguagesEngine,
} from './voice'

/**
 * Initialize platform-specific engines and create unified exports.
 * This eliminates duplication between web and native entry points.
 *
 * @param sttEngine - Platform-specific STT engine
 * @param ttsEngine - Platform-specific TTS engine
 */
export function initializePlatform(sttEngine: STTEngine | null, ttsEngine: TTSEngine | null): void {
  setEngines(sttEngine, ttsEngine)
  refreshAvailability()
}

/**
 * List available voices for the current platform.
 */
export async function listVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
  return listVoicesEngine()
}

/**
 * List available languages for the current platform.
 * Returns unique languages with friendly names and voice counts.
 */
export async function listLanguages(): Promise<
  Array<{ code: string; name: string; voiceCount: number }>
> {
  return listLanguagesEngine()
}

/**
 * Re-export all shared types and functions that both platforms need.
 * This creates a single source of truth for platform exports.
 */
export {
  // React hooks
  QonvoProvider,
  useQonvo,
} from './context'

// Type exports
export type {
  SynthesizeOptions,
  RecognizeOptions,
  RecognitionResult,
  RecognitionController,
  RecognitionChain,
  ConversationOptions,
  ConversationChain,
  Availability,
  TranscriptEntry,
  ConversationSnapshot,
  VoiceError,
  VoiceErrorCode,
} from './types'
