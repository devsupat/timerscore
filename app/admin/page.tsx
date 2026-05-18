'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
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

type ConfirmDialogState = {
  isOpen: boolean
  title: string
  message: string
  confirmText: string
  isDestructive: boolean
  onConfirm: () => void
}

// Name format: "School Name [No: 001] [S:2]"
// Legacy names without [S:N] are treated as session 1
function parseTeamInfo(fullName: string) {
  const sessionMatch = fullName.match(/\[S:(\d+)\]/)
  const session = sessionMatch ? parseInt(sessionMatch[1]) : 1
  const nameWithoutSession = fullName.replace(/\s*\[S:\d+\]/, '').trim()
  const noMatch = nameWithoutSession.match(/(.*)\s+\[No:\s*([^\]]+)\]/)
  if (noMatch) return { name: noMatch[1].trim(), noUrut: noMatch[2], session }
  return { name: nameWithoutSession, noUrut: '-', session }
}

const TOTAL_SESSIONS = 4

export default function AdminPage() {
  const dbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const dbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '****************' : ''
  const isConnected = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPin = localStorage.getItem('admin_pin')
      setTimeout(() => {
        if (storedPin === '2026') {
          setIsAuthenticated(true)
        }
        setCheckingAuth(false)
      }, 0)
    }
  }, [])

  const handlePinSubmit = (pin: string) => {
    if (pin === '2026') {
      localStorage.setItem('admin_pin', '2026')
      setIsAuthenticated(true)
      setPinError(false)
      window.location.reload() // Reload to ensure Supabase client gets the new pin from localStorage
    } else {
      setPinError(true)
      setPinInput('')
      // clear error after 1.5s
      setTimeout(() => setPinError(false), 1500)
    }
  }

  const [teams, setTeams] = useState<Team[]>([])
  const [timerCfg, setTimerCfg] = useState<TimerConfig | null>(null)
  const [currentSession, setCurrentSession] = useState(1)

  const [newName, setNewName] = useState('')
  const [newNoUrut, setNewNoUrut] = useState('')
  const [newSessionOverride, setNewSessionOverride] = useState<number | null>(null)

  // Sesi tertinggi yang ada di data (minimal TOTAL_SESSIONS)
  const maxSession = useMemo(() => {
    if (teams.length === 0) return TOTAL_SESSIONS
    return Math.max(TOTAL_SESSIONS, ...teams.map(t => parseTeamInfo(t.name).session))
  }, [teams])

  // Sesi default untuk form tambah peserta — sesi pertama yang belum penuh
  const newSession = useMemo(() => {
    if (newSessionOverride !== null) return newSessionOverride
    for (let s = 1; s <= maxSession; s++) {
      const count = teams.filter(t => parseTeamInfo(t.name).session === s).length
      if (count < 3) return s
    }
    return maxSession
  }, [teams, newSessionOverride, maxSession])
  const [scoreStep, setScoreStep] = useState(100)
  const [eventTitle, setEventTitle] = useState('SELEKSI LIGA BINTANG JUARA')
  const [eventSubtitle, setEventSubtitle] = useState('Tingkat Gugus Kecamatan Tangerang • Selasa, 12 Mei 2025')

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)

  const [minutes, setMinutes] = useState(5)
  const [seconds, setSeconds] = useState(0)
  const [timeLeft, setTimeLeft] = useState(300)
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const timerInterval = useRef<NodeJS.Timeout | null>(null)
  const isLive = isTimerRunning && timeLeft > 0
  const isEnded = timeLeft === 0

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

  const applyTimerConfig = useCallback((cfg: TimerConfig) => {
    setTimerCfg(cfg)
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
      setMinutes(Math.floor(cfg.duration_seconds / 60))
      setSeconds(cfg.duration_seconds % 60)
    }
  }, [])

  const loadTimer = useCallback(async () => {
    const { data, error } = await supabase.from('timer_config').select('*').limit(1)
    if (error) throw error
    return data?.[0] ? (data[0] as TimerConfig) : null
  }, [])

  const fetchTimer = useCallback(() => {
    void loadTimer()
      .then(cfg => { if (cfg) applyTimerConfig(cfg) })
      .catch(err => console.error('Error fetching timer:', err))
  }, [applyTimerConfig, loadTimer])

  const buildLabel = useCallback(
    (title: string, subtitle: string, session: number) => `${title}|${subtitle}|${session}`,
    []
  )

  const saveTimerToSupabase = useCallback(async (
    started_at: string | null,
    is_running: boolean,
    duration: number,
    label?: string
  ) => {
    if (!timerCfg) return
    const finalLabel = label ?? buildLabel(eventTitle, eventSubtitle, currentSession)
    const { error } = await supabase
      .from('timer_config')
      .update({ started_at, is_running, duration_seconds: duration, label: finalLabel })
      .eq('id', timerCfg.id)
    if (error) console.error('Error saving timer:', error)
  }, [timerCfg, buildLabel, eventTitle, eventSubtitle, currentSession])

  const handleStartTimer = async () => {
    const totalSecs = minutes * 60 + seconds
    const target = timeLeft > 0 && timeLeft <= totalSecs ? timeLeft : totalSecs
    const startedAt = new Date(Date.now() - (totalSecs - target) * 1000).toISOString()
    setIsTimerRunning(true)
    await saveTimerToSupabase(startedAt, true, totalSecs)
  }

  const handlePauseTimer = async () => {
    setIsTimerRunning(false)
    await saveTimerToSupabase(null, false, timeLeft)
  }

  const handleResetTimer = async () => {
    const totalSecs = minutes * 60 + seconds
    setTimeLeft(totalSecs)
    setIsTimerRunning(false)
    await saveTimerToSupabase(null, false, totalSecs)
  }

  const handleSwitchSession = (target: number) => {
    setConfirmDialog({
      isOpen: true,
      title: `Pindah ke Sesi ${target}`,
      message: `Ini akan beralih ke Sesi ${target} dan mereset timer. Skor peserta sesi sebelumnya tetap tersimpan. Lanjutkan?`,
      confirmText: `Ya, Mulai Sesi ${target}`,
      isDestructive: false,
      onConfirm: async () => {
        const totalSecs = minutes * 60 + seconds
        setCurrentSession(target)
        setTimeLeft(totalSecs)
        setIsTimerRunning(false)
        if (timerCfg) {
          const label = buildLabel(eventTitle, eventSubtitle, target)
          await supabase
            .from('timer_config')
            .update({ started_at: null, is_running: false, duration_seconds: totalSecs, label })
            .eq('id', timerCfg.id)
        }
      }
    })
  }

  const handleAddNewSession = () => {
    const next = maxSession + 1
    const babakLabel = next <= TOTAL_SESSIONS ? `Babak ${next}` : `Babak Lanjutan ${next - TOTAL_SESSIONS}`
    setConfirmDialog({
      isOpen: true,
      title: `Tambah ${babakLabel}`,
      message: `Ini akan menambahkan ${babakLabel} untuk peserta yang akan diseleksi lebih lanjut. Timer akan direset. Tambahkan peserta secara manual melalui form "Kelola Peserta". Lanjutkan?`,
      confirmText: `Ya, Tambah ${babakLabel}`,
      isDestructive: false,
      onConfirm: async () => {
        const totalSecs = minutes * 60 + seconds
        setCurrentSession(next)
        setTimeLeft(totalSecs)
        setIsTimerRunning(false)
        if (timerCfg) {
          const label = buildLabel(eventTitle, eventSubtitle, next)
          await supabase
            .from('timer_config')
            .update({ started_at: null, is_running: false, duration_seconds: totalSecs, label })
            .eq('id', timerCfg.id)
        }
        setNewSessionOverride(next)
      }
    })
  }

  const updateEventDetails = async (title: string, subtitle: string) => {
    if (timerCfg) {
      await saveTimerToSupabase(
        timerCfg.started_at,
        timerCfg.is_running,
        timerCfg.duration_seconds,
        buildLabel(title, subtitle, currentSession)
      )
    }
  }

  const handleAddTeam = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!newName.trim()) return
    const noUrutPart = newNoUrut.trim() ? ` [No: ${newNoUrut.trim()}]` : ''
    const formattedName = `${newName.trim()}${noUrutPart} [S:${newSession}]`
    try {
      const { error } = await supabase.from('teams').insert({ name: formattedName, score: 0 })
      if (error) throw error
      setNewName('')
      setNewNoUrut('')
      setNewSessionOverride(null)
      fetchTeams()
    } catch (err) {
      console.error('Error adding team:', err)
    }
  }

  const handleUpdateScore = async (id: number, delta: number) => {
    try {
      const { error } = await supabase.rpc('increment_score', { team_id: id, delta })
      if (error) throw error
      fetchTeams()
    } catch (err) {
      console.error('Error updating score:', err)
    }
  }

  const handleUpdateTBScore = async (id: number, delta: number) => {
    try {
      const { error } = await supabase.rpc('increment_tiebreaker_score', { team_id: id, delta })
      if (error) throw error
      fetchTeams()
    } catch (err) {
      console.error('Error updating tiebreaker score:', err)
    }
  }

  const handleDeleteTeam = (id: number, teamName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Hapus Peserta',
      message: `Apakah Anda yakin ingin menghapus "${teamName}"? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('teams').delete().eq('id', id)
        if (error) console.error('Error deleting team:', error)
        else fetchTeams()
      }
    })
  }

  const handleResetAllScores = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Reset Semua Skor',
      message: 'Semua skor peserta (semua sesi) akan kembali ke 0. Tindakan ini langsung terlihat di layar display.',
      confirmText: 'Ya, Reset Skor',
      isDestructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from('teams').update({ score: 0, tiebreaker_score: 0 }).neq('id', 0)
        if (error) console.error('Error resetting scores:', error)
        else fetchTeams()
      }
    })
  }

  const handleReinitDefaultTeams = () => {
    setConfirmDialog({
      isOpen: true,
      title: 'Re-init Default Teams',
      message: `Ini akan menghapus SEMUA tim dan membuat ${TOTAL_SESSIONS * 3} SDN default (3 sekolah × ${TOTAL_SESSIONS} sesi). Lanjutkan?`,
      confirmText: 'Ya, Re-init',
      isDestructive: true,
      onConfirm: async () => {
        await supabase.from('teams').delete().neq('id', 0)
        const defaults = []
        for (let s = 1; s <= TOTAL_SESSIONS; s++) {
          for (let t = 1; t <= 3; t++) {
            const num = (s - 1) * 3 + t
            defaults.push({
              name: `SDN CONTOH ${num} [No: ${String(num).padStart(3, '0')}] [S:${s}]`,
              score: 0,
              tiebreaker_score: 0
            })
          }
        }
        await supabase.from('teams').insert(defaults)
        fetchTeams()
      }
    })
  }

  useEffect(() => {
    if (!isAuthenticated) return
    const initialLoad = setTimeout(() => {
      fetchTeams()
      fetchTimer()
    }, 0)

    const teamChannel = supabase.channel('admin-teams-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchTeams)
      .subscribe()
    const timerChannel = supabase.channel('admin-timer-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timer_config' }, fetchTimer)
      .subscribe()
    return () => {
      clearTimeout(initialLoad)
      supabase.removeChannel(teamChannel)
      supabase.removeChannel(timerChannel)
    }
  }, [fetchTeams, fetchTimer, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    const handleVisibility = () => { if (document.visibilityState === 'visible') fetchTimer() }
    window.addEventListener('visibilitychange', handleVisibility)
    return () => window.removeEventListener('visibilitychange', handleVisibility)
  }, [fetchTimer, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    if (!isLive) {
      if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null }
      return
    }
    timerInterval.current = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0))
    }, 1000)
    return () => {
      if (timerInterval.current) { clearInterval(timerInterval.current); timerInterval.current = null }
    }
  }, [isLive, isAuthenticated])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const sessionTeams = teams.filter(t => parseTeamInfo(t.name).session === currentSession)
  // Kartu scoring diurutkan by id agar posisi tidak bergeser saat skor berubah
  const scoringCards = [...sessionTeams].sort((a, b) => a.id - b.id)

  if (checkingAuth) {
    return (
      <div className="bg-[#0D2B16] min-h-screen flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#F5C518] border-r-2"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="bg-[#0D2B16] min-h-screen flex flex-col items-center justify-center p-4 antialiased font-space selection:bg-[#F5C518] selection:text-[#3B2000]">
        <div className="w-full max-w-md bg-[#145224]/50 backdrop-blur-md border border-[#0F3D1E] rounded-3xl p-8 shadow-2xl text-center space-y-8">
          <div className="flex flex-col items-center gap-3">
            <Image src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" width={64} height={64} unoptimized className="h-16 w-auto object-contain filter drop-shadow-[0_4px_8px_rgba(245,197,24,0.2)]" />
            <div className="space-y-1">
              <h1 className="font-bebas text-3xl font-black text-[#F5C518] tracking-wider">LIGA BINTANG JUARA</h1>
              <p className="text-[10px] text-white font-bold tracking-widest uppercase">KOTA TANGERANG • PANEL ADMIN</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[#0F3D1E] to-transparent"></div>

          <div className="space-y-4">
            <span className="text-xs font-black uppercase text-white tracking-widest block">MASUKKAN PIN KEAMANAN</span>
            
            {/* PIN Dots display */}
            <div className="flex justify-center gap-4 py-2">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`w-4 h-4 rounded-full transition-all duration-200 ${
                    pinError
                      ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] scale-110'
                      : index < pinInput.length
                      ? 'bg-[#F5C518] shadow-[0_0_12px_rgba(245,197,24,0.6)] scale-125'
                      : 'bg-[#0F3D1E]'
                  }`}
                />
              ))}
            </div>
            
            {pinError && (
              <span className="text-xs font-black text-red-400 tracking-wider animate-bounce block">
                PIN SALAH! SILAKAN COBA LAGI
              </span>
            )}
          </div>

          {/* Large, finger-friendly keypad */}
          <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => {
                  if (pinInput.length < 4) {
                    const next = pinInput + num
                    setPinInput(next)
                    if (next.length === 4) {
                      setTimeout(() => handlePinSubmit(next), 150)
                    }
                  }
                }}
                className="w-16 h-16 rounded-full bg-[#145224]/80 hover:bg-[#1A6B2F]/80 active:bg-[#F5C518] active:text-[#3B2000] border border-[#0F3D1E]/50 text-xl font-black text-white hover:scale-105 hover:border-[#1A6B2F] transition-all flex items-center justify-center shadow-lg"
              >
                {num}
              </button>
            ))}
            
            {/* Clear Button */}
            <button
              onClick={() => setPinInput('')}
              className="w-16 h-16 rounded-full bg-[#0D2B16] hover:bg-[#145224] active:bg-red-500/20 active:text-red-400 border border-[#0F3D1E] hover:border-[#1A6B2F] text-xs font-black text-white transition-all flex items-center justify-center shadow-lg"
            >
              HAPUS
            </button>
            
            {/* 0 Button */}
            <button
              onClick={() => {
                if (pinInput.length < 4) {
                  const next = pinInput + '0'
                  setPinInput(next)
                  if (next.length === 4) {
                    setTimeout(() => handlePinSubmit(next), 150)
                  }
                }
              }}
              className="w-16 h-16 rounded-full bg-[#145224]/80 hover:bg-[#1A6B2F]/80 active:bg-[#F5C518] active:text-[#3B2000] border border-[#0F3D1E]/50 text-xl font-black text-white hover:scale-105 hover:border-[#1A6B2F] transition-all flex items-center justify-center shadow-lg"
              >
              0
            </button>

            {/* Keluar/Kembali Button */}
            <a
              href="/livescore"
              className="w-16 h-16 rounded-full bg-[#0D2B16] hover:bg-[#145224] border border-[#0F3D1E] hover:border-[#1A6B2F] text-[10px] font-black text-white transition-all flex items-center justify-center shadow-lg uppercase"
            >
              Batal
            </a>
          </div>

          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Sistem Keamanan Terenkripsi Supabase
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-bg text-on-surface min-h-screen font-hanken antialiased pb-24">
      {/* Modal Dialog */}
      {confirmDialog?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmDialog(null)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-outline-var relative z-10">
            <div className={`p-6 border-b ${confirmDialog.isDestructive ? 'bg-red-50 border-red-100' : 'bg-surface-container-low border-outline-var'}`}>
              <div className="flex items-center gap-3">
                {confirmDialog.isDestructive ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-red-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-primary-main flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                  </svg>
                )}
                <h3 className={`font-bebas text-2xl tracking-wide pt-1 ${confirmDialog.isDestructive ? 'text-red-700' : 'text-primary-main'}`}>
                  {confirmDialog.title}
                </h3>
              </div>
            </div>
            <div className="p-6">
              <p className="text-on-surface-variant font-space text-sm mb-8 font-medium leading-relaxed">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3 font-space text-sm font-bold">
                <button onClick={() => setConfirmDialog(null)} className="px-5 py-2.5 rounded-lg border border-outline-var text-on-surface hover:bg-surface-container-low transition-colors">Batal</button>
                <button
                  onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
                  className={`px-5 py-2.5 rounded-lg text-white transition-colors shadow-sm ${confirmDialog.isDestructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-main hover:bg-primary-main/90'}`}
                >
                  {confirmDialog.confirmText}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#145224]/95 backdrop-blur-md text-white border-b border-[#0F3D1E] px-4 py-3 md:px-8 md:py-0 md:h-20 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0 shadow-lg w-full">
        <div className="flex items-center gap-2.5 md:gap-4 bg-gradient-to-r from-[#0F3D1E] to-[#145224] px-3 md:px-4 py-1.5 rounded-xl border border-[#1A6B2F]/20 w-full md:w-auto justify-center md:justify-start">
          <Image src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" width={48} height={48} unoptimized className="h-8 md:h-12 w-auto object-contain flex-shrink-0 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
          <div className="h-6 md:h-8 w-px bg-[#1A6B2F]/30 flex-shrink-0"></div>
          <div className="min-w-0 flex flex-col justify-center items-start">
            <span className="font-bebas text-lg md:text-2xl font-black text-[#F5C518] tracking-wider uppercase block leading-none pt-0.5 whitespace-nowrap">LIGA BINTANG JUARA</span>
            <span className="text-[9px] md:text-[10px] text-white font-space font-black tracking-widest uppercase block mt-1 whitespace-nowrap">KOTA TANGERANG • PANEL ADMIN</span>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center md:justify-end items-center gap-4 md:gap-6 w-full md:w-auto">
          <nav className="flex flex-wrap justify-center items-center gap-3 md:gap-6 h-full font-space text-[10px] md:text-xs font-bold uppercase tracking-wider">
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/display">Layar Utama</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/livescore">Skor Langsung</a>
            <a className="text-[#F5C518] border-b-2 border-[#F5C518] py-1 md:py-2.5" href="/admin">Panel Admin</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/admin/ai">Analisis Cerdas</a>
          </nav>
          <div className="flex items-center gap-2 md:gap-4">
            <div>
            {isConnected ? (
                <span className="flex items-center gap-2 bg-[#1A6B2F]/20 border border-[#1A6B2F]/40 text-[#F5C518] px-3 md:px-4 py-1.5 rounded-full text-[10px] md:text-xs font-black font-space shadow-sm">
                  <span className="w-1.5 md:w-2 h-1.5 md:h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  TERHUBUNG
                </span>
              ) : (
                <span className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 px-3 md:px-4 py-1.5 rounded-full text-[10px] md:text-xs font-black font-space shadow-sm">
                  <span className="w-1.5 md:w-2 h-1.5 md:h-2 rounded-full bg-red-500 animate-pulse"></span>
                  TERPUTUS
                </span>
              )}
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('admin_pin');
                window.location.reload();
              }}
              title="Kunci / Keluar Konsol"
              className="flex items-center justify-center p-2 rounded-lg bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-8 pt-8 space-y-8">
        {/* Event Config */}
        <section className="bg-white border border-outline-var p-6 rounded-xl shadow-sm space-y-4">
          <h2 className="font-bebas text-2xl text-primary-main tracking-wide">Konfigurasi Judul Acara</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase font-space">Judul Utama</label>
              <input
                className="bg-surface-container-low border border-outline-var text-on-surface px-4 py-3 rounded-lg focus:border-primary-main outline-none font-medium"
                type="text"
                value={eventTitle}
                onChange={e => { setEventTitle(e.target.value); updateEventDetails(e.target.value, eventSubtitle) }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase font-space">Sub-Judul / Keterangan Lomba</label>
              <input
                className="bg-surface-container-low border border-outline-var text-on-surface px-4 py-3 rounded-lg focus:border-primary-main outline-none font-medium"
                type="text"
                value={eventSubtitle}
                onChange={e => { setEventSubtitle(e.target.value); updateEventDetails(eventTitle, e.target.value) }}
              />
            </div>
          </div>
        </section>

        {/* Timer + Session Control */}
        <section className="bg-primary-container border-none rounded-xl p-8 shadow-xl text-white space-y-6">
          {/* Session Switcher */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-12 w-full lg:w-auto">
              <div>
                <span className="font-space text-xs text-white/60 uppercase tracking-widest font-bold block mb-1">
                  {currentSession <= TOTAL_SESSIONS ? 'Babak Penyisihan' : 'Babak Lanjutan'}
                </span>
                <span className="font-bebas text-3xl text-secondary-container tracking-wide">
                  {currentSession <= TOTAL_SESSIONS
                    ? `SESI ${currentSession}`
                    : `LANJUTAN ${currentSession - TOTAL_SESSIONS}`}
                  <span className="text-white/50 text-xl font-normal tracking-wider ml-1.5">DARI {maxSession}</span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: maxSession }, (_, i) => i + 1).map(s => {
                  const count = teams.filter(t => parseTeamInfo(t.name).session === s).length
                  const isExtra = s > TOTAL_SESSIONS
                  return (
                    <button
                      key={s}
                      onClick={() => s !== currentSession && handleSwitchSession(s)}
                      title={`${isExtra ? `Babak Lanjutan ${s - TOTAL_SESSIONS}` : `Sesi ${s}`} — ${count} peserta`}
                      className={`w-14 h-14 rounded-xl font-space font-black text-sm transition-all flex flex-col items-center justify-center gap-0.5 ${
                        s === currentSession
                          ? 'bg-secondary-container text-on-secondary-container shadow-lg scale-105'
                          : isExtra
                          ? 'bg-amber-400/20 text-amber-200 hover:bg-amber-400/30 hover:text-white border border-amber-400/30'
                          : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                      }`}
                    >
                      <span className="text-base">{isExtra ? `+${s - TOTAL_SESSIONS}` : s}</span>
                      <span className="text-[10px] opacity-70">{count}/3</span>
                    </button>
                  )
                })}
                <button
                  onClick={handleAddNewSession}
                  title="Tambah babak lanjutan"
                  className="w-14 h-14 rounded-xl font-space font-black text-sm transition-all flex flex-col items-center justify-center bg-transparent text-white/40 hover:bg-white/5 hover:text-white border border-dashed border-white/20"
                >
                  <span className="text-base leading-none">+</span>
                  <span className="text-[8px] leading-tight font-medium opacity-70 mt-0.5 text-center">tambah<br/>sesi</span>
                </button>
              </div>
            </div>
            <p className="text-sm text-white/60 font-space font-semibold whitespace-nowrap">
              Klik tombol <span className="text-secondary-container font-black px-1">&ldquo;+&rdquo;</span> untuk tambah sesi lanjutan
            </p>
          </div>

          {/* Timer Controls */}
          <div className="flex flex-col lg:flex-row items-center justify-between gap-8 border-t border-white/10 pt-8">
            <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left">
              <span className="font-space text-xs text-white/70 uppercase tracking-widest mb-1 font-bold">Sisa Waktu</span>
              <span className="font-space text-[80px] font-bold text-secondary-container timer-glow leading-none font-mono">
                {formatTime(timeLeft)}
              </span>
            </div>
            <div className="flex flex-col gap-4 w-full lg:w-[480px]">
              <div className="flex gap-4">
                {!isTimerRunning ? (
                  <button onClick={handleStartTimer} className="flex-1 bg-secondary-container text-on-secondary-container font-black py-4 px-6 rounded-lg shadow-[0_4px_14px_0_rgba(245,197,24,0.25)] hover:bg-secondary-container/90 active:scale-95 transition-all font-space tracking-wider uppercase text-sm">
                    MULAI
                  </button>
                ) : (
                  <button onClick={handlePauseTimer} className="flex-1 bg-amber-500 text-white font-black py-4 px-6 rounded-lg shadow-[0_4px_14px_0_rgba(245,158,11,0.25)] hover:bg-amber-500/90 active:scale-95 transition-all font-space tracking-wider uppercase text-sm">
                    JEDA
                  </button>
                )}
                <button onClick={handleResetTimer} className="flex-1 border border-outline-main text-white font-bold py-4 px-6 rounded-lg hover:bg-white/5 transition-colors font-space tracking-wider uppercase text-sm">
                  ATUR ULANG
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="flex flex-col gap-1.5">
                  <label className="font-space text-[10px] text-white/70 font-bold uppercase tracking-wider">MENIT</label>
                  <input
                    className="bg-[#1A6B2F]/40 border border-[#1A6B2F]/60 text-white font-bold text-base p-2.5 rounded-lg text-center focus:border-secondary-container outline-none transition-colors shadow-inner"
                    type="number" min={0} value={minutes}
                    onChange={e => { const m = Math.max(0, parseInt(e.target.value) || 0); setMinutes(m); setTimeLeft(m * 60 + seconds) }}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-space text-[10px] text-white/70 font-bold uppercase tracking-wider">DETIK</label>
                  <input
                    className="bg-[#1A6B2F]/40 border border-[#1A6B2F]/60 text-white font-bold text-base p-2.5 rounded-lg text-center focus:border-secondary-container outline-none transition-colors shadow-inner"
                    type="number" min={0} max={59} value={seconds}
                    onChange={e => { const s = Math.min(59, Math.max(0, parseInt(e.target.value) || 0)); setSeconds(s); setTimeLeft(minutes * 60 + s) }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Scoring Cards — current session only */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bebas text-2xl text-primary-main tracking-wide">
              Skor Peserta — Sesi {currentSession}
            </h2>
            <span className="font-space text-xs font-semibold text-on-surface-variant bg-surface-container-low border border-outline-var px-3 py-1.5 rounded-full">
              {sessionTeams.length} / 3 peserta
            </span>
          </div>
          {sessionTeams.length === 0 ? (
            <div className="bg-white border-2 border-dashed border-outline-var rounded-xl p-12 text-center text-on-surface-variant font-space text-sm">
              Belum ada peserta untuk Sesi {currentSession}.<br />Tambahkan melalui panel &quot;Kelola Peserta&quot; di bawah.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {scoringCards.map((team) => {
                const parsed = parseTeamInfo(team.name)
                const rank = sessionTeams.findIndex(t => t.id === team.id)
                const medalEmoji = isEnded
                  ? rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : null
                  : null
                const glowClass = isEnded && rank < 3
                  ? rank === 0 ? 'gold-glow border-2' : rank === 1 ? 'silver-glow border-2' : 'bronze-glow border-2'
                  : 'border-outline-var'

                return (
                  <div
                    key={team.id}
                    className={`bg-white border ${glowClass} rounded-xl p-6 flex flex-col justify-between shadow-md overflow-hidden transition-all hover:translate-y-[-2px]`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {medalEmoji && <span className="text-xl">{medalEmoji}</span>}
                        <span className="text-xs text-on-surface-variant font-space font-semibold">No. Urut: {parsed.noUrut}</span>
                      </div>
                      <h3 className="font-bebas text-3xl tracking-wide text-primary-main font-bold">{parsed.name}</h3>
                    </div>
                    <div className="text-center my-4">
                      <span className="font-space text-6xl font-black text-primary-main">{team.score}</span>
                      {team.tiebreaker_score > 0 && (
                        <div className="mt-1 font-space text-sm font-bold text-red-600 bg-red-50 border border-red-200 py-1 rounded-full px-3 inline-block">
                          Babak Tambahan: {team.tiebreaker_score} poin
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleUpdateScore(team.id, -scoreStep)}
                          className="flex-1 bg-surface-container-low py-3 rounded-lg font-space text-sm font-bold hover:bg-surface-container transition-colors active:scale-95 border border-outline-var text-on-surface"
                        >
                          -{scoreStep}
                        </button>
                        <button
                          onClick={() => handleUpdateScore(team.id, scoreStep)}
                          className="flex-1 bg-secondary-container text-on-secondary-container py-3 rounded-lg font-space text-sm font-black hover:opacity-90 transition-opacity active:scale-95 border border-amber-400 shadow-sm"
                        >
                          +{scoreStep}
                        </button>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleUpdateTBScore(team.id, -scoreStep)}
                          className="flex-1 bg-red-50/50 py-2 rounded-lg font-space text-xs font-bold hover:bg-red-50 transition-colors active:scale-95 border border-red-100 text-red-700"
                        >
                          -Tambahan {scoreStep}
                        </button>
                        <button
                          onClick={() => handleUpdateTBScore(team.id, scoreStep)}
                          className="flex-1 bg-red-100 text-red-800 py-2 rounded-lg font-space text-xs font-black hover:bg-red-200 transition-colors active:scale-95 border border-red-200 shadow-sm"
                        >
                          +Tambahan {scoreStep}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Kelola Peserta */}
        <section className="bg-white border border-outline-var p-8 rounded-xl shadow-md space-y-6">
          <div className="flex items-center gap-3 border-b border-outline-var pb-4">
            <span className="material-symbols-outlined text-primary-main font-bold">group</span>
            <h2 className="font-bebas text-2xl text-primary-main tracking-wide">Kelola Peserta</h2>
            <span className="ml-auto font-space text-xs text-on-surface-variant font-semibold">{teams.length} total terdaftar</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add Team Form */}
            <div className="bg-surface-container-low p-6 rounded-lg border border-outline-var space-y-4">
              <h3 className="font-bebas text-xl text-primary-main font-bold">Tambah Peserta Baru</h3>
              <form onSubmit={handleAddTeam} className="space-y-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-on-surface-variant font-space">NAMA SEKOLAH / PESERTA</label>
                  <input
                    className="bg-white border border-outline-var text-on-surface p-2.5 rounded-lg focus:border-primary-main outline-none font-medium"
                    placeholder="Contoh: SDN SALOM"
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-on-surface-variant font-space">NO. URUT</label>
                  <input
                    className="bg-white border border-outline-var text-on-surface p-2.5 rounded-lg focus:border-primary-main outline-none font-medium"
                    placeholder="Contoh: 001"
                    type="text"
                    value={newNoUrut}
                    onChange={e => setNewNoUrut(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-bold text-on-surface-variant font-space">SESI</label>
                  <select
                    className="bg-white border border-outline-var text-on-surface p-2.5 rounded-lg focus:border-primary-main outline-none font-medium font-space"
                    value={newSession}
                    onChange={e => setNewSessionOverride(parseInt(e.target.value))}
                  >
                    {Array.from({ length: maxSession }, (_, i) => i + 1).map(s => {
                      const count = teams.filter(t => parseTeamInfo(t.name).session === s).length
                      const label = s > TOTAL_SESSIONS ? `Babak Lanjutan ${s - TOTAL_SESSIONS}` : `Sesi ${s}`
                      return (
                        <option key={s} value={s} disabled={count >= 3}>
                          {label} ({count}/3){count >= 3 ? ' — penuh' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full bg-primary-main text-white font-bold p-2.5 rounded-lg hover:opacity-90 transition-opacity font-space tracking-wider uppercase text-xs"
                >
                  Tambah Peserta
                </button>
              </form>
            </div>

            {/* All Participants grouped by session */}
            <div className="lg:col-span-2 bg-surface-container-low p-6 rounded-lg border border-outline-var space-y-4">
              <h3 className="font-bebas text-xl text-primary-main font-bold">Semua Peserta per Sesi</h3>
              {teams.length === 0 ? (
                <div className="text-center text-on-surface-variant py-8 font-space text-sm">
                  Belum ada peserta terdaftar. Tambahkan di form sebelah kiri atau gunakan Re-init.
                </div>
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-5 pr-1">
                  {Array.from({ length: maxSession }, (_, i) => i + 1).map(sesi => {
                    const sesiTeams = teams.filter(t => parseTeamInfo(t.name).session === sesi)
                    const isActive = sesi === currentSession
                    const sesiLabel = sesi > TOTAL_SESSIONS ? `Babak Lanjutan ${sesi - TOTAL_SESSIONS}` : `Sesi ${sesi}`
                    return (
                      <div key={sesi}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`font-space text-xs font-black px-2.5 py-1 rounded-full uppercase tracking-wide ${isActive ? 'bg-primary-container text-white' : sesi > TOTAL_SESSIONS ? 'bg-amber-100 text-amber-700 border border-amber-300' : 'bg-surface-container text-on-surface-variant border border-outline-var'}`}>
                            {sesiLabel}{isActive ? ' ● Aktif' : ''}
                          </span>
                          <span className="text-xs text-on-surface-variant font-space">{sesiTeams.length}/3 peserta</span>
                        </div>
                        {sesiTeams.length === 0 ? (
                          <p className="text-xs text-on-surface-variant font-space italic pl-2 pb-1">Belum ada peserta</p>
                        ) : (
                          <div className="space-y-1.5">
                            {sesiTeams.map(team => {
                              const parsed = parseTeamInfo(team.name)
                              return (
                                <div key={team.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-outline-var shadow-sm">
                                  <div>
                                    <span className="font-bold block text-primary-main text-sm">{parsed.name}</span>
                                    <span className="text-xs text-on-surface-variant font-space">No. Urut: {parsed.noUrut} • Skor: {team.score}</span>
                                  </div>
                                  <button
                                    onClick={() => handleDeleteTeam(team.id, parsed.name)}
                                    className="text-red-700 hover:text-red-800 font-space text-xs font-bold bg-red-50 hover:bg-red-100 border border-red-200 px-3 py-1.5 rounded-lg transition-colors ml-4"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center gap-4 pt-6 border-t border-outline-var justify-between">
            <div className="flex items-center gap-3 bg-surface-container-low border border-outline-var px-4 py-2 rounded-xl">
              <span className="font-space text-xs font-bold text-on-surface-variant uppercase mr-1">Langkah +/-</span>
              <div className="flex items-center border border-outline-var rounded-lg bg-white overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setScoreStep(prev => Math.max(1, prev - 10))}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold font-space border-r border-outline-var transition-colors active:bg-slate-200 select-none"
                >
                  -
                </button>
                <input
                  className="w-14 bg-transparent text-on-surface font-bold text-center py-1.5 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-mono"
                  type="number" min={1} value={scoreStep}
                  onChange={e => setScoreStep(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <button
                  type="button"
                  onClick={() => setScoreStep(prev => prev + 10)}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold font-space border-l border-outline-var transition-colors active:bg-slate-200 select-none"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleReinitDefaultTeams} className="border border-outline-main text-primary-main hover:bg-surface-container-low font-bold px-6 py-2.5 rounded-lg transition-colors font-space text-xs uppercase">
                Setel Ulang Data Awal
              </button>
              <button onClick={handleResetAllScores} className="border border-red-500 text-red-700 font-bold px-6 py-2.5 rounded-lg hover:bg-red-50 transition-colors font-space text-xs uppercase">
                Reset Semua Skor
              </button>
            </div>
          </div>
        </section>

        {/* DB Connection Info */}
        <section className="p-6 bg-white rounded-xl border border-outline-var shadow-sm">
          <h3 className="font-bebas text-xl text-primary-main font-bold mb-3">Informasi Koneksi Database</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-space">
            <div>
              <span className="block text-on-surface-variant uppercase font-bold mb-1">Referensi Proyek</span>
              <span className="block font-mono bg-surface-container-low p-2.5 rounded border border-outline-var text-on-surface select-all">vdnfbdxxcgrgqsrrjwmw</span>
            </div>
            <div>
              <span className="block text-on-surface-variant uppercase font-bold mb-1">Alamat Server API</span>
              <span className="block font-mono bg-surface-container-low p-2.5 rounded border border-outline-var text-on-surface text-ellipsis overflow-hidden">{dbUrl || 'Belum dimuat'}</span>
            </div>
            <div>
              <span className="block text-on-surface-variant uppercase font-bold mb-1">Kunci Akses API</span>
              <span className="block font-mono bg-surface-container-low p-2.5 rounded border border-outline-var text-on-surface">{dbKey || 'Belum dimuat'}</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
