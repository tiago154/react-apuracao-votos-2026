export const ENDPOINT = 'https://djwnrcncpvp8z.cloudfront.net/oficial/2026/2t/historical/br/presidente.json'
export const STORAGE_KEY = `apuracao:v1:${ENDPOINT}`

export interface Candidate {
  number: number
  name: string
  party: string
  picture: string
  votes: number
  percent: number
}

export interface Snapshot {
  timestamp: number
  candidates: [Candidate, Candidate]
  counted: number
  boxes: number
  countedPercent: number
  valid: number
  blank: number
  invalid: number
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Formato inesperado na fonte.')
  return value as Record<string, unknown>
}

function number(value: unknown, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (integer && !Number.isSafeInteger(value))) {
    throw new Error('Valor numerico invalido na fonte.')
  }
  return value
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Candidato incompleto na fonte.')
  return value
}

export function validateSnapshot(value: unknown): Snapshot {
  const source = object(value)
  if (!Array.isArray(source.candidates) || source.candidates.length !== 2) throw new Error('Esperados dois candidatos.')
  const candidates = source.candidates.map((value: unknown): Candidate => {
    const candidate = object(value)
    const percent = number(candidate.percent, false)
    if (percent > 100) throw new Error('Percentual invalido.')
    return {
      number: number(candidate.number), name: text(candidate.name), party: text(candidate.party),
      picture: typeof candidate.picture === 'string' && candidate.picture.startsWith('https://') ? candidate.picture : '',
      votes: number(candidate.votes), percent,
    }
  }).sort((first, second) => first.number - second.number) as [Candidate, Candidate]
  const result: Snapshot = {
    timestamp: number(source.timestamp), candidates,
    counted: number(source.counted), boxes: number(source.boxes),
    countedPercent: number(source.countedPercent, false),
    valid: number(source.valid), blank: number(source.blank), invalid: number(source.invalid),
  }
  if (candidates[0].number === candidates[1].number || result.counted > result.boxes || result.countedPercent > 100 || result.timestamp <= 0 || !Number.isFinite(new Date(result.timestamp).getTime())) {
    throw new Error('Dados inconsistentes na fonte.')
  }
  return result
}

export function normalize(payload: unknown): Snapshot {
  if (!Array.isArray(payload)) throw new Error('Formato inesperado na fonte.')
  const source = object(payload.find(item => item && typeof item === 'object' && item.uf === 'br'))
  const election = object(source.election)
  if (election.year !== 2026 || election.round !== 2) throw new Error('Eleicao diferente de 2026, segundo turno.')
  const resume = object(source.resume)
  const counted = object(resume.counted_ballot_box)
  if (!Array.isArray(source.candidates)) throw new Error('Candidatos ausentes.')
  return validateSnapshot({
    timestamp: source.updated_at,
    counted: counted.total, countedPercent: counted.percent_number, boxes: resume.ballot_box,
    valid: object(resume.valid).total, blank: object(resume.blank).total, invalid: object(resume.invalid).total,
    candidates: source.candidates.map((value: unknown) => {
      const candidate = object(value)
      const votes = object(candidate.votes)
      return {
        number: candidate.number, name: candidate.ballot_name, picture: candidate.picture,
        party: object(candidate.party).acronym, votes: votes.total, percent: votes.percent_number,
      }
    }),
  })
}

export function gap(snapshot: Snapshot): number {
  return snapshot.candidates[0].votes - snapshot.candidates[1].votes
}

export function compare(current: Snapshot, previous?: Snapshot) {
  const signed = gap(current)
  return {
    lead: Math.abs(signed),
    leader: signed === 0 ? null : current.candidates[signed > 0 ? 0 : 1],
    change: previous ? signed - gap(previous) : null,
    gains: current.candidates.map(candidate => previous
      ? candidate.votes - previous.candidates.find(prior => prior.number === candidate.number)!.votes
      : null),
  }
}

export function describeChange(current: Snapshot, previous?: Snapshot): string {
  if (!previous) return 'Aguardando a proxima atualizacao'
  const result = compare(current, previous)
  const prior = compare(previous)
  if (result.change === 0) return 'A vantagem nao mudou'
  const beneficiary = current.candidates[result.change! > 0 ? 0 : 1]
  const amount = integer.format(Math.abs(result.change!))
  if (!result.leader) return `${beneficiary.name} tirou ${amount} votos de desvantagem e empatou`
  if (!prior.leader) return `${result.leader.name} saiu do empate e abriu ${integer.format(result.lead)} votos de vantagem`
  if (result.leader.number !== prior.leader.number) return `${result.leader.name} virou e abriu ${integer.format(result.lead)} votos de vantagem`
  return result.lead > prior.lead
    ? `${result.leader.name} ampliou a vantagem em ${amount} votos`
    : `${beneficiary.name} reduziu a desvantagem em ${amount} votos`
}

export function advantagePoint(snapshot: Snapshot) {
  const { lead, leader } = compare(snapshot)
  return {
    timestamp: snapshot.timestamp,
    difference: lead,
    leader: leader?.name ?? 'Empate',
    leaderNumber: leader?.number ?? null,
  }
}

export function append(history: Snapshot[], incoming: Snapshot): Snapshot[] {
  const last = history.at(-1)
  if (last && incoming.timestamp < last.timestamp) return history
  if (last && incoming.candidates.some((candidate, index) => candidate.number !== last.candidates[index].number)) {
    throw new Error('A identificacao dos candidatos mudou na fonte.')
  }
  if (last && incoming.timestamp === last.timestamp) {
    return JSON.stringify(last) === JSON.stringify(incoming) ? history : [...history.slice(0, -1), incoming]
  }
  return [...history, incoming].slice(-500)
}

export function restore(): Snapshot[] {
  try {
    const saved = object(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'))
    if (saved.version !== 1 || !Array.isArray(saved.snapshots)) return []
    return saved.snapshots.slice(-500).reduce<Snapshot[]>((history, item: unknown) => append(history, validateSnapshot(item)), [])
  } catch {
    return []
  }
}

export function persist(snapshots: Snapshot[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, snapshots }))
    return true
  } catch {
    return false
  }
}

export function createArchive(history: Snapshot[], exportedAt = Date.now()) {
  const snapshots = history.map(validateSnapshot)
  return {
    version: 1,
    source: ENDPOINT,
    election: { year: 2026, round: 2, uf: 'br', office: 'presidente' },
    exportedAt: new Date(exportedAt).toISOString(),
    timeZone: 'America/Sao_Paulo',
    snapshotCount: snapshots.length,
    firstUpdate: snapshots.at(0)?.timestamp ?? null,
    lastUpdate: snapshots.at(-1)?.timestamp ?? null,
    snapshots,
  }
}

export function parseArchive(value: unknown): Snapshot[] {
  const archive = object(value)
  const election = object(archive.election)
  if (archive.version !== 1 || archive.source !== ENDPOINT || election.year !== 2026 || election.round !== 2 || election.uf !== 'br' || election.office !== 'presidente') {
    throw new Error('Arquivo incompativel. Selecione um JSON exportado por este painel.')
  }
  if (!Array.isArray(archive.snapshots) || archive.snapshots.length === 0) {
    throw new Error('O arquivo nao possui registros de apuracao.')
  }
  const snapshots = archive.snapshots.map(validateSnapshot)
  snapshots.forEach((snapshot, index) => {
    if (index === 0) return
    const prior = snapshots[index - 1]
    if (snapshot.timestamp <= prior.timestamp || snapshot.candidates.some((candidate, candidateIndex) => candidate.number !== prior.candidates[candidateIndex].number)) {
      throw new Error('Historico invalido: horarios fora de ordem ou candidatos inconsistentes.')
    }
  })
  if (archive.snapshotCount !== snapshots.length || archive.firstUpdate !== snapshots[0].timestamp || archive.lastUpdate !== snapshots.at(-1)!.timestamp) {
    throw new Error('Os metadados do arquivo nao correspondem aos registros.')
  }
  return snapshots
}

export const integer = new Intl.NumberFormat('pt-BR')
export const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const clock = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })