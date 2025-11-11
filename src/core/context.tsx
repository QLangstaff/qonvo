// React Context Provider for Qonvo

import * as React from 'react'
import {
  subscribeToRecognition,
  getRecognitionSnapshot,
  startRecognition,
  stopRecognition,
  subscribeToSynthesis,
  getSynthesisSnapshot,
  startSynthesis,
  stopSynthesis,
  pauseSynthesis,
  resumeSynthesis,
  subscribeToTranscript,
  getTranscriptSnapshot,
  clearTranscript,
  subscribeToQonvo,
  getQonvoSnapshot,
  clearError,
  setGlobalOnError,
  subscribeToConversation,
  getConversationSnapshot,
  startConversation,
  stopConversation,
} from './voice'
import type {
  ConversationSnapshot,
  RecognitionSnapshot,
  SynthesisSnapshot,
  TranscriptSnapshot,
  QonvoSnapshot,
} from './types'

// ---- Server Snapshots (cached to prevent infinite loops) ----

const CONVERSATION_SERVER_SNAPSHOT: ConversationSnapshot = {
  isActive: false,
  isAvailable: false,
}

const RECOGNITION_SERVER_SNAPSHOT: RecognitionSnapshot = {
  isActive: false,
  isAvailable: false,
}

const SYNTHESIS_SERVER_SNAPSHOT: SynthesisSnapshot = {
  isActive: false,
  isPaused: false,
  isAvailable: false,
}

const TRANSCRIPT_SERVER_SNAPSHOT: TranscriptSnapshot = {
  entries: [],
  caption: undefined,
}

const QONVO_SERVER_SNAPSHOT: QonvoSnapshot = {
  isReady: false,
  error: null,
}

// ---- Qonvo Provider (Root Context) ----

const QonvoContext = React.createContext<boolean>(false)

export interface QonvoProviderProps {
  children: React.ReactNode
  onError?: (error: import('./types').VoiceError) => void
}

export function QonvoProvider({ children, onError }: QonvoProviderProps) {
  // Wire up global onError callback
  React.useEffect(() => {
    setGlobalOnError(onError)
    return () => setGlobalOnError(undefined)
  }, [onError])

  return <QonvoContext.Provider value={true}>{children}</QonvoContext.Provider>
}

function useQonvoContext() {
  const context = React.useContext(QonvoContext)
  if (!context) {
    throw new Error('Qonvo hooks must be used within a QonvoProvider')
  }
}

// ---- Internal Types ----

// TODO: Future enhancements for synthesis events:
// - SSML support for multi-voice synthesis
// - Text-triggered events for dynamic voice switching (.when("phrase").then())
// - Advanced lifecycle events (onProgress with word/character position)
// - Multiple simultaneous synthesis streams with mixing

// ---- useQonvo Hook (Unified API) ----

/**
 * Unified hook that provides all Qonvo functionality in one place.
 * This is the single source of truth for using Qonvo in React.
 *
 * @example
 * ```typescript
 * const qonvo = useQonvo()
 *
 * // Text-to-Speech
 * await qonvo.synthesis.start('Hello world')
 *
 * // Speech-to-Text
 * await qonvo.recognition.start({ stream: true })
 * console.log(qonvo.recognition.caption)
 *
 * // Conversation
 * await qonvo.conversation.start()
 * qonvo.conversation.runLoop(myLoopFn)
 *
 * // General state
 * console.log(qonvo.isReady, qonvo.synthesis.isAvailable, qonvo.recognition.isAvailable)
 * ```
 */
export function useQonvo() {
  useQonvoContext()

  // Subscribe to recognition state
  const recognition = React.useSyncExternalStore(
    subscribeToRecognition,
    getRecognitionSnapshot,
    () => RECOGNITION_SERVER_SNAPSHOT
  )

  // Subscribe to conversation state
  const conversation = React.useSyncExternalStore(
    subscribeToConversation,
    getConversationSnapshot,
    () => CONVERSATION_SERVER_SNAPSHOT
  )

  // Subscribe to synthesis state
  const synthesis = React.useSyncExternalStore(
    subscribeToSynthesis,
    getSynthesisSnapshot,
    () => SYNTHESIS_SERVER_SNAPSHOT
  )

  // Subscribe to transcript state
  const transcript = React.useSyncExternalStore(
    subscribeToTranscript,
    getTranscriptSnapshot,
    () => TRANSCRIPT_SERVER_SNAPSHOT
  )

  // Subscribe to qonvo state (general)
  const qonvo = React.useSyncExternalStore(
    subscribeToQonvo,
    getQonvoSnapshot,
    () => QONVO_SERVER_SNAPSHOT
  )

  return {
    // Conversation (Simple API)
    conversation: {
      start: startConversation, // Simple API with .onRecognition()
      stop: stopConversation,
      // State
      isActive: conversation.isActive,
      isAvailable: conversation.isAvailable,
    },
    // Recognition (STT)
    recognition: {
      start: startRecognition,
      stop: stopRecognition,
      isActive: recognition.isActive,
      isAvailable: recognition.isAvailable,
    },
    // Synthesis (TTS)
    synthesis: {
      start: startSynthesis,
      stop: stopSynthesis,
      pause: pauseSynthesis,
      resume: resumeSynthesis,
      isActive: synthesis.isActive,
      isAvailable: synthesis.isAvailable,
      isPaused: synthesis.isPaused,
    },
    // Transcript (single source of truth)
    transcript: {
      entries: transcript.entries,
      caption: transcript.caption,
      clear: clearTranscript,
    },
    // General state
    isReady: qonvo.isReady,
    // Consolidated error state (single error for all operations)
    error: qonvo.error,
    isError: qonvo.error !== null,
    clearError: clearError,
  }
}
