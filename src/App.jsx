import { useEffect, useMemo, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'

const ScreenCapture = registerPlugin('ScreenCapture')
import './App.css'

function App() {
  const [game, setGame] = useState('aviator')
  const [multiplier, setMultiplier] = useState('')
  const [results, setResults] = useState(() => { try { return JSON.parse(localStorage.getItem('1stborn-aviator-results') || '[]').filter(v => Number.isFinite(v) && v >= 1).slice(0, 100) } catch { return [] } })
  useEffect(() => { localStorage.setItem('1stborn-aviator-results', JSON.stringify(results)) }, [results])

  const [sessionActive, setSessionActive] = useState(() => localStorage.getItem("1stborn-session-active") === "true")
  const [sessionStartedAt, setSessionStartedAt] = useState(() => localStorage.getItem("1stborn-session-started") || "")
  const [sessionRounds, setSessionRounds] = useState(() => { try { return JSON.parse(localStorage.getItem("1stborn-session-rounds") || "[]") } catch { return [] } })

  useEffect(() => {
    localStorage.setItem("1stborn-session-active", String(sessionActive))
    localStorage.setItem("1stborn-session-started", sessionStartedAt)
    localStorage.setItem("1stborn-session-rounds", JSON.stringify(sessionRounds))
  }, [sessionActive, sessionStartedAt, sessionRounds])

  const [capturePermission, setCapturePermission] = useState('not requested')
  const [captureMessage, setCaptureMessage] = useState('Screen capture permission has not been requested.')

  const [mineCount, setMineCount] = useState(3)
  const [safePicks, setSafePicks] = useState(1)

  const stats = useMemo(() => {
    if (!results.length) return null
    const sorted = [...results].sort((a, b) => a - b)
    return {
      average: (results.reduce((a, b) => a + b, 0) / results.length).toFixed(2),
      median: sorted.length % 2
        ? sorted[Math.floor(sorted.length / 2)].toFixed(2)
        : ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(2),
      highest: Math.max(...results).toFixed(2),
      lowest: Math.min(...results).toFixed(2),
    }
  }, [results])

  const analysis = useMemo(() => {
    if (results.length === 0) return null
    const recent = results.slice(0, 10)
    const average = results.reduce((sum, value) => sum + value, 0) / results.length
    const variance = results.reduce((sum, value) => sum + (value - average) ** 2, 0) / results.length
    return {
      low: results.filter(value => value < 2).length,
      medium: results.filter(value => value >= 2 && value <= 5).length,
      high: results.filter(value => value > 5).length,
      lowPercent: (results.filter(value => value < 2).length / results.length * 100).toFixed(1),
      mediumPercent: (results.filter(value => value >= 2 && value <= 5).length / results.length * 100).toFixed(1),
      highPercent: (results.filter(value => value > 5).length / results.length * 100).toFixed(1),
      volatility: Math.sqrt(variance).toFixed(2),
      recentAverage: (recent.reduce((sum, value) => sum + value, 0) / recent.length).toFixed(2),
      recentCount: recent.length,
      recentRounds: recent,
      recentMax: Math.max(...recent),
    }
  }, [results])

  const safeProbability = useMemo(() => {
    let probability = 1
    for (let i = 0; i < safePicks; i++) {
      probability *= (25 - mineCount - i) / (25 - i)
    }
    return probability * 100
  }, [mineCount, safePicks])

  function exportHistory() {
    const backup = {
      app: "1StBorN Predictor",
      version: 1,
      exportedAt: new Date().toISOString(),
      game: "aviator",
      results,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "1stborn-aviator-backup.json"
    link.click()
    URL.revokeObjectURL(url)
  }

  function importHistory(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result)
        if (backup.app !== "1StBorN Predictor" || backup.version !== 1 || backup.game !== "aviator" || !Array.isArray(backup.results) || backup.results.length > 100 || !backup.results.every(value => Number.isFinite(value) && value >= 1)) {
          throw new Error("Invalid backup file")
        }
        setResults(backup.results)
        alert("Backup restored successfully!")
      } catch {
        alert("Invalid backup file. Your existing history was not changed.")
      }
      event.target.value = ""
    }
    reader.readAsText(file)
  }

  function importOcrHistory(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const report = JSON.parse(reader.result)
        if (!Array.isArray(report.rounds)) throw new Error("Invalid OCR report")
        const confirmed = report.rounds
          .filter(item => item.status === "confirmed" && Number.isFinite(item.multiplier) && item.multiplier >= 1)
          .map(item => item.multiplier)
        if (!confirmed.length) throw new Error("No confirmed readings")
        setResults(old => [...new Set([...confirmed, ...old])].slice(0, 100))
        alert(`${confirmed.length} confirmed OCR readings imported. Uncertain readings were skipped.`)
      } catch {
        alert("Invalid OCR report or no confirmed readings. Your existing history was not changed.")
      }
      event.target.value = ""
    }
    reader.readAsText(file)
  }

  function startSession() {
    setSessionRounds([])
    setSessionStartedAt(new Date().toISOString())
    setSessionActive(true)
  }

  function stopSession() {
    setSessionActive(false)
  }

  async function requestScreenCapturePermission() {
    if (!Capacitor.isNativePlatform()) {
      setCaptureMessage('Install the Android app to request screen capture permission.')
      return
    }

    try {
      setCaptureMessage('Waiting for Android permission...')
      const response = await ScreenCapture.requestPermission()
      setCapturePermission(response.granted ? 'granted' : 'denied')
      setCaptureMessage(response.granted
        ? 'Permission granted. Screen capture service is not started yet.'
        : 'Permission denied. You can try again whenever you are ready.')
    } catch (error) {
      setCapturePermission('error')
      setCaptureMessage(error?.message || 'Could not request screen capture permission.')
    }
  }

  async function startScreenCapture() {
    try {
      setCaptureMessage('Starting Android screen capture service...')
      const response = await ScreenCapture.startCapture()
      if (response.started) {
        setCaptureMessage('Capture start requested. Check for the 1StBorN Predictor notification.')
      }
    } catch (error) {
      setCaptureMessage(error?.message || 'Could not start screen capture.')
    }
  }

  async function stopScreenCapture() {
    try {
      await ScreenCapture.stopCapture()
      setCaptureMessage('Screen capture stop requested.')
    } catch (error) {
      setCaptureMessage(error?.message || 'Could not stop screen capture.')
    }
  }

  function addResult(event) {
    event.preventDefault()
    const value = Number(multiplier)
    if (!Number.isFinite(value) || value < 1) return
    const recordedAt = new Date().toISOString()
    setResults(old => [value, ...old].slice(0, 100))
    if (sessionActive) {
      setSessionRounds(old => [{ value, recordedAt }, ...old])
    }
    setMultiplier('')
  }

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">1B</div>
          <div>
            <h1>1StBorN <span>Predictor</span></h1>
            <p>STATISTICS & ANALYTICS</p>
          </div>
        </div>
        <div className="status"><i /> DEMO MODE</div>
      </header>

      <section className="welcome">
        <div>
          <p className="eyebrow">YOUR CASINO ANALYTICS COMPANION</p>
          <h2>Analyse every<br /><span>game round.</span></h2>
          <p className="subtext">Track results. Understand probabilities. Make informed decisions.</p>
        </div>
        <div className="orb">1B</div>
      </section>

      <section className="overview-panel">
        <div className="overview-heading">
          <div>
            <p className="eyebrow">YOUR PERFORMANCE</p>
            <h3>Dashboard Overview</h3>
          </div>
          <span className="tag">LIVE STATS</span>
        </div>
        <div className="overview-grid">
          <div className="overview-card">
            <span>TOTAL ROUNDS</span>
            <strong>{results.length}</strong>
          </div>
          <div className="overview-card">
            <span>OVERALL AVERAGE</span>
            <strong>{stats ? `${stats.average}x` : "--"}</strong>
          </div>
          <div className="overview-card">
            <span>LATEST ROUND</span>
            <strong>{results.length ? `${results[0].toFixed(2)}x` : "--"}</strong>
          </div>
        </div>
        <p className="overview-note">Statistics update automatically from your recorded Aviator results.</p>
      </section>

      <nav className="game-tabs">
        <button className={game === 'aviator' ? 'active' : ''} onClick={() => setGame('aviator')}>
          ✈ Aviator
        </button>
        <button className={game === 'mines' ? 'active' : ''} onClick={() => setGame('mines')}>
          ◈ Mines
        </button>
      </nav>

      {game === 'aviator' ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">GAME ANALYTICS</p>
              <h3>Aviator Tracker</h3>
            </div>
            <span className="tag">MANUAL DATA</span>
          </div>

          <div className="session-panel">
            <div className="session-heading">
              <div>
                <p className="eyebrow">LIVE BETTING COMPANION</p>
                <h3>Session Control</h3>
              </div>
              <span className={`session-status ${sessionActive ? "active" : ""}`}>
                {sessionActive ? "SESSION ACTIVE" : "SESSION STOPPED"}
              </span>
            </div>
            <div className="session-actions">
              {!sessionActive ? (
                <button type="button" onClick={startSession}>START SESSION</button>
              ) : (
                <button type="button" onClick={stopSession}>STOP SESSION</button>
              )}
            </div>
            <div className="session-actions">
              {capturePermission !== 'granted' ? (
                <button type="button" onClick={requestScreenCapturePermission}>
                  REQUEST SCREEN PERMISSION
                </button>
              ) : (
                <>
                  <button type="button" onClick={startScreenCapture}>
                    START SCREEN CAPTURE
                  </button>
                  <button type="button" onClick={stopScreenCapture}>
                    STOP SCREEN CAPTURE
                  </button>
                </>
              )}
              <span className={`session-status ${capturePermission === 'granted' ? 'active' : ''}`}>
                {capturePermission.toUpperCase()}
              </span>
            </div>
            <p className="disclaimer">{captureMessage}</p>
            <div className="session-summary">
              <div><span>SESSION ROUNDS</span><strong>{sessionRounds.length}</strong></div>
              <div><span>STARTED</span><strong>{sessionStartedAt ? new Date(sessionStartedAt).toLocaleTimeString() : "--"}</strong></div>
            </div>
            <div className="session-history">
              <h4>SESSION ROUND HISTORY</h4>
              {sessionRounds.length === 0 ? (
                <p className="disclaimer">No rounds recorded in this session yet.</p>
              ) : (
                sessionRounds.slice(0, 10).map((round, index) => (
                  <div className="session-round" key={`${round.recordedAt}-${index}`}>
                    <strong>{Number(round.value).toFixed(2)}x</strong>
                    <span>{new Date(round.recordedAt).toLocaleTimeString()}</span>
                  </div>
                ))
              )}
            </div>
            <p className="disclaimer">Manual round logging only. Historical results cannot reliably predict the next crash point.</p>
          </div>

          <div className="metric-grid">
            <div className="metric">
              <span>ROUNDS RECORDED</span>
              <strong>{results.length}</strong>
            </div>
            <div className="metric">
              <span>AVERAGE</span>
              <strong>{stats ? `${stats.average}x` : '--'}</strong>
            </div>
            <div className="metric">
              <span>MEDIAN</span>
              <strong>{stats ? `${stats.median}x` : '--'}</strong>
            </div>
            <div className="metric">
              <span>HIGHEST</span>
              <strong className="lime">{stats ? `${stats.highest}x` : '--'}</strong>
            </div>
          </div>

          {analysis && (
            <div className="analysis-panel">
              <div className="history-heading">
                <h4>Round distribution</h4>
                <span className="tag">HISTORICAL DATA</span>
              </div>
              <div className="distribution">
                <div><span>Below 2x</span><strong>{analysis.low}</strong><small>{analysis.lowPercent}%</small><div className="distribution-track"><i style={{ width: `${analysis.lowPercent}%` }} /></div></div>
                <div><span>2x–5x</span><strong>{analysis.medium}</strong><small>{analysis.mediumPercent}%</small><div className="distribution-track"><i style={{ width: `${analysis.mediumPercent}%` }} /></div></div>
                <div><span>Above 5x</span><strong>{analysis.high}</strong><small>{analysis.highPercent}%</small><div className="distribution-track"><i style={{ width: `${analysis.highPercent}%` }} /></div></div>
              </div>
              <div className="extra-stats">
                <div><span>Volatility (standard deviation)</span><strong>{analysis.volatility}x</strong></div>
                <div><span>Last {analysis.recentCount} rounds average</span><strong>{analysis.recentAverage}x</strong></div>
              </div>
              <div className="trend-section">
                <h4>Recent round trend</h4>
                <div className="trend-chart">
                  {analysis.recentRounds.slice().reverse().map((value, index) => (
                    <div className="trend-column" key={`${index}-${value}`}>
                      <strong>{value.toFixed(2)}x</strong>
                      <i style={{ height: `${Math.max(8, value / analysis.recentMax * 100)}%` }} />
                      <span>{index + 1}</span>
                    </div>
                  ))}
                </div>
                <p className="chart-caption">Oldest to newest · Last {analysis.recentCount} rounds</p>
              </div>
              <p className="disclaimer">These describe recorded rounds only. They cannot forecast the next result.</p>
            </div>
          )}

          <form className="entry-form" onSubmit={addResult}>
            <label htmlFor="multiplier">RECORD A COMPLETED ROUND</label>
            <div className="input-row">
              <input id="multiplier" type="number" min="1" step="0.01"
                placeholder="Enter multiplier e.g. 2.45"
                value={multiplier} onChange={e => setMultiplier(e.target.value)} />
              <button type="submit">ADD ROUND +</button>
            </div>
          </form>

          <div className="history-heading">
            <h4>Recent results</h4>
            <div className="history-actions">
              <button className="text-button" onClick={exportHistory} disabled={!results.length}>Export Backup</button>
              <label className="text-button import-button" htmlFor="backup-file">Import Backup</label>
              <label className="text-button import-button" htmlFor="ocr-file">Import OCR</label>
              <input id="ocr-file" type="file" accept=".json,application/json" onChange={importOcrHistory} hidden />
              <input id="backup-file" type="file" accept=".json,application/json" onChange={importHistory} hidden />
              <button className="text-button" onClick={() => { if (window.confirm("Delete all recorded Aviator rounds? This cannot be undone unless you have a backup.")) setResults([]) }}>Clear history</button>
            </div>
          </div>

          {results.length ? (
            <div className="history">
              {results.slice(0, 12).map((value, index) => (
                <div className={`history-item ${value >= 2 ? 'good' : 'low'}`} key={`${index}-${value}`}>
                  <span>{value.toFixed(2)}x</span>
                  <button type="button" className="delete-result" aria-label={`Delete ${value.toFixed(2)}x result`} onClick={() => setResults(old => old.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span>◎</span>
              <p>No rounds recorded yet.</p>
              <small>Enter completed round results to begin your analysis.</small>
            </div>
          )}

          {stats && (
            <div className="extra-stats">
              <div><span>Lowest recorded</span><strong>{stats.lowest}x</strong></div>
              <div><span>Data source</span><strong>Manual entry</strong></div>
            </div>
          )}
          <p className="disclaimer">Historical statistics describe recorded results. They do not predict or guarantee the next crash multiplier.</p>
        </section>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MATHEMATICAL ANALYSIS</p>
              <h3>Mines Calculator</h3>
            </div>
            <span className="tag">25 TILES</span>
          </div>

          <div className="mine-board">
            {Array.from({ length: 25 }, (_, i) => (
              <div className="mine-tile" key={i}>{i + 1}</div>
            ))}
          </div>
          <p className="board-note">Illustrative board only. No hidden mine positions are known.</p>

          <div className="calculator">
            <label htmlFor="mines">NUMBER OF MINES</label>
            <select id="mines" value={mineCount} onChange={e => {
              const value = Number(e.target.value)
              setMineCount(value)
              setSafePicks(Math.min(safePicks, 25 - value))
            }}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} mines</option>
              ))}
            </select>

            <label htmlFor="picks">NUMBER OF SAFE PICKS</label>
            <select id="picks" value={safePicks} onChange={e => setSafePicks(Number(e.target.value))}>
              {Array.from({ length: 25 - mineCount }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n} picks</option>
              ))}
            </select>

            <div className="probability-result">
              <span>MATHEMATICAL CHANCE OF ALL PICKS BEING SAFE</span>
              <strong>{safeProbability.toFixed(4)}%</strong>
              <div className="probability-track">
                <div style={{ width: `${safeProbability}%` }} />
              </div>
              <small>Assuming uniformly random mine placement.</small>
            </div>
          </div>
          <p className="disclaimer">This calculates probability, not the location of hidden mines. Actual game rules and fairness must be independently verified.</p>
        </section>
      )}

      <footer>
        <strong>1StBorN Predictor</strong>
        <span>ANALYTICS, NOT GUARANTEED PREDICTIONS.</span>
      </footer>
    </main>
  )
}

export default App
