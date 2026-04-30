import { useRef, useState, useEffect, useCallback } from 'react'
import Webcam from 'react-webcam'

export default function RegisterPage() {
  const webcamRef = useRef(null)

  const [tab, setTab] = useState('upload') // 'upload' | 'camera'
  const [name, setName] = useState('')
  const [preview, setPreview] = useState(null) // base64 or object URL
  const [uploadFile, setUploadFile] = useState(null)
  const [captured, setCaptured] = useState(null) // base64 from webcam
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null) // { type: 'success'|'error', text }
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/register/users')
      const data = await res.json()
      setUsers(data)
    } catch {
      // ignore
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadFile(file)
    setPreview(URL.createObjectURL(file))
    setCaptured(null)
  }

  function handleCapture() {
    if (!webcamRef.current) return
    const imageSrc = webcamRef.current.getScreenshot()
    setCaptured(imageSrc)
    setPreview(imageSrc)
    setUploadFile(null)
  }

  function handleRetake() {
    setCaptured(null)
    setPreview(null)
  }

  function switchTab(newTab) {
    setTab(newTab)
    setPreview(null)
    setUploadFile(null)
    setCaptured(null)
    setMessage(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return setMessage({ type: 'error', text: 'Please enter a name.' })
    if (!uploadFile && !captured) return setMessage({ type: 'error', text: 'Please provide a photo.' })

    setSubmitting(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('name', name.trim())

      if (uploadFile) {
        formData.append('image', uploadFile)
      } else {
        formData.append('image_base64', captured)
      }

      const res = await fetch('/api/register', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setMessage({ type: 'error', text: data.detail || 'Registration failed.' })
      } else {
        setMessage({ type: 'success', text: `${data.name} registered successfully!` })
        setName('')
        setPreview(null)
        setUploadFile(null)
        setCaptured(null)
        fetchUsers()
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Is the backend running?' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(userId, userName) {
    if (!window.confirm(`Remove ${userName} from the system? This will also delete all their attendance records.`)) return
    const res = await fetch(`/api/register/users/${userId}`, { method: 'DELETE' })
    if (res.ok) {
      fetchUsers()
    } else {
      const data = await res.json().catch(() => ({}))
      alert(`Failed to delete: ${data.detail || 'Unknown error'}`)
    }
  }

  return (
    <div className="register-page">
      <div className="register-left">
        <h1 className="page-title">Register Attendee</h1>

        <form onSubmit={handleSubmit} className="register-form">
          <label className="field-label">Full Name</label>
          <input
            type="text"
            className="text-input"
            placeholder="e.g. Sivateja Sripadaa"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={submitting}
          />

          <label className="field-label">Photo</label>
          <div className="tabs">
            <button type="button" className={`tab-btn ${tab === 'upload' ? 'active' : ''}`} onClick={() => switchTab('upload')}>
              Upload Photo
            </button>
            <button type="button" className={`tab-btn ${tab === 'camera' ? 'active' : ''}`} onClick={() => switchTab('camera')}>
              Use Camera
            </button>
          </div>

          {tab === 'upload' && (
            <div className="upload-area">
              <input
                type="file"
                accept="image/*"
                id="file-input"
                className="hidden-input"
                onChange={handleFileChange}
                disabled={submitting}
              />
              {!preview ? (
                <label htmlFor="file-input" className="upload-placeholder">
                  <span className="upload-icon">+</span>
                  <span>Click to choose a photo</span>
                </label>
              ) : (
                <div className="preview-wrapper">
                  <img src={preview} alt="Preview" className="photo-preview" />
                  <label htmlFor="file-input" className="change-btn">Change Photo</label>
                </div>
              )}
            </div>
          )}

          {tab === 'camera' && (
            <div className="camera-capture-area">
              {!captured ? (
                <>
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.9}
                    videoConstraints={{ width: 480, height: 360, facingMode: 'user' }}
                    className="register-webcam"
                  />
                  <button type="button" className="btn-capture" onClick={handleCapture}>
                    Capture Photo
                  </button>
                </>
              ) : (
                <div className="preview-wrapper">
                  <img src={preview} alt="Captured" className="photo-preview" />
                  <button type="button" className="change-btn" onClick={handleRetake}>
                    Retake
                  </button>
                </div>
              )}
            </div>
          )}

          {message && (
            <div className={`message ${message.type}`}>{message.text}</div>
          )}

          <button type="submit" className="btn-submit" disabled={submitting}>
            {submitting ? 'Registering...' : 'Register'}
          </button>
        </form>
      </div>

      <div className="register-right">
        <h2 className="section-title">Registered Users ({users.length})</h2>
        {loadingUsers ? (
          <p className="muted">Loading...</p>
        ) : users.length === 0 ? (
          <p className="muted">No users registered yet.</p>
        ) : (
          <div className="users-list">
            {users.map(u => (
              <div key={u.id} className="user-card">
                {u.image_url ? (
                  <img src={u.image_url} alt={u.name} className="user-thumb" />
                ) : (
                  <div className="user-thumb-placeholder">?</div>
                )}
                <div className="user-info">
                  <div className="user-name">{u.name}</div>
                  <div className="user-date">{new Date(u.registered_at).toLocaleDateString()}</div>
                </div>
                <button className="btn-delete" onClick={() => handleDelete(u.id, u.name)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
