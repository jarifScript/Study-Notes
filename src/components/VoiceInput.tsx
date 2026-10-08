import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { createSpeechProvider, type SpeechLanguage, type SpeechProvider } from '../lib/speechProvider'

const languages: { value: SpeechLanguage; label: string }[] = [
  { value: 'bn-BD', label: 'Bangla' },
  { value: 'en-US', label: 'English' },
  { value: 'mixed', label: 'Mixed' },
]

export function VoiceInput({ onText }: { onText: (text: string) => void }) {
  const [language, setLanguage] = useState<SpeechLanguage>('bn-BD')
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const providerRef = useRef<SpeechProvider | null>(null)

  useEffect(() => () => providerRef.current?.stop(), [])

  function toggle() {
    if (listening) {
      providerRef.current?.stop()
      providerRef.current = null
      setListening(false)
      return
    }
    setMessage('')
    let provider: SpeechProvider | null = null
    try {
      provider = createSpeechProvider()
      providerRef.current = provider
      provider.start(language, onText, (code) => {
        setListening(false)
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          setMessage('Microphone access was denied. Allow microphone access in your browser settings.')
        } else {
          setMessage(`Voice typing stopped (${code}). Please try again.`)
        }
      }, () => {
        if (providerRef.current === provider) providerRef.current = null
        setListening(false)
      })
      setListening(true)
    } catch (error) {
      if (providerRef.current === provider) providerRef.current = null
      if (error instanceof Error && error.message === 'unsupported') {
        setMessage('Voice typing is not supported in this browser. Try Chrome or Edge.')
      } else {
        setMessage('Could not start voice typing. Check your microphone and try again.')
      }
      setListening(false)
    }
  }

  function changeLanguage(value: SpeechLanguage) {
    setLanguage(value)
    providerRef.current?.setLanguage(value)
  }

  return (
    <span className="voice-control">
      <select aria-label="Voice typing language" value={language} onChange={(event) => {
        const selected = languages.find((item) => item.value === event.target.value)
        if (selected) changeLanguage(selected.value)
      }}>
        {languages.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
      </select>
      <button className={`voice-button ${listening ? 'listening' : ''}`} type="button" onClick={toggle} aria-label={listening ? 'Stop voice typing' : 'Start voice typing'} title={listening ? 'Stop listening' : 'Dictate'}>
        {listening ? <MicOff size={16} /> : <Mic size={16} />}
        <span>{listening ? 'Listening' : 'Dictate'}</span>
      </button>
      {message && <span className="voice-message" role="status">{message}</span>}
    </span>
  )
}
