import SwiftUI

// This disposable harness opens the real Safari app. It contains no signer key.
@main
struct SafariHarness: App {
    private var cambiumURL: URL {
        let now = Date().timeIntervalSince1970
        let fields: [Any] = [String(repeating: "a", count: 64), String(repeating: "b", count: 64), String(repeating: "c", count: 64), Int(now), Int((now + 300) * 1000), "Gamestr"]
        let data = try! JSONSerialization.data(withJSONObject: fields)
        let compact = data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return URL(string: "http://127.0.0.1:4174/phone-pair/#pairing=\(compact)")!
    }

    var body: some Scene {
        WindowGroup {
            VStack {
                Link("Open arcade in Safari", destination: URL(string: "http://127.0.0.1:4174/")!)
                    .accessibilityIdentifier("Open arcade in Safari")
                Link("Open Cambium invitation in Safari", destination: cambiumURL)
                    .accessibilityIdentifier("Open Cambium invitation in Safari")
            }
        }
    }
}
