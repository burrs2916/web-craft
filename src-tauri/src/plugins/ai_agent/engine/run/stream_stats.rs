#![allow(dead_code)]

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::super::types::{AgentStatusEvent, StreamStats};
use super::super::AgentEngine;

/// 流式速率统计的句柄：持有后台任务与共享字符计数器。
pub(super) struct StreamTicker {
    pub(super) handle: tokio::task::JoinHandle<()>,
    pub(super) chars: Arc<AtomicUsize>,
}

impl AgentEngine {
    /// 启动流式速率统计后台任务：每 500ms 向 on_status 推送一次速率统计，
    /// 持续运行直到调用方 abort（支持大模型长时间加载）。
    pub(super) fn spawn_stream_stats<O>(&self, on_status: Arc<O>, iteration: u32) -> StreamTicker
    where
        O: Fn(AgentStatusEvent) + Send + Sync + 'static,
    {
        let stream_start = Instant::now();
        let stream_chars = Arc::new(AtomicUsize::new(0));
        let chars_for_task = stream_chars.clone();
        let max_iter_val = self.max_iterations as u32;

        let handle = tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_millis(500)).await;
                let current_chars = chars_for_task.load(Ordering::Relaxed);
                let elapsed_ms = stream_start.elapsed().as_millis() as u64;
                if elapsed_ms == 0 {
                    continue;
                }
                let chars_per_sec = (current_chars as f64) / (elapsed_ms as f64 / 1000.0);
                let tokens_per_sec = chars_per_sec / 4.0;
                let tokens_estimated = current_chars / 4;

                let detail = if current_chars == 0 {
                    // 还没有收到任何数据，模型可能在加载中（尤其是本地大模型）
                    let waited_secs = elapsed_ms / 1000;
                    if waited_secs < 10 {
                        "正在连接模型...".to_string()
                    } else if waited_secs < 60 {
                        format!("模型加载中... 已等待 {}s", waited_secs)
                    } else if waited_secs < 300 {
                        format!("模型加载中（大模型可能需要 1-5 分钟）... 已等待 {}s", waited_secs)
                    } else {
                        let mins = waited_secs / 60;
                        let secs = waited_secs % 60;
                        format!("模型加载中，请耐心等待... 已等待 {}m {}s", mins, secs)
                    }
                } else {
                    format!("生成中... {:.1} tok/s", tokens_per_sec)
                };

                (on_status.as_ref())(AgentStatusEvent {
                    status: "thinking".to_string(),
                    iteration,
                    max_iterations: max_iter_val,
                    detail: Some(detail),
                    stream_stats: Some(StreamStats {
                        chars_total: current_chars,
                        tokens_estimated,
                        chars_per_sec,
                        tokens_per_sec,
                        elapsed_ms,
                    }),
                    context_usage: None,
                });
            }
        });

        StreamTicker {
            handle,
            chars: stream_chars,
        }
    }
}