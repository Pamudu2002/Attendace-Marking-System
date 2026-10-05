package lk.attendance.hce

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.nfc.NfcAdapter
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge for the student phone's identity and HCE status. The tap itself is handled by AttendanceHceService. */
class AttendanceHceModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AttendanceHce")

    Events("onTap")

    OnStartObserving {
      TapLog.listener = { entry -> sendEvent("onTap", entry) }
    }

    OnStopObserving {
      TapLog.listener = null
    }

    Function("getStatus") {
      val pm = context.packageManager
      val adapter = NfcAdapter.getDefaultAdapter(context)
      mapOf(
        "nfcSupported" to (adapter != null),
        "hceSupported" to pm.hasSystemFeature(PackageManager.FEATURE_NFC_HOST_CARD_EMULATION),
        "nfcEnabled" to (adapter?.isEnabled == true),
        "deviceId" to DeviceIdentity.getDeviceId(context),
        "hasKey" to DeviceIdentity.hasKey(),
      )
    }

    /** Creates the Keystore key pair if needed; returns the SPKI public key (base64url) and where it lives. */
    AsyncFunction("ensureKeyAsync") {
      val d = DeviceIdentity.ensureKey()
      mapOf("publicKey" to d.publicKey, "securityLevel" to d.securityLevel, "hardwareBacked" to d.hardwareBacked)
    }

    Function("setDeviceId") { deviceId: String ->
      DeviceIdentity.setDeviceId(context, deviceId)
    }

    /** Signs "ATTv1-LOGIN" || deviceId || nonce. Only the login message can be signed from JS. */
    AsyncFunction("signLoginChallengeAsync") { nonceB64url: String ->
      val deviceId = DeviceIdentity.getDeviceId(context) ?: throw IllegalStateException("Device is not registered")
      val nonce = DeviceIdentity.fromB64url(nonceB64url)
      require(nonce.size == 32) { "Login nonce must be 32 bytes" }
      DeviceIdentity.b64url(DeviceIdentity.sign(Protocol.loginMessage(deviceId, nonce)))
    }

    /** Deletes the key and deviceId (re-registration). The teacher must re-enrol the phone afterwards. */
    AsyncFunction("clearIdentityAsync") {
      DeviceIdentity.clear(context)
      TapLog.clear(context)
    }

    Function("getRecentTaps") {
      TapLog.all(context)
    }

    Function("openNfcSettings") {
      val intent = Intent(Settings.ACTION_NFC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
