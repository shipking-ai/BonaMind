//! The Microsoft Store build: the same exe, run from an MSIX package
//! (`scripts/package-msix.mjs`). Inside a package Windows keeps registry
//! writes private to the app, so the Run key the autostart plugin writes does
//! nothing; Start with Windows goes through the package's startup task
//! instead. The Store also updates the app itself, so the updater stays off,
//! and toasts must carry the package's AppUserModelID.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Declared as `desktop:StartupTask TaskId` by scripts/package-msix.mjs.
pub const STARTUP_TASK_ID: &str = "BonaMindStartup";

/// How this copy was installed, as the web layer sees it.
pub fn install_source(packaged: bool) -> &'static str {
    if packaged {
        "store"
    } else {
        "installer"
    }
}

/// Running from an MSIX package (the Store build, or a local test package).
#[cfg(windows)]
pub fn is_packaged() -> bool {
    use std::sync::OnceLock;
    use windows::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
    use windows::Win32::Storage::Packaging::Appx::GetCurrentPackageFullName;
    static PACKAGED: OnceLock<bool> = OnceLock::new();
    *PACKAGED.get_or_init(|| {
        let mut len = 0u32;
        // A packaged process is told its name needs a bigger buffer; any
        // other process gets APPMODEL_ERROR_NO_PACKAGE.
        let rc = unsafe { GetCurrentPackageFullName(&mut len, None) };
        rc == ERROR_INSUFFICIENT_BUFFER
    })
}

#[cfg(not(windows))]
pub fn is_packaged() -> bool {
    false
}

/// The package's AppUserModelID (`<family name>!BonaMind`), which toasts
/// from a packaged app must use. None outside a package.
#[cfg(windows)]
pub fn app_user_model_id() -> Option<String> {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::Storage::Packaging::Appx::GetCurrentApplicationUserModelId;
    if !is_packaged() {
        return None;
    }
    let mut len = 0u32;
    let _ = unsafe { GetCurrentApplicationUserModelId(&mut len, None) };
    if len == 0 {
        return None;
    }
    let mut buf = vec![0u16; len as usize];
    if unsafe { GetCurrentApplicationUserModelId(&mut len, Some(PWSTR(buf.as_mut_ptr()))) } != ERROR_SUCCESS {
        return None;
    }
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16(&buf[..end]).ok()
}

#[cfg(not(windows))]
pub fn app_user_model_id() -> Option<String> {
    None
}

/// Windows started this copy through the startup task (Start with Windows),
/// so it belongs in the tray, like `--hidden` for the installer build.
#[cfg(windows)]
pub fn launched_at_startup() -> bool {
    use windows::ApplicationModel::Activation::ActivationKind;
    use windows::ApplicationModel::AppInstance;
    is_packaged()
        && AppInstance::GetActivatedEventArgs()
            .and_then(|args| args.Kind())
            .is_ok_and(|kind| kind == ActivationKind::StartupTask)
}

#[cfg(not(windows))]
pub fn launched_at_startup() -> bool {
    false
}

#[cfg(windows)]
fn task_is_on(state: windows::ApplicationModel::StartupTaskState) -> bool {
    use windows::ApplicationModel::StartupTaskState;
    state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy
}

#[cfg(windows)]
fn startup_task() -> windows::core::Result<windows::ApplicationModel::StartupTask> {
    use windows::core::HSTRING;
    windows::ApplicationModel::StartupTask::GetAsync(&HSTRING::from(STARTUP_TASK_ID))?.get()
}

/// Whether BonaMind starts with Windows. These calls wait on Windows, so
/// keep them off the main thread.
pub fn autostart_enabled(app: &AppHandle) -> bool {
    #[cfg(windows)]
    if is_packaged() {
        return startup_task().and_then(|t| t.State()).is_ok_and(task_is_on);
    }
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// Turn Start with Windows on or off; returns the state Windows reports
/// afterwards. A task the user turned off in Settings → Apps → Startup stays
/// off: only they can turn it back on there.
pub fn set_autostart(app: &AppHandle, enabled: bool) -> bool {
    #[cfg(windows)]
    if is_packaged() {
        if let Ok(task) = startup_task() {
            let _ = if enabled {
                task.RequestEnableAsync().and_then(|op| op.get()).map(|_| ())
            } else {
                task.Disable()
            };
        }
        return autostart_enabled(app);
    }
    let launcher = app.autolaunch();
    let _ = if enabled { launcher.enable() } else { launcher.disable() };
    launcher.is_enabled().unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_web_layer_hears_store_only_from_a_package() {
        assert_eq!(install_source(true), "store");
        assert_eq!(install_source(false), "installer");
    }

    #[test]
    fn cargo_test_is_not_packaged() {
        assert!(!is_packaged());
        assert_eq!(app_user_model_id(), None);
        assert!(!launched_at_startup());
    }

    #[cfg(windows)]
    #[test]
    fn only_enabled_tasks_count_as_on() {
        use windows::ApplicationModel::StartupTaskState as S;
        assert!(task_is_on(S::Enabled));
        assert!(task_is_on(S::EnabledByPolicy));
        assert!(!task_is_on(S::Disabled));
        assert!(!task_is_on(S::DisabledByUser));
        assert!(!task_is_on(S::DisabledByPolicy));
    }

    #[test]
    fn the_task_id_is_a_valid_manifest_id() {
        assert!(STARTUP_TASK_ID.chars().all(|c| c.is_ascii_alphanumeric()));
    }
}
