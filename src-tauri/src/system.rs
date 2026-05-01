use crate::models::resolve::RuntimeMetrics;
use crate::storage::settings::RuntimeSettings;

#[cfg(target_os = "windows")]
use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

pub struct MemorySnapshot {
    pub total_gb: f32,
    pub available_gb: f32,
}

#[cfg(target_os = "windows")]
pub fn memory_snapshot() -> MemorySnapshot {
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

    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok == 0 {
        return MemorySnapshot {
            total_gb: 0.0,
            available_gb: 0.0,
        };
    }

    MemorySnapshot {
        total_gb: bytes_to_gb(status.ullTotalPhys),
        available_gb: bytes_to_gb(status.ullAvailPhys),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn memory_snapshot() -> MemorySnapshot {
    MemorySnapshot {
        total_gb: 0.0,
        available_gb: 0.0,
    }
}

#[cfg(target_os = "windows")]
pub fn cpu_usage_percent() -> f32 {
    use std::{thread, time::Duration};
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::System::Threading::GetSystemTimes;

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
        let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
        if ok == 0 {
            return None;
        }
        Some((
            filetime_to_u64(idle),
            filetime_to_u64(kernel),
            filetime_to_u64(user),
        ))
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
    let kernel = second.1.saturating_sub(first.1) as f32;
    let user = second.2.saturating_sub(first.2) as f32;
    let total = kernel + user;
    if total <= 0.0 {
        0.0
    } else {
        ((total - idle) / total * 100.0).clamp(0.0, 100.0)
    }
}

#[cfg(not(target_os = "windows"))]
pub fn cpu_usage_percent() -> f32 {
    0.0
}

#[cfg(target_os = "windows")]
fn filetime_to_u64(value: windows_sys::Win32::Foundation::FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

fn bytes_to_gb(value: u64) -> f32 {
    value as f32 / 1024.0 / 1024.0 / 1024.0
}

pub fn build_runtime_metrics(settings: &RuntimeSettings) -> RuntimeMetrics {
    let cpu_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(1);
    let memory = memory_snapshot();
    let cpu_usage_percent = cpu_usage_percent();
    let pressure =
        if cpu_usage_percent >= settings.max_cpu_percent as f32 || memory.available_gb < 4.0 {
            "high"
        } else if cpu_usage_percent >= 45.0 || memory.available_gb < 8.0 {
            "medium"
        } else {
            "low"
        }
        .to_string();

    let recommended = crate::models::resolve::recommend_model(settings, &pressure, memory.available_gb);
    RuntimeMetrics {
        cpu_count,
        cpu_usage_percent,
        total_memory_gb: memory.total_gb,
        available_memory_gb: memory.available_gb,
        pressure,
        recommended_model_id: recommended.as_ref().map(|model| model.id.clone()),
        recommended_reason: recommended
            .map(|model| {
                format!(
                    "recommended {} ({:.1}B, {}) for current load",
                    model.label, model.params_b, model.quant
                )
            })
            .unwrap_or_else(|| {
                "no available model registered; download or add a GGUF model first".to_string()
            }),
    }
}

pub fn runtime_plan(metrics: &RuntimeMetrics, settings: &RuntimeSettings) -> serde_json::Value {
    let cpu_count = metrics.cpu_count.max(1);
    let pressure_high = metrics.pressure == "high";
    let max_threads = if pressure_high || settings.prefer_low_power {
        (cpu_count / 2).max(2)
    } else {
        (cpu_count.saturating_sub(1)).max(2)
    };
    let context_size = if pressure_high || metrics.available_memory_gb < 6.0 {
        2048
    } else {
        4096
    };

    serde_json::json!({
        "maxThreads": max_threads,
        "contextSize": context_size,
        "batchSize": if context_size <= 2048 { 128 } else { 256 },
        "gpu": if pressure_high { serde_json::Value::Bool(false) } else { serde_json::Value::String("auto".to_string()) },
        "cpuLimitPercent": settings.max_cpu_percent,
        "pressure": metrics.pressure,
    })
}
