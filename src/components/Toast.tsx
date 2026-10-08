import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleCheck, CircleX, X } from 'lucide-react'

type Toast = { id: number; message: string; kind: 'success' | 'error' }
const ToastContext = createContext<(message: string, kind?: Toast['kind']) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const notify = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, kind }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200)
  }, [])

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast ${toast.kind}`} key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'}>
            {toast.kind === 'success' ? <CircleCheck size={18} /> : <CircleX size={18} />}
            <span>{toast.message}</span>
            <button aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
