import { describe, expect, it } from 'vitest'
import { advantagePoint, append, compare, createArchive, describeChange, ENDPOINT, normalize, parseArchive, validateSnapshot, type Snapshot } from './election'

function sample(first = 1500, second = 1300, timestamp = 1792967083000): Snapshot {
  return {
    timestamp, counted: 10, boxes: 100, countedPercent: 10,
    valid: first + second, blank: 0, invalid: 0,
    candidates: [
      { number: 13, name: 'A', party: 'A', picture: '', votes: first, percent: 50 },
      { number: 22, name: 'B', party: 'B', picture: '', votes: second, percent: 50 },
    ],
  }
}

describe('comparacao de votos', () => {
  it('mostra vantagem de 200 e primeira amostra sem variacao', () => {
    expect(compare(sample())).toMatchObject({ lead: 200, change: null, gains: [null, null] })
  })
  it('distingue crescimento da vantagem dos ganhos individuais', () => {
    expect(compare(sample(1700, 1400), sample())).toMatchObject({ lead: 300, change: 100, gains: [200, 100] })
  })
  it('calcula virada com identidades fixas', () => {
    expect(compare(sample(1600, 1700), sample())).toMatchObject({ lead: 100, change: -300, leader: { number: 22 } })
  })
  it('trata empate e correcoes negativas', () => {
    expect(compare(sample(1500, 1500)).leader).toBeNull()
    expect(compare(sample(1400), sample()).gains).toEqual([-100, 0])
  })
})

describe('resumo entre atualizacoes', () => {
  it('explica quem ampliou a vantagem sem confundir com votos recebidos', () => {
    expect(describeChange(sample(1700, 1400), sample())).toBe('A ampliou a vantagem em 100 votos')
    expect(describeChange(sample(1300, 1700), sample(1300, 1500))).toBe('B ampliou a vantagem em 200 votos')
  })
  it('explica a reducao da desvantagem de quem ainda esta atras', () => {
    expect(describeChange(sample(1600, 1500), sample())).toBe('B reduziu a desvantagem em 100 votos')
    expect(describeChange(sample(1500, 1600), sample(1300, 1600))).toBe('A reduziu a desvantagem em 200 votos')
  })
  it('identifica virada em vez de chamar o saldo de vantagem atual', () => {
    expect(describeChange(sample(1600, 1700), sample())).toBe('B virou e abriu 100 votos de vantagem')
  })
  it('trata chegada ao empate e saida do empate', () => {
    expect(describeChange(sample(1500, 1500), sample())).toBe('B tirou 200 votos de desvantagem e empatou')
    expect(describeChange(sample(1600, 1500), sample(1500, 1500))).toBe('A saiu do empate e abriu 100 votos de vantagem')
  })
  it('trata primeira consulta e vantagem inalterada', () => {
    expect(describeChange(sample())).toBe('Aguardando a proxima atualizacao')
    expect(describeChange(sample(1700, 1500), sample())).toBe('A vantagem nao mudou')
  })
})

describe('grafico da vantagem absoluta', () => {
  it('sobe de 200 para 400 quando a vantagem do segundo candidato aumenta', () => {
    const points = [sample(1300, 1500), sample(1300, 1700)].map(advantagePoint)
    expect(points.map(point => point.difference)).toEqual([200, 400])
    expect(points.map(point => point.leaderNumber)).toEqual([22, 22])
  })
  it('preserva o lider de cada instante durante uma virada', () => {
    const points = [sample(), sample(1600, 1700)].map(advantagePoint)
    expect(points.map(point => point.difference)).toEqual([200, 100])
    expect(points.map(point => point.leader)).toEqual(['A', 'B'])
    expect(points.map(point => point.leaderNumber)).toEqual([13, 22])
  })
  it('mostra zero no empate e queda quando a vantagem diminui', () => {
    expect(advantagePoint(sample(1500, 1500))).toMatchObject({ difference: 0, leader: 'Empate', leaderNumber: null })
    expect([sample(1700, 1300), sample()].map(advantagePoint).map(point => point.difference)).toEqual([400, 200])
  })
})

describe('timeline', () => {
  it('nao duplica respostas identicas', () => {
    const history = [sample()]
    expect(append(history, sample())).toBe(history)
  })
  it('registra novo horario mesmo sem votos novos', () => {
    const history = append([sample()], sample(1500, 1300, 1792967084000))
    expect(history).toHaveLength(2)
    expect(compare(history[1], history[0]).change).toBe(0)
  })
  it('substitui correcao no mesmo horario e ignora resposta antiga', () => {
    const history = [sample()]
    expect(append(history, sample(1600))).toHaveLength(1)
    expect(append(history, sample(1600))[0].candidates[0].votes).toBe(1600)
    expect(append(history, sample(1600, 1300, 1))).toBe(history)
  })
  it('limita a 500 registros e rejeita candidatos trocados', () => {
    const history = Array.from({ length: 500 }, (_, index) => sample(1500, 1300, index + 1))
    expect(append(history, sample())).toHaveLength(500)
    const changed = sample()
    changed.candidates[0].number = 14
    expect(() => append([sample()], changed)).toThrow()
  })
})

describe('exportacao do historico', () => {
  it('exporta todos os snapshots disponiveis com metadados e dados originais normalizados', () => {
    const history = [sample(), sample(1700, 1400, 1792967084000)]
    const archive = createArchive(history, 1792967085000)
    expect(archive).toMatchObject({
      version: 1, source: ENDPOINT, snapshotCount: 2,
      election: { year: 2026, round: 2, uf: 'br', office: 'presidente' },
      firstUpdate: history[0].timestamp, lastUpdate: history[1].timestamp,
      exportedAt: new Date(1792967085000).toISOString(),
    })
    expect(JSON.parse(JSON.stringify(archive)).snapshots).toEqual(history)
    expect(archive.snapshots).not.toBe(history)
  })
  it('trata historico vazio e recusa registros invalidos', () => {
    expect(createArchive([])).toMatchObject({ snapshotCount: 0, firstUpdate: null, lastUpdate: null, snapshots: [] })
    expect(() => createArchive([{ ...sample(), valid: -1 }])).toThrow()
  })
})

describe('importacao de historico', () => {
  it('reabre o JSON exportado sem alterar os registros', () => {
    const history = [sample(), sample(1700, 1400, 1792967084000)]
    expect(parseArchive(JSON.parse(JSON.stringify(createArchive(history))))).toEqual(history)
  })
  it('rejeita versao, fonte ou eleicao incompativel e arquivo vazio', () => {
    const archive = createArchive([sample()])
    expect(() => parseArchive({ ...archive, version: 2 })).toThrow('incompativel')
    expect(() => parseArchive({ ...archive, source: 'https://example.com' })).toThrow('incompativel')
    expect(() => parseArchive({ ...archive, election: { ...archive.election, round: 1 } })).toThrow('incompativel')
    expect(() => parseArchive(createArchive([]))).toThrow('nao possui registros')
    expect(() => parseArchive(null)).toThrow()
  })
  it('rejeita valores invalidos, metadados divergentes e horarios duplicados ou invertidos', () => {
    const archive = createArchive([sample(), sample(1700, 1400, 1792967084000)])
    expect(() => parseArchive({ ...archive, snapshotCount: 3 })).toThrow('metadados')
    expect(() => parseArchive({ ...archive, snapshots: [{ ...sample(), valid: -1 }] })).toThrow()
    expect(() => parseArchive(createArchive([sample(), sample()]))).toThrow('fora de ordem')
    expect(() => parseArchive(createArchive([...archive.snapshots].reverse()))).toThrow('fora de ordem')
  })
  it('rejeita troca de candidatos entre registros', () => {
    const changed = sample(1700, 1400, 1792967084000)
    changed.candidates[0].number = 14
    expect(() => parseArchive(createArchive([sample(), changed]))).toThrow('candidatos inconsistentes')
  })
})

describe('validacao', () => {
  it('ordena por identidade e rejeita numeros invalidos', () => {
    const source = sample()
    source.candidates.reverse()
    expect(validateSnapshot(source).candidates[0].number).toBe(13)
    expect(() => validateSnapshot({ ...source, countedPercent: 101 })).toThrow()
    expect(() => validateSnapshot({ ...source, valid: -1 })).toThrow()
    expect(() => normalize([])).toThrow()
    expect(() => normalize({})).toThrow()
  })
})