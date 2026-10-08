export type SpeechLanguage = 'bn-BD' | 'en-US' | 'mixed'

export interface SpeechProvider {
  start(language: SpeechLanguage, onText: (text: string) => void, onError: (code: string) => void, onStopped: () => void): void
  setLanguage(language: SpeechLanguage): void
  stop(): void
}

type SpeechResult = { isFinal: boolean; 0: { transcript: string }; length: number }
interface SpeechEvent extends Event { resultIndex: number; results: ArrayLike<SpeechResult> }
interface SpeechErrorEvent extends Event { error: string }
interface Recognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
interface SpeechWindow extends Window {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}

function browserLanguage(language: SpeechLanguage) {
  return language === 'en-US' ? 'en-US' : 'bn-BD'
}

class BrowserSpeechProvider implements SpeechProvider {
  private recognition: Recognition | null = null

  constructor(private readonly createRecognition: new () => Recognition) {}

  start(language: SpeechLanguage, onText: (text: string) => void, onError: (code: string) => void, onStopped: () => void) {
    const recognition = new this.createRecognition()
    this.recognition = recognition
    recognition.lang = browserLanguage(language)
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result?.[0]?.transcript.trim()
        if (result?.isFinal && text) onText(text)
      }
    }
    recognition.onerror = (event) => onError(event.error)
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null
      onStopped()
    }
    recognition.start()
  }

  setLanguage(language: SpeechLanguage) {
    if (this.recognition) this.recognition.lang = browserLanguage(language)
  }

  stop() {
    this.recognition?.stop()
    this.recognition = null
  }
}

export function createSpeechProvider(): SpeechProvider {
  const speechWindow = window as SpeechWindow
  const recognitionConstructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
  if (!recognitionConstructor) throw new Error('unsupported')
  return new BrowserSpeechProvider(recognitionConstructor)
}
