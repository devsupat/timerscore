'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
            <img src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" className="h-16 w-auto object-contain filter drop-shadow-[0_4px_8px_rgba(245,197,24,0.2)]" />
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
          <img src="https://i.imgur.com/Fz8oi5y.png" alt="Logo Kota Tangerang" className="h-8 md:h-12 w-auto object-contain flex-shrink-0 filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)]" />
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
            <span className="material-symbols-outlined text-xs md:text-sm font-bold">lock</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-6 mt-12 space-y-8">
        
        {/* SNAPSHOT CARD */}
        <section className="bg-white border border-outline-var p-8 rounded-2xl shadow-md space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-var pb-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-primary-main font-bold text-3xl">analytics</span>
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
                <span className="material-symbols-outlined text-primary-main text-xl">workspace_premium</span>
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
                      <span className="material-symbols-outlined text-base">warning</span>
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
                <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>bolt</span>
                <span>Analisis Siapa 7 Besar yang Berhak Lolos</span>
              </>
            )}
          </button>
        </section>

        {/* ERROR STATE */}
        {errorMsg && (
          <section className="bg-rose-50 border-2 border-rose-200 p-6 rounded-2xl flex items-start gap-4 shadow-sm">
            <span className="material-symbols-outlined text-rose-600 font-bold text-3xl">error</span>
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
                <span className="material-symbols-outlined text-amber-500 font-bold text-3xl animate-pulse">psychology</span>
                <h2 className="font-bebas text-2xl text-primary-main tracking-wide">Hasil Penilaian — Rekomendasi 7 Besar</h2>
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-600 font-space text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full">
                  <span className="material-symbols-outlined text-sm" style={{fontVariationSettings:"'FILL' 1"}}>auto_awesome</span>
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
                        <span className="material-symbols-outlined" style={{fontVariationSettings:"'FILL' 1"}}>lightbulb</span>
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
                <span className="material-symbols-outlined text-sm font-bold">refresh</span>
                <span>Refresh Analisis</span>
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
