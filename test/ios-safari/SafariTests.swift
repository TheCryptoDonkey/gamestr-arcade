import XCTest

final class SafariTests: XCTestCase {
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    private func open(_ label: String) {
        let host = XCUIApplication()
        host.launch()
        host.descendants(matching: .any).matching(identifier: label).firstMatch.tap()
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20))
        if safari.buttons["Continue"].waitForExistence(timeout: 3) { safari.buttons["Continue"].tap() }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: safari.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testGuestAndOwnSignerChoicesInSafari() {
        open("Open arcade in Safari")
        let connect = safari.buttons["CONNECT NOSTR"]
        XCTAssertTrue(connect.waitForExistence(timeout: 30))
        connect.tap()
        safari.buttons["Pair a phone (Signet or Cambium)"].tap()
        let signet = safari.buttons.matching(NSPredicate(format: "label BEGINSWITH 'My Signet'")).firstMatch
        let cambium = safari.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cambium'")).firstMatch
        let another = safari.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Another Nostr signer'")).firstMatch
        XCTAssertTrue(signet.waitForExistence(timeout: 10))
        XCTAssertTrue(cambium.exists)
        XCTAssertTrue(another.exists)
        XCTAssertLessThan(signet.frame.minY, cambium.frame.minY)
        XCTAssertLessThan(cambium.frame.minY, another.frame.minY)
        capture("iphone-signer-choices")
        safari.buttons["Play as guest"].tap()
        XCTAssertTrue(connect.waitForExistence(timeout: 10))
        XCTAssertFalse(safari.buttons["Play as guest"].exists)
        capture("iphone-guest")
    }

    func testCambiumExplainsAndroidRequirementInSafari() {
        open("Open Cambium invitation in Safari")
        XCTAssertTrue(safari.staticTexts["Connect with Cambium."].waitForExistence(timeout: 30))
        XCTAssertTrue(safari.staticTexts["A confirmation code will appear after you approve."].exists)
        XCTAssertTrue(safari.staticTexts["Cambium needs an Android phone. On the TV, choose My Signet, another Nostr signer, or guest play."].exists)
        XCTAssertFalse(safari.links["Approve with Cambium"].exists)
        capture("iphone-cambium-guidance")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(safari.staticTexts["Connect with Cambium."].waitForExistence(timeout: 10))
        capture("iphone-cambium-landscape")
    }
}
