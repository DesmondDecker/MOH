import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative bg-canvas-raised border border-border rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-auto"
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-ink-soft hover:text-ink text-lg leading-none px-1"
            >
              ×
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
