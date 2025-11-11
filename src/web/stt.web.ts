import type { STTEngine, Availability } from '../core/types'
import { safeCleanup, createErrorMapper } from '../core/errors'
/// <reference path="../core/web-speech-api.d.ts" />

function getSpeechRecognitionConstructor(): typeof SpeechRecognition | null {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

// Create error mapper for Web Speech API errors
const mapWebSpeechError = createErrorMapper(
  {
    aborted: 'ABORTED',
    'not-allowed': 'PERMISSION_DENIED',
    'service-not-allowed': 'PERMISSION_DENIED',
    'audio-capture': 'AUDIO_CAPTURE_FAILED',
    network: 'NETWORK_ERROR',
    'no-speech': 'NO_SPEECH',
    'language-not-supported': 'NOT_SUPPORTED',
  },
  'STT_FAILED'
)

export function createWebSTT(): STTEngine {
  let rec: SpeechRecognition | null = null
  let isActive = false
  let handlers: {
    onPartial?: (t: string) => void
    onFinal?: (t: string, c?: number) => void
    onError?: (error: any) => void
  } = {}

  const availability = async (): Promise<Availability> => {
    const ok = !!getSpeechRecognitionConstructor()
    return { stt: ok, tts: false, details: ok ? undefined : 'Web SpeechRecognition not available' }
  }

  const start: STTEngine['start'] = async (opts) => {
    const Ctor = getSpeechRecognitionConstructor()
    if (!Ctor) return

    // Stop any existing recognition before starting new one
    if (rec && isActive) {
      await stop()
    }

    handlers = opts || {}
    rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true

    // Handle abort signal
    const abortHandler = () => {
      stop()
    }

    if (opts.signal) {
      if (opts.signal.aborted) {
        return
      }
      opts.signal.addEventListener('abort', abortHandler, { once: true })
    }

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let interimTranscript = ''

      // Accumulate all results (e.results is cumulative)
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          const text = res[0].transcript.trim()
          const conf = res[0].confidence
          handlers.onFinal?.(text, conf)
        } else {
          // Accumulate interim text
          interimTranscript += res[0].transcript + ' '
        }
      }

      // Send accumulated interim text once per event
      if (interimTranscript && handlers.onPartial) {
        handlers.onPartial(interimTranscript.trim())
      }
    }

    rec.onend = () => {
      isActive = false
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortHandler)
      }
    }

    rec.onerror = (event) => {
      isActive = false
      if (opts.signal) {
        opts.signal.removeEventListener('abort', abortHandler)
      }

      // Map Web Speech API errors to Qonvo error codes
      const voiceError = mapWebSpeechError(event.error, event.message || event.error)

      handlers.onError?.(voiceError)
    }

    rec.start()
    isActive = true
  }

  const stop = async () => {
    await safeCleanup(() => rec?.stop(), 'WebSTT')
    isActive = false
    rec = null
  }

  return { availability, start, stop, isActive }
}
