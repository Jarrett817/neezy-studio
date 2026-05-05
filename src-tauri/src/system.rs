use tauri::AppHandle;

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::SystemInformation::{
    GetSystemInfo, GlobalMemoryStatusEx, MEMORYSTATUSEX, SYSTEM_INFO,
};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::FILETIME;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::GetSystemTimes;

#[cfg(target_os = "windows")]
pub fn memory_snapshot() -> (f32, f32) {
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        dwMemoryLoad: 0,
        ullTotalPhys: 0,
        ullAvailPhys: 0,
        ullTotalPageFile: 0,
        ullAvailPageFile: 0,
        ullTotalVirtual: 0,
        ullAvailVirtual: 0,
        ullAvailExtendedVirtual: 0,
    };
    unsafe {
        if GlobalMemoryStatusEx(&mut status) == 0 {
            return (0.0, 0.0);
        }
    }
    let total = status.ullTotalPhys as f32 / (1024.0 * 1024.0 * 1024.0);
    let available = status.ullAvailPhys as f32 / (1024.0 * 1024.0 * 1024.0);
    (total, available)
}

#[cfg(not(target_os = "windows"))]
pub fn memory_snapshot() -> (f32, f32) {
    (8.0, 4.0)
}

#[cfg(target_os = "windows")]
pub fn cpu_usage_percent() -> f32 {
    use std::{thread, time::Duration};
    fn read_times() -> Option<(u64, u64, u64)> {
        let mut idle = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut kernel = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let mut user = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        unsafe {
            if GetSystemTimes(&mut idle, &mut kernel, &mut user) == 0 {
                return None;
            }
        }
        let to_u64 = |ft: FILETIME| ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64;
        Some((to_u64(idle), to_u64(kernel), to_u64(user)))
    }
    let first = match read_times() {
        Some(v) => v,
        None => return 0.0,
    };
    thread::sleep(Duration::from_millis(120));
    let second = match read_times() {
        Some(v) => v,
        None => return 0.0,
    };
    let idle = second.0.saturating_sub(first.0) as f32;
    let total = (second.1.saturating_sub(first.1) + second.2.saturating_sub(first.2)) as f32;
    if total <= 0.0 {
        0.0
    } else {
        ((total - idle) / total * 100.0).clamp(0.0, 100.0)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn cpu_usage_percent() -> f32 {
    45.0
}

#[cfg(target_os = "windows")]
pub fn get_cpu_count() -> usize {
    unsafe {
        let mut info: SYSTEM_INFO = std::mem::zeroed();
        GetSystemInfo(&mut info);
        info.dwNumberOfProcessors as usize
    }
}

#[cfg(not(target_os = "windows"))]
pub fn get_cpu_count() -> usize {
    std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(1)
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeMetrics {
    pub cpu_count: usize,
    pub cpu_usage_percent: f32,
    pub total_memory_gb: f32,
    pub available_memory_gb: f32,
    pub pressure: String,
    pub recommended_model_id: Option<String>,
    pub recommended_reason: String,
}

pub fn build_runtime_metrics(_app: &AppHandle) -> RuntimeMetrics {
    let cpu_count = get_cpu_count();
    let (total_mem, avail_mem) = memory_snapshot();
    let cpu_usage = cpu_usage_percent();
    let pressure = if cpu_usage >= 70.0 || avail_mem < 4.0 {
        "high"
    } else if cpu_usage >= 45.0 || avail_mem < 8.0 {
        "medium"
    } else {
        "low"
    }
    .to_string();
    let recommended = if avail_mem >= 16.0 {
        "qwen3:4b"
    } else if avail_mem >= 8.0 {
        "qwen3:1.7b"
    } else {
        "qwen3:0.5b"
    };
    RuntimeMetrics {
        cpu_count,
        cpu_usage_percent: cpu_usage,
        total_memory_gb: total_mem,
        available_memory_gb: avail_mem,
        pressure,
        recommended_model_id: Some(recommended.to_string()),
        recommended_reason: format!("基于 {:.1}GB 可用内存", avail_mem),
    }
}
