// Alapon is a serverless WebRTC mesh: every peer uploads its camera to every other
// peer, so per-person upload + CPU grows with the room. Past ~5 the mesh degrades
// (frozen video, audio drops). We cap rooms here so the experience stays good and
// degradation is never silent. Raising this without an SFU will hurt call quality.
export const MAX_PARTICIPANTS = 5
