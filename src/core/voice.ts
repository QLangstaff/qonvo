// Core voice engine with singleton pattern

import type {
  Availability,
  STTEngine,
  TTSEngine,
  TranscriptEntry,
  SynthesizeOptions,
  RecognizeOptions,
  RecognitionResult,
  RecognitionController as IRecognitionController,
  RecognitionChain,
  SynthesisSnapshot,
  RecognitionSnapshot,
  TranscriptSnapshot,
  QonvoSnapshot,
  ConversationSnapshot,
  VoiceError,
} from './types'
import {
  createVoiceError,
  toVoiceError,
  logError,
  isSystemError,
  shouldLogError,
  throwVoiceError,
  processVoiceError,
} from './errors'

// ---- Module State (Singleton) ----

let stt: STTEngine | null = null
let tts: TTSEngine | null = null
let transcript: TranscriptEntry[] = []
let isReady = false
let isRecognitionAvailable = false
let isSynthesisAvailable = false

// Recognition session tracking (single source of truth)
interface RecognitionSession {
  type: 'one-shot' | 'continuous'
  abortController: AbortController
  controller?: IRecognitionController
  startedAt: number
}

let activeRecognitionSession: RecognitionSession | null = null

// Synthesis session tracking (single source of truth)
interface SynthesisSession {
  text: string
  abortController: AbortController
  startedAt: number
  pausedAt?: number
}

let activeSynthesisSession: SynthesisSession | null = null

// Error state (single error - only one operation can fail at a time)
let lastError: VoiceError | null = null

// Global onError callback (set by QonvoProvider)
let globalOnError: ((error: VoiceError) => void) | undefined

// ---- State Management (4 separate snapshot systems) ----

// Synthesis snapshot
const synthesisListeners = new Set<() => void>()
let cachedSynthesisSnapshot: SynthesisSnapshot | null = null

export function subscribeToSynthesis(listener: () => void): () => void {
  synthesisListeners.add(listener)
  return () => synthesisListeners.delete(listener)
}

export function getSynthesisSnapshot(): SynthesisSnapshot {
  if (cachedSynthesisSnapshot) {
    return cachedSynthesisSnapshot
  }

  cachedSynthesisSnapshot = {
    isActive: activeSynthesisSession !== null,
    isPaused: activeSynthesisSession?.pausedAt !== undefined,
    isAvailable: isSynthesisAvailable,
  }

  return cachedSynthesisSnapshot
}

function setActiveSynthesisSession(session: SynthesisSession | null): void {
  activeSynthesisSession = session
  cachedSynthesisSnapshot = null
  for (const listener of synthesisListeners) {
    listener()
  }
}

// Recognition snapshot
const recognitionListeners = new Set<() => void>()
let cachedRecognitionSnapshot: RecognitionSnapshot | null = null

export function subscribeToRecognition(listener: () => void): () => void {
  recognitionListeners.add(listener)
  return () => recognitionListeners.delete(listener)
}

export function getRecognitionSnapshot(): RecognitionSnapshot {
  if (cachedRecognitionSnapshot) {
    return cachedRecognitionSnapshot
  }

  cachedRecognitionSnapshot = {
    isActive: activeRecognitionSession !== null,
    isAvailable: isRecognitionAvailable,
  }

  return cachedRecognitionSnapshot
}

function setActiveRecognitionSession(session: RecognitionSession | null): void {
  activeRecognitionSession = session
  cachedRecognitionSnapshot = null
  for (const listener of recognitionListeners) {
    listener()
  }
}

// Transcript snapshot
const transcriptListeners = new Set<() => void>()
let cachedTranscriptSnapshot: TranscriptSnapshot | null = null

export function subscribeToTranscript(listener: () => void): () => void {
  transcriptListeners.add(listener)
  return () => transcriptListeners.delete(listener)
}

export function getTranscriptSnapshot(): TranscriptSnapshot {
  if (cachedTranscriptSnapshot) {
    return cachedTranscriptSnapshot
  }

  // Get the latest non-final entry (STT sends cumulative text)
  const nonFinalEntries = transcript.filter((t) => !t.final)
  const caption =
    nonFinalEntries.length > 0 ? nonFinalEntries[nonFinalEntries.length - 1].text : undefined

  cachedTranscriptSnapshot = {
    entries: transcript.filter((t) => t.final),
    caption,
  }

  return cachedTranscriptSnapshot
}

// Qonvo snapshot (general state)
const qonvoListeners = new Set<() => void>()
let cachedQonvoSnapshot: QonvoSnapshot | null = null

export function subscribeToQonvo(listener: () => void): () => void {
  qonvoListeners.add(listener)
  return () => qonvoListeners.delete(listener)
}

export function getQonvoSnapshot(): QonvoSnapshot {
  if (cachedQonvoSnapshot) {
    return cachedQonvoSnapshot
  }

  cachedQonvoSnapshot = {
    isReady,
    error: lastError,
  }

  return cachedQonvoSnapshot
}

// Conversation snapshot
const conversationListeners = new Set<() => void>()
let cachedConversationSnapshot: ConversationSnapshot | null = null

export function subscribeToConversation(listener: () => void): () => void {
  conversationListeners.add(listener)
  return () => conversationListeners.delete(listener)
}

export function getConversationSnapshot(): ConversationSnapshot {
  if (cachedConversationSnapshot) {
    return cachedConversationSnapshot
  }

  cachedConversationSnapshot = {
    isActive: activeConversationLoop !== null,
    isAvailable: isSynthesisAvailable && isRecognitionAvailable,
  }

  return cachedConversationSnapshot
}

function notifyConversation(): void {
  cachedConversationSnapshot = null
  for (const listener of conversationListeners) {
    try {
      listener()
    } catch (err) {
      console.error('Error in conversation listener:', err)
    }
  }
}

// Internal notify helpers for targeted notifications
function notifySynthesis(): void {
  cachedSynthesisSnapshot = null
  for (const listener of synthesisListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[Qonvo] Synthesis listener error:', error)
    }
  }
}

function notifyRecognition(): void {
  cachedRecognitionSnapshot = null
  for (const listener of recognitionListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[Qonvo] Recognition listener error:', error)
    }
  }
}

function notifyTranscript(): void {
  cachedTranscriptSnapshot = null
  for (const listener of transcriptListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[Qonvo] Transcript listener error:', error)
    }
  }
}

function notifyQonvo(): void {
  cachedQonvoSnapshot = null
  for (const listener of qonvoListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[Qonvo] Qonvo listener error:', error)
    }
  }
}

// Notify all systems (when multiple features affected)
function notifyAll(): void {
  notifySynthesis()
  notifyRecognition()
  notifyTranscript()
  notifyQonvo()
}

// ---- Error State Mutators ----

// Internal: Set error state
function setError(error: VoiceError | null): void {
  lastError = error
  notifyQonvo()
}

// Exported: Set global onError callback (called by QonvoProvider)
export function setGlobalOnError(callback: ((error: VoiceError) => void) | undefined): void {
  globalOnError = callback
}

// Exported: Clear error state
export function clearError(): void {
  lastError = null
  notifyQonvo()
}

// Internal: Handle error - sets state and calls callbacks
// Exported for use by processVoiceError utility
export function handleError(error: VoiceError, onError?: (error: VoiceError) => void): void {
  // Don't set error state for ABORTED - it's intentional user action, not a failure
  if (error.code !== 'ABORTED') {
    setError(error)
  }

  // Call per-operation onError callback (still called even for ABORTED)
  if (onError) {
    try {
      onError(error)
    } catch (err) {
      console.error('[Qonvo] Error in onError callback:', err)
    }
  }

  // Call global onError callback (still called even for ABORTED)
  if (globalOnError) {
    try {
      globalOnError(error)
    } catch (err) {
      console.error('[Qonvo] Error in global onError callback:', err)
    }
  }
}

// ---- Transcript Management ----

// Generate unique IDs
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// Add or update interim entry
function addInterimTranscript(role: 'user' | 'assistant', text: string): void {
  // Find existing interim entry for this role
  const interimIndex = transcript.findIndex((t) => t.role === role && !t.final)

  if (interimIndex !== -1) {
    // Replace existing interim with latest cumulative text
    transcript[interimIndex] = {
      id: transcript[interimIndex].id, // Keep same ID
      role,
      text,
      at: Date.now(),
      final: false,
    }
  } else {
    // Create new interim entry
    transcript.push({
      id: generateId(),
      role,
      text,
      at: Date.now(),
      final: false,
    })
  }
  notifyTranscript()
}

// Finalize interim entry or add new final
function addFinalTranscript(role: 'user' | 'assistant', text: string): void {
  // Remove any interim entries for this role
  transcript = transcript.filter((t) => !(t.role === role && !t.final))

  // Add final entry
  transcript.push({
    id: generateId(),
    role,
    text,
    at: Date.now(),
    final: true,
  })
  notifyTranscript()
}

// Clear transcript
export function clearTranscript(): void {
  transcript = []
  notifyTranscript()
}

export function setEngines(sttEngine: STTEngine | null, ttsEngine: TTSEngine | null): void {
  stt = sttEngine
  tts = ttsEngine
  notifyAll()
}

// ---- Availability ----

export async function refreshAvailability(): Promise<void> {
  const sttAvail = await (stt?.availability?.() ??
    Promise.resolve({ stt: false, tts: false } as Availability))
  const ttsAvail = await (tts?.availability?.() ??
    Promise.resolve({ stt: false, tts: false } as Availability))
  isReady = true
  isRecognitionAvailable = !!sttAvail.stt
  isSynthesisAvailable = !!ttsAvail.tts
  // Notify all: availability affects synthesis, recognition, and qonvo state
  notifySynthesis()
  notifyRecognition()
  notifyQonvo()
}

// ---- TTS Control (Singleton) ----

export async function startSynthesis(text: string, options: SynthesizeOptions = {}): Promise<void> {
  if (!tts) {
    throw createVoiceError('TTS_NOT_AVAILABLE', 'Text-to-speech not available')
  }

  // Stop any existing session
  if (activeSynthesisSession) {
    await stopSynthesis()
  }

  // Create new session
  const abortController = new AbortController()
  const signal = options.signal || abortController.signal

  const session: SynthesisSession = {
    text,
    abortController,
    startedAt: Date.now(),
  }

  // Set as active (automatically notifies React)
  setActiveSynthesisSession(session)
  setError(null)

  // Add to transcript immediately (synthesis text known upfront)
  addFinalTranscript('assistant', text)

  try {
    await tts.start(text, { ...options, signal })
  } catch (error) {
    processVoiceError(error, 'startSynthesis', {
      defaultCode: 'TTS_FAILED',
      onError: options.onError,
      handleError,
      shouldThrow: true,
    })
  } finally {
    // Clear session (automatically updates isActive/isPaused)
    if (activeSynthesisSession === session) {
      setActiveSynthesisSession(null)
    }
  }
}

export async function pauseSynthesis(): Promise<void> {
  if (!tts || !activeSynthesisSession) return

  try {
    await tts.pause()
    // Update session to mark as paused
    if (activeSynthesisSession) {
      activeSynthesisSession.pausedAt = Date.now()
      setActiveSynthesisSession(activeSynthesisSession) // Notify listeners
    }
  } catch (error) {
    const voiceError = toVoiceError(error, 'TTS_FAILED')
    logError(voiceError, 'pause')
    throwVoiceError(voiceError)
  }
}

export async function resumeSynthesis(): Promise<void> {
  if (!tts || !activeSynthesisSession?.pausedAt) return

  try {
    await tts.resume()
    // Update session to clear paused state
    if (activeSynthesisSession) {
      activeSynthesisSession.pausedAt = undefined
      setActiveSynthesisSession(activeSynthesisSession) // Notify listeners
    }
  } catch (error) {
    const voiceError = toVoiceError(error, 'TTS_FAILED')
    logError(voiceError, 'resume')
    throwVoiceError(voiceError)
  }
}

export async function stopSynthesis(): Promise<void> {
  if (!tts || !activeSynthesisSession) return

  const session = activeSynthesisSession

  // Clear session first (updates isActive/isPaused immediately)
  setActiveSynthesisSession(null)

  // Then stop the engine
  session.abortController.abort()

  try {
    await tts.stop()
  } catch (error) {
    const voiceError = toVoiceError(error, 'TTS_FAILED')
    if (shouldLogError(voiceError)) {
      logError(voiceError, 'stopSynthesis')
    }
    // Don't re-throw - stop operations always succeed from caller's perspective
  }
}

// ---- STT Control (Singleton) ----

/**
 * Unified phrase matching logic.
 * Uses substring matching for flexibility.
 *
 * @param text - The recognized text to search in
 * @param phrase - The phrase to search for
 * @returns true if phrase is found in text (case-insensitive, normalized)
 */
export function matchPhrase(text: string, phrase: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalize(text).includes(normalize(phrase))
}

// ---- Internal Orchestration Primitives ----

/**
 * Internal: Simple one-shot recognition primitive.
 * Returns plain Promise - no controller, no voice commands, no session tracking.
 *
 * Used by: conversation API, TopicContext (optional future use)
 *
 * @internal
 */
async function recognizeOnce(options?: {
  caption?: boolean
  signal?: AbortSignal
}): Promise<RecognitionResult> {
  if (!stt) {
    throw createVoiceError('STT_NOT_AVAILABLE', 'Speech recognition not available')
  }

  // Capture stt in closure to satisfy TypeScript null check
  const sttEngine = stt

  return new Promise((resolve, reject) => {
    const abortController = new AbortController()
    const signal = options?.signal || abortController.signal

    sttEngine
      .start({
        onPartial: options?.caption ? (text) => addInterimTranscript('user', text) : undefined,
        onFinal: (text, confidence) => {
          addFinalTranscript('user', text)
          resolve({ text, at: Date.now(), confidence })
        },
        onError: (error) => {
          if (error.code !== 'ABORTED' && error.code !== 'NO_SPEECH') {
            reject(error)
          }
        },
        signal,
      })
      .catch((error) => {
        const voiceError = toVoiceError(error, 'STT_FAILED')
        if (voiceError.code !== 'ABORTED') {
          reject(voiceError)
        }
      })
  })
}

// ---- RecognitionTask Implementation ----

/**
 * UnifiedRecognitionController - A Promise/Controller for speech recognition.
 *
 * Supports two modes via options.method:
 * - 'once': Recognizes once and stops automatically
 * - 'continuous': Keeps listening until explicitly stopped (default)
 *
 * Both modes support .when().then() for phrase matching.
 */
class UnifiedRecognitionController implements IRecognitionController {
  private triggers = new Map<string, (controller: IRecognitionController) => void>()
  private session: RecognitionSession
  private promise: Promise<RecognitionResult>
  private resolveResult!: (result: RecognitionResult) => void
  private rejectResult!: (error: any) => void

  constructor(method: 'once' | 'continuous', options: RecognizeOptions = {}) {
    // Create promise with deferred pattern FIRST
    this.promise = new Promise<RecognitionResult>((resolve, reject) => {
      this.resolveResult = resolve
      this.rejectResult = reject
    })

    // Create abort controller
    const abortController = new AbortController()

    // Create session
    this.session = {
      type: method === 'once' ? 'one-shot' : 'continuous',
      abortController,
      controller: this,
      startedAt: Date.now(),
    }

    // Set as active
    setActiveRecognitionSession(this.session)
    setError(null)

    // Start recognition
    if (method === 'once') {
      this.startOnceMode(options, abortController)
    } else {
      this.startContinuousMode(options, abortController)
    }
  }

  private startOnceMode(options: RecognizeOptions, abortController: AbortController): void {
    stt!
      .start({
        onPartial: options.caption ? (text) => addInterimTranscript('user', text) : undefined,
        onFinal: (text, confidence) => {
          addFinalTranscript('user', text)

          // Check triggers
          for (const [phrase, callback] of this.triggers) {
            if (matchPhrase(text, phrase)) {
              callback(this)
            }
          }

          // Resolve promise
          this.resolveResult({ text, at: Date.now(), confidence })

          // Stop automatically (once behavior)
          this.stop().catch(() => {})
        },
        onError: (error) => {
          if (error.code !== 'ABORTED' && error.code !== 'NO_SPEECH') {
            this.rejectResult(error)
            handleError(error, options.onError)
          }
          this.stop().catch(() => {})
        },
        signal: abortController.signal,
      })
      .catch((error) => {
        const voiceError = toVoiceError(error, 'STT_FAILED')
        if (voiceError.code !== 'ABORTED') {
          this.rejectResult(voiceError)
          handleError(voiceError, options.onError)
        }
        if (activeRecognitionSession === this.session) {
          setActiveRecognitionSession(null)
        }
      })
  }

  private startContinuousMode(options: RecognizeOptions, abortController: AbortController): void {
    stt!
      .start({
        onPartial: options.caption ? (text) => addInterimTranscript('user', text) : undefined,
        onFinal: (text) => {
          addFinalTranscript('user', text)

          // Check triggers
          for (const [phrase, callback] of this.triggers) {
            if (matchPhrase(text, phrase)) {
              callback(this)
            }
          }

          // Don't resolve promise - continuous mode keeps going
        },
        onError: (error) => {
          if (error.code !== 'ABORTED' && error.code !== 'NO_SPEECH') {
            handleError(error, options.onError)
            if (shouldLogError(error)) {
              logError(error, 'UnifiedRecognitionController.continuous')
            }
          }
        },
        signal: abortController.signal,
      })
      .catch((error) => {
        const voiceError = toVoiceError(error, 'STT_FAILED')
        if (voiceError.code !== 'ABORTED') {
          handleError(voiceError, options.onError)
          if (shouldLogError(voiceError)) {
            logError(voiceError, 'UnifiedRecognitionController.continuous.catch')
          }
        }
        if (activeRecognitionSession === this.session) {
          setActiveRecognitionSession(null)
        }
      })
  }

  when(phrase: string): RecognitionChain {
    return {
      then: (callback) => {
        this.triggers.set(phrase, callback)
        return this
      },
    }
  }

  on(_event: string, _callback: (data: any) => void): IRecognitionController {
    // Future: event handling
    return this
  }

  async stop(): Promise<void> {
    await stopRecognition()
  }

  // Thenable protocol - delegate to internal promise
  then<TResult1 = RecognitionResult, TResult2 = never>(
    onfulfilled?: ((value: RecognitionResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<RecognitionResult | TResult> {
    return this.promise.catch(onrejected)
  }

  finally(onfinally?: (() => void) | null): Promise<RecognitionResult> {
    return this.promise.finally(onfinally)
  }

  get [Symbol.toStringTag]() {
    return 'UnifiedRecognitionController'
  }
}

/**
 * Start speech recognition with unified controller.
 *
 * @param options - Recognition options
 * @param options.method - Recognition mode: 'once' (stops after first result) or 'continuous' (keeps listening). Default: 'continuous'
 * @param options.caption - Enable live captions (interim results)
 * @returns RecognitionController that supports .when().then() and Promise interface
 *
 * @example
 * // Continuous with voice commands (default)
 * recognition.start()
 *   .when("next").then(() => nextPage())
 *   .when("stop").then((ctrl) => ctrl.stop())
 *
 * @example
 * // One-time recognition
 * const result = await recognition.start({ method: 'once' })
 * console.log(result.text)
 *
 * @example
 * // One-time with trigger
 * recognition.start({ method: 'once' })
 *   .when("yes").then(() => console.log("User said yes!"))
 */
export function startRecognition(options: RecognizeOptions = {}): IRecognitionController {
  if (!stt) {
    throw createVoiceError('STT_NOT_AVAILABLE', 'Speech recognition not available')
  }

  // Stop any existing session
  if (activeRecognitionSession) {
    setActiveRecognitionSession(null)
    stopRecognition().catch(() => {})
  }

  const method = options.method ?? 'continuous'
  return new UnifiedRecognitionController(method, options)
}

export async function stopRecognition(): Promise<void> {
  if (!stt || !activeRecognitionSession) return

  const session = activeRecognitionSession

  // Clear session first (updates isActive immediately)
  setActiveRecognitionSession(null)

  // Then stop the engine
  session.abortController.abort()

  try {
    await stt.stop()
  } catch (error) {
    const voiceError = toVoiceError(error, 'STT_FAILED')
    if (shouldLogError(voiceError)) {
      logError(voiceError, 'stopRecognition')
    }
    // Don't re-throw - stop operations always succeed from caller's perspective
  }
}

// ---- Conversation API (Orchestration) ----

// Track active conversation loop
let activeConversationLoop: {
  isRunning: boolean
  abortController: AbortController
} | null = null

/**
 * Start a conversation with automatic listen-respond loop.
 *
 * Symmetrical with recognition API:
 * - method: 'once' | 'continuous' (default: 'continuous')
 * - caption: boolean (default: true)
 *
 * @param options.method - 'once' for single interaction, 'continuous' for loop (default)
 * @param options.caption - Enable live captions (default: true)
 *
 * @example
 * // Magic 8-Ball
 * conversation.start()
 *   .onRecognition(() => `The spirits say... ${pickRandom(ANSWERS)}`)
 *
 * @example
 * // One-time Q&A
 * conversation.start({ method: 'once' })
 *   .onRecognition(({ text }) => `You said: ${text}`)
 *
 * @example
 * // Custom delay between interactions
 * conversation.start()
 *   .onRecognition(() => response, { pauseMs: 2000 })
 *
 * @param loopOptions.pauseMs - Delay in ms after each response before listening again.
 *   Default: 1000ms. Minimum: 500ms (enforced to prevent audio feedback).
 *   This prevents the STT from hearing TTS output and responding to itself.
 */
export function startConversation(options?: {
  method?: 'once' | 'continuous'
  caption?: boolean
}): {
  onRecognition: (
    callback: (result: RecognitionResult) => string | Promise<string>,
    loopOptions?: { pauseMs?: number }
  ) => void
} {
  const { method = 'continuous', caption = true } = options || {}

  // Stop any existing conversation
  if (activeConversationLoop) {
    stopConversation()
  }

  const abortController = new AbortController()
  activeConversationLoop = {
    isRunning: true,
    abortController,
  }

  // Notify React that conversation state has changed
  notifyConversation()

  return {
    onRecognition: (callback, loopOptions) => {
      // Default 1000ms, minimum 500ms to prevent audio feedback
      const MIN_PAUSE_MS = 500
      const DEFAULT_PAUSE_MS = 1000
      const requestedPause = loopOptions?.pauseMs ?? DEFAULT_PAUSE_MS
      const pauseMs = Math.max(requestedPause, MIN_PAUSE_MS)

      // Run loop in background (non-blocking)
      ;(async () => {
        do {
          try {
            // Use internal primitive (no controller overhead)
            const result = await recognizeOnce({
              caption,
              signal: abortController.signal,
            })

            if (!activeConversationLoop?.isRunning) break

            // Get response from callback
            const response = await callback(result)

            if (!activeConversationLoop?.isRunning) break

            // Synthesize response
            await startSynthesis(response)

            // Always wait to prevent audio feedback (STT hearing TTS output)
            if (activeConversationLoop?.isRunning) {
              await new Promise((resolve) => setTimeout(resolve, pauseMs))
            }
          } catch (error) {
            const voiceErr = error as VoiceError

            // ABORTED - clean exit
            if (voiceErr.code === 'ABORTED' || !activeConversationLoop?.isRunning) {
              break
            }

            // NO_SPEECH - continue
            if (voiceErr.code === 'NO_SPEECH') {
              continue
            }

            // System errors - fatal
            if (isSystemError(voiceErr)) {
              if (shouldLogError(voiceErr)) {
                logError(voiceErr, 'Conversation loop')
              }
              break
            }

            // Other errors - retry if recoverable
            if (!voiceErr.recoverable) {
              if (shouldLogError(voiceErr)) {
                logError(voiceErr, 'Conversation loop')
              }
              break
            }

            // Log and retry
            if (shouldLogError(voiceErr)) {
              logError(voiceErr, 'Conversation loop')
            }
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        } while (method === 'continuous' && activeConversationLoop?.isRunning)

        // Cleanup
        activeConversationLoop = null
        notifyConversation()
      })()
    },
  }
}

/**
 * Stop the active conversation loop.
 * Also stops any ongoing recognition/synthesis.
 */
export function stopConversation(): void {
  if (activeConversationLoop) {
    activeConversationLoop.isRunning = false
    activeConversationLoop.abortController.abort()
    activeConversationLoop = null
    notifyConversation()
  }

  // Stop any ongoing voice operations
  stopRecognition().catch(() => {})
  stopSynthesis().catch(() => {})
}

// ---- Utilities ----

export async function listVoices(): Promise<Array<{ id: string; name: string; lang: string }>> {
  return (await tts?.listVoices()) ?? []
}

export async function listLanguages(): Promise<
  Array<{ code: string; name: string; voiceCount: number }>
> {
  const voices = await listVoices()
  const langMap = new Map<string, Set<string>>()

  // Group voices by language
  voices.forEach((v) => {
    if (!langMap.has(v.lang)) {
      langMap.set(v.lang, new Set())
    }
    langMap.get(v.lang)!.add(v.name)
  })

  // Convert to array with friendly names
  return Array.from(langMap.entries())
    .map(([code, voiceNames]) => ({
      code,
      name: getLanguageName(code),
      voiceCount: voiceNames.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Helper to get friendly language names
function getLanguageName(code: string): string {
  // Use Intl.DisplayNames if available (modern browsers)
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    try {
      const displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
      const [lang, region] = code.split('-')

      if (region) {
        // Get language and region separately
        const langName = displayNames.of(lang) || lang
        const regionName = new Intl.DisplayNames(['en'], { type: 'region' }).of(region) || region
        return `${langName} (${regionName})`
      }

      return displayNames.of(lang) || code
    } catch {
      // Fallback if Intl fails
      return code
    }
  }

  // Fallback: just return the code
  return code
}
