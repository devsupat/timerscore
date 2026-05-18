'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
  score: number
  tiebreaker_score: number
}

type TimerConfig = {
  id: number
  duration_seconds: number
  started_at: string | null
  is_running: boolean
  label: string
}

function parseTeamInfo(fullName: string) {
  const sessionMatch = fullName.match(/\[S:(\d+)\]/)
  const session = sessionMatch ? parseInt(sessionMatch[1]) : 1
  const nameWithoutSession = fullName.replace(/\s*\[S:\d+\]/, '').trim()
  const noMatch = nameWithoutSession.match(/(.*)\s+\[No:\s*([^\]]+)\]/)
  if (noMatch) return { name: noMatch[1].trim(), noUrut: noMatch[2], session }
  return { name: nameWithoutSession, noUrut: '-', session }
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function computeFinalTop7(teams: Team[]) {
  const maxSes = teams.length > 0 ? Math.max(...teams.map(t => parseTeamInfo(t.name).session)) : 1
  const isLanjutan = maxSes > 4
  // Saat lanjutan aktif, hanya hitung skor dari sesi lanjutan (babak baru, skor fresh)
  const relevant = isLanjutan
    ? teams.filter(t => parseTeamInfo(t.name).session > 4)
    : teams

  const sorted = [...relevant].sort((a, b) =>
    b.score !== a.score ? b.score - a.score :
    b.tiebreaker_score !== a.tiebreaker_score ? b.tiebreaker_score - a.tiebreaker_score :
    a.id - b.id
  )

  const rank7Score = sorted[6]?.score
  const atCutoff = sorted.filter(t => t.score === rank7Score)
  const needsCutoffTB = atCutoff.length > 1 && sorted.indexOf(atCutoff[0]) < 7

  const top7 = sorted.slice(0, 7)

  const scoreMap = new Map<number, Team[]>()
  for (const t of top7) {
    if (!scoreMap.has(t.score)) scoreMap.set(t.score, [])
    scoreMap.get(t.score)!.push(t)
  }
  const internalTies = [...scoreMap.values()].filter(g => g.length > 1)

  return { top7, needsCutoffTB, internalTies, cutoffCandidates: atCutoff, isLanjutan }
}

export default function LiveScorePage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [eventTitle, setEventTitle] = useState('LIVE SCORE')
  const [eventSubtitle, setEventSubtitle] = useState('')
  const [currentSession, setCurrentSession] = useState(1)

  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const timerInterval = useRef<NodeJS.Timeout | null>(null)

  const isLive = isTimerRunning && timeLeft !== null && timeLeft > 0
  const isEnded = timeLeft !== null && timeLeft === 0

  const fetchTeams = useCallback(() => {
    void supabase
      .from('teams')
      .select('*')
      .order('score', { ascending: false })
      .order('tiebreaker_score', { ascending: false })
      .order('id', { ascending: true })
      .then(({ data }) => { if (data) setTeams(data) })
  }, [])

  const loadTimer = useCallback(async () => {
    const { data, error } = await supabase.from('timer_config').select('*').limit(1)
    if (error) throw error
    return data?.[0] ? (data[0] as TimerConfig) : null
  }, [])

  const fetchTimer = useCallback(() => {
    void loadTimer().then(cfg => {
      if (!cfg) return
      if (cfg.label) {
        const parts = cfg.label.split('|')
        if (parts[0]) setEventTitle(parts[0])
        if (parts[1]) setEventSubtitle(parts[1])
        if (parts[2]) setCurrentSession(parseInt(parts[2]) || 1)
      }
      setIsTimerRunning(cfg.is_running)
      if (cfg.is_running && cfg.started_at) {
        const elapsed = Math.floor((Date.now() - new Date(cfg.started_at).getTime()) / 1000)
        setTimeLeft(Math.max(0, cfg.duration_seconds - elapsed))
      } else {
        setTimeLeft(cfg.duration_seconds)
      }
    }).catch(err => console.error('Error fetching timer:', err))
  }, [loadTimer])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      fetchTeams()
      fetchTimer()
    }, 0)

    const teamChannel = supabase.channel('livescore-teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe()
    const timerChannel = supabase.channel('livescore-timer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timer_config' }, fetchTimer)
      .subscribe()
    return () => {
      clearTimeout(initialLoad)
      supabase.removeChannel(teamChannel)
      supabase.removeChannel(timerChannel)
    }
  }, [fetchTeams, fetchTimer])

  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchTimer() }
    window.addEventListener('visibilitychange', handleVisibility)
    return () => window.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchTimer])

  useEffect(() => {
    if (!isLive) {
      if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null }
      return
    }
    timerInterval.current = setInterval(() => {
      setTimeLeft(prev => (prev !== null && prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => {
      if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null }
    }
  }, [isLive])

  const statusLabel = isEnded ? 'Selesai' : isLive ? 'Sedang Berlangsung' : 'Belum Dimulai'
  const statusStyle = isEnded
    ? 'bg-red-50 text-red-700 border-red-200'
    : isLive
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-surface-container-low text-on-surface-variant border-outline-var'

  const totalSessions = Math.max(4, currentSession, teams.length > 0 ? Math.max(...teams.map(t => parseTeamInfo(t.name).session)) : 4)
  const isLanjutanSession = currentSession > 4

  const sessionLabel = (s: number) => s > 4 ? `Lanjutan ${s - 4}` : `Sesi ${s}`

  // Current session teams (sorted by score desc, already from DB)
  const sessionTeams = teams.filter(t => parseTeamInfo(t.name).session === currentSession)

  return (
    <div className="bg-surface-bg text-on-surface min-h-screen font-hanken antialiased">
      <header className="sticky top-0 z-30 bg-[#145224]/95 backdrop-blur-md text-white border-b border-[#0F3D1E] px-4 py-3 md:px-6 md:py-0 md:h-20 flex flex-col md:flex-row justify-between items-center gap-3 md:gap-0 shadow-lg">
        <div className="flex items-center gap-2.5 md:gap-4 bg-gradient-to-r from-[#0F3D1E] to-[#145224] px-3 md:px-4 py-1.5 rounded-xl border border-[#1A6B2F]/20 w-full md:w-auto justify-center md:justify-start">
          <img src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" className="h-8 md:h-12 w-auto flex-shrink-0 object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
          <div className="h-6 md:h-8 w-px bg-[#1A6B2F]/30 flex-shrink-0"></div>
          <div className="min-w-0 flex flex-col justify-center items-start">
            <span className="font-bebas text-lg md:text-2xl font-black text-[#F5C518] tracking-wider uppercase block leading-none pt-0.5 whitespace-nowrap">LIGA BINTANG JUARA</span>
            <span className="text-[9px] md:text-[10px] text-slate-400 font-space font-black tracking-widest uppercase block mt-1 whitespace-nowrap">KOTA TANGERANG • PLATFORM PENONTON</span>
          </div>
        </div>

        <nav className="flex flex-wrap justify-center md:justify-end items-center gap-4 md:gap-6 w-full md:w-auto font-space text-[10px] md:text-xs font-bold uppercase tracking-wider">
          <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/display">Layar Utama</a>
          <a className="text-[#F5C518] border-b-2 border-[#F5C518] py-1 md:py-2.5" href="/livescore">Skor Langsung</a>
          <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/admin">Panel Admin</a>
        </nav>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="bg-primary-container text-white rounded-2xl p-8 text-center shadow-lg space-y-2">
          <span className="font-space text-xs font-bold tracking-widest uppercase text-white/60">Skor Langsung</span>
          <h1 className="font-bebas text-4xl md:text-5xl tracking-wide leading-tight">{eventTitle}</h1>
          {eventSubtitle && <p className="text-sm text-white/70 font-space">{eventSubtitle}</p>}

          {/* Session pills */}
          <div className="flex items-center justify-center flex-wrap gap-2 pt-2">
            {Array.from({ length: totalSessions }, (_, i) => i + 1).map(s => (
              <span
                key={s}
                className={`font-space text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${
                  s === currentSession
                    ? s > 4
                      ? 'bg-amber-400 text-slate-950'
                      : 'bg-secondary-container text-on-secondary-container'
                    : s < currentSession
                    ? 'bg-white/10 text-white/40 line-through'
                    : 'bg-white/10 text-white/50'
                }`}
              >
                {sessionLabel(s)}
              </span>
            ))}
          </div>

          {isLanjutanSession && isLive && (
            <div className="inline-flex items-center gap-2 bg-amber-400/20 border border-amber-400/50 px-4 py-1.5 rounded-full mt-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span className="font-space text-xs font-black text-amber-300 uppercase tracking-widest">🏆 Babak Penentu Pemenang — Sedang Berlangsung</span>
            </div>
          )}

          <div className="pt-4 pb-2 space-y-1">
            {timeLeft !== null ? (
              <>
                <span className={`font-mono text-8xl font-black block leading-none ${timeLeft === 0 ? 'text-red-400 animate-pulse' : 'text-secondary-container timer-glow'}`}>
                  {formatTime(timeLeft)}
                </span>
                <span className="font-space text-xs font-bold uppercase tracking-widest text-white/60 block pt-1">Sisa Waktu</span>
              </>
            ) : (
              <span className="font-mono text-8xl font-black text-white/20 animate-pulse block">--:--</span>
            )}
          </div>

          <div className={`inline-flex items-center gap-2 border px-4 py-1.5 rounded-full text-xs font-bold font-space mt-2 ${statusStyle}`}>
            {isLive && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>}
            {isEnded && <span className="w-2 h-2 rounded-full bg-red-500"></span>}
            Status: {statusLabel}
          </div>
        </div>

        {/* Current session rankings */}
        <div className="bg-white border border-outline-var rounded-2xl shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-var flex items-center justify-between">
            <h2 className="font-bebas text-2xl text-primary-main tracking-wide">
              {isLanjutanSession
                ? isEnded
                  ? `🏆 Hasil Akhir — ${sessionLabel(currentSession)}`
                  : `🔥 Babak Penentu Pemenang — ${sessionLabel(currentSession)}`
                : isEnded
                  ? `Hasil Akhir Sesi ${currentSession}`
                  : `Ranking Sementara — Sesi ${currentSession}`}
            </h2>
            <span className="font-space text-xs text-on-surface-variant font-semibold">{sessionTeams.length} peserta</span>
          </div>

          {sessionTeams.length === 0 ? (
            <p className="text-center text-on-surface-variant py-12 font-space text-sm">Belum ada peserta untuk sesi ini.</p>
          ) : (
            <div className="divide-y divide-outline-var/40">
              {sessionTeams.map((team, idx) => {
                const parsed = parseTeamInfo(team.name)
                const medalEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                const showMedal = isEnded && medalEmoji !== null

                return (
                  <div
                    key={team.id}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                      showMedal
                        ? idx === 0 ? 'bg-amber-50' : idx === 1 ? 'bg-slate-50' : 'bg-orange-50/60'
                        : idx < 3 ? 'bg-surface-container-low/40' : ''
                    }`}
                  >
                    <div className="w-10 flex-shrink-0 flex items-center justify-center">
                      {showMedal ? (
                        <span className="text-2xl">{medalEmoji}</span>
                      ) : (
                        <span className="font-space font-bold text-sm w-8 h-8 rounded-full bg-surface-container-low border border-outline-var flex items-center justify-center text-primary-main">
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bebas text-xl tracking-wide text-primary-main block leading-tight truncate">{parsed.name}</span>
                      <span className="text-xs text-on-surface-variant font-space font-medium">No. Urut: {parsed.noUrut}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="font-space text-2xl font-black text-primary-main">{team.score}</span>
                      <span className="text-xs text-on-surface-variant font-space block">pts</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* All sessions summary (Top 7) */}
        {(() => {
          const { top7, needsCutoffTB, internalTies, isLanjutan } = computeFinalTop7(teams)
          if (top7.length === 0) return null

          const panelTitle = isLanjutan
            ? '🏆 Klasemen Babak Penentu Pemenang'
            : 'Rekap Global — Top 7 Sementara'
          const panelBorder = isLanjutan
            ? 'border-amber-300 bg-gradient-to-b from-amber-50/50 to-white'
            : 'border-outline-var bg-white'

          return (
            <div className={`border rounded-2xl shadow-md overflow-hidden ${panelBorder}`}>
              <div className="px-6 py-4 border-b border-inherit flex items-center justify-between">
                <h2 className="font-bebas text-xl text-primary-main tracking-wide">{panelTitle}</h2>
                {needsCutoffTB && (
                  <span className="font-space text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                    Perlu Babak Tambahan
                  </span>
                )}
              </div>
              <div className="divide-y divide-outline-var/40">
                {top7.map((team, idx) => {
                  const parsed = parseTeamInfo(team.name)
                  const isTied = internalTies.some(group => group.some(t => t.id === team.id)) || (needsCutoffTB && team.score === top7[6].score)
                  
                  return (
                    <div key={team.id} className="px-6 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-3">
                        <span className="font-space font-bold w-6 h-6 flex items-center justify-center bg-surface-container-low rounded-full text-primary-main border border-outline-var">
                          {idx + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="font-space text-on-surface-variant font-medium">{parsed.name} (Sesi {parsed.session})</span>
                          {isTied && <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">⚠ Skor Sama</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-space font-bold text-primary-main text-lg">{team.score} pts</span>
                        {team.tiebreaker_score > 0 && <span className="block font-space text-[10px] text-red-500 font-bold">TB: {team.tiebreaker_score}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <div className="text-center font-space pb-6 space-y-1.5">
          <p className="text-xs text-on-surface-variant">
            Data diperbarui secara real-time &bull; <a href="/display" className="underline hover:text-primary-main">Layar Utama</a>
          </p>
          <p className="text-xs text-on-surface-variant/70 flex items-center justify-center gap-1.5">
            Dibuat dengan cinta
            <span className="inline-block animate-bounce text-red-500 text-sm">❤️</span>
            oleh Guru SDN Sukasari 4
          </p>
        </div>
      </div>
    </div>
  )
}
