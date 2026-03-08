import React from 'react'

interface AvatarProps {
  portraitUrl?: string
  senderName: string
  senderColor: string
  size?: number
}

export const Avatar: React.FC<AvatarProps> = ({
  portraitUrl,
  senderName,
  senderColor,
  size = 32,
}) => {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.15)',
    flexShrink: 0,
  }

  if (portraitUrl) {
    return (
      <div style={containerStyle}>
        <img
          src={portraitUrl}
          alt={senderName}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        ...containerStyle,
        background: senderColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.4375,
        fontWeight: 600,
      }}
    >
      {senderName[0]?.toUpperCase() || '?'}
    </div>
  )
}
