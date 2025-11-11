// Error handling for Qonvo

import type { VoiceError, VoiceErrorCode } from './types'

// Create a structured VoiceError with automatic metadata enrichment
export function createVoiceError(
  code: VoiceErrorCode,
  message: string,
  options?: {
    cause?: Error
    context?: Record<string, unknown>
  }
): VoiceError {
  const error = new Error(message) as VoiceError
  error.code = code
  error.name = `VoiceError[${code}]`
  if (options?.cause) error.cause = options.cause
  if (options?.context) error.context = options.context

  // Automatically enrich with metadata based on error code
  enrichErrorMetadata(error)

  return error
}

// Automatically set metadata fields based on error code
function enrichErrorMetadata(error: VoiceError): void {
  switch (error.code) {
    case 'ABORTED':
      error.userAction = true
      error.recoverable = false
      break

    case 'NO_SPEECH':
      error.userAction = false // Not user's fault - just silence
      error.recoverable = true // Can retry
      break

    case 'PERMISSION_DENIED':
    case 'NOT_SUPPORTED':
    case 'TTS_NOT_AVAILABLE':
    case 'STT_NOT_AVAILABLE':
      error.needsPermission = true // System-level permission/support issue
      error.recoverable = true // User can fix by granting permission
      break

    case 'TTS_FAILED':
    case 'STT_FAILED':
    case 'AUDIO_CAPTURE_FAILED':
    case 'CONVERSATION_ERROR':
      error.recoverable = true // Operation failed but can retry
      break

    case 'NETWORK_ERROR':
      error.recoverable = true // Network might recover
      break

    case 'INVALID_STATE':
      error.recoverable = false // Logic error, shouldn't happen
      break
  }
}

// Convert unknown error to VoiceError
export function toVoiceError(
  error: unknown,
  defaultCode: VoiceErrorCode = 'TTS_FAILED'
): VoiceError {
  if (isVoiceError(error)) {
    return error
  }

  if (error instanceof Error) {
    // Check for AbortError
    if (error.name === 'AbortError') {
      return createVoiceError('ABORTED', 'Operation was aborted', { cause: error })
    }

    return createVoiceError(defaultCode, error.message, { cause: error })
  }

  return createVoiceError(defaultCode, String(error))
}

// Type guard for VoiceError
export function isVoiceError(error: unknown): error is VoiceError {
  return error instanceof Error && 'code' in error && typeof (error as VoiceError).code === 'string'
}

// Determine if error is system-level (affects all operations)
// These errors should be shown globally, not per-operation
export function isSystemError(error: VoiceError): boolean {
  return ['PERMISSION_DENIED', 'NOT_SUPPORTED', 'TTS_NOT_AVAILABLE', 'STT_NOT_AVAILABLE'].includes(
    error.code
  )
}

// Error logging configuration
let errorLoggingEnabled = true

// Unified error logging policy: don't log expected/silent errors
const SILENT_ERROR_CODES: VoiceErrorCode[] = ['ABORTED', 'NO_SPEECH']

export function setErrorLogging(enabled: boolean): void {
  errorLoggingEnabled = enabled
}

// Determine if error should be logged
export function shouldLogError(error: VoiceError): boolean {
  return !SILENT_ERROR_CODES.includes(error.code)
}

export function logError(error: VoiceError | Error, context?: string): void {
  if (!errorLoggingEnabled) return

  // Skip silent errors if it's a VoiceError
  if (isVoiceError(error) && !shouldLogError(error)) {
    return
  }

  const prefix = context ? `[Qonvo:${context}]` : '[Qonvo]'

  if (isVoiceError(error)) {
    console.error(`${prefix} ${error.code}:`, error.message)
    if (error.cause) console.error('  Cause:', error.cause)
    if (error.context) console.error('  Context:', error.context)
  } else {
    console.error(prefix, error)
  }
}

// Safe cleanup helper
export async function safeCleanup(fn: () => void | Promise<void>, context: string): Promise<void> {
  try {
    await fn()
  } catch (error) {
    logError(toVoiceError(error, 'INVALID_STATE'), `${context} cleanup`)
  }
}

// Throw helper that silently handles ABORTED errors (single source of truth)
export function throwVoiceError(error: VoiceError): never | void {
  // Don't throw ABORTED errors - they're intentional user actions, not failures
  if (error.code === 'ABORTED') {
    return
  }
  throw error
}

/**
 * Create an error mapper function for platform-specific error codes.
 * This provides a DRY way to convert platform errors to Qonvo error codes.
 *
 * @param errorCodeMap - Mapping from platform error codes to VoiceErrorCode
 * @param defaultCode - Default error code if no mapping found
 * @returns Function that converts platform errors to VoiceError
 *
 * @example
 * ```typescript
 * const mapError = createErrorMapper({
 *   'not-allowed': 'PERMISSION_DENIED',
 *   'no-speech': 'NO_SPEECH',
 * }, 'STT_FAILED')
 *
 * const voiceError = mapError('not-allowed', 'Permission denied')
 * ```
 */
export function createErrorMapper(
  errorCodeMap: Record<string, VoiceErrorCode>,
  defaultCode: VoiceErrorCode
): (platformCode: string, message: string) => VoiceError {
  return (platformCode: string, message: string) => {
    const code = errorCodeMap[platformCode] || defaultCode
    return createVoiceError(code, message)
  }
}

/**
 * Unified error processing pipeline.
 * Converts unknown errors to VoiceError, logs them, and optionally throws.
 *
 * This centralizes the error handling pattern used throughout the codebase:
 * 1. Convert to VoiceError
 * 2. Call error handlers
 * 3. Log if appropriate
 * 4. Throw if requested
 *
 * @param error - The error to process (any type)
 * @param context - Context string for logging (e.g., "startSynthesis")
 * @param options - Processing options
 * @returns The processed VoiceError
 *
 * @example
 * ```typescript
 * try {
 *   await tts.speak(text)
 * } catch (error) {
 *   processVoiceError(error, 'startSynthesis', {
 *     defaultCode: 'TTS_FAILED',
 *     onError: options.onError,
 *     handleError,  // Pass the handler function
 *     shouldThrow: true
 *   })
 * }
 * ```
 */
export function processVoiceError(
  error: unknown,
  context: string,
  options: {
    defaultCode?: VoiceErrorCode
    onError?: (error: VoiceError) => void
    handleError?: (error: VoiceError, onError?: (error: VoiceError) => void) => void
    shouldThrow?: boolean
  } = {}
): VoiceError {
  const {
    defaultCode = 'TTS_FAILED',
    onError,
    handleError: errorHandler,
    shouldThrow = true,
  } = options

  // Convert to VoiceError
  const voiceError = toVoiceError(error, defaultCode)

  // Call error handler (sets state, calls callbacks)
  if (errorHandler) {
    errorHandler(voiceError, onError)
  }

  // Log error if appropriate
  if (shouldLogError(voiceError)) {
    logError(voiceError, context)
  }

  // Throw if requested
  if (shouldThrow) {
    throwVoiceError(voiceError)
  }

  return voiceError
}
