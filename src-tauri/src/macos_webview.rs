use objc2::{msg_send, rc::Retained, runtime::Bool, sel, ClassType};
use objc2_foundation::{ns_string, NSArray, NSObject, NSObjectProtocol, NSString};
use objc2_web_kit::{WKPreferences, WKWebView};

/// Uses private WebKit API; not suitable for Mac App Store distribution.
pub fn disable_60fps_preference(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    // SAFETY: Tauri provides a live WKWebView on the main thread. Selectors
    // match WKPreferencesPrivate.h / _WKFeature.h; check API availability first.
    window.with_webview(|webview| unsafe {
        let webview = &*webview.inner().cast::<WKWebView>();
        let preferences = webview.configuration().preferences();
        let available: Bool =
            msg_send![WKPreferences::class(), respondsToSelector: sel!(_features)];
        if !available.as_bool() || !preferences.respondsToSelector(sel!(_setEnabled:forFeature:)) {
            return;
        }
        let features: Option<Retained<NSArray<NSObject>>> =
            msg_send![WKPreferences::class(), _features];
        let Some(features) = features else { return };
        for feature in features.iter() {
            let key: Retained<NSString> = msg_send![&feature, key];
            if key.isEqualToString(ns_string!("PreferPageRenderingUpdatesNear60FPSEnabled")) {
                let _: () = msg_send![&preferences, _setEnabled: Bool::NO, forFeature: &*feature];
                break;
            }
        }
    })
}
