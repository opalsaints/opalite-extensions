/**
 * Opalite Overlay — Starter component for new UI elements.
 *
 * This component serves as the entry point for new Opalite UI features
 * that are built with the modern Vite pipeline. It renders inside the
 * shadow root alongside the existing panel.
 *
 * Examples of future components that would live here:
 * - Download progress indicator
 * - Quick action floating toolbar
 * - Status notifications
 * - Keyboard shortcut overlay
 */

import React, { useState, useEffect } from 'react';

interface ZustandStore {
  getState: () => {
    isDownloaderConnected: boolean;
    isMember: boolean;
    showSelectImagesModal: number;
  };
  subscribe: (listener: (state: Record<string, unknown>) => void) => () => void;
}

export function OpaliteOverlay(): React.ReactElement | null {
  const [connected, setConnected] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Access the existing Zustand store from main.js
    const store = (window as unknown as Record<string, ZustandStore>).useAutojourneyGlobal;
    if (store) {
      const state = store.getState();
      setConnected(state.isDownloaderConnected);

      // Subscribe to store changes
      const unsubscribe = store.subscribe((newState) => {
        setConnected((newState as { isDownloaderConnected: boolean }).isDownloaderConnected);
      });

      return unsubscribe;
    }
  }, []);

  // Only show when the overlay has something to display
  // For now, this is a placeholder — add real features here
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 10000,
        background: 'var(--panel-bg, rgba(248,247,252,0.88))',
        border: '1px solid var(--border-default, rgba(0,0,0,0.12))',
        borderRadius: 'var(--radius-lg, 14px)',
        padding: '12px 16px',
        boxShadow: 'var(--shadow-lg)',
        backdropFilter: 'var(--glass-blur-light)',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '13px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#22c55e' : '#ef4444',
            boxShadow: connected
              ? '0 0 8px rgba(34,197,94,0.5)'
              : '0 0 8px rgba(239,68,68,0.5)',
          }}
        />
        <span style={{ color: 'var(--text-primary, #111827)' }}>
          Opalite {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}
