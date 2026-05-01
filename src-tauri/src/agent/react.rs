// ReAct Agent 已移至前端 - 此文件保留以避免编译错误

use tauri::AppHandle;

pub async fn run_react(_app: &AppHandle, _context: super::super::ReActContext) -> Result<String, String> {
    Err("ReAct agent 已移至前端".to_string())
}

pub struct ReActContext {
    pub topic: String,
    pub goal: String,
}