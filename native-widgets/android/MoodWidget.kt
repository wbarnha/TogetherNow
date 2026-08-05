// MoodWidget.kt — Android home-screen widget (Jetpack Glance).
// Place in android/app/src/main/java/io/github/wbarnha/togethernow/widget/ and register
// MoodWidgetReceiver in AndroidManifest.xml (see MOBILE.md).

package io.github.wbarnha.togethernow.widget

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.padding
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.graphics.Color
import org.json.JSONObject

// Capacitor Preferences writes to SharedPreferences named "CapacitorStorage".
private const val PREFS = "CapacitorStorage"
private const val KEY = "togethernow.widget.snapshot"

private data class Side(val name: String, val emoji: String, val label: String)
private data class Snapshot(val couple: String, val me: Side, val them: Side)

private fun readSnapshot(context: Context): Snapshot? = runCatching {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
        ?: return null
    val json = JSONObject(raw)
    fun side(key: String): Side {
        val o = json.getJSONObject(key)
        return Side(o.optString("name"), o.optString("emoji", "…"), o.optString("label", ""))
    }
    Snapshot(json.optString("couple", "Together Now"), side("me"), side("them"))
}.getOrNull()

class MoodWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: androidx.glance.GlanceId) {
        val snapshot = readSnapshot(context)
        provideContent { Content(snapshot) }
    }

    @Composable
    private fun Content(snapshot: Snapshot?) {
        Column(GlanceModifier.padding(12.dp).background(Color(0xFFFDF8F4))) {
            Text(
                snapshot?.couple ?: "Together Now",
                style = TextStyle(color = ColorProvider(Color(0xFF6B5B57))),
            )
            Row(GlanceModifier.padding(top = 6.dp)) {
                Text("${snapshot?.me?.emoji ?: "➕"} ${snapshot?.me?.label ?: "Check in"}   ")
                Text("${snapshot?.them?.emoji ?: "…"} ${snapshot?.them?.label ?: "No check-in"}")
            }
            Row(GlanceModifier.padding(top = 10.dp)) {
                listOf("😞", "😕", "😐", "🙂", "😍").forEachIndexed { i, emoji ->
                    Text(
                        "$emoji  ",
                        modifier = GlanceModifier.clickable(
                            actionStartActivity(
                                Intent(
                                    Intent.ACTION_VIEW,
                                    Uri.parse("togethernow://mood?score=${i + 1}"),
                                ),
                            ),
                        ),
                    )
                }
            }
        }
    }
}

class MoodWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = MoodWidget()
}