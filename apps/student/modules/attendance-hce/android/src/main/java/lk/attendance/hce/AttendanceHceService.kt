package lk.attendance.hce

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.nfc.cardemulation.HostApduService
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import java.util.concurrent.Executors

/**
 * The student phone acting as a contactless card (Host Card Emulation).
 * Android routes APDUs for our AID here even when the app is closed, so no JavaScript runs during a tap.
 *
 *   SELECT AID           -> version | deviceId(16) | 9000
 *   AUTH (P1 = purpose)  -> deviceId(16) | sigLen(1) | DER signature | 9000
 *   CONFIRM (P1 = result)-> 9000, and the verdict text is shown as a notification
 *
 * Spec: docs/IDENTITY_AND_AUTH.md §3.
 */
class AttendanceHceService : HostApduService() {
  private val signer = Executors.newSingleThreadExecutor()

  @Volatile private var lastPurpose: Int = 0
  @Volatile private var lastSignMs: Double? = null

  override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray? =
    try {
      handle(apdu)
    } catch (e: Exception) {
      Log.e(TAG, "APDU handling failed", e)
      Protocol.sw(Protocol.SW_SIGNING_FAILED)
    }

  private fun handle(apdu: ByteArray): ByteArray? {
    if (apdu.size < 4) return Protocol.sw(Protocol.SW_WRONG_LENGTH)

    if (Protocol.isSelectAid(apdu)) {
      val deviceId = DeviceIdentity.getDeviceId(this)
      if (deviceId == null || !DeviceIdentity.hasKey()) return Protocol.sw(Protocol.SW_NOT_REGISTERED)
      return byteArrayOf(Protocol.PROTOCOL_VERSION) + Protocol.uuidToBytes(deviceId) + Protocol.sw(Protocol.SW_OK)
    }

    if ((apdu[0].toInt() and 0xFF) != Protocol.CLA_PROPRIETARY) return Protocol.sw(Protocol.SW_CLA_NOT_SUPPORTED)
    return when (apdu[1].toInt() and 0xFF) {
      Protocol.INS_AUTH -> handleAuth(apdu)
      Protocol.INS_CONFIRM -> handleConfirm(apdu)
      else -> Protocol.sw(Protocol.SW_INS_NOT_SUPPORTED)
    }
  }

  private fun handleAuth(apdu: ByteArray): ByteArray? {
    val purpose = apdu[2].toInt() and 0xFF
    if (purpose != Protocol.PURPOSE_ENROLL && purpose != Protocol.PURPOSE_ATTEND) return Protocol.sw(Protocol.SW_WRONG_P1)
    if (apdu.size < 5) return Protocol.sw(Protocol.SW_WRONG_LENGTH)
    val lc = apdu[4].toInt() and 0xFF
    if (lc != Protocol.AUTH_DATA_LENGTH || apdu.size < 5 + lc) return Protocol.sw(Protocol.SW_WRONG_LENGTH)
    val deviceIdStr = DeviceIdentity.getDeviceId(this) ?: return Protocol.sw(Protocol.SW_NOT_REGISTERED)
    val deviceId = Protocol.uuidToBytes(deviceIdStr)
    val message = Protocol.nfcProofMessage(purpose, apdu.copyOfRange(5, 5 + lc), deviceId)
    lastPurpose = purpose

    // Keystore signing can take tens of ms (StrongBox more), so reply asynchronously.
    signer.execute {
      try {
        val t0 = SystemClock.elapsedRealtimeNanos()
        val signature = DeviceIdentity.sign(message)
        lastSignMs = (SystemClock.elapsedRealtimeNanos() - t0) / 1_000_000.0
        sendResponseApdu(deviceId + byteArrayOf(signature.size.toByte()) + signature + Protocol.sw(Protocol.SW_OK))
      } catch (e: Exception) {
        Log.e(TAG, "Signing failed", e)
        sendResponseApdu(Protocol.sw(Protocol.SW_SIGNING_FAILED))
      }
    }
    return null
  }

  private fun handleConfirm(apdu: ByteArray): ByteArray {
    val result = apdu[2].toInt() and 0xFF
    val lc = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0
    val text = if (lc > 0 && apdu.size >= 5 + lc) String(apdu.copyOfRange(5, 5 + lc), Charsets.UTF_8) else ""
    val entry = mapOf(
      "at" to System.currentTimeMillis(),
      "purpose" to if (lastPurpose == Protocol.PURPOSE_ENROLL) "ENROLL" else "ATTEND",
      "result" to result,
      "resultName" to RESULT_NAMES[result],
      "message" to text,
      "signMs" to lastSignMs,
    )
    TapLog.add(this, entry)
    showNotification(result, text)
    return Protocol.sw(Protocol.SW_OK)
  }

  override fun onDeactivated(reason: Int) {
    // DEACTIVATION_LINK_LOSS or DEACTIVATION_DESELECTED: nothing to clean up.
  }

  override fun onDestroy() {
    signer.shutdown()
    super.onDestroy()
  }

  private fun showNotification(result: Int, text: String) {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Check-in results", NotificationManager.IMPORTANCE_HIGH),
      )
    }
    val ok = result <= 0x03
    val title = when (result) {
      0x00 -> "Checked in ✓"
      0x01 -> "Checked in (late)"
      0x02 -> "Already checked in"
      0x03 -> "Enrolled ✓"
      else -> "Check-in failed"
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val pending = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(if (ok) android.R.drawable.checkbox_on_background else android.R.drawable.stat_notify_error)
      .setContentTitle(title)
      .setContentText(text.ifBlank { RESULT_NAMES[result] ?: "" })
      .setAutoCancel(true)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()
    try {
      manager.notify(NOTIFICATION_ID, notification)
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS not granted (Android 13+): the in-app tap log still records it.
    }
  }

  companion object {
    private const val TAG = "AttendanceHce"
    private const val CHANNEL_ID = "attendance_checkins"
    private const val NOTIFICATION_ID = 4473
    val RESULT_NAMES = mapOf(
      0x00 to "PRESENT",
      0x01 to "LATE",
      0x02 to "ALREADY_MARKED",
      0x03 to "ENROLLED",
      0x10 to "NOT_ENROLLED",
      0x11 to "OUTSIDE_WINDOW",
      0x12 to "BAD_SIGNATURE",
      0x13 to "UNKNOWN_DEVICE",
    )
  }
}
