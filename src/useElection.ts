import { useEffect, useRef, useState } from 'react'
import { append, ENDPOINT, normalize, persist, restore } from './election'

export function useElection() {
  const [history, setHistory] = useState(restore)
  const historyRef = useRef(history)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<number | null>(null)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [automatic, setAutomatic] = useState(true)
  const request = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    let disposed = false
    let controller: AbortController | null = null

    const update = async () => {
      if (controller) return
      const currentController = new AbortController()
      controller = currentController
      const timeout = window.setTimeout(() => currentController.abort(), 15000)
      setLoading(true)
      try {
        const url = import.meta.env.DEV ? '/api/apuracao' : ENDPOINT
        const response = await fetch(url, { signal: currentController.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(`A fonte retornou HTTP ${response.status}.`)
        const incoming = normalize(await response.json())
        if (disposed) return
        const last = historyRef.current.at(-1)
        if (last && incoming.timestamp < last.timestamp) throw new Error('A fonte retornou uma versao anterior. Ultimo resultado mantido.')
        const next = append(historyRef.current, incoming)
        historyRef.current = next
        setHistory(next)
        setStorageAvailable(persist(next))
        setCheckedAt(Date.now())
        setError(null)
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof DOMException && cause.name === 'AbortError'
            ? 'A consulta excedeu 15 segundos. Tente novamente.'
            : cause instanceof TypeError
              ? 'Nao foi possivel acessar a fonte. Verifique a conexao e a permissao CORS do endpoint.'
              : cause instanceof Error ? cause.message : 'Nao foi possivel atualizar os dados.')
        }
      } finally {
        window.clearTimeout(timeout)
        controller = null
        if (!disposed) setLoading(false)
      }
    }

    request.current = update
    void update()
    const timer = automatic ? window.setInterval(() => void update(), 30000) : undefined
    return () => {
      disposed = true
      if (timer !== undefined) window.clearInterval(timer)
      controller?.abort()
      request.current = null
    }
  }, [automatic])

  return {
    history, loading, error, checkedAt, storageAvailable, automatic, setAutomatic,
    refresh: () => void request.current?.(),
  }
}