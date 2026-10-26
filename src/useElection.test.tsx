import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalize, persist, STORAGE_KEY } from './election'
import { useElection } from './useElection'

function payload(timestamp = 1792967083000, first = 1500, second = 1300) {
  return [{
    uf: 'br', updated_at: timestamp, election: { year: 2026, round: 2 },
    resume: {
      ballot_box: 100, counted_ballot_box: { total: 10, percent_number: 10 },
      valid: { total: first + second }, blank: { total: 0 }, invalid: { total: 0 },
    },
    candidates: [
      { number: 13, ballot_name: 'A', party: { acronym: 'A' }, votes: { total: first, percent_number: first / (first + second) * 100 } },
      { number: 22, ballot_name: 'B', party: { acronym: 'B' }, votes: { total: second, percent_number: second / (first + second) * 100 } },
    ],
  }]
}

const fetchMock = vi.fn<typeof fetch>()

function respond(data = payload()) {
  fetchMock.mockResolvedValue({ ok: true, json: async () => data } as Response)
}

async function settle() {
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('coleta e persistencia', () => {
  it('consulta um arquivo sem rede e sem substituir o historico ao vivo', async () => {
    const archived = [normalize(payload(1792967081000, 1200, 1000))]
    persist([normalize(payload())])
    const original = localStorage.getItem(STORAGE_KEY)
    const { result } = renderHook(() => useElection(archived))
    await settle()
    expect(result.current.history).toEqual(archived)
    expect(result.current.automatic).toBe(false)
    expect(result.current.checkedAt).toBeNull()
    await act(async () => { result.current.refresh(); vi.advanceTimersByTime(60000) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original)
  })

  it('pausa a coleta ao importar e retoma o historico original ao voltar ao vivo', async () => {
    respond()
    const archived = [normalize(payload(1792967081000, 1200, 1000))]
    const { result, rerender } = renderHook(({ archive }) => useElection(archive), { initialProps: { archive: null as ReturnType<typeof normalize>[] | null } })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    rerender({ archive: archived })
    await act(async () => { vi.advanceTimersByTime(60000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current.history).toEqual(archived)
    rerender({ archive: null })
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.history[0].timestamp).toBe(1792967083000)
  })

  it('consulta imediatamente, nao duplica e registra novo horario', async () => {
    respond()
    const { result } = renderHook(useElection)
    await settle()
    expect(fetchMock).toHaveBeenCalledWith('/api/apuracao', expect.objectContaining({ cache: 'no-store' }))
    expect(result.current.history).toHaveLength(1)
    expect(result.current.checkedAt).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(30000) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.current.history).toHaveLength(1)
    respond(payload(1792967084000, 1700, 1400))
    await act(async () => { result.current.refresh() })
    expect(result.current.history).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).snapshots).toHaveLength(2)
  })

  it('preserva resultados em erro e permite tentar novamente', async () => {
    respond()
    const { result } = renderHook(useElection)
    await settle()
    fetchMock.mockRejectedValueOnce(new TypeError('Network error'))
    await act(async () => { result.current.refresh() })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.error).toContain('conexao')
    await act(async () => { result.current.refresh() })
    expect(result.current.error).toBeNull()
  })

  it('restaura historico sem marcar consulta de rede como confirmada', async () => {
    persist([normalize(payload())])
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(useElection)
    expect(result.current.history).toHaveLength(1)
    expect(result.current.checkedAt).toBeNull()
    await act(async () => { vi.advanceTimersByTime(30000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('tolera armazenamento corrompido ou indisponivel', async () => {
    localStorage.setItem(STORAGE_KEY, '{')
    respond()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    const { result } = renderHook(useElection)
    await settle()
    expect(result.current.history).toHaveLength(1)
    expect(result.current.storageAvailable).toBe(false)
  })

  it('rejeita resposta antiga e aceita correcao no mesmo horario', async () => {
    respond()
    const { result } = renderHook(useElection)
    await settle()
    respond(payload(1792967082000))
    await act(async () => { result.current.refresh() })
    expect(result.current.error).toContain('anterior')
    expect(result.current.history[0].timestamp).toBe(1792967083000)
    respond(payload(1792967083000, 1600))
    await act(async () => { result.current.refresh() })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].candidates[0].votes).toBe(1600)
  })

  it('aborta consultas e remove timers ao desmontar', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    const { unmount } = renderHook(useElection)
    const signal = fetchMock.mock.calls[0][1]?.signal
    unmount()
    expect(signal?.aborted).toBe(true)
    await act(async () => { vi.advanceTimersByTime(60000) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})