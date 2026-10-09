const VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

export async function synthesizeSpeech(text: string, speakerId: number, emotion?: string): Promise<Buffer> {
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

  const synthRes = await fetch(`${VOICEVOX_BASE_URL}/synthesis?speaker=${speakerId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(audioQuery),
  });
  
  if (!synthRes.ok) {
    throw new Error(`VOICEVOX synthesis failed (status ${synthRes.status}).`);
  }

  const arrayBuffer = await synthRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
