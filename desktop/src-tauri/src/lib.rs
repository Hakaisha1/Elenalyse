use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let screen_size = monitor.size();
                    let scale_factor = monitor.scale_factor();
                    if let Ok(win_size) = window.outer_size() {
                        let x = (24.0 * scale_factor) as i32;
                        let taskbar_margin = (52.0 * scale_factor) as u32;
                        let y = (screen_size.height as i32) - (win_size.height as i32) - (taskbar_margin as i32);
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y.max(0)));
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
