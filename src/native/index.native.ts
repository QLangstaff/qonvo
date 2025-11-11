// Qonvo React Native Platform Entry Point

import { initializePlatform } from '../core/platform'
import { createNativeSTT } from './stt.native'
import { createNativeTTS } from './tts.native'

// Initialize native engines
initializePlatform(createNativeSTT(), createNativeTTS())

// Re-export all shared functionality
export * from '../core/platform'
