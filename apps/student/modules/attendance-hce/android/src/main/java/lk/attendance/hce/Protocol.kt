package lk.attendance.hce

import java.nio.ByteBuffer
import java.util.UUID

/** Mirrors packages/shared/src/protocol.ts. Keep in sync. */
object Protocol {
  const val PROTOCOL_VERSION: Byte = 1
  val AID: ByteArray = hex("F0415454454E44")

  const val CLA_PROPRIETARY = 0x80
  const val INS_AUTH = 0x10
  const val INS_CONFIRM = 0x20

  const val PURPOSE_ENROLL = 0x01
  const val PURPOSE_ATTEND = 0x02

  const val SW_OK = 0x9000
  const val SW_WRONG_LENGTH = 0x6700
  const val SW_NOT_REGISTERED = 0x6985
  const val SW_WRONG_P1 = 0x6A86
  const val SW_INS_NOT_SUPPORTED = 0x6D00
  const val SW_CLA_NOT_SUPPORTED = 0x6E00
  const val SW_SIGNING_FAILED = 0x6F00

  private val NFC_TAG = "ATTv1-NFC".toByteArray(Charsets.US_ASCII)
  private val LOGIN_TAG = "ATTv1-LOGIN".toByteArray(Charsets.US_ASCII)

  /** AUTH data = contextId(16) | nonce(16) | hostTime(8). */
  const val AUTH_DATA_LENGTH = 40

  fun sw(code: Int): ByteArray = byteArrayOf((code shr 8).toByte(), code.toByte())

  fun isSelectAid(apdu: ByteArray): Boolean {
    if (apdu.size < 5 + AID.size) return false
    val header = apdu[0] == 0x00.toByte() && apdu[1] == 0xA4.toByte() && apdu[2] == 0x04.toByte()
    val lc = apdu[4].toInt() and 0xFF
    return header && lc == AID.size && apdu.copyOfRange(5, 5 + lc).contentEquals(AID)
  }

  fun uuidToBytes(id: String): ByteArray {
    val uuid = UUID.fromString(id)
    return ByteBuffer.allocate(16).putLong(uuid.mostSignificantBits).putLong(uuid.leastSignificantBits).array()
  }

  fun bytesToUuid(b: ByteArray): String {
    val buf = ByteBuffer.wrap(b)
    return UUID(buf.long, buf.long).toString()
  }

  /** "ATTv1-NFC" || purpose || contextId(16) || nonce(16) || hostTime(8) || deviceId(16) */
  fun nfcProofMessage(purpose: Int, authData: ByteArray, deviceId: ByteArray): ByteArray =
    NFC_TAG + byteArrayOf(purpose.toByte()) + authData + deviceId

  /** "ATTv1-LOGIN" || deviceId(16) || serverNonce(32) */
  fun loginMessage(deviceId: String, nonce: ByteArray): ByteArray = LOGIN_TAG + uuidToBytes(deviceId) + nonce

  fun hex(s: String): ByteArray = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}
