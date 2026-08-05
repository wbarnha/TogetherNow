//  TogetherNowWidget.swift
//  Add to an iOS "Widget Extension" target in ios/App/App.xcodeproj.
//  Both the app target and the widget target must join the App Group
//  "group.io.github.wbarnha.togethernow" (Signing & Capabilities > App Groups).

import WidgetKit
import SwiftUI

private let appGroup = "group.io.github.wbarnha.togethernow"
// Capacitor Preferences prefixes keys with "CapacitorStorage."
private let snapshotKey = "CapacitorStorage.togethernow.widget.snapshot"

struct MoodSide: Decodable {
    let name: String
    let score: Int?
    let emoji: String
    let label: String
    let note: String?
}

struct Snapshot: Decodable {
    let couple: String
    let me: MoodSide
    let them: MoodSide
    let streak: Int
}

struct MoodEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> MoodEntry { MoodEntry(date: Date(), snapshot: nil) }

    func getSnapshot(in context: Context, completion: @escaping (MoodEntry) -> Void) {
        completion(MoodEntry(date: Date(), snapshot: load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MoodEntry>) -> Void) {
        let entry = MoodEntry(date: Date(), snapshot: load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func load() -> Snapshot? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: snapshotKey),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }
}

struct TogetherNowWidgetView: View {
    var entry: MoodEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(entry.snapshot?.couple ?? "Together Now")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)

            HStack(spacing: 12) {
                side(entry.snapshot?.me, fallbackName: "You")
                side(entry.snapshot?.them, fallbackName: "Them")
            }

            // Tapping a face deep-links into the app and logs that mood.
            HStack(spacing: 6) {
                ForEach(Array(["😞", "😕", "😐", "🙂", "😍"].enumerated()), id: \.offset) { i, emoji in
                    Link(destination: URL(string: "togethernow://mood?score=\(i + 1)")!) {
                        Text(emoji).font(.title3).frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .padding()
        .containerBackground(for: .widget) { Color(.systemBackground) }
    }

    @ViewBuilder
    private func side(_ s: MoodSide?, fallbackName: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s?.name ?? fallbackName).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
            Text(s?.emoji ?? "…").font(.title)
            Text(s?.label ?? "No check-in").font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

@main
struct TogetherNowWidget: Widget {
    let kind = "TogetherNowMoodWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            TogetherNowWidgetView(entry: entry)
        }
        .configurationDisplayName("Mood check-in")
        .description("See both moods and log yours in one tap.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}