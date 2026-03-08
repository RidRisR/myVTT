import { useRef, useState } from 'react'
import { uploadAsset } from '../shared/assetUpload'

interface HandoutEditModalProps {
  initialTitle?: string
  initialImageUrl?: string
  initialContent?: string
  onConfirm: (title: string, imageUrl: string | undefined, content: string) => void
  onCancel: () => void
}

export function HandoutEditModal({
  initialTitle = '',
  initialImageUrl,
  initialContent = '',
  onConfirm,
  onCancel,
}: HandoutEditModalProps) {
  const [title, setTitle] = useState(initialTitle)
  const [imageUrl, setImageUrl] = useState<string | undefined>(initialImageUrl)
  const [content, setContent] = useState(initialContent)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    onConfirm(title.trim(), imageUrl, content.trim())
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const url = await uploadAsset(file)
      setImageUrl(url)
    } finally {
      setUploading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    marginTop: 4,
    padding: '8px 10px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'sans-serif',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: 'rgba(15, 15, 25, 0.95)',
        backdropFilter: 'blur(20px)',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
        width: 460,
        maxHeight: '85vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
      }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

        {/* Form fields */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Untitled"
              autoFocus
              style={inputStyle}
            />
          </div>

          {/* Image area */}
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              Image (optional)
            </label>
            {imageUrl ? (
              <div style={{ position: 'relative', marginTop: 4 }}>
                <img
                  src={imageUrl}
                  alt="Preview"
                  style={{
                    width: '100%',
                    maxHeight: 240,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'rgba(0,0,0,0.3)',
                    display: 'block',
                  }}
                />
                <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: 6,
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'sans-serif',
                    }}
                  >
                    Replace
                  </button>
                  <button
                    onClick={() => setImageUrl(undefined)}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      borderRadius: 6,
                      color: '#f87171',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: 'sans-serif',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  marginTop: 4,
                  height: 80,
                  borderRadius: 8,
                  border: '2px dashed rgba(255,255,255,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: uploading ? 'wait' : 'pointer',
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 12,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
              >
                {uploading ? 'Uploading...' : 'Click to add image'}
              </div>
            )}
          </div>

          {/* Content */}
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
              Content (optional)
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write text content here..."
              rows={5}
              style={{
                ...inputStyle,
                fontSize: 13,
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onCancel}
              style={{
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.6)',
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'sans-serif',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              style={{
                padding: '8px 16px',
                background: '#3b82f6',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'sans-serif',
              }}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
