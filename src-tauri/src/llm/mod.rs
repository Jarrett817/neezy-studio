// Ollama 进程管理模块
// 前端直接通过 HTTP API 与 Ollama 交互（http://127.0.0.1:11434）

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};
use tokio::time::{sleep, Duration};

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

/// 检查 Ollama 服务是否正在运行（同步版本）
pub fn is_server_running() -> bool {
    // 使用 std::net::TcpStream 测试连接，避免 reqwest 阻塞问题
    use std::net::TcpStream;
    match TcpStream::connect_timeout(
        &"127.0.0.1:11434".parse().unwrap(),
        std::time::Duration::from_secs(2),
    ) {
        Ok(_) => true,
        Err(_) => false,
    }
}

/// 检查我们是否已启动过 Ollama
pub fn is_managed() -> bool {
    OLLAMA_STARTED.load(Ordering::SeqCst)
}

/// 启动 Ollama 服务（异步）
pub async fn ensure_ollama_running(app: &AppHandle) -> Result<(), String> {
    log::info!("[Ollama] ensure_ollama_running 被调用");

    // 如果已经在运行，就不用管了
    log::info!("[Ollama] 检查服务是否运行中...");
    if is_server_running() {
        log::info!("[Ollama] 服务已在运行");
        OLLAMA_STARTED.store(true, Ordering::SeqCst);
        return Ok(());
    }

    // 如果我们已经启动了进程但服务没在运行，先清理
    if OLLAMA_STARTED.load(Ordering::SeqCst) {
        log::info!("[Ollama] 清理之前的进程");
        stop_ollama();
    }

    let ollama_path = get_ollama_path(app)?;
    log::info!("[Ollama] 找到 Ollama 路径: {:?}", ollama_path);

    log::info!("[Ollama] 正在启动 Ollama...");
    let child = Command::new(&ollama_path)
        .arg("serve")
        .spawn()
        .map_err(|e| format!("[Ollama] 启动失败: {}", e))?;

    log::info!("[Ollama] 进程已 spawn，PID: {:?}", child.id());
    let _ = OLLAMA_PROCESS.get_or_init(|| Mutex::new(Some(child)));

    // 等待服务就绪（使用异步睡眠）
    for i in 0..60 {
        log::info!("[Ollama] 等待服务就绪... ({})", i + 1);
        sleep(Duration::from_secs(1)).await;
        if is_server_running() {
            log::info!("[Ollama] 服务启动成功!");
            OLLAMA_STARTED.store(true, Ordering::SeqCst);
            return Ok(());
        }
    }

    log::error!("[Ollama] 60秒内未能启动");
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
