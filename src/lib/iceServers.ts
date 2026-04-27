export function getIceServers(): RTCIceServer[] {
  const turnUsername = import.meta.env.VITE_TURN_USERNAME
  const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL

  return [
    // STUN servers (free, public)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },

    // TURN servers (for NAT traversal, requires credentials)
    ...(turnUsername && turnCredential ? [{
      urls: [
        'turn:relay.metered.ca:80',
        'turn:relay.metered.ca:443',
        'turns:relay.metered.ca:443'
      ],
      username: turnUsername,
      credential: turnCredential,
    }] : []),
  ]
}
