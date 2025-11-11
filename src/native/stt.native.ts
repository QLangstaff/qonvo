import type { STTEngine, Availability } from '../core/types'
import type {
  Voice,
  SpeechResultsEvent,
  SpeechErrorEvent,
  DynamicModule,
} from '../core/native-types'
import { safeCleanup, createErrorMapper } from '../core/errors'

// Create error mapper for React Native Voice errors
const mapNativeVoiceError = createErrorMapper(
  {
    permissions: 'PERMISSION_DENIED',
    'no-match': 'NO_SPEECH',
    network: 'NETWORK_ERROR',
    audio: 'AUDIO_CAPTURE_FAILED',
    aborted: 'ABORTED',
  },
  'STT_FAILED'
)

export function createNativeSTT(): STTEngine {
  let Voice: Voice | null = null
  let isActive = false
  let handlers: {
    onPartial?: (t: string) => void
    onFinal?: (t: string, c?: number) => void
    onError?: (error: any) => void
  } = {}

  const tryLoad = async (): Promise<Voice | null> => {
    if (Voice) return Voice
    try {
      const mod = (await import('@react-native-voice/voice')) as DynamicModule<Voice>
      Voice = 'default' in mod ? mod.default : mod
    } catch {
      Voice = null
    }
    return Voice
  }

  const availability = async (): Promise<Availability> => {
    const v = await tryLoad()
    return {
      stt: !!v,
      tts: false,
      details: v ? undefined : '@react-native-voice/voice not installed',
    }
  }

  const start: STTEngine['start'] = async (opts) => {
    const v = await tryLoad()
    if (!v) return
    handlers = opts || {}
    v.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const t = e?.value?.[0]
      if (t) handlers.onPartial?.(t)
    }
    v.onSpeechResults = (e: SpeechResultsEvent) => {
      const t = e?.value?.[0]
      if (t) handlers.onFinal?.(t, undefined)
    }
    v.onSpeechError = (e: SpeechErrorEvent) => {
      // Map React Native Voice errors to Qonvo error codes
      const errorCode = e?.error?.code || ''
      const errorMessage = e?.error?.message || 'Speech recognition error'

      const voiceError = mapNativeVoiceError(errorCode, errorMessage)

      handlers.onError?.(voiceError)
    }
    await v.start('en-US')
    isActive = true
  }

  const stop = async () => {
    const v = await tryLoad()
    if (v) {
      await safeCleanup(() => v.stop(), 'NativeSTT.stop')
      await safeCleanup(() => v.destroy(), 'NativeSTT.destroy')
      await safeCleanup(() => v.removeAllListeners?.(), 'NativeSTT.removeListeners')
    }
    isActive = false
  }

  return { availability, start, stop, isActive }
}
