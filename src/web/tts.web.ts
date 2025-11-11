import type { TTSEngine, Availability } from '../core/types'
/// <reference path="../core/web-speech-api.d.ts" />

type TTSOpts = {
  rate?: number
  pitch?: number
  voice?: string
  lang?: string
  signal?: AbortSignal
}

function getSpeechSynthesis(): SpeechSynthesis | undefined {
  if (typeof window === 'undefined') return undefined
  return window.speechSynthesis
}

export function createWebTTS(): TTSEngine {
  let isActive = false
  let isPaused = false

  const availability = async (): Promise<Availability> => {
    const ok = typeof window !== 'undefined' && 'speechSynthesis' in window
    return { stt: false, tts: ok, details: ok ? undefined : 'Web SpeechSynthesis not available' }
  }

  const listVoices = async () => {
    const ss = getSpeechSynthesis()
    if (!ss) return []

    let voices = ss.getVoices()

    // If voices not loaded yet, wait for voiceschanged event with timeout fallback
    if (voices.length === 0) {
      voices = await Promise.race([
        // Wait for voiceschanged event
        new Promise<SpeechSynthesisVoice[]>((resolve) => {
          ss.addEventListener(
            'voiceschanged',
            () => {
              resolve(ss.getVoices())
            },
            { once: true }
          )
        }),
        // Timeout fallback (100ms - voices usually load immediately or within this time)
        new Promise<SpeechSynthesisVoice[]>((resolve) => {
          setTimeout(() => resolve(ss.getVoices()), 100)
        }),
      ])
    }

    return voices.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang }))
  }

  const start = async (text: string, opts: TTSOpts) => {
    const ss = getSpeechSynthesis()
    if (!ss) return

    // Cancel existing speech
    if (isActive) ss.cancel()

    const u = new SpeechSynthesisUtterance(text)
    if (opts.rate) u.rate = opts.rate
    if (opts.pitch) u.pitch = opts.pitch

    // Voice selection priority: specific voice > language-based selection
    if (opts.voice) {
      const v = ss.getVoices().find((v) => v.name === opts.voice || v.voiceURI === opts.voice)
      if (v) u.voice = v
    } else if (opts.lang) {
      // Auto-select first voice matching the language
      const v = ss.getVoices().find((v) => v.lang === opts.lang)
      if (v) u.voice = v
    }

    // Set language (helps with pronunciation even if voice is set)
    if (opts.lang) u.lang = opts.lang

    isActive = true
    isPaused = false

    return new Promise<void>((resolve, reject) => {
      // Handle abort signal
      const abortHandler = () => {
        ss.cancel()
        isActive = false
        isPaused = false
        const abortError = new Error('Speech was aborted')
        abortError.name = 'AbortError'
        reject(abortError)
      }

      if (opts.signal) {
        if (opts.signal.aborted) {
          abortHandler()
          return
        }
        opts.signal.addEventListener('abort', abortHandler, { once: true })
      }

      u.onend = () => {
        isActive = false
        isPaused = false
        if (opts.signal) {
          opts.signal.removeEventListener('abort', abortHandler)
        }
        resolve()
      }

      u.onerror = (event) => {
        isActive = false
        isPaused = false
        if (opts.signal) {
          opts.signal.removeEventListener('abort', abortHandler)
        }
        reject(new Error(`Speech synthesis error: ${event.error}`))
      }

      ss.speak(u)
    })
  }

  const pause = async () => {
    const ss = getSpeechSynthesis()
    if (ss && isActive) {
      ss.pause()
      isPaused = true
    }
  }

  const resume = async () => {
    const ss = getSpeechSynthesis()
    if (ss && isPaused) {
      ss.resume()
      isPaused = false
    }
  }

  const stop = async () => {
    const ss = getSpeechSynthesis()
    ss?.cancel()
    isActive = false
    isPaused = false
  }

  return { availability, listVoices, start, pause, resume, stop, isActive, isPaused }
}
