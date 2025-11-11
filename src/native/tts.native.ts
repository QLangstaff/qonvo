import type { TTSEngine, Availability } from '../core/types'
import type { ExpoSpeech, DynamicModule, VoiceInfo } from '../core/native-types'
import { safeCleanup } from '../core/errors'

type TTSOpts = { rate?: number; pitch?: number; voice?: string; lang?: string }

export function createNativeTTS(): TTSEngine {
  let ExpoSpeech: ExpoSpeech | null = null
  let isActive = false
  let isPaused = false

  const tryLoad = async (): Promise<ExpoSpeech | null> => {
    if (ExpoSpeech) return ExpoSpeech
    try {
      const mod = (await import('expo-speech')) as DynamicModule<ExpoSpeech>
      ExpoSpeech = ('default' in mod ? mod.default : mod) as ExpoSpeech
    } catch {
      ExpoSpeech = null
    }
    return ExpoSpeech
  }

  const availability = async (): Promise<Availability> => {
    const s = await tryLoad()
    return { stt: false, tts: !!s, details: s ? undefined : 'expo-speech not installed' }
  }

  const listVoices = async () => {
    const s = await tryLoad()
    if (!s?.getAvailableVoicesAsync) return []
    const vs = await s.getAvailableVoicesAsync()
    return (vs || []).map((v: VoiceInfo) => ({
      id: v.identifier || v.name,
      name: v.name || v.identifier,
      lang: v.language || '',
    }))
  }

  const start = async (text: string, opts: TTSOpts) => {
    const s = await tryLoad()
    if (!s?.speak) return

    // Voice selection: use specified voice, or auto-select by language
    let voiceId = opts.voice
    if (!voiceId && opts.lang && s.getAvailableVoicesAsync) {
      const vs = await s.getAvailableVoicesAsync()
      const match = vs?.find((v: VoiceInfo) => v.language === opts.lang)
      if (match) voiceId = match.identifier || match.name
    }

    isActive = true
    await new Promise<void>((resolve) => {
      s.speak(text, {
        rate: opts.rate,
        pitch: opts.pitch,
        voice: voiceId,
        language: opts.lang,
        onDone: () => {
          isActive = false
          resolve()
        },
      })
    })
  }

  const pause = async () => {
    const s = await tryLoad()
    await safeCleanup(() => s?.pause?.(), 'NativeTTS.pause')
    isPaused = true
  }

  const resume = async () => {
    const s = await tryLoad()
    await safeCleanup(() => s?.resume?.(), 'NativeTTS.resume')
    isPaused = false
  }

  const stop = async () => {
    const s = await tryLoad()
    await safeCleanup(() => s?.stop?.(), 'NativeTTS.stop')
    isActive = false
    isPaused = false
  }

  return { availability, listVoices, start, pause, resume, stop, isActive, isPaused }
}
