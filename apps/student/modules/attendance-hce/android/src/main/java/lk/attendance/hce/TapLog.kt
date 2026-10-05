package lk.attendance.hce

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * What happened on this phone during recent taps (shown in the app, useful for the experiment:
 * signing time per tap on TEE vs StrongBox). Kept small in SharedPreferences.
 */
object TapLog {
  private const val PREFS = "attendance_tap_log"
  private const val KEY = "entries"
  private const val MAX = 50

  /** Set by the Expo module while JS is listening; the service may run without JS. */
  @Volatile var listener: ((Map<String, Any?>) -> Unit)? = null

  @Synchronized
  fun add(context: Context, entry: Map<String, Any?>) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val arr = JSONArray(prefs.getString(KEY, "[]"))
    val list = mutableListOf(JSONObject(entry))
    for (i in 0 until minOf(arr.length(), MAX - 1)) list.add(arr.getJSONObject(i))
    prefs.edit().putString(KEY, JSONArray(list).toString()).apply()
    try {
      listener?.invoke(entry)
    } catch (_: Exception) {
    }
  }

  fun all(context: Context): List<Map<String, Any?>> {
    val arr = JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"))
    return (0 until arr.length()).map { i ->
      val o = arr.getJSONObject(i)
      o.keys().asSequence().associateWith { k -> if (o.isNull(k)) null else o.get(k) }
    }
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }
}
