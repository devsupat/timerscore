'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Team = {
  id: number
  name: string
  score: number
  tiebreaker_score: number
  created_at?: string
}

type TimerConfig = {
  id: number
  duration_seconds: number
  started_at: string | null
  is_running: boolean
  label: string
}

// Name format: "School Name [No: 001] [S:2]" — strip [S:N] before display
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

// Spectacular custom vector trophy icons that never fail to load
function TrophyIcon({ rank, isEnded }: { rank: number; isEnded: boolean }) {
  let fillUrl = "url(#neutral-trophy-grad)"
  let glowColor = "rgba(148, 163, 184, 0.12)"
  
  if (isEnded) {
    if (rank === 1) {
      fillUrl = "url(#gold-trophy-grad)"
      glowColor = "rgba(251, 191, 36, 0.25)"
    } else if (rank === 2) {
      fillUrl = "url(#silver-trophy-grad)"
      glowColor = "rgba(203, 213, 225, 0.2)"
    } else if (rank === 3) {
      fillUrl = "url(#bronze-trophy-grad)"
      glowColor = "rgba(249, 115, 22, 0.15)"
    }
  }

  return (
    <div className="relative flex items-center justify-center w-32 h-32 my-1">
      {/* Dynamic ambient halo glow behind the trophy */}
      <div 
        className="absolute inset-2 rounded-full blur-2xl transition-all duration-1000 opacity-70 animate-pulse"
        style={{ backgroundColor: glowColor }}
      />
      <svg className="w-28 h-28 filter drop-shadow-[0_10px_20px_rgba(0,0,0,0.15)] relative z-10 transition-transform duration-500 group-hover:scale-110" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gold-trophy-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFbeb" />
            <stop offset="25%" stopColor="#FDE047" />
            <stop offset="65%" stopColor="#CA8A04" />
            <stop offset="100%" stopColor="#854D0E" />
          </linearGradient>
          <linearGradient id="silver-trophy-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="30%" stopColor="#E2E8F0" />
            <stop offset="65%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id="bronze-trophy-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF7ED" />
            <stop offset="30%" stopColor="#FDBA74" />
            <stop offset="65%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#9A3412" />
          </linearGradient>
          <linearGradient id="neutral-trophy-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F8FAFC" />
            <stop offset="50%" stopColor="#CBD5E1" />
            <stop offset="100%" stopColor="#64748B" />
          </linearGradient>
        </defs>
        
        {/* Trophy Shape */}
        <path d="M16 12V20C16 29 22.5 35 30 36.5V46H23C21.5 46 20 47.5 20 49C20 50.5 21.5 52 23 52H41C42.5 52 44 50.5 44 49C44 47.5 42.5 46 41 46H34V36.5C41.5 35 48 29 48 20V12H16Z" fill={fillUrl} />
        <path d="M11 15C8.5 15 6.5 17 6.5 19.5C6.5 24 10 28 14 29.5L15.5 26C12.5 25 10.5 22.5 10.5 19.5C10.5 19 11 18.5 11.5 18.5H16V15H11Z" fill={fillUrl} opacity="0.8" />
        <path d="M53 15C55.5 15 57.5 17 57.5 19.5C57.5 24 54 28 50 29.5L48.5 26C51.5 25 53.5 22.5 53.5 19.5C53.5 19 53 18.5 52.5 18.5H48V15H53Z" fill={fillUrl} opacity="0.8" />
        <rect x="18" y="52" width="28" height="4" rx="2" fill="#FFFFFF" opacity="0.4" />
        <path d="M32 18L34 23L39.5 23.5L35.5 27L36.8 32.2L32 29.5L27.2 32.2L28.5 27L24.5 23.5L30 23L32 18Z" fill="#FFFFFF" opacity="0.9" />
      </svg>
    </div>
  )
}

export default function DisplayPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [eventTitle, setEventTitle] = useState('SELEKSI LIGA BINTANG JUARA')
  const [eventSubtitle, setEventSubtitle] = useState('Tingkat Gugus Kecamatan Tangerang • Selasa, 12 Mei 2025')
  const [currentSession, setCurrentSession] = useState(1)
  const totalSessions = 4

  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const timerInterval = useRef<NodeJS.Timeout | null>(null)
  const isLive = isTimerRunning && timeLeft !== null && timeLeft > 0
  const isCompetitionEnded = timeLeft !== null && timeLeft === 0

  const loadTeams = useCallback(async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('score', { ascending: false })
      .order('tiebreaker_score', { ascending: false })
      .order('id', { ascending: true })
    if (error) throw error
    return data ?? []
  }, [])

  const fetchTeams = useCallback(() => {
    void loadTeams()
      .then(data => setTeams(data))
      .catch(err => console.error('Error fetching teams:', err))
  }, [loadTeams])

  const loadTimer = useCallback(async () => {
    const { data, error } = await supabase.from('timer_config').select('*').limit(1)
    if (error) throw error
    return data?.[0] ? (data[0] as TimerConfig) : null
  }, [])

  const applyTimerConfig = useCallback((cfg: TimerConfig) => {
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
  }, [])

  const fetchTimer = useCallback(() => {
    void loadTimer()
      .then(cfg => { if (cfg) applyTimerConfig(cfg) })
      .catch(err => console.error('Error fetching timer:', err))
  }, [applyTimerConfig, loadTimer])

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      fetchTeams()
      fetchTimer()
    }, 0)

    const teamChannel = supabase.channel('display-teams-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe()
    const timerChannel = supabase.channel('display-timer-realtime')
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

  // Filter current session participants
  const sessionTeams = teams.filter(t => parseTeamInfo(t.name).session === currentSession)
  const podiumTeams = sessionTeams.slice(0, 3)

  return (
    <div className="bg-gradient-to-br from-[#F0F4F0] via-white to-[#E8F0E9] text-slate-900 min-h-screen font-hanken antialiased pb-24 relative overflow-hidden select-none">
      
      {/* Decorative Widescreen Broadcaster Header */}
      <header className="sticky top-0 z-30 bg-[#145224]/95 backdrop-blur-md text-white border-b border-[#0F3D1E] px-12 h-20 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4 bg-gradient-to-r from-[#0F3D1E] to-[#145224] px-4 py-1.5 rounded-xl border border-[#1A6B2F]/20">
          <img src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" className="h-12 w-auto object-contain filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
          <div className="h-8 w-px bg-[#1A6B2F]/30"></div>
          <div>
            <span className="font-bebas text-2xl font-black text-[#F5C518] tracking-wider uppercase block leading-none pt-0.5">LIGA BINTANG JUARA</span>
            <span className="text-[10px] text-slate-400 font-space font-black tracking-widest uppercase block mt-1">KOTA TANGERANG • PAPAN SKOR RESMI</span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-6 h-full font-space text-xs font-bold uppercase tracking-wider">
            <a className="text-[#F5C518] border-b-2 border-[#F5C518] py-2.5" href="/display">Layar Utama</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-2.5" href="/livescore">Skor Langsung</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-2.5" href="/admin">Panel Admin</a>
          </nav>
          {isTimerRunning && (
            <span className="flex items-center gap-2 bg-[#F5C518]/20 border border-[#F5C518]/40 text-[#F5C518] px-4 py-1.5 rounded-full text-xs font-black font-space live-badge shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#F5C518] animate-pulse"></span>
              SIARAN LANGSUNG
            </span>
          )}
        </div>
      </header>

      {/* Decorative subtle visual glows in background */}
      <div className="absolute top-44 left-1/4 w-96 h-96 rounded-full bg-emerald-400/5 blur-3xl pointer-events-none"></div>
      <div className="absolute top-96 right-1/4 w-96 h-96 rounded-full bg-amber-400/5 blur-3xl pointer-events-none"></div>

      <main className="max-w-[1440px] mx-auto px-12 pt-10 space-y-10 relative z-10">
        
        {/* Tournament Info Panel */}
        <section className="text-center space-y-4 max-w-4xl mx-auto">
          <div className="inline-block bg-primary-main/10 border border-primary-main/20 px-4 py-1.5 rounded-full backdrop-blur-sm">
            <span className="font-space text-xs font-bold tracking-widest text-primary-main uppercase">
              🏆 BABAK SELEKSI KOMPETISI
            </span>
          </div>
          <h1 className="font-bebas text-6xl md:text-7xl tracking-wide text-primary-main uppercase leading-none drop-shadow-sm">
            {eventTitle}
          </h1>
          <p className="text-lg text-on-surface-variant font-semibold font-space tracking-wide">
            {eventSubtitle}
          </p>
          
          {/* Custom polished session indicator pills */}
          <div className="flex items-center justify-center gap-2 pt-2">
            {Array.from({ length: totalSessions }, (_, i) => i + 1).map(s => (
              <span
                key={s}
                className={`font-space text-xs font-black px-5 py-2 rounded-full uppercase tracking-wider transition-all duration-300 ${
                  s === currentSession
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md scale-105 ring-2 ring-amber-300 ring-offset-2'
                    : s < currentSession
                    ? 'bg-slate-200 text-slate-500 opacity-60'
                    : 'bg-white text-slate-700 border border-outline-var shadow-sm'
                }`}
              >
                Sesi {s}
              </span>
            ))}
          </div>
        </section>

        {/* Stadium Scoreboard Timer Console */}
        <section className="bg-gradient-to-br from-[#0D2B16] via-[#0F3D1E] to-[#145224] border border-[#1A6B2F]/30 rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center space-y-4 text-white overflow-hidden relative min-h-[220px]">
          {/* Radial glow overlay */}
          <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#F5C518] to-transparent pointer-events-none"></div>

          {/* Metadata badges for high-tech look */}
          <div className="absolute top-4 left-6 font-space text-[10px] tracking-widest text-[#1A6B2F]/70 font-bold uppercase flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            JAM PERTANDINGAN // STATUS: AKTIF
          </div>
          <div className="absolute top-4 right-6 font-space text-[10px] tracking-widest text-[#1A6B2F]/70 font-bold uppercase">
            SESI {currentSession} DARI {totalSessions}
          </div>

          <span className="font-space text-xs text-slate-400 uppercase tracking-widest font-black pt-4">
            SISA WAKTU PERTANDINGAN
          </span>

          <div className="flex items-center justify-center relative">
            {timeLeft !== null ? (
              <span className={`font-space text-8xl md:text-9xl font-black font-mono leading-none tracking-tight transition-colors duration-500 ${
                timeLeft === 0 
                  ? 'text-red-500 animate-pulse drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                  : 'text-amber-400 drop-shadow-[0_0_25px_rgba(245,158,11,0.45)]'
              }`}>
                {formatTime(timeLeft)}
              </span>
            ) : (
              <span className="font-space text-8xl font-black text-slate-800 font-mono animate-pulse">--:--</span>
            )}
          </div>

          {timeLeft === 0 && (
            <div className="bg-red-500/10 border border-red-500/20 px-6 py-1.5 rounded-full z-10 animate-bounce">
              <span className="text-red-400 font-space text-sm font-black tracking-widest uppercase">
                🏁 WAKTU HABIS - SESI SELESAI
              </span>
            </div>
          )}
        </section>

        {/* Podium Standings */}
        {podiumTeams.length > 0 ? (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch pt-4">
            
            {/* 2nd Place Card */}
            {podiumTeams[1] ? (
              <div className="md:order-1 flex flex-col">
                <PodiumCard team={podiumTeams[1]} rank={2} parseFn={parseTeamInfo} isCompetitionEnded={isCompetitionEnded} />
              </div>
            ) : (
              <div className="md:order-1 hidden md:flex opacity-40 border-2 border-dashed border-outline-var rounded-2xl bg-white/50 items-center justify-center p-8 text-center font-space font-bold text-slate-400">Posisi 2</div>
            )}
            
            {/* 1st Place Card */}
            {podiumTeams[0] && (
              <div className="md:order-2 flex flex-col">
                <PodiumCard team={podiumTeams[0]} rank={1} parseFn={parseTeamInfo} isCompetitionEnded={isCompetitionEnded} />
              </div>
            )}
            
            {/* 3rd Place Card */}
            {podiumTeams[2] ? (
              <div className="md:order-3 flex flex-col">
                <PodiumCard team={podiumTeams[2]} rank={3} parseFn={parseTeamInfo} isCompetitionEnded={isCompetitionEnded} />
              </div>
            ) : (
              <div className="md:order-3 hidden md:flex opacity-40 border-2 border-dashed border-outline-var rounded-2xl bg-white/50 items-center justify-center p-8 text-center font-space font-bold text-slate-400">Posisi 3</div>
            )}
          </section>
        ) : (
          <div className="text-center py-20 bg-white border border-outline-var rounded-3xl font-space text-lg font-bold text-slate-500 shadow-sm">
            Belum ada data peserta untuk Sesi {currentSession}.
          </div>
        )}

        {/* Detailed Leaderboard Table */}
        {sessionTeams.length > 0 && (
          <section className="bg-white border border-outline-var rounded-3xl p-8 shadow-md space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-bebas text-3xl text-primary-main tracking-wider">
                {isCompetitionEnded ? `🏆 Hasil Akhir Keseluruhan Sesi ${currentSession}` : `📊 Rekap Skor Sesi ${currentSession}`}
              </h3>
              {isCompetitionEnded && (
                <span className="font-space text-xs font-black bg-red-50 border border-red-200 text-red-600 px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Sesi Selesai
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full font-space text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-widest font-black">
                    <th className="text-left pb-4 w-16">Peringkat</th>
                    <th className="text-left pb-4">Sekolah / Nama Peserta</th>
                    <th className="text-center pb-4 w-28">No. Urut</th>
                    <th className="text-right pb-4 w-32">Skor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessionTeams.map((team, idx) => {
                    const parsed = parseTeamInfo(team.name)
                    const medalEmoji = isCompetitionEnded
                      ? idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null
                      : null
                    
                    return (
                      <tr key={team.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="py-4">
                          <span className="font-black text-sm w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-primary-main">
                            {medalEmoji ?? idx + 1}
                          </span>
                        </td>
                        <td className="py-4">
                          <span className="font-bebas text-2xl tracking-wide text-primary-main block leading-tight">{parsed.name}</span>
                        </td>
                        <td className="py-4 text-center font-bold text-slate-600">{parsed.noUrut}</td>
                        <td className="py-4 text-right">
                          <span className="font-black font-mono text-2xl text-primary-main">{team.score}</span>
                          {team.tiebreaker_score > 0 && <span className="block font-space text-xs font-bold text-red-500">TB: {team.tiebreaker_score}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

interface PodiumCardProps {
  team: Team
  rank: number
  parseFn: (fullName: string) => { name: string; noUrut: string; session: number }
  isCompetitionEnded: boolean
}

function PodiumCard({ team, rank, parseFn, isCompetitionEnded }: PodiumCardProps) {
  const parsed = parseFn(team.name)

  let cardClass = "bg-white border border-outline-var"
  let rankLabel = `POSISI ${rank}`
  let headerBg = "bg-[#E8F0E9] border-b border-[#1A6B2F]/20 text-slate-700"
  let scoreClass = "text-slate-900 bg-slate-50 border-slate-200"

  if (isCompetitionEnded) {
    if (rank === 1) {
      cardClass = "bg-gradient-to-b from-amber-50 to-white ring-4 ring-amber-400 shadow-[0_20px_50px_rgba(245,158,11,0.15)] md:scale-105 z-10"
      rankLabel = "🏆 JUARA 1"
      headerBg = "bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950"
      scoreClass = "text-amber-700 bg-amber-50 border-amber-200"
    } else if (rank === 2) {
      cardClass = "bg-gradient-to-b from-slate-50 to-white border-2 border-slate-400 shadow-[0_15px_35px_rgba(148,163,184,0.12)]"
      rankLabel = "🥈 JUARA 2"
      headerBg = "bg-gradient-to-r from-slate-400 to-slate-300 text-slate-900"
      scoreClass = "text-slate-700 bg-slate-50 border-slate-200"
    } else if (rank === 3) {
      cardClass = "bg-gradient-to-b from-orange-50 to-white border-2 border-amber-600 shadow-[0_15px_30px_rgba(234,88,12,0.1)]"
      rankLabel = "🥉 JUARA 3"
      headerBg = "bg-gradient-to-r from-amber-700 to-orange-600 text-white"
      scoreClass = "text-orange-700 bg-orange-50 border-orange-200"
    }
  }

  return (
    <div className={`${cardClass} rounded-3xl overflow-hidden shadow-lg flex-1 flex flex-col transition-all duration-500 hover:-translate-y-2 relative group`}>
      
      {/* Decorative rank ribbon header */}
      <div className={`${headerBg} px-6 py-4 flex justify-between items-center font-space text-xs font-black tracking-widest uppercase`}>
        <span>{rankLabel}</span>
        {rank === 1 ? (
          <span className="text-amber-950 font-bold">🥇</span>
        ) : rank === 2 ? (
          <span className="text-slate-950 font-bold">🥈</span>
        ) : (
          <span className="text-white font-bold">🥉</span>
        )}
      </div>

      <div className="p-8 flex-1 flex flex-col items-center justify-between text-center space-y-6 relative">
        {/* Trophy Avatar Panel */}
        <TrophyIcon rank={rank} isEnded={isCompetitionEnded} />

        {/* Team / School details */}
        <div className="space-y-2 w-full">
          <span className="text-[10px] font-space font-black tracking-widest text-slate-400 uppercase">
            SEKOLAH / PESERTA
          </span>
          <h3 className="font-bebas text-4xl tracking-wide text-primary-main drop-shadow-sm min-h-[48px] flex items-center justify-center leading-none mt-1 group-hover:scale-105 transition-transform duration-300">
            {parsed.name}
          </h3>
          <div className="inline-block bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
            <span className="text-[10px] text-slate-600 font-space font-black tracking-wider uppercase">
              NO. URUT: {parsed.noUrut}
            </span>
          </div>
        </div>

        {/* Score Panel */}
        <div className="pt-6 w-full border-t border-slate-100 flex flex-col items-center">
          <span className="text-[10px] font-space font-black tracking-widest text-slate-400 uppercase block mb-1">
            SKOR AKHIR
          </span>
          <div className={`px-8 py-3 rounded-2xl border ${scoreClass} font-space font-mono text-5xl font-black shadow-sm tracking-tight transition-transform duration-300 group-hover:scale-110`}>
            {team.score}
          </div>
          {team.tiebreaker_score > 0 && (
            <div className="mt-2 font-space text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-3 py-1 rounded-full shadow-sm">
              TB Score: {team.tiebreaker_score}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
