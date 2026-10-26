import { useId, useRef, useState, type ChangeEvent } from 'react'
import { Activity, ArrowRight, ArrowRightLeft, Check, Clock3, Download, Upload, RefreshCw, AlertCircle, Minus } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { advantagePoint, clock, compare, createArchive, date, decimal, describeChange, ENDPOINT, integer, parseArchive, type Candidate, type Snapshot } from './election'
import { useElection } from './useElection'

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${integer.format(value)}`
}

function changeLabel(change: number | null, snapshot: Snapshot): string {
  if (change === null) return 'Primeiro registro'
  if (change === 0) return 'Sem variacao da vantagem'
  return `${integer.format(Math.abs(change))} a favor de ${snapshot.candidates[change > 0 ? 0 : 1].name}`
}

function leadLabel(snapshot: Snapshot): string {
  const { lead, leader } = compare(snapshot)
  return leader ? `${integer.format(lead)} votos para ${leader.name}` : 'Empate'
}

function Portrait({ candidate }: { candidate: Candidate }) {
  const [failed, setFailed] = useState(false)
  return candidate.picture && !failed
    ? <img className="portrait" src={candidate.picture} alt={candidate.name} onError={() => setFailed(true)} />
    : <div className="portrait portrait-fallback" aria-label={candidate.name}>{candidate.number}</div>
}

export default function App() {
  const [archive, setArchive] = useState<{ name: string; snapshots: Snapshot[] } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const { history, loading, error, checkedAt, storageAvailable, automatic, setAutomatic, refresh } = useElection(archive?.snapshots ?? null)
  const [visibleRows, setVisibleRows] = useState(20)
  const gradientId = useId().replace(/:/g, '')
  const current = history.at(-1)
  const previous = history.at(-2)
  const result = current ? compare(current, previous) : null
  const points = history.map(advantagePoint)
  const pointColor = (leaderNumber: number | null) => leaderNumber === 13 ? 'var(--lula)' : leaderNumber === 22 ? 'var(--flavio)' : '#8b9790'
  const colorStops = points.flatMap((point, index) => {
    if (index === 0) return [{ offset: 0, color: pointColor(point.leaderNumber) }]
    const prior = points[index - 1]
    const duration = points.at(-1)!.timestamp - points[0].timestamp
    const offset = (prior.timestamp + (point.timestamp - prior.timestamp) / 2 - points[0].timestamp) / duration
    return [{ offset, color: pointColor(prior.leaderNumber) }, { offset, color: pointColor(point.leaderNumber) }]
  })
  const renderDot = ({ cx, cy, payload }: { cx?: number; cy?: number; payload?: ReturnType<typeof advantagePoint> }) => (
    <circle cx={cx} cy={cy} r={4} fill={pointColor(payload?.leaderNumber ?? null)} stroke="#fff" strokeWidth={2} />
  )
  const rows = history.map((snapshot, index) => ({ snapshot, result: compare(snapshot, history[index - 1]) })).reverse()
  const sourceStatus = archive ? 'Arquivo carregado' : error ? 'Falha na consulta' : !checkedAt && current ? 'Historico local' : loading ? 'Consultando fonte' : checkedAt ? 'Fonte consultada' : 'Conectando'

  async function importHistory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setImporting(true)
    setImportError(null)
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('O arquivo deve ter no maximo 5 MB.')
      const snapshots = parseArchive(JSON.parse(await file.text()))
      setArchive({ name: file.name, snapshots })
      setVisibleRows(20)
    } catch (cause) {
      setImportError(cause instanceof SyntaxError ? 'JSON invalido. Selecione o arquivo exportado pelo painel.' : cause instanceof Error ? cause.message : 'Nao foi possivel carregar o arquivo.')
    } finally {
      setImporting(false)
    }
  }

  function downloadHistory() {
    const archive = createArchive(history)
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `apuracao-2026-2t-${archive.exportedAt.replace(/[:.]/g, '-')}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Inicio da apuracao"><span className="brand-mark"><Activity size={22} /></span>APURACAO<span className="brand-year">2026</span></a>
        <span className="election-label">ELEICOES GERAIS <span>/</span> 2º TURNO</span>
      </header>

      <main id="inicio">
        <section className="page-heading">
          <div><p className="eyebrow">RESULTADO NACIONAL</p><h1>Brasil <span>/ Presidente</span></h1></div>
          <div className="live-status"><span className={`status-dot ${error ? 'warning' : ''}`} />{sourceStatus}</div>
        </section>

        <div className="controlbar">
          <div className="source-time"><Clock3 size={16} /><span>Fonte: <strong>{current ? `${date.format(current.timestamp)} ${clock.format(current.timestamp)}` : '--:--:--'}</strong><small>Brasilia</small></span></div>
          <div className="controls">
            <label className="auto-toggle"><input type="checkbox" checked={automatic} disabled={archive !== null} onChange={event => setAutomatic(event.target.checked)} /><span>Auto · 30s</span></label>
            <input ref={fileInput} type="file" accept=".json,application/json" hidden aria-label="Arquivo JSON do historico" onChange={importHistory} />
            <button className="refresh-button" onClick={() => fileInput.current?.click()} disabled={importing} title="Selecionar historico JSON exportado"><Upload size={16} /><span>{importing ? 'Carregando...' : 'Carregar JSON'}</span></button>
            <button className="refresh-button" onClick={downloadHistory} disabled={history.length === 0} title={`Baixar ${history.length} registros do historico em JSON`}><Download size={16} /><span>Baixar historico JSON</span></button>
            <button className="refresh-button" onClick={refresh} disabled={loading || archive !== null} title="Consultar dados agora"><RefreshCw size={16} className={loading ? 'spinning' : ''} /><span>Atualizar</span></button>
          </div>
        </div>

        {archive && <div className="notice archive-notice" role="status"><Upload size={18} /><span><strong>{archive.name}</strong> · {integer.format(history.length)} registros · {date.format(history[0].timestamp)} {clock.format(history[0].timestamp)} a {date.format(history.at(-1)!.timestamp)} {clock.format(history.at(-1)!.timestamp)}</span><button onClick={() => { setArchive(null); setImportError(null); setVisibleRows(20) }}>Voltar ao vivo</button></div>}
        {importError && <div className="notice error" role="alert"><AlertCircle size={18} /><span>{importError}</span><button onClick={() => setImportError(null)}>Fechar</button></div>}
        {error && <div className="notice error" role="alert"><AlertCircle size={18} /><span>{error} {current ? 'Os dados anteriores continuam visiveis.' : ''}</span><button onClick={refresh} disabled={loading}>Tentar novamente</button></div>}
        {!storageAvailable && !archive && <div className="notice" role="status"><AlertCircle size={18} />Historico disponivel apenas nesta sessao: armazenamento local indisponivel.</div>}

        {!current || !result ? (
          <section className="empty-state" aria-live="polite"><Activity size={32} className={loading ? 'spinning' : ''} /><h2>{loading ? 'Consultando a apuracao' : 'Sem dados disponiveis'}</h2><p>{loading ? 'Aguardando resposta da fonte.' : 'Nenhum resultado foi recebido.'}</p></section>
        ) : <>
          <section className="counting-section" aria-label="Progresso da apuracao">
            <div className="counting-label"><span><Check size={17} />Urnas apuradas</span><strong>{decimal.format(current.countedPercent)}<small>%</small></strong></div>
            <progress value={current.countedPercent} max={100} aria-label="Percentual de urnas apuradas" />
            <p>{integer.format(current.counted)} de {integer.format(current.boxes)} urnas</p>
          </section>

          <section className="candidates" aria-label="Votos dos candidatos">
            {current.candidates.map((candidate, index) => <article key={candidate.number} className={`candidate candidate-${index}`}>
              <div className="candidate-header"><Portrait candidate={candidate} /><div className="candidate-identity"><p>{candidate.party} <span>·</span> {candidate.number}</p><h2>{candidate.name}</h2><span className={`candidate-status ${result.leader?.number === candidate.number ? 'leading' : ''}`}>{result.leader?.number === candidate.number ? 'Na frente' : result.leader ? 'Em disputa' : 'Empate'}</span></div></div>
              <div className="candidate-numbers"><strong>{decimal.format(candidate.percent)}<small>%</small></strong><span>{integer.format(candidate.votes)} <small>votos</small></span></div>
              <div className="candidate-track"><div style={{ width: `${candidate.percent}%` }} /></div>
            </article>)}
          </section>

          <section className="lead-section" aria-label="Diferenca de votos" aria-live="polite">
            <div className="lead-primary"><p className="eyebrow">DIFERENCA ATUAL</p><div className="lead-number">{integer.format(result.lead)} <span>votos</span></div><p>{result.leader ? <><strong>{result.leader.name}</strong> na frente</> : 'Empate entre os candidatos'}</p></div>
            <div className="lead-change"><span className="change-icon">{result.change === null || result.change === 0 ? <Minus size={24} /> : <ArrowRightLeft size={24} />}</span><div className="change-summary"><p>DESDE A ATUALIZACAO ANTERIOR</p><strong>{describeChange(current, previous)}</strong>{previous ? <dl className="change-comparison"><div><dt>Antes <time dateTime={new Date(previous.timestamp).toISOString()} title={date.format(previous.timestamp)}>{clock.format(previous.timestamp)}</time></dt><dd>{leadLabel(previous)}</dd></div><ArrowRight size={16} aria-hidden="true" /><div><dt>Agora <time dateTime={new Date(current.timestamp).toISOString()} title={date.format(current.timestamp)}>{clock.format(current.timestamp)}</time></dt><dd>{leadLabel(current)}</dd></div></dl> : <span>Primeiro registro: {clock.format(current.timestamp)}</span>}</div></div>
          </section>

          <section className="evolution-section">
            <div className="section-heading"><div><p className="eyebrow">ACOMPANHAMENTO</p><h2>Evolucao da vantagem</h2></div><span className="record-count">{history.length} {history.length === 1 ? 'registro' : 'registros'}</span></div>
            <div className="chart-legend"><span className="legend-first">Lideranca: {current.candidates[0].name}</span><span className="legend-second">Lideranca: {current.candidates[1].name}</span></div>
            <div className="chart" role="img" aria-label={`Grafico da diferenca de votos. Ultima vantagem: ${integer.format(result.lead)} votos${result.leader ? ` para ${result.leader.name}` : ', empate'}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 15, right: 18, bottom: 10, left: 6 }}>
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                      {colorStops.map((stop, index) => <stop key={index} offset={stop.offset} stopColor={stop.color} />)}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#dce3df" />
                  <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={value => clock.format(value)} minTickGap={60} tick={{ fontSize: 11, fill: '#6a746e' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 'auto']} allowDecimals={false} tickFormatter={value => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(value)} width={58} tick={{ fontSize: 11, fill: '#6a746e' }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={0} stroke="#8b9790" strokeDasharray="4 4" />
                  <Tooltip labelFormatter={value => `${date.format(Number(value))} ${clock.format(Number(value))}`} formatter={(value, _name, entry) => [`${integer.format(Number(value))} votos · ${entry.payload.leader}`, 'Vantagem']} contentStyle={{ borderRadius: 6, borderColor: '#dce3df', fontSize: 12, maxWidth: 280 }} />
                  <Line type="linear" dataKey="difference" stroke={`url(#${gradientId})`} strokeWidth={2.5} dot={points.length < 12 ? renderDot : false} activeDot={renderDot} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="timeline-section">
            <div className="section-heading"><h2>Timeline da apuracao</h2><span className="latest-label"><span className="status-dot" />Mais recente primeiro</span></div>
            <div className="table-scroll"><table><thead><tr><th>Atualizacao da fonte</th><th>Lideranca</th><th>Diferenca</th><th>Variacao da diferenca</th>{current.candidates.map(candidate => <th key={candidate.number}>{candidate.name}</th>)}</tr></thead>
              <tbody>{rows.slice(0, visibleRows).map(({ snapshot, result: row }, index) => <tr key={snapshot.timestamp} className={index === 0 ? 'latest-row' : ''}>
                <td><strong>{clock.format(snapshot.timestamp)}</strong><small>{date.format(snapshot.timestamp)}{index === 0 ? ' · ULTIMA' : ''}</small></td>
                <td><span className={`leader-dot ${row.leader?.number === current.candidates[1].number ? 'second' : ''}`} />{row.leader?.name ?? 'Empate'}</td>
                <td className="numeric"><strong>{integer.format(row.lead)}</strong><small>votos</small></td>
                <td className="variation-cell">{changeLabel(row.change, snapshot)}</td>
                {snapshot.candidates.map((candidate, candidateIndex) => <td key={candidate.number} className="numeric">{integer.format(candidate.votes)}<small>{row.gains[candidateIndex] === null ? '--' : signed(row.gains[candidateIndex]!)}</small></td>)}
              </tr>)}</tbody></table></div>
            {visibleRows < rows.length && <button className="more-button" onClick={() => setVisibleRows(value => value + 20)}>Carregar registros anteriores</button>}
          </section>

          <section className="summary-strip" aria-label="Resumo dos votos"><div><span>Votos validos</span><strong>{integer.format(current.valid)}</strong></div><div><span>Brancos</span><strong>{integer.format(current.blank)}</strong></div><div><span>Nulos</span><strong>{integer.format(current.invalid)}</strong></div></section>
        </>}

        <footer><span>Fonte: <a href={ENDPOINT} target="_blank" rel="noreferrer">endpoint informado · CloudFront</a></span><span>{archive ? `Arquivo local: ${archive.name}` : checkedAt ? `Consulta confirmada: ${date.format(checkedAt)} ${clock.format(checkedAt)}` : 'Nenhuma consulta confirmada nesta sessao'}</span></footer>
      </main>
    </div>
  )
}