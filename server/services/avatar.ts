interface AvatarSession {
  sessionId: string;
  provider: "heygen" | "did";
  offer?: RTCSessionDescriptionInit;
  iceServers?: RTCIceServer[];
  streamId?: string;
}

const activeSessions = new Map<string, AvatarSession>();

async function createHeyGenSession(agentType: string): Promise<AvatarSession> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY not configured");

  try {
    const response = await fetch("https://api.heygen.com/v1/streaming.new", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        quality: "medium",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("HeyGen session creation failed:", response.status, errText);
      throw new Error(`HeyGen API error: ${response.status}`);
    }

    const data = await response.json();
    const sessionData = data.data || data;

    const session: AvatarSession = {
      sessionId: sessionData.session_id || `heygen_${Date.now()}`,
      provider: "heygen",
      offer: sessionData.sdp ? { type: "offer", sdp: sessionData.sdp } : undefined,
      iceServers: sessionData.ice_servers || sessionData.ice_servers2 || [],
    };

    activeSessions.set(session.sessionId, session);
    return session;
  } catch (error) {
    console.error("HeyGen session creation error:", error);
    throw error;
  }
}

async function createDIDSession(agentType: string): Promise<AvatarSession> {
  const apiKey = process.env.DID_API_KEY;
  if (!apiKey) throw new Error("DID_API_KEY not configured");

  try {
    const response = await fetch("https://api.d-id.com/talks/streams", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        source_url: "https://create-images-results.d-id.com/DefaultPresenters/Noelle_f/image.jpeg",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("D-ID session creation failed:", response.status, errText);
      throw new Error(`D-ID API error: ${response.status}`);
    }

    const data = await response.json();

    const session: AvatarSession = {
      sessionId: data.id || `did_${Date.now()}`,
      provider: "did",
      offer: data.offer ? { type: "offer", sdp: data.offer.sdp } : undefined,
      iceServers: data.ice_servers || [],
      streamId: data.stream_id,
    };

    activeSessions.set(session.sessionId, session);
    return session;
  } catch (error) {
    console.error("D-ID session creation error:", error);
    throw error;
  }
}

export async function createAvatarSession(
  provider: "heygen" | "did",
  agentType: string
): Promise<AvatarSession> {
  if (provider === "heygen") {
    try {
      return await createHeyGenSession(agentType);
    } catch (err) {
      console.log("HeyGen failed, falling back to D-ID");
      return createDIDSession(agentType);
    }
  }
  return createDIDSession(agentType);
}

export async function sendSdpAnswer(
  sessionId: string,
  sdp: string
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.provider === "heygen") {
    const response = await fetch("https://api.heygen.com/v1/streaming.start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.HEYGEN_API_KEY!,
      },
      body: JSON.stringify({
        session_id: sessionId,
        sdp: { type: "answer", sdp },
      }),
    });
    if (!response.ok) {
      console.error("HeyGen SDP answer failed:", await response.text());
    }
  } else if (session.provider === "did") {
    const response = await fetch(`https://api.d-id.com/talks/streams/${session.streamId}/sdp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${process.env.DID_API_KEY}`,
      },
      body: JSON.stringify({
        answer: { type: "answer", sdp },
        session_id: sessionId,
      }),
    });
    if (!response.ok) {
      console.error("D-ID SDP answer failed:", await response.text());
    }
  }
}

export async function sendIceCandidate(
  sessionId: string,
  candidate: RTCIceCandidateInit
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.provider === "heygen") {
    await fetch("https://api.heygen.com/v1/streaming.ice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.HEYGEN_API_KEY!,
      },
      body: JSON.stringify({
        session_id: sessionId,
        candidate,
      }),
    });
  } else if (session.provider === "did") {
    await fetch(`https://api.d-id.com/talks/streams/${session.streamId}/ice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${process.env.DID_API_KEY}`,
      },
      body: JSON.stringify({
        candidate,
        session_id: sessionId,
      }),
    });
  }
}

export async function sendSpeak(
  sessionId: string,
  text: string
): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  if (session.provider === "heygen") {
    const response = await fetch("https://api.heygen.com/v1/streaming.task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.HEYGEN_API_KEY!,
      },
      body: JSON.stringify({
        session_id: sessionId,
        text,
        task_type: "talk",
      }),
    });
    if (!response.ok) {
      console.error("HeyGen speak failed:", await response.text());
    }
  } else if (session.provider === "did") {
    const response = await fetch(`https://api.d-id.com/talks/streams/${session.streamId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${process.env.DID_API_KEY}`,
      },
      body: JSON.stringify({
        script: {
          type: "text",
          input: text,
          provider: { type: "microsoft", voice_id: "en-US-GuyNeural" },
        },
        driver_url: "bank://lively/",
        config: { stitch: true },
        session_id: sessionId,
      }),
    });
    if (!response.ok) {
      console.error("D-ID speak failed:", await response.text());
    }
  }
}

export async function closeAvatarSession(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  try {
    if (session.provider === "heygen") {
      await fetch("https://api.heygen.com/v1/streaming.stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": process.env.HEYGEN_API_KEY!,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } else if (session.provider === "did") {
      await fetch(`https://api.d-id.com/talks/streams/${session.streamId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Basic ${process.env.DID_API_KEY}`,
        },
        body: JSON.stringify({ session_id: sessionId }),
      });
    }
  } catch (error) {
    console.error("Error closing avatar session:", error);
  }

  activeSessions.delete(sessionId);
}

export function getActiveSession(sessionId: string): AvatarSession | undefined {
  return activeSessions.get(sessionId);
}
