import { NextRequest, NextResponse } from 'next/server';
import { Groq } from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

interface Team {
  id: number;
  name: string;
  score: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Internal Server Error';
}

function parseTeamInfo(fullName: string) {
  const match = fullName.match(/\[S:(\d+)\]/);
  const session = match ? parseInt(match[1]) : 1;
  const nameWithoutSession = fullName.replace(/\s*\[S:\d+\]/, '').trim();
  const noMatch = nameWithoutSession.match(/(.*)\s+\[No:\s*([^\]]+)\]/);
  if (noMatch) return { name: noMatch[1].trim(), noUrut: noMatch[2], session };
  return { name: nameWithoutSession, noUrut: '-', session };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { teams, currentSession, isRunning, timeLeft } = body as {
      teams: Team[];
      currentSession: number;
      isRunning: boolean;
      timeLeft: number;
    };

    if (!teams || !Array.isArray(teams)) {
      return NextResponse.json({ error: 'Data teams tidak valid.' }, { status: 400 });
    }

    // Build performance session details
    let performaSesi = '';
    for (let s = 1; s <= 4; s++) {
      const sTeams = teams.filter((t) => parseTeamInfo(t.name).session === s);

      if (sTeams.length === 0) {
        performaSesi += `Sesi ${s}: belum ada data\n`;
      } else {
        const sorted = [...sTeams].sort((a, b) => b.score - a.score);
        const listStr = sorted
          .map((t) => {
            const parsed = parseTeamInfo(t.name);
            return `${parsed.name} - ${t.score}`;
          })
          .join(', ');
        performaSesi += `Sesi ${s}: [${listStr}]\n`;
      }
    }

    const allSorted = [...teams].sort((a, b) => b.score - a.score);
    const top7List = allSorted.slice(0, 7)
      .map((t, i) => {
        const parsed = parseTeamInfo(t.name);
        return `${i + 1}. ${parsed.name} (Babak ${parsed.session}) — ${t.score} poin`;
      })
      .join('\n');

    const rank7Score = allSorted[6]?.score;
    const tiedAtCutoff = allSorted.filter(t => t.score === rank7Score);
    const cutoffWarning = tiedAtCutoff.length > 1
      ? `\n⚠️ PERHATIAN JURI: ${tiedAtCutoff.length} sekolah memiliki skor yang sama (${rank7Score} poin) di posisi batas masuk 7 besar. Diperlukan babak tambahan untuk menentukan siapa yang berhak lolos.`
      : '';

    const userMessage = `Data seleksi kompetisi saat ini:

Babak aktif: ${currentSession} | Status: ${isRunning ? 'Sedang berlangsung' : 'Tidak aktif'} | Sisa waktu: ${timeLeft} detik
Total peserta: ${teams.length} sekolah

Performa per babak:
${performaSesi}
Kandidat 7 Besar saat ini:
${top7List}${cutoffWarning}

Berikan analisis untuk JURI dan PANITIA lomba yang mencakup:
1. Siapa 7 sekolah yang paling berhak lolos ke babak berikutnya dan mengapa
2. Apakah persaingan ketat atau ada sekolah yang jauh unggul
3. Apakah ada skor anomali atau babak yang perlu diperhatikan
4. Apakah diperlukan babak tambahan untuk menyelesaikan skor yang sama
5. Satu rekomendasi konkret untuk panitia dalam mengambil keputusan selanjutnya`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Kamu adalah analis kompetisi akademik berpengalaman untuk lomba tingkat sekolah dasar di Indonesia. Berikan analisis yang tajam, to the point, dan relevan secara kontekstual untuk panitia dan juri lomba. Gunakan Bahasa Indonesia yang profesional namun mudah dipahami. Selalu akhiri dengan 1 rekomendasi strategis yang konkret.',
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      model: 'llama-3.1-8b-instant',
    });

    const analysis = chatCompletion.choices[0]?.message?.content || 'Gagal menghasilkan analisis.';
    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    console.error('Groq AI API error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
