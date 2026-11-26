'use client'
import { X } from 'lucide-react'

// `fullScreen` = the window covers the whole page (no margin, no rounded
// corners) — for wide content like the product details graphs + tables.
export default function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-md', fullScreen = false }) {
  if (!open) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm ${fullScreen ? '' : 'p-4'}`}>
      <div className={`bg-card w-full shadow-2xl flex flex-col ${fullScreen ? 'h-full' : `rounded-2xl ${maxWidth} max-h-[90vh]`}`}>
        <div className={`flex items-center justify-between py-4 border-b border-divider flex-shrink-0 ${fullScreen ? 'px-4 sm:px-6 lg:px-10' : 'px-6'}`}>
          <h2 className="font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-subtle hover:text-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`py-5 flex flex-col gap-4 overflow-y-auto ${fullScreen ? 'flex-1 min-h-0 px-4 sm:px-6 lg:px-10' : 'px-6'}`}>{children}</div>

        {footer && <div className="flex gap-3 px-6 pb-6 flex-shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
