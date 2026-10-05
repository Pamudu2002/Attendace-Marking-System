package lk.attendance.reader

import android.content.Context
import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The teacher's phone as an NFC reader (NfcAdapter reader mode + IsoDep).
 * Reader mode also stops this phone from acting as a card and suppresses Android's own tag dispatch.
 */
class NfcReaderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private sealed class Mode {
    class Attend(val session: AttendanceSession) : Mode()
    class Enroll(val session: EnrollSession) : Mode()
  }

  private class PendingEnroll {
    val latch = CountDownLatch(1)
    @Volatile var result: Int = Apdu.Result.BAD_SIGNATURE
    @Volatile var message: String = ""
  }

  @Volatile private var mode: Mode? = null
  @Volatile private var enabled = false
  private val pending = ConcurrentHashMap<String, PendingEnroll>()

  override fun definition() = ModuleDefinition {
    Name("NfcReader")

    Events("onTap", "onEnrollProof", "onReaderState")

    Function("getStatus") {
      val adapter = NfcAdapter.getDefaultAdapter(context)
      mapOf("nfcSupported" to (adapter != null), "nfcEnabled" to (adapter?.isEnabled == true), "readerActive" to enabled)
    }

    Function("openNfcSettings") {
      context.startActivity(Intent(Settings.ACTION_NFC_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    AsyncFunction("startAttendance") { config: AttendanceConfigRecord ->
      val roster = config.roster.mapNotNull { r ->
        try {
          r.deviceId to StudentKey(r.deviceId, r.studentId, r.fullName, r.indexNumber, ReaderEngine.parseKey(r.publicKey))
        } catch (e: Exception) {
          Log.w(TAG, "Skipping invalid key for ${r.indexNumber}", e)
          null
        }
      }.toMap()
      mode = Mode.Attend(
        AttendanceSession(
          sessionId = config.sessionId,
          label = config.label,
          startsAt = config.startsAt.toLong(),
          endsAt = config.endsAt.toLong(),
          opensBeforeMin = config.checkInOpensBeforeMin,
          lateAfterMin = config.lateAfterMin,
          roster = roster,
          marked = config.alreadyMarked.toMutableSet(),
        ),
      )
      enable()
      roster.size
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startEnrollment") { config: EnrollConfigRecord ->
      mode = Mode.Enroll(EnrollSession(config.classId, config.label, config.confirmTimeoutMs))
      enable()
    }.runOnQueue(Queues.MAIN)

    /** Called by JS after the server answered POST /classes/{id}/enrollments for this tap. */
    Function("resolveEnrollment") { tapId: String, result: Int, message: String ->
      pending[tapId]?.let {
        it.result = result
        it.message = message
        it.latch.countDown()
      }
    }

    /** Keep the duplicate guard in sync after manual edits or a server refresh. */
    Function("setMarked") { studentIds: List<String> ->
      (mode as? Mode.Attend)?.session?.marked?.let { synchronized(it) { it.clear(); it.addAll(studentIds) } }
    }

    AsyncFunction("stop") {
      mode = null
      disable()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersForeground {
      if (mode != null) enable()
    }

    OnActivityEntersBackground {
      disable(keepMode = true)
    }

    OnDestroy {
      pending.values.forEach { it.latch.countDown() }
      disable()
    }
  }

  private fun enable() {
    val activity = appContext.currentActivity ?: return
    val adapter = NfcAdapter.getDefaultAdapter(context) ?: return
    val extras = Bundle().apply { putInt(NfcAdapter.EXTRA_READER_PRESENCE_CHECK_DELAY, 500) }
    activity.runOnUiThread {
      try {
        adapter.enableReaderMode(
          activity,
          { tag -> onTag(tag) },
          NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
            NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
          extras,
        )
        enabled = true
        sendEvent("onReaderState", mapOf("active" to true))
      } catch (e: Exception) {
        Log.e(TAG, "enableReaderMode failed", e)
      }
    }
  }

  private fun disable(keepMode: Boolean = false) {
    if (!keepMode) mode = null
    val activity = appContext.currentActivity ?: run { enabled = false; return }
    val adapter = NfcAdapter.getDefaultAdapter(context) ?: return
    activity.runOnUiThread {
      try {
        adapter.disableReaderMode(activity)
      } catch (_: Exception) {
      }
      enabled = false
      sendEvent("onReaderState", mapOf("active" to false))
    }
  }

  /** Runs on an NFC binder thread, so blocking I/O is fine here. */
  private fun onTag(tag: Tag) {
    val t0 = SystemClock.elapsedRealtimeNanos()
    val isoDep = IsoDep.get(tag) ?: return
    try {
      isoDep.connect()
      isoDep.timeout = 3000
      val transceiver = Transceiver { cmd -> isoDep.transceive(cmd) }
      when (val m = mode) {
        is Mode.Attend -> sendEvent("onTap", ReaderEngine.attend(transceiver, m.session, t0))
        is Mode.Enroll -> enroll(transceiver, m.session, t0)
        null -> Unit
      }
    } catch (e: Exception) {
      sendEvent("onTap", mapOf("outcome" to "TAG_LOST", "errorDetail" to (e.message ?: "connect failed"),
        "discoveredAt" to System.currentTimeMillis().toDouble(), "purpose" to purposeName()))
    } finally {
      try { isoDep.close() } catch (_: Exception) {}
    }
  }

  private fun enroll(t: Transceiver, session: EnrollSession, t0: Long) {
    val event = ReaderEngine.enrollProof(t, session, t0)
    if (event["outcome"] != "PENDING") {
      sendEvent("onEnrollProof", event)
      return
    }
    val tapId = event["tapId"] as String
    val wait = PendingEnroll()
    pending[tapId] = wait
    sendEvent("onEnrollProof", event)
    // Keep the link up while JS asks the server, then tell the student phone the verdict.
    try {
      if (wait.latch.await(session.confirmTimeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
        val out = mutableMapOf<String, Any?>("tapId" to tapId)
        ReaderEngine.sendConfirm(t, wait.result, wait.message, out, SystemClock.elapsedRealtimeNanos())
      }
    } finally {
      pending.remove(tapId)
    }
  }

  private fun purposeName() = if (mode is Mode.Enroll) "ENROLL" else "ATTEND"

  companion object {
    private const val TAG = "NfcReader"
  }
}
