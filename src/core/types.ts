// ---- Core Types ----

export interface TranscriptEntry {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  final: boolean
}

export type Availability = {
  stt: boolean
  tts: boolean
  details?: string
}

export type Unsubscribe = () => void

// ---- Engine Types ----

export interface STTEngine {
  start(opts: {
    onPartial?: (t: string) => void
    onFinal?: (t: string, confidence?: number) => void
    onError?: (error: VoiceError) => void
    signal?: AbortSignal
  }): Promise<void>
  stop(): Promise<void>
  isActive: boolean
  availability(): Promise<Availability>
}

export interface TTSEngine {
  start(
    text: string,
    opts: {
      rate?: number
      pitch?: number
      voice?: string
      lang?: string
      signal?: AbortSignal
    }
  ): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  stop(): Promise<void>
  isActive: boolean
  isPaused: boolean
  listVoices(): Promise<Array<{ id: string; name: string; lang: string }>>
  availability(): Promise<Availability>
}

// ---- Error Types ----

export type VoiceErrorCode =
  // User actions (not really errors)
  | 'ABORTED'
  // Permission/availability errors
  | 'PERMISSION_DENIED'
  | 'NOT_SUPPORTED'
  | 'TTS_NOT_AVAILABLE'
  | 'STT_NOT_AVAILABLE'
  // Runtime errors
  | 'NO_SPEECH'
  | 'AUDIO_CAPTURE_FAILED'
  | 'NETWORK_ERROR'
  | 'TTS_FAILED'
  | 'STT_FAILED'
  | 'CONVERSATION_ERROR'
  | 'INVALID_STATE'

export interface VoiceError extends Error {
  code: VoiceErrorCode
  cause?: Error
  context?: Record<string, unknown>
  userAction?: boolean // Was this user-initiated? (like ABORTED)
  needsPermission?: boolean // Does user need to grant permission?
  recoverable?: boolean // Can user fix this?
}

// ---- Snapshot Types ----

export interface RecognitionSnapshot {
  isActive: boolean
  isAvailable: boolean
}

export interface SynthesisSnapshot {
  isActive: boolean
  isPaused: boolean
  isAvailable: boolean
}

export interface TranscriptSnapshot {
  entries: TranscriptEntry[]
  caption: string | undefined
}

export interface QonvoSnapshot {
  isReady: boolean
  error: VoiceError | null
}

// ---- Recognition (STT) Types ----

export interface RecognizeOptions {
  method?: 'once' | 'continuous' // Recognition mode: once stops after first result, continuous keeps listening (default: continuous)
  caption?: boolean // Enable live captions (interim results)
  signal?: AbortSignal // AbortSignal for cancellation
  onError?: (error: VoiceError) => void // Custom error handler
}

export interface RecognitionResult {
  phrase?: string
  text: string
  at: number
  confidence?: number
}

export interface RecognitionChain {
  then(callback: (controller?: RecognitionController) => void): RecognitionController
}

export interface RecognitionController extends Promise<RecognitionResult> {
  when(phrase: string): RecognitionChain
  on(event: string, callback: (data: any) => void): RecognitionController
  stop(): Promise<void>
}

// ---- Synthesis (TTS) Types ----

export interface SynthesizeOptions {
  rate?: number
  pitch?: number
  voice?: string
  lang?: string
  signal?: AbortSignal
  onError?: (error: VoiceError) => void // Custom error handler
}

// ---- Conversation API Types (Simple) ----

export interface ConversationOptions {
  method?: 'once' | 'continuous' // Conversation mode (default: 'continuous')
  caption?: boolean // Enable live captions (default: true)
}

export interface ConversationChain {
  onRecognition(
    callback: (result: RecognitionResult) => string | Promise<string>,
    options?: { pauseMs?: number }
  ): void
}

// ---- Conversation Snapshot ----

export interface ConversationSnapshot {
  isActive: boolean
  isAvailable: boolean
}
