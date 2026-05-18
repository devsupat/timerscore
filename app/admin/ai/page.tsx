'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';

interface Team {
  id: number;
  name: string;
  score: number;
}

interface TimerConfig {
  id: number;
  duration_seconds: number;
  is_running: boolean;
  started_at: string | null;
  label: string | null;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function parseTeamInfo(fullName: string) {
  const match = fullName.match(/\[S:(\d+)\]/);
  const session = match ? parseInt(match[1]) : 1;
  const nameWithoutSession = fullName.replace(/\s*\[S:\d+\]/, '').trim();
  const noMatch = nameWithoutSession.match(/(.*)\s+\[No:\s*([^\]]+)\]/);
  if (noMatch) return { name: noMatch[1].trim(), noUrut: noMatch[2], session };
  return { name: nameWithoutSession, noUrut: '-', session };
}

export default function AIAnalysisPage() {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Data states
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentSession, setCurrentSession] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);

  // UI/API states
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Handle local PIN checking without cascading render warnings
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedPin = localStorage.getItem('admin_pin');
      setTimeout(() => {
        if (storedPin === '2026') {
          setIsAuthenticated(true);
        }
        setCheckingAuth(false);
      }, 0);
    }
  }, []);

  const handlePinSubmit = (pin: string) => {
    if (pin === '2026') {
      localStorage.setItem('admin_pin', '2026');
      setIsAuthenticated(true);
      setPinError(false);
      window.location.reload();
    } else {
      setPinError(true);
      setPinInput('');
      setTimeout(() => setPinError(false), 1500);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_pin');
    setIsAuthenticated(false);
    window.location.reload();
  };

  // Data fetch logic protected by authentication check
  const fetchTeams = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('score', { ascending: false })
        .order('id', { ascending: true });
      if (error) throw error;
      setTeams(data ?? []);
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  }, []);

  const fetchTimer = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('timer_config').select('*').limit(1);
      if (error) throw error;
      if (data?.[0]) {
        const cfg = data[0] as TimerConfig;
        setIsRunning(cfg.is_running);

        if (cfg.label) {
          const parts = cfg.label.split('|');
          if (parts[2]) setCurrentSession(parseInt(parts[2]) || 1);
        }

        if (cfg.is_running && cfg.started_at) {
          const elapsed = Math.floor((Date.now() - new Date(cfg.started_at).getTime()) / 1000);
          setTimeLeft(Math.max(0, cfg.duration_seconds - elapsed));
        } else {
          setTimeLeft(cfg.duration_seconds);
        }
      }
    } catch (err) {
      console.error('Error fetching timer:', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const initialLoad = setTimeout(() => {
      void fetchTeams();
      void fetchTimer();
    }, 0);

    return () => clearTimeout(initialLoad);
  }, [fetchTeams, fetchTimer, isAuthenticated]);

  // AI analysis trigger handler
  const handleAnalyze = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teams,
          currentSession,
          isRunning,
          timeLeft,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Gagal memproses analisis kompetisi.');
      }

      setAnalysis(data.analysis);
      setLastUpdated(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' WIB');
    } catch (err: unknown) {
      setErrorMsg(getErrorMessage(err, 'Koneksi ke sistem analisis terputus. Periksa koneksi internet dan coba lagi.'));
    } finally {
      setLoading(false);
    }
  };

  const sessionMap = useMemo(() => {
    const map: Record<number, Team[]> = {};
    teams.forEach((t) => {
      const s = parseTeamInfo(t.name).session;
      if (!map[s]) map[s] = [];
      map[s].push(t);
    });
    return map;
  }, [teams]);

  const sessionNumbers = useMemo(() =>
    Object.keys(sessionMap).map(Number).sort((a, b) => a - b),
  [sessionMap]);

  const top7 = useMemo(() => {
    return [...teams]
      .sort((a, b) => b.score !== a.score ? b.score - a.score : a.id - b.id)
      .slice(0, 7);
  }, [teams]);

  // Strip semua markdown sebelum ditampilkan
  const stripMd = (text: string) =>
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/`(.+?)`/g, '$1')
      .trim();

  // Analysis structured parser
  const parsedBlocks = useMemo(() => {
    if (!analysis) return [];
    const lines = analysis.split('\n').map((l) => stripMd(l.trim())).filter(Boolean);
    const blocks: { type: 'intro' | 'point' | 'recommendation'; text: string; num?: string }[] = [];

    lines.forEach((line) => {
      const numMatch = line.match(/^(\d+)[\.\)]\s*(.*)/);
      const isRec = line.toLowerCase().startsWith('rekomendasi');

      if (isRec) {
        blocks.push({ type: 'recommendation', text: line.replace(/^rekomendasi[\s\w]*:/i, '').trim() });
      } else if (numMatch) {
        blocks.push({ type: 'point', num: numMatch[1], text: numMatch[2] });
      } else {
        blocks.push({ type: 'intro', text: line });
      }
    });

    return blocks;
  }, [analysis]);

  if (checkingAuth) {
    return (
      <div className="bg-[#0D2B16] min-h-screen flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#F5C518] border-r-2"></div>
      </div>
    );
  }

  // Keypad Lock Screen
  if (!isAuthenticated) {
    return (
      <div className="bg-[#0D2B16] min-h-screen flex flex-col items-center justify-center p-4 antialiased font-space selection:bg-[#F5C518] selection:text-[#3B2000]">
        <div className="w-full max-w-md bg-[#145224]/50 backdrop-blur-md border border-[#0F3D1E] rounded-3xl p-8 shadow-2xl text-center space-y-8">
          <div className="flex flex-col items-center gap-3">
            <Image src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" width={64} height={64} unoptimized className="h-16 w-auto object-contain filter drop-shadow-[0_4px_8px_rgba(245,197,24,0.2)]" />
            <div className="space-y-1">
              <h1 className="font-bebas text-3xl font-black text-[#F5C518] tracking-wider">LIGA BINTANG JUARA</h1>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">KOTA TANGERANG • KONSOL ANALISIS</p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-[#0F3D1E] to-transparent"></div>

          <div className="space-y-4">
            <span className="text-xs font-black uppercase text-slate-400 tracking-widest block">MASUKKAN KODE AKSES</span>
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

          <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => {
                  if (pinInput.length < 4) {
                    const next = pinInput + num;
                    setPinInput(next);
                    if (next.length === 4) {
                      setTimeout(() => handlePinSubmit(next), 150);
                    }
                  }
                }}
                className="w-16 h-16 rounded-full bg-[#145224]/80 hover:bg-[#1A6B2F]/80 border border-[#0F3D1E]/50 text-xl font-bold text-white hover:scale-105 active:bg-[#F5C518] active:text-[#3B2000] transition-all flex items-center justify-center shadow-md"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => setPinInput(pinInput.slice(0, -1))}
              className="w-16 h-16 rounded-full bg-[#0D2B16] hover:bg-[#145224] border border-[#0F3D1E] text-xs font-black text-slate-400 hover:scale-105 hover:text-white transition-all flex items-center justify-center shadow-md uppercase"
            >
              Hapus
            </button>
            <button
              onClick={() => {
                if (pinInput.length < 4) {
                  const next = pinInput + '0';
                  setPinInput(next);
                  if (next.length === 4) {
                    setTimeout(() => handlePinSubmit(next), 150);
                  }
                }
              }}
              className="w-16 h-16 rounded-full bg-[#145224]/80 hover:bg-[#1A6B2F]/80 border border-[#0F3D1E]/50 text-xl font-bold text-white hover:scale-105 active:bg-[#F5C518] active:text-[#3B2000] transition-all flex items-center justify-center shadow-md"
            >
              0
            </button>
            <a
              href="/livescore"
              className="w-16 h-16 rounded-full bg-[#0D2B16] hover:bg-[#145224] border border-[#0F3D1E] text-[10px] font-black text-slate-400 hover:scale-105 transition-all flex items-center justify-center shadow-md uppercase"
            >
              Batal
            </a>
          </div>

          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
            Sistem Keamanan Terenkripsi
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-[#F0F4F0] via-white to-[#E8F0E9] text-on-surface min-h-screen font-hanken antialiased pb-24">
      {/* Premium Navy Header */}
      <header className="sticky top-0 z-30 bg-[#145224]/95 backdrop-blur-md text-white border-b border-[#0F3D1E] px-4 py-3 md:px-8 md:py-0 md:h-20 flex flex-col md:flex-row justify-between items-center gap-4 md:gap-0 shadow-lg w-full">
        <div className="flex items-center gap-2.5 md:gap-4 bg-gradient-to-r from-[#0F3D1E] to-[#145224] px-3 md:px-4 py-1.5 rounded-xl border border-[#1A6B2F]/20 w-full md:w-auto justify-center md:justify-start">
          <Image src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" width={48} height={48} unoptimized className="h-8 md:h-12 w-auto object-contain flex-shrink-0 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
          <div className="h-6 md:h-8 w-px bg-[#1A6B2F]/30 flex-shrink-0"></div>
          <div className="min-w-0 flex flex-col justify-center items-start">
            <span className="font-bebas text-lg md:text-2xl font-black text-[#F5C518] tracking-wider uppercase block leading-none pt-0.5 whitespace-nowrap">LIGA BINTANG JUARA</span>
            <span className="text-[9px] md:text-[10px] text-slate-400 font-space font-black tracking-widest uppercase block mt-1 whitespace-nowrap">KOTA TANGERANG • KONSOL ANALISIS</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center md:justify-end items-center gap-4 md:gap-6 w-full md:w-auto">
          <nav className="flex flex-wrap justify-center items-center gap-3 md:gap-6 h-full font-space text-[10px] md:text-xs font-bold uppercase tracking-wider">
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/display">Layar Utama</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/livescore">Skor Langsung</a>
            <a className="text-slate-300 hover:text-[#F5C518] transition-colors py-1 md:py-2.5" href="/admin">Panel Admin</a>
            <a className="text-[#F5C518] border-b-2 border-[#F5C518] py-1 md:py-2.5" href="/admin/ai">Analisis Cerdas</a>
          </nav>
          
          <div className="hidden md:block h-8 w-px bg-[#1A6B2F]/30"></div>

          {/* Live sync connection badge */}
          <div className="flex items-center gap-2 bg-[#1A6B2F]/20 border border-[#1A6B2F]/40 text-[#F5C518] px-3.5 py-1.5 rounded-full shadow-sm">
            <div className="w-1.5 md:w-2 h-1.5 md:h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            <span className="text-[9px] md:text-[10px] text-[#F5C518] font-space font-black tracking-widest uppercase">TERHUBUNG</span>
          </div>

          {/* Secure Logout / Lock Console */}
          <button
            onClick={handleLogout}
            title="Kunci Konsol Admin"
            className="p-1.5 md:p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 active:scale-95 transition-all flex items-center justify-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3A5.25 5.25 0 0012 1.5zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-6 mt-12 space-y-8">
        
        {/* SNAPSHOT CARD */}
        <section className="bg-white border border-outline-var p-8 rounded-2xl shadow-md space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-var pb-4">
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-main" viewBox="0 0 24 24" fill="currentColor"><path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" /></svg>
              <h2 className="font-bebas text-2xl text-primary-main tracking-wide">Snapshot Data Kompetisi</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="bg-primary-container text-on-primary-container font-space text-xs font-extrabold px-3 py-1 rounded-md border border-[#1A6B2F]/40">
                SESI AKTIF: {currentSession}
              </span>
              <span className={`font-space text-xs font-extrabold px-3 py-1 rounded-md border ${
                isRunning 
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-100 text-rose-700 border-rose-200'
              }`}>
                TIMER: {isRunning ? 'AKTIF' : 'MATI'}
              </span>
            </div>
          </div>

          {/* Session details grids — dynamic, tidak hardcode 4 sesi */}
          {sessionNumbers.length === 0 ? (
            <p className="text-sm text-on-surface-variant font-space text-center py-4 italic">
              Belum ada peserta terdaftar. Tambahkan dari halaman Admin Panel.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessionNumbers.map((sNum) => {
                const sTeams = sessionMap[sNum] || [];
                const isActive = sNum === currentSession;
                return (
                  <div
                    key={sNum}
                    className={`p-4 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-amber-50/50 border-amber-300 shadow-sm ring-1 ring-amber-300'
                        : 'bg-surface-container-low border-outline-var'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bebas text-lg text-primary-main font-bold tracking-wide">
                        {sNum <= 4 ? `BABAK PENYISIHAN ${sNum}` : `BABAK TAMBAHAN ${sNum - 4}`} {isActive && '🔥'}
                      </span>
                      <span className="text-[10px] font-space text-on-surface-variant font-bold">
                        {sTeams.length} Peserta
                      </span>
                    </div>
                    {sTeams.length === 0 ? (
                      <p className="text-xs text-on-surface-variant font-space italic">Belum ada sekolah terdaftar</p>
                    ) : (
                      <div className="space-y-1.5 font-space text-xs">
                        {sTeams.map((t) => {
                          const parsed = parseTeamInfo(t.name);
                          return (
                            <div key={t.id} className="flex justify-between items-center text-on-surface">
                              <span className="font-semibold truncate max-w-[180px]">{parsed.name}</span>
                              <span className="font-black text-primary-main bg-white border border-outline-var px-2 py-0.5 rounded">
                                {t.score} pt
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Top 7 Sementara */}
          {top7.length > 0 && (
            <div className="bg-primary-container/5 border border-primary-container/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-primary-main" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" /></svg>
                <h3 className="font-bebas text-xl text-primary-main tracking-wide">
                  {teams.length >= 7 ? '7 Besar Sementara — Kandidat Lolos Babak Berikutnya' : `${top7.length} Peserta Terdaftar (Butuh ${7 - top7.length} lagi untuk penentuan 7 besar)`}
                </h3>
              </div>
              <div className="space-y-1.5">
                {top7.map((t, idx) => {
                  const parsed = parseTeamInfo(t.name);
                  const isTied = idx > 0 && top7[idx - 1].score === t.score;
                  return (
                    <div key={t.id} className={`flex items-center gap-3 font-space text-sm rounded-lg px-3 py-2 ${idx < 3 ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-outline-var'}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-slate-700' : idx === 2 ? 'bg-orange-300 text-white' : 'bg-surface-container text-on-surface-variant border border-outline-var'}`}>
                        {idx + 1}
                      </span>
                      <span className="font-bold text-primary-main flex-1 truncate">{parsed.name}</span>
                      {isTied && <span className="text-[10px] font-black text-orange-600 bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded-full uppercase">Skor Sama</span>}
                      <span className="font-black text-primary-main">{t.score} pt</span>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const rank7Score = top7[6]?.score;
                const tied = teams.filter(t => t.score === rank7Score);
                if (rank7Score !== undefined && tied.length > 1 && teams.some(t => t.score === rank7Score && top7.indexOf(t) === -1)) {
                  return (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-lg px-4 py-2.5 text-xs font-space font-bold text-orange-700">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                      Terdapat {tied.length} sekolah dengan skor sama di posisi batas — diperlukan babak tambahan untuk menentukan yang berhak lolos.
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Analyze CTA button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || teams.length === 0}
            className={`w-full font-space text-base font-black py-4 px-8 rounded-xl shadow-lg border active:scale-[0.98] transition-all flex items-center justify-center gap-3 ${
              loading || teams.length === 0
                ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed'
                : 'bg-primary-main border-amber-400 text-white hover:bg-primary-main/90 shadow-primary-main/20'
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-amber-400 border-r-2"></div>
                <span>Menghitung peluang lolos babak berikutnya...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71l1.992-7.302H3.818a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 01.845-.143z" clipRule="evenodd" /></svg>
                <span>Analisis Siapa 7 Besar yang Berhak Lolos</span>
              </>
            )}
          </button>
        </section>

        {/* ERROR STATE */}
        {errorMsg && (
          <section className="bg-rose-50 border-2 border-rose-200 p-6 rounded-2xl flex items-start gap-4 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-rose-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
            <div className="space-y-2 flex-1">
              <h3 className="font-bebas text-xl text-rose-700 tracking-wide">Sistem Analisis Tidak Dapat Dihubungi</h3>
              <p className="text-sm font-space text-rose-600 font-medium">{errorMsg}</p>
              <button 
                onClick={handleAnalyze}
                className="mt-2 inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-space text-xs font-bold py-2 px-4 rounded-lg shadow transition-colors"
              >
                Coba Lagi
              </button>
            </div>
          </section>
        )}

        {/* ANALYSIS RESULTS CARD */}
        {analysis && !loading && (
          <section className="bg-white border border-outline-var p-8 rounded-2xl shadow-md space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-var pb-4">
              <div className="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-500 animate-pulse flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .75a8.25 8.25 0 00-4.135 15.39c.686.398 1.115 1.008 1.134 1.623a.75.75 0 00.577.706c.352.083.71.148 1.074.195.323.041.6-.218.6-.544v-4.661a6.714 6.714 0 01-.937-.171.75.75 0 11.374-1.453 5.261 5.261 0 002.626 0 .75.75 0 11.374 1.452 6.712 6.712 0 01-.937.172v4.66c0 .327.277.586.6.545.364-.047.722-.112 1.074-.195a.75.75 0 00.577-.706c.02-.615.448-1.225 1.134-1.623A8.25 8.25 0 0012 .75z" /><path fillRule="evenodd" d="M9.013 19.9a.75.75 0 01.877-.597 11.319 11.319 0 004.22 0 .75.75 0 11.28 1.473 12.819 12.819 0 01-4.78 0 .75.75 0 01-.597-.876zM9.754 22.344a.75.75 0 01.824-.668 13.682 13.682 0 002.844 0 .75.75 0 11.156 1.492 15.156 15.156 0 01-3.156 0 .75.75 0 01-.668-.824z" clipRule="evenodd" /></svg>
                <h2 className="font-bebas text-2xl text-primary-main tracking-wide">Hasil Penilaian — Rekomendasi 7 Besar</h2>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-600 font-space text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036a2.63 2.63 0 001.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258a2.63 2.63 0 00-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.63 2.63 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.63 2.63 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5z" clipRule="evenodd" /></svg>
                  <span>Sistem Cerdas</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs font-space font-medium text-on-surface-variant">
                <span>Terakhir diperbarui:</span>
                <span className="bg-slate-100 border border-outline-var px-2 py-0.5 rounded font-mono font-bold text-primary-main">
                  {lastUpdated}
                </span>
              </div>
            </div>

            {/* Structured parser result render */}
            <div className="space-y-4">
              {parsedBlocks.map((block, idx) => {
                if (block.type === 'recommendation') {
                  return (
                    <div 
                      key={idx} 
                      className="bg-amber-50/50 border border-amber-300 rounded-xl p-5 flex items-start gap-4 shadow-sm"
                    >
                      <div className="bg-amber-100 border border-amber-300 text-amber-600 p-2.5 rounded-lg flex items-center justify-center shrink-0 shadow-inner">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .75a8.25 8.25 0 00-4.135 15.39c.686.398 1.115 1.008 1.134 1.623a.75.75 0 00.577.706c.352.083.71.148 1.074.195.323.041.6-.218.6-.544v-4.661a6.714 6.714 0 01-.937-.171.75.75 0 11.374-1.453 5.261 5.261 0 002.626 0 .75.75 0 11.374 1.452 6.712 6.712 0 01-.937.172v4.66c0 .327.277.586.6.545.364-.047.722-.112 1.074-.195a.75.75 0 00.577-.706c.02-.615.448-1.225 1.134-1.623A8.25 8.25 0 0012 .75z" /></svg>
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-bebas text-lg text-amber-700 tracking-wide font-black">Rekomendasi Juri & Panitia</h4>
                        <p className="font-space text-xs font-semibold text-amber-800 leading-relaxed">
                          {block.text.replace(/^(Rekomendasi\s*Strategis|Rekomendasi|Rekomendasi\s*Strategis\s*untuk\s*panitia):/i, '').trim()}
                        </p>
                      </div>
                    </div>
                  );
                }

                if (block.type === 'point') {
                  return (
                    <div 
                      key={idx} 
                      className="bg-surface-container-low border border-outline-var rounded-xl p-5 flex items-start gap-4 transition-all hover:border-primary-main/30"
                    >
                      <div className="bg-primary-container border border-[#1A6B2F]/40 text-on-primary-container w-8 h-8 rounded-full flex items-center justify-center font-space text-sm font-extrabold shrink-0 shadow-sm">
                        {block.num}
                      </div>
                      <p className="font-space text-xs font-semibold text-on-surface leading-relaxed pt-1.5">
                        {block.text}
                      </p>
                    </div>
                  );
                }

                // Intro paragraph
                return (
                  <p 
                    key={idx} 
                    className="font-space text-xs font-bold text-on-surface-variant leading-relaxed px-2 border-l-2 border-outline-var py-1"
                  >
                    {block.text}
                  </p>
                );
              })}
            </div>

            {/* Refresh action bottom bar */}
            <div className="flex justify-end pt-4 border-t border-outline-var">
              <button 
                onClick={handleAnalyze}
                disabled={loading}
                className="flex items-center gap-2 border border-outline-var text-on-surface font-space text-xs font-bold py-2.5 px-5 rounded-lg hover:bg-surface-container-low active:scale-95 transition-all shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H3.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" /></svg>
                <span>Refresh Analisis</span>
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
