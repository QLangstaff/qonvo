// Qonvo Web Platform Entry Point

import { initializePlatform } from '../core/platform'
import { createWebSTT } from './stt.web'
import { createWebTTS } from './tts.web'

// Initialize web engines
initializePlatform(createWebSTT(), createWebTTS())

// Re-export all shared functionality
export * from '../core/platform'
