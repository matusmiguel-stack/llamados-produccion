"use client"

import type { CSSProperties } from "react"

export function PageLoader() {
  return (
    <div style={wrapStyle}>
      <div style={innerStyle}>
        {/* Logo */}
        <img
          src="/logo-retro.png"
          alt="Retro Casa"
          style={logoStyle}
        />
        {/* Dots */}
        <div style={dotsStyle}>
          <span style={dotStyle(0)} />
          <span style={dotStyle(1)} />
          <span style={dotStyle(2)} />
        </div>
      </div>

      <style>{`
        @keyframes rc-pulse {
          0%, 80%, 100% { opacity: 0.15; transform: scale(0.7); }
          40%            { opacity: 1;    transform: scale(1);   }
        }
        @keyframes rc-logo-breathe {
          0%, 100% { opacity: 0.7; transform: scale(1);    }
          50%      { opacity: 1;   transform: scale(1.04); }
        }
      `}</style>
    </div>
  )
}

const wrapStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "#0d1117",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 99999,
}

const innerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 28,
}

const logoStyle: CSSProperties = {
  width: 72,
  height: 72,
  objectFit: "contain",
  borderRadius: 16,
  animation: "rc-logo-breathe 1.6s ease-in-out infinite",
}

const dotsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
}

function dotStyle(i: number): CSSProperties {
  return {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#a78bfa",
    animation: `rc-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
  }
}
