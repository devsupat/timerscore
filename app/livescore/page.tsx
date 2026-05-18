'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
  score: number
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

export default function LiveScorePage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [eventTitle, setEventTitle] = useState('LIVE SCORE')
  const [eventSubtitle, setEventSubtitle] = useState('')
  const [currentSession, setCurrentSession] = useState(1)
  const totalSessions = 4

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
    fetchTeams()
    fetchTimer()
    const teamChannel = supabase.channel('livescore-teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe()
    const timerChannel = supabase.channel('livescore-timer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timer_config' }, fetchTimer)
      .subscribe()
    return () => {
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

  // Current session teams (sorted by score desc, already from DB)
  const sessionTeams = teams.filter(t => parseTeamInfo(t.name).session === currentSession)

  return (
    <div className="bg-surface-bg text-on-surface min-h-screen font-hanken antialiased">
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md text-white border-b border-slate-800 px-6 h-20 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <img src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" className="h-12 w-auto object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
          <div className="h-8 w-px bg-slate-800"></div>
          <div>
            <span className="font-bebas text-2xl font-black text-amber-400 tracking-wider uppercase block leading-none pt-0.5">LIGA BINTANG JUARA</span>
            <span className="text-[10px] text-slate-400 font-space font-black tracking-widest uppercase block mt-1">KOTA TANGERANG • SPECTATOR PLATFORM</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-6 h-full font-space text-xs font-bold uppercase tracking-wider">
            <a className="text-slate-300 hover:text-amber-400 transition-colors py-2.5" href="/display">Display</a>
            <a className="text-amber-400 border-b-2 border-amber-400 py-2.5" href="/livescore">Live Score</a>
            <a className="text-slate-300 hover:text-amber-400 transition-colors py-2.5" href="/admin">Admin Panel</a>
          </nav>
        </div>
      </header>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="bg-primary-container text-white rounded-2xl p-8 text-center shadow-lg space-y-2">
          <span className="font-space text-xs font-bold tracking-widest uppercase text-white/60">Live Score</span>
          <h1 className="font-bebas text-4xl md:text-5xl tracking-wide leading-tight">{eventTitle}</h1>
          {eventSubtitle && <p className="text-sm text-white/70 font-space">{eventSubtitle}</p>}

          {/* Session pills */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {Array.from({ length: totalSessions }, (_, i) => i + 1).map(s => (
              <span
                key={s}
                className={`font-space text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${
                  s === currentSession
                    ? 'bg-secondary-container text-on-secondary-container'
                    : s < currentSession
                    ? 'bg-white/10 text-white/40 line-through'
                    : 'bg-white/10 text-white/50'
                }`}
              >
                Sesi {s}
              </span>
            ))}
          </div>

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
              {isEnded ? `Hasil Akhir Sesi ${currentSession}` : `Ranking Sementara — Sesi ${currentSession}`}
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

        {/* All sessions summary (collapsed view) */}
        {teams.length > sessionTeams.length && (
          <div className="bg-white border border-outline-var rounded-2xl shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-outline-var">
              <h2 className="font-bebas text-xl text-primary-main tracking-wide">Rekap Semua Sesi</h2>
            </div>
            <div className="divide-y divide-outline-var/40">
              {Array.from({ length: totalSessions }, (_, i) => i + 1).map(sesi => {
                const sesiTeams = teams.filter(t => parseTeamInfo(t.name).session === sesi)
                if (sesiTeams.length === 0) return null
                const isActive = sesi === currentSession
                return (
                  <div key={sesi} className={`px-6 py-3 ${isActive ? 'bg-primary-container/5' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`font-space text-xs font-black px-2 py-0.5 rounded-full uppercase ${isActive ? 'bg-primary-container text-white' : 'bg-surface-container text-on-surface-variant border border-outline-var'}`}>
                        Sesi {sesi}{isActive ? ' ● Aktif' : ''}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {sesiTeams.slice(0, 3).map((team, idx) => {
                        const parsed = parseTeamInfo(team.name)
                        return (
                          <div key={team.id} className="flex items-center justify-between text-sm">
                            <span className="font-space text-on-surface-variant font-medium">{idx + 1}. {parsed.name}</span>
                            <span className="font-space font-bold text-primary-main">{team.score} pts</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-on-surface-variant font-space pb-4">
          Data diperbarui secara real-time &bull; <a href="/display" className="underline hover:text-primary-main">Display Screen</a>
        </p>
      </div>
    </div>
  )
}
