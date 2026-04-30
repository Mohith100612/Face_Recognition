import { useRef, useState, useEffect, useCallback } from 'react'
import Webcam from 'react-webcam'
import * as faceapi from '@vladmandic/face-api'

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

function getTimeGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
const DETECT_EVERY_MS = 250    // 4 fps face detection
const RESULT_DISPLAY_MS = 5000
const NO_FACE_COOLDOWN_MS = 2000  // pause before retrying when backend says no_face

function getFemalVoice() {
  const voices = window.speechSynthesis.getVoices()

  // Priority list — sweet, natural-sounding female English voices
  const preferred = [
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Eva - English (United States)',
    'Microsoft Zira - English (United States)',
    'Google US English',
  ]

  for (const name of preferred) {
    const v = voices.find(v => v.name === name)
    if (v) return v
  }

  // Fallback: any English female voice
  return (
    voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')) ||
    voices.find(v => v.lang.startsWith('en') && /zira|eva|aria|jenny|hazel|susan|karen|samantha|victoria|fiona/i.test(v.name)) ||
    voices.find(v => v.lang.startsWith('en')) ||
    null
  )
}

function speak(text) {
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)

  const voice = getFemalVoice()
  if (voice) u.voice = voice

  u.pitch = 1.2   // slightly higher — sounds warmer and more feminine
  u.rate = 0.92   // a touch slower — feels more welcoming
  u.volume = 1.0

  window.speechSynthesis.speak(u)
}

export default function AttendancePage() {
  const webcamRef = useRef(null)
  const rafRef = useRef(null)
  const activeRef = useRef(false)
  const stateRef = useRef('idle')
  const recognitionRef = useRef(null)

  const [uiState, setUiState] = useState('idle')
  const [result, setResult] = useState(null)
  const [modelsReady, setModelsReady] = useState(false)
  const [modelError, setModelError] = useState(false)

  function setState(s) {
    stateRef.current = s
    setUiState(s)
  }

  useEffect(() => {
    faceapi.nets.tinyFaceDetector
      .loadFromUri(MODEL_URL)
      .then(() => {
        setModelsReady(true)
        setUiState('idle')
      })
      .catch(() => setModelError(true))
  }, [])

  const startLoop = useCallback(() => {
    let lastRun = 0

    const tick = async (ts) => {
      if (!activeRef.current || stateRef.current !== 'watching') return

      if (ts - lastRun >= DETECT_EVERY_MS) {
        lastRun = ts
        const video = webcamRef.current?.video
        if (video && video.readyState === 4) {
          try {
            const hits = await faceapi.detectAllFaces(
              video,
              new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.7 })
            )

            if (hits.length > 0 && stateRef.current === 'watching') {
              // Capture the screenshot at the exact moment face is confirmed
              const imageSrc = webcamRef.current?.getScreenshot()
              if (imageSrc) {
                setState('identifying')
                await recognitionRef.current(imageSrc)
                return  // loop restarts after recognition
              }
            }
          } catch {
            // ignore transient detection errors
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  // Receives the pre-captured screenshot so both detection + recognition use the same frame
  const handleRecognition = async (imageSrc) => {
    try {
      const res = await fetch('/api/attendance/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc }),
      })
      const data = await res.json()

      if (data.status === 'matched') {
        const msg = data.user.already_attended
          ? `${getTimeGreeting()}, ${data.user.name}! You are already checked in.`
          : `${getTimeGreeting()}, ${data.user.name}! Welcome to the event!`
        setResult({ ...data, message: msg })
        setState('matched')
        speak(msg)
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else if (data.status === 'not_registered') {
        setResult({ status: 'not_registered', message: "You're not registered. Please register first." })
        setState('not_registered')
        speak("You are not registered. Please register first.")
        setTimeout(resetToWatching, RESULT_DISPLAY_MS)

      } else {
        // backend couldn't confirm a face (no_face / no_users_registered)
        // pause before retrying to avoid rapid cycle
        setTimeout(() => {
          if (activeRef.current) {
            setState('watching')
            startLoop()
          }
        }, NO_FACE_COOLDOWN_MS)
      }
    } catch {
      setTimeout(() => {
        if (activeRef.current) {
          setState('watching')
          startLoop()
        }
      }, NO_FACE_COOLDOWN_MS)
    }
  }

  function resetToWatching() {
    setResult(null)
    setState('watching')
    if (activeRef.current) startLoop()
  }

  recognitionRef.current = handleRecognition

  function handleActivate() {
    speak(' ')
    activeRef.current = true
    setState('watching')
    startLoop()
  }

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <div className="attendance-page">
      <div className="camera-wrapper">
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          screenshotQuality={0.85}
          videoConstraints={{ width: 1280, height: 720, facingMode: 'user' }}
          className="webcam"
        />

        {(uiState === 'watching' || uiState === 'identifying') && (
          <div className={`scan-indicator ${uiState}`}>
            <span className="scan-dot" />
            {uiState === 'watching' ? 'Watching for a face...' : 'Identifying...'}
          </div>
        )}

        {uiState === 'watching' && (
          <div className="face-frame">
            <div className="corner tl" />
            <div className="corner tr" />
            <div className="corner bl" />
            <div className="corner br" />
          </div>
        )}

        {result && (
          <div className={`result-overlay ${result.status}`}>
            {result.status === 'matched' && (
              <div className="result-card matched">
                {result.user?.image_url && (
                  <img src={result.user.image_url} alt={result.user.name} className="result-photo" />
                )}
                <div className="result-text">
                  <div className="result-icon">✓</div>
                  <div className="result-name">{result.user?.name}</div>
                  <div className="result-message">{result.message}</div>
                </div>
              </div>
            )}
            {result.status === 'not_registered' && (
              <div className="result-card not-registered">
                <div className="result-icon">✕</div>
                <div className="result-message">{result.message}</div>
              </div>
            )}
          </div>
        )}

        {(uiState === 'idle' || uiState === 'models_loading') && (
          <div className="activate-overlay">
            <div className="activate-card">
              <div className="activate-icon">⬤</div>
              <h2>Face Attendance System</h2>
              {modelError ? (
                <p style={{ color: 'var(--accent-red)' }}>
                  Failed to load models. Check your internet connection and refresh.
                </p>
              ) : (
                <p>
                  {modelsReady
                    ? 'Click to start. Camera will detect and identify faces automatically.'
                    : 'Loading face detection models...'}
                </p>
              )}
              <button
                className="btn-activate"
                onClick={handleActivate}
                disabled={!modelsReady || modelError}
              >
                {modelsReady ? 'Start Attendance' : 'Please wait...'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
