const VOICEVOX_BASE_URL = "http://127.0.0.1:50021";

export async function synthesizeSpeech(text: string, speakerId: number): Promise<Buffer> {
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
