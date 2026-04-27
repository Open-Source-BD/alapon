const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const PBKDF2_ITERATIONS = 100000

export const supportsInsertableStreams =
  typeof RTCRtpSender !== 'undefined' &&
  'createEncodedStreams' in RTCRtpSender.prototype

export async function deriveRoomKey(
  passphrase: string,
  roomId: string
): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passphraseData = encoder.encode(passphrase)
  const salt = encoder.encode(roomId)

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseData,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export function createEncoderTransform(
  key: CryptoKey
): TransformStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame> {
  return new TransformStream({
    async transform(frame, controller) {
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const encrypted = await crypto.subtle.encrypt(
          { name: ALGORITHM, iv },
          key,
          frame.data
        )

        const encryptedData = new Uint8Array(iv.length + encrypted.byteLength)
        encryptedData.set(iv)
        encryptedData.set(new Uint8Array(encrypted), iv.length)

        frame.data = encryptedData.buffer
        controller.enqueue(frame)
      } catch (error) {
        console.error('Encryption error:', error)
        controller.error(error)
      }
    },
  })
}

export function createDecoderTransform(
  key: CryptoKey
): TransformStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame> {
  return new TransformStream({
    async transform(frame, controller) {
      try {
        const data = new Uint8Array(frame.data)
        const iv = data.slice(0, 12)
        const ciphertext = data.slice(12)

        const decrypted = await crypto.subtle.decrypt(
          { name: ALGORITHM, iv },
          key,
          ciphertext
        )

        frame.data = decrypted
        controller.enqueue(frame)
      } catch (error) {
        console.error('Decryption error:', error)
        controller.error(error)
      }
    },
  })
}

export async function applyEncoderTransform(
  sender: RTCRtpSender,
  key: CryptoKey
): Promise<void> {
  try {
    const { readable, writable } = await (sender as any).createEncodedStreams()
    const transformer = createEncoderTransform(key)
    readable.pipeThrough(transformer).pipeTo(writable)
  } catch (error) {
    console.warn('Failed to apply encoder transform (Insertable Streams not supported):', error)
  }
}

export async function applyDecoderTransform(
  receiver: RTCRtpReceiver,
  key: CryptoKey
): Promise<void> {
  try {
    const { readable, writable } = await (receiver as any).createEncodedStreams()
    const transformer = createDecoderTransform(key)
    readable.pipeThrough(transformer).pipeTo(writable)
  } catch (error) {
    console.warn('Failed to apply decoder transform (Insertable Streams not supported):', error)
  }
}
