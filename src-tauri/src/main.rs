// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            app_lib::get_build_info,
            app_lib::ensure_ollama_running,
            app_lib::is_ollama_running,
            app_lib::stop_ollama,
            app_lib::get_ollama_host,
            app_lib::get_runtime_settings,
            app_lib::save_runtime_settings,
            app_lib::get_runtime_metrics,
            app_lib::get_workspace_snapshot,
            app_lib::get_account_profile,
            app_lib::save_account_profile,
            app_lib::get_relevant_knowledge,
            app_lib::list_knowledge_items,
            app_lib::save_knowledge_item,
            app_lib::delete_knowledge_item,
            app_lib::list_skills,
            app_lib::save_skill,
            app_lib::set_skill_enabled,
            app_lib::delete_skill,
            app_lib::add_memory_event,
            app_lib::save_pasted_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}