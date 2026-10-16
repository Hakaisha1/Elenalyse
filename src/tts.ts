const VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

export type VrmViseme = "aa" | "ih" | "ou" | "ee" | "oh";

export interface VisemeCue {
  time: number;            // Timestamp mulai dalam detik
  duration: number;        // Durasi dalam detik
  vowel: VrmViseme | null; // null jika konsonan, jeda, atau diam
  text?: string;           // Teks karakter mora untuk inspeksi
}

export interface SpeechSynthesisResult {
  audio: Buffer;
  cues: VisemeCue[];
  totalDuration: number;
}

function mapVoicevoxVowelToVrm(vowel: string): VrmViseme | null {
  const v = vowel.toLowerCase();
  switch (v) {
    case "a":
      return "aa";
    case "i":
      return "ih";
    case "u":
      return "ou";
    case "e":
      return "ee";
    case "o":
      return "oh";
    default:
      // "N" (ん), pauses ("pau"), geminate ("cl") atau vokal tidak terdefinisi
      return null;
  }
}

function extractVisemeCues(audioQuery: any): { cues: VisemeCue[]; totalDuration: number } {
  const speedScale = typeof audioQuery.speedScale === "number" && audioQuery.speedScale > 0 ? audioQuery.speedScale : 1.0;
  const cues: VisemeCue[] = [];
  let currentTime = 0;

  // Pre-phoneme silence
  if (typeof audioQuery.prePhonemeLength === "number" && audioQuery.prePhonemeLength > 0) {
    const dur = audioQuery.prePhonemeLength / speedScale;
    cues.push({ time: currentTime, duration: dur, vowel: null, text: "pre" });
    currentTime += dur;
  }

  // Accent phrases and moras
  if (Array.isArray(audioQuery.accent_phrases)) {
    for (const phrase of audioQuery.accent_phrases) {
      if (Array.isArray(phrase.moras)) {
        for (const mora of phrase.moras) {
          // Consonant part (k, s, t, dsb)
          if (mora.consonant && typeof mora.consonant_length === "number" && mora.consonant_length > 0) {
            const cDur = mora.consonant_length / speedScale;
            cues.push({ time: currentTime, duration: cDur, vowel: null, text: mora.consonant });
            currentTime += cDur;
          }
          // Vowel part (a, i, u, e, o)
          if (mora.vowel && typeof mora.vowel_length === "number" && mora.vowel_length > 0) {
            const vDur = mora.vowel_length / speedScale;
            const viseme = mapVoicevoxVowelToVrm(mora.vowel);
            cues.push({ time: currentTime, duration: vDur, vowel: viseme, text: mora.text });
            currentTime += vDur;
          }
        }
      }

      // Inter-phrase pause mora (jeda antar frasa)
      if (phrase.pause_mora && typeof phrase.pause_mora.vowel_length === "number" && phrase.pause_mora.vowel_length > 0) {
        const pDur = phrase.pause_mora.vowel_length / speedScale;
        cues.push({ time: currentTime, duration: pDur, vowel: null, text: phrase.pause_mora.text });
        currentTime += pDur;
      }
    }
  }

  // Post-phoneme silence
  if (typeof audioQuery.postPhonemeLength === "number" && audioQuery.postPhonemeLength > 0) {
    const postDur = audioQuery.postPhonemeLength / speedScale;
    cues.push({ time: currentTime, duration: postDur, vowel: null, text: "post" });
    currentTime += postDur;
  }

  return { cues, totalDuration: currentTime };
}

export async function synthesizeSpeech(text: string, speakerId: number, emotion?: string): Promise<SpeechSynthesisResult> {
  let queryRes: Response;
  try {
    queryRes = await fetch(
      `${VOICEVOX_BASE_URL}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`,
      { method: "POST" }
    );
  } catch (err) {
    throw new Error(
      "Cannot connect to local VOICEVOX ENGINE. Ensure it is running or try restarting with --voice flag."
    );
  }
  
  if (!queryRes.ok) {
    throw new Error(`VOICEVOX audio_query failed (status ${queryRes.status}).`);
  }
  const audioQuery = await queryRes.json();

  if (emotion) {
    const e = emotion.toLowerCase();
    if (e === "angry" || e === "mad") {
      audioQuery.intonationScale = 1.4;
      audioQuery.speedScale = 1.15;
      audioQuery.pitchScale = 0.05;
    } else if (e === "sad" || e === "cry") {
      audioQuery.intonationScale = 0.8;
      audioQuery.speedScale = 0.85;
      audioQuery.pitchScale = -0.1;
    } else if (e === "happy" || e === "excited") {
      audioQuery.intonationScale = 1.3;
      audioQuery.speedScale = 1.1;
      audioQuery.pitchScale = 0.1;
    } else if (e === "calm" || e === "cold") {
      audioQuery.intonationScale = 0.7;
      audioQuery.speedScale = 0.95;
      audioQuery.pitchScale = 0.0;
    }
  }

  // Ekstraksi cue vokal sebelum request synthesis
  const { cues, totalDuration } = extractVisemeCues(audioQuery);

  const synthRes = await fetch(`${VOICEVOX_BASE_URL}/synthesis?speaker=${speakerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audioQuery),
  });
  
  if (!synthRes.ok) {
    throw new Error(`VOICEVOX synthesis failed (status ${synthRes.status}).`);
  }

  const arrayBuffer = await synthRes.arrayBuffer();
  return {
    audio: Buffer.from(arrayBuffer),
    cues,
    totalDuration,
  };
}

