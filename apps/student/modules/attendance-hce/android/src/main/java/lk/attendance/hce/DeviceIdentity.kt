package lk.attendance.hce

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * The phone's identity: a random deviceId (issued by the backend) plus an EC P-256 key pair
 * generated inside the Android Keystore. The private key never leaves secure hardware.
 * Shared by the HCE service (taps) and the Expo module (registration, login).
 */
object DeviceIdentity {
  private const val KEYSTORE = "AndroidKeyStore"
  private const val KEY_ALIAS = "attendance_device_key_v1"
  private const val PREFS = "attendance_identity"
  private const val PREF_DEVICE_ID = "device_id"

  data class KeyDetails(val publicKey: String, val securityLevel: String, val hardwareBacked: Boolean)

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun getDeviceId(context: Context): String? = prefs(context).getString(PREF_DEVICE_ID, null)

  fun setDeviceId(context: Context, deviceId: String) {
    Protocol.uuidToBytes(deviceId) // validates the format
    prefs(context).edit().putString(PREF_DEVICE_ID, deviceId).apply()
  }

  fun hasKey(): Boolean = keyStore().containsAlias(KEY_ALIAS)

  /** Creates the key pair on first use (StrongBox when available, else TEE) and describes it. */
  @Synchronized
  fun ensureKey(): KeyDetails {
    if (!hasKey()) generate()
    return describe()
  }

  private fun generate() {
    fun spec(strongBox: Boolean): KeyGenParameterSpec {
      val builder = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
        .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
        .setDigests(KeyProperties.DIGEST_SHA256)
      if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) builder.setIsStrongBoxBacked(true)
      return builder.build()
    }
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    try {
      generator.initialize(spec(strongBox = true))
      generator.generateKeyPair()
    } catch (e: Exception) {
      // No StrongBox (StrongBoxUnavailableException, or ProviderException on some OEMs): use the TEE.
      generator.initialize(spec(strongBox = false))
      generator.generateKeyPair()
    }
  }

  private fun privateKey(): PrivateKey =
    keyStore().getKey(KEY_ALIAS, null) as? PrivateKey ?: throw IllegalStateException("No device key")

  fun describe(): KeyDetails {
    val ks = keyStore()
    val publicKey = ks.getCertificate(KEY_ALIAS).publicKey
    val key = privateKey()
    val info = KeyFactory.getInstance(key.algorithm, KEYSTORE).getKeySpec(key, KeyInfo::class.java)
    val level = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      when (info.securityLevel) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TEE"
        KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
        else -> "UNKNOWN"
      }
    } else {
      @Suppress("DEPRECATION")
      if (info.isInsideSecureHardware) "TEE" else "SOFTWARE"
    }
    return KeyDetails(b64url(publicKey.encoded), level, level == "TEE" || level == "STRONGBOX")
  }

  /** SHA256withECDSA, ASN.1 DER output (what the backend verifies). */
  fun sign(data: ByteArray): ByteArray =
    Signature.getInstance("SHA256withECDSA").run {
      initSign(privateKey())
      update(data)
      sign()
    }

  fun clear(context: Context) {
    val ks = keyStore()
    if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)
    prefs(context).edit().clear().apply()
  }

  fun b64url(bytes: ByteArray): String =
    Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  fun fromB64url(s: String): ByteArray = Base64.decode(s, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}
