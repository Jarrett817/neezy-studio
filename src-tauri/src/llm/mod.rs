// Ollama 进程管理模块
// 前端直接通过 HTTP API 与 Ollama 交互（http://127.0.0.1:11434）

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

static OLLAMA_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static OLLAMA_STARTED: AtomicBool = AtomicBool::new(false);

const OLLAMA_HOST: &str = "http://127.0.0.1:11434";

/// 获取 Ollama 二进制文件路径
pub fn get_ollama_path(app: &AppHandle) -> Result<PathBuf, String> {
    // 首先检查资源目录（打包的 Ollama）
    if let Ok(resource_dir) = app.path().resource_dir() {
        #[cfg(target_os = "windows")]
        let ollama_exe = resource_dir.join("resources").join("windows").join("ollama.exe");
        #[cfg(target_os = "macos")]
        let ollama_exe = resource_dir
            .join("Contents")
            .join("Resources")
            .join("resources")
            .join("macos")
            .join("ollama");
        #[cfg(target_os = "linux")]
        let ollama_exe = resource_dir.join("resources").join("linux").join("ollama");

        if ollama_exe.exists() {
            return Ok(ollama_exe);
        }
    }

    // 回退：检查可执行文件旁边
    if let Ok(exe_path) = std::env::current_exe() {
        #[cfg(target_os = "windows")]
        let ollama_exe = exe_path.parent().unwrap().join("ollama.exe");
        #[cfg(not(target_os = "windows"))]
        let ollama_exe = exe_path.parent().unwrap().join("ollama");

        if ollama_exe.exists() {
            return Ok(ollama_exe);
        }
    }

    // 最后回退：PATH 中的 ollama
    #[cfg(target_os = "windows")]
    let ollama_exe = PathBuf::from("ollama.exe");
    #[cfg(not(target_os = "windows"))]
    let ollama_exe = PathBuf::from("ollama");

    if ollama_exe.exists() {
        return Ok(ollama_exe);
    }

    Err("Ollama binary not found".to_string())
}

/// 检查 Ollama 服务是否正在运行
pub fn is_server_running() -> bool {
    if let Ok(client) = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build()
    {
        client.get(OLLAMA_HOST).send().is_ok()
    } else {
        false
    }
}

/// 检查我们是否已启动过 Ollama
pub fn is_managed() -> bool {
    OLLAMA_STARTED.load(Ordering::SeqCst)
}

/// 启动 Ollama 服务
pub fn ensure_ollama_running(app: &AppHandle) -> Result<(), String> {
    // 如果已经在运行，就不用管了
    if is_server_running() {
        OLLAMA_STARTED.store(true, Ordering::SeqCst);
        return Ok(());
    }

    // 如果我们已经启动了进程但服务没在运行，先清理
    if OLLAMA_STARTED.load(Ordering::SeqCst) {
        stop_ollama();
    }

    let ollama_path = get_ollama_path(app)?;
    log::info!("Starting Ollama from: {:?}", ollama_path);

    let child = Command::new(&ollama_path)
        .arg("serve")
        .spawn()
        .map_err(|e| format!("failed to start Ollama: {}", e))?;

    let _ = OLLAMA_PROCESS.get_or_init(|| Mutex::new(Some(child)));

    // 等待服务就绪
    for i in 0..60 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if is_server_running() {
            log::info!("Ollama server started successfully");
            OLLAMA_STARTED.store(true, Ordering::SeqCst);
            return Ok(());
        }
        log::info!("Waiting for Ollama... ({})", i + 1);
    }

    Err("Ollama failed to start within 60 seconds".to_string())
}

/// 停止 Ollama 服务
pub fn stop_ollama() {
    if let Some(process) = OLLAMA_PROCESS.get() {
        if let Ok(mut guard) = process.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
    OLLAMA_STARTED.store(false, Ordering::SeqCst);
    log::info!("Ollama stopped");
}

/// 获取 Ollama 服务器地址
pub fn get_ollama_host() -> &'static str {
    OLLAMA_HOST
}

/// 取消生成（Ollama 原生支持通过 HTTP 请求取消）
pub fn cancel_generation() {
    // Ollama 不需要显式取消，HTTP 请求可以被中断
    // 保留此函数以保持 API 兼容性
}

// ============== 为兼容旧代码保留的存根 ==============
// 注意：embedding 功能已移至前端，通过 Ollama /api/embeddings 实现

#[derive(Clone)]
pub struct RuntimeModel {
    pub path: String,
    pub file: Option<String>,
    pub tokenizer_repo: Option<String>,
}

pub async fn embed_texts(
    _model: RuntimeModel,
    _texts: Vec<String>,
) -> Result<Vec<Vec<f32>>, String> {
    // Embedding 功能已移至前端 (Ollama npm 包)
    // 返回空结果，避免中断知识库流程
    Ok(Vec::new())
}
