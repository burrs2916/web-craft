#![allow(dead_code)]

use std::sync::Arc;
use async_trait::async_trait;
use serde_json::Value;

use super::provider::{ChatMessage, ChatOptions, ChatResponse, ProviderConfig, LlmProvider};

/// Ollama 原生 API Provider
/// 充分利用 Ollama 原生 /api/chat 接口特性：
/// - 原生 tools 支持
/// - keep_alive 模型保活
/// - options 精细参数控制（num_ctx, num_predict 等）
/// - 原生 thinking/推理过程输出
/// - load_duration / eval_duration 等性能指标
pub struct OllamaProvider {
    config: ProviderConfig,
    /// 流式客户端（无全局超时，首字节/空闲超时在循环内控制）
    stream_client: reqwest::Client,
    /// 普通请求客户端
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(config: ProviderConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .connect_timeout(std::time::Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        // 流式客户端：仅连接超时，流式循环内做空闲超时
        let stream_client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        OllamaProvider {
            config,
            client,
            stream_client,
        }
    }

    /// 构建 /api/chat URL
    fn build_chat_url(&self) -> String {
        let base = self.config.base_url.trim_end_matches('/');
        // 如果 base_url 已经包含 /api/chat 或 /v1，规范化为 /api/chat
        if base.ends_with("/api/chat") {
            base.to_string()
        } else if base.ends_with("/v1") || base.ends_with("/v1/chat/completions") {
            // OpenAI 兼容路径转换为原生路径
            base.trim_end_matches("/v1/chat/completions")
                .trim_end_matches("/v1")
                .to_string() + "/api/chat"
        } else {
            format!("{}/api/chat", base)
        }
    }

    /// 将 HTTP 错误转换为用户友好的中文错误提示
    fn map_http_error(&self, err: &reqwest::Error, model_name: &str) -> String {
        let base = self.config.base_url.trim_end_matches('/');

        if err.is_connect() {
            return format!(
                "无法连接到 Ollama 服务（{}）。\n\
                 请确保 Ollama 已启动并运行在正确的端口。\n\
                 您可以运行 'ollama serve' 启动服务，或检查 base_url 配置是否正确。",
                base
            );
        }

        if err.is_timeout() {
            return format!(
                "Ollama 请求超时。\n\
                 模型加载超时可能是因为模型较大（{}）或系统资源不足。\n\
                 建议：\n\
                 1. 确保模型已通过 'ollama pull {}' 下载\n\
                 2. 检查系统内存/GPU 是否充足\n\
                 3. 尝试使用更小的模型",
                model_name, model_name
            );
        }

        if let Some(status) = err.status() {
            if status == reqwest::StatusCode::NOT_FOUND {
                return format!(
                    "模型未找到：{}\n\
                     请先运行 'ollama pull {}' 下载模型，或检查模型名称是否正确。",
                    model_name, model_name
                );
            }
            if status == reqwest::StatusCode::INTERNAL_SERVER_ERROR {
                return format!(
                    "Ollama 服务内部错误（模型：{}）。\n\
                     可能是模型加载失败或内存不足。请检查 Ollama 日志获取详细信息。",
                    model_name
                );
            }
            if status == reqwest::StatusCode::BAD_REQUEST {
                return format!(
                    "Ollama 请求参数错误（模型：{}）。\n\
                     请检查模型名称和参数配置是否正确。",
                    model_name
                );
            }
        }

        format!("Ollama HTTP 请求失败: {}", err)
    }

    /// 将 API 错误响应转换为用户友好的提示
    fn map_api_error(&self, status: reqwest::StatusCode, body: &str, model_name: &str) -> String {
        let body_lower = body.to_lowercase();

        if status == reqwest::StatusCode::NOT_FOUND
            || body_lower.contains("model not found")
            || body_lower.contains("model is not found") {
            return format!(
                "模型未找到：{}\n\
                 请先运行 'ollama pull {}' 下载模型，或检查模型名称是否正确。\n\
                 原始错误：{}",
                model_name, model_name, body
            );
        }

        if body_lower.contains("out of memory") || body_lower.contains("out of vram") {
            return format!(
                "模型加载失败：内存不足（模型：{}）。\n\
                 请尝试：\n\
                 1. 使用更小的模型或更低的量化级别\n\
                 2. 关闭其他占用内存的程序\n\
                 3. 调整 num_gpu 参数减少 GPU 显存占用",
                model_name
            );
        }

        format!("Ollama API 错误 {}: {}", status, body)
    }

    /// 检测是否为 Ollama 服务
    pub async fn check_ollama_service(base_url: &str) -> bool {
        let client = reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(3))
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_default();
        let base = base_url.trim_end_matches('/');
        // 尝试 Ollama 版本接口
        if let Ok(resp) = client.get(format!("{}/api/version", base)).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        // 尝试 tags 接口
        if let Ok(resp) = client.get(format!("{}/api/tags", base)).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        false
    }

    /// 预加载模型（让模型常驻内存，避免首次调用加载等待）
    /// keep_alive: 模型保活时间，如 "30m"、"1h"、"-1"（永久）
    pub async fn preload_model(&self, model: &str, keep_alive: &str) -> Result<(), String> {
        let url = self.build_chat_url();
        let body = serde_json::json!({
            "model": model,
            "messages": [],
            "stream": false,
            "keep_alive": keep_alive,
        });

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Preload HTTP error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Preload API error {}: {}", status, text));
        }

        Ok(())
    }

    /// 获取运行中的模型列表
    pub async fn list_running_models(&self) -> Result<Vec<Value>, String> {
        let base = self.config.base_url.trim_end_matches('/');
        let url = format!("{}/api/ps", base);

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let json: Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(json["models"].as_array().cloned().unwrap_or_default())
    }

    /// 获取 Ollama 服务版本信息
    pub async fn get_version(&self) -> Result<String, String> {
        let base = self.config.base_url.trim_end_matches('/');
        let url = format!("{}/api/version", base);

        let response = self.client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API error: {}", response.status()));
        }

        let json: Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(json["version"].as_str().unwrap_or("unknown").to_string())
    }

    /// 检查指定模型是否已加载到内存（通过 /api/ps 接口）
    pub async fn is_model_loaded(&self, model: &str) -> Result<bool, String> {
        let running_models = self.list_running_models().await?;
        for m in &running_models {
            if let Some(name) = m["name"].as_str() {
                // 匹配模型名，支持带 tag 和不带 tag 的情况
                if name == model || name.starts_with(&format!("{}:", model)) {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    /// 获取模型详细信息（大小、参数、量化等）
    pub async fn get_model_info(&self, model: &str) -> Result<Value, String> {
        let base = self.config.base_url.trim_end_matches('/');
        let url = format!("{}/api/show", base);

        let body = serde_json::json!({
            "name": model,
        });

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("API error {}: {}", status, text));
        }

        let json: Value = response.json().await.map_err(|e| e.to_string())?;
        Ok(json)
    }

    /// 构建 Ollama 格式的工具定义
    fn build_ollama_tools(tools: &Option<Vec<super::provider::ToolDefinition>>) -> Option<Vec<Value>> {
        let tools = tools.as_ref()?;
        if tools.is_empty() {
            return None;
        }
        let mut ollama_tools = Vec::new();
        for tool in tools {
            ollama_tools.push(serde_json::json!({
                "type": "function",
                "function": {
                    "name": tool.function.name,
                    "description": tool.function.description,
                    "parameters": tool.function.parameters,
                }
            }));
        }
        Some(ollama_tools)
    }

    /// 构建 Ollama 请求体（使用原生 API 格式）
    fn build_chat_body(&self, messages: &[ChatMessage], options: &ChatOptions, stream: bool) -> Value {
        // 转换消息格式：Ollama 原生格式
        let ollama_messages: Vec<Value> = messages.iter().map(|m| {
            let mut msg = serde_json::json!({
                "role": m.role,
                "content": m.content,
            });
            // 工具调用消息（assistant 角色）
            if let Some(tool_calls) = &m.tool_calls {
                if !tool_calls.is_empty() {
                    let tc_list: Vec<Value> = tool_calls.iter().map(|tc| {
                        // Ollama 原生格式：function 包含 name 和 arguments（JSON 对象）
                        let args_value = serde_json::from_str::<Value>(&tc.function.arguments)
                            .unwrap_or_else(|e| {
                                tracing::warn!(
                                    "Failed to parse tool call arguments as JSON: {}. \
                                    Function: {}, Raw arguments: {}",
                                    e, tc.function.name, tc.function.arguments
                                );
                                Value::Object(serde_json::Map::new())
                            });
                        serde_json::json!({
                            "function": {
                                "name": tc.function.name,
                                "arguments": args_value,
                            }
                        })
                    }).collect();
                    msg["tool_calls"] = Value::Array(tc_list);
                }
            }
            // tool 角色消息：Ollama 要求 role="tool" + content（工具返回结果字符串）
            // content 已经在上面设置了，这里确保 role 正确
            if m.role == "tool" {
                msg["role"] = Value::String("tool".to_string());
            }
            msg
        }).collect();

        let mut body = serde_json::json!({
            "model": options.model,
            "messages": ollama_messages,
            "stream": stream,
            // 模型保活：默认 30 分钟，让环境修复等长任务不用反复加载
            "keep_alive": "30m",
        });

        // Ollama 原生 options 参数
        let mut ollama_options = serde_json::json!({
            "temperature": options.temperature,
        });

        if options.max_tokens > 0 {
            ollama_options["num_predict"] = Value::from(options.max_tokens);
        }

        // num_ctx: 上下文窗口大小（0 表示使用模型默认，不传递）
        if options.num_ctx > 0 {
            ollama_options["num_ctx"] = Value::from(options.num_ctx);
        }

        // num_gpu: GPU 层数（-1 表示全部，是默认值，这里都传递）
        ollama_options["num_gpu"] = Value::from(options.num_gpu);

        // repeat_penalty: 重复惩罚
        ollama_options["repeat_penalty"] = Value::from(options.repeat_penalty);

        // top_p: 核采样参数
        ollama_options["top_p"] = Value::from(options.top_p);

        // top_k: top-k 采样
        ollama_options["top_k"] = Value::from(options.top_k);

        // seed: 随机种子（-1 表示随机）
        if options.seed >= 0 {
            ollama_options["seed"] = Value::from(options.seed);
        }

        body["options"] = ollama_options;

        // 工具定义（Ollama 原生格式）
        if let Some(tools) = Self::build_ollama_tools(&options.tools) {
            body["tools"] = Value::Array(tools);
        }

        // JSON mode: 如果 response_format 为 "json"，添加 format 参数
        if options.response_format == "json" {
            body["format"] = Value::String("json".to_string());
        }

        body
    }

    /// 解析 Ollama 流式响应的单个 chunk
    fn parse_ollama_chunk(&self, json: &Value) -> Option<super::provider::ChatChunk> {
        let message = &json["message"];
        if message.is_null() {
            return None;
        }

        let content = message["content"].as_str().map(|s| s.to_string());
        let reasoning_content = message["thinking"].as_str().map(|s| s.to_string());

        // Ollama 工具调用
        let tool_calls = if let Some(tc_list) = message["tool_calls"].as_array() {
            let mut deltas = Vec::new();
            for (idx, tc) in tc_list.iter().enumerate() {
                let func = &tc["function"];
                // arguments 在 Ollama 中是对象，需要转成字符串
                let args_str = func.get("arguments")
                    .map(|a| serde_json::to_string(a).unwrap_or_default())
                    .unwrap_or_default();
                deltas.push(super::provider::ToolCallDelta {
                    index: idx as i32,
                    id: None, // Ollama 不提供 tool_call id
                    function: Some(super::provider::FunctionCallDelta {
                        name: func["name"].as_str().map(|s| s.to_string()),
                        arguments: Some(args_str),
                    }),
                });
            }
            if deltas.is_empty() { None } else { Some(deltas) }
        } else {
            None
        };

        let finish_reason = if json["done"].as_bool().unwrap_or(false) {
            json["done_reason"].as_str().map(|s| s.to_string())
        } else {
            None
        };

        Some(super::provider::ChatChunk {
            content,
            reasoning_content,
            tool_calls,
            finish_reason,
        })
    }

    /// 解析 Ollama 非流式响应
    fn parse_ollama_response(&self, json: &Value) -> Result<ChatResponse, String> {
        let message = &json["message"];
        if message.is_null() {
            return Err("Invalid Ollama response: missing message".to_string());
        }

        let content = message["content"].as_str()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        let reasoning_content = message["thinking"].as_str()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());

        let tool_calls: Option<Vec<super::provider::ToolCall>> = message["tool_calls"]
            .as_array()
            .filter(|v| !v.is_empty())
            .map(|tc_list| {
                tc_list.iter().enumerate().map(|(idx, tc)| {
                    let func = &tc["function"];
                    let args_str = func.get("arguments")
                        .map(|a| serde_json::to_string(a).unwrap_or_else(|_| "{}".to_string()))
                        .unwrap_or_else(|| "{}".to_string());
                    super::provider::ToolCall {
                        id: format!("ollama_tc_{}", idx),
                        call_type: "function".to_string(),
                        function: super::provider::FunctionCall {
                            name: func["name"].as_str().unwrap_or("").to_string(),
                            arguments: args_str,
                        },
                    }
                }).collect()
            });

        let finish_reason = json["done_reason"].as_str().map(|s| s.to_string());

        Ok(ChatResponse {
            role: "assistant".to_string(),
            content,
            reasoning_content,
            tool_calls,
            finish_reason,
        })
    }
}

#[async_trait]
impl LlmProvider for OllamaProvider {
    async fn chat(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
    ) -> Result<ChatResponse, String> {
        let url = self.build_chat_url();
        let body = self.build_chat_body(messages, options, false);

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| self.map_http_error(&e, &options.model))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(self.map_api_error(status, &text, &options.model));
        }

        let json: Value = response.json().await.map_err(|e| e.to_string())?;
        self.parse_ollama_response(&json)
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
    ) -> Result<Vec<super::provider::ChatChunk>, String> {
        let url = self.build_chat_url();
        let body = self.build_chat_body(messages, options, true);

        let response = self.stream_client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| self.map_http_error(&e, &options.model))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(self.map_api_error(status, &text, &options.model));
        }

        let mut chunks = Vec::new();
        let mut stream = response.bytes_stream();
        use futures::StreamExt;

        while let Some(chunk_result) = stream.next().await {
            let chunk_bytes = chunk_result.map_err(|e| format!("Stream read error: {}", e))?;
            let chunk_str = String::from_utf8_lossy(&chunk_bytes);

            // Ollama 流式是 JSONL 格式（每行一个 JSON 对象），不是 SSE 的 data: 格式
            for line in chunk_str.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<Value>(line) {
                    if let Some(chunk) = self.parse_ollama_chunk(&json) {
                        chunks.push(chunk);
                    }
                }
            }
        }

        Ok(chunks)
    }

    fn validate_config(&self, config: &ProviderConfig) -> Result<(), String> {
        if config.base_url.is_empty() {
            return Err("Base URL is required".to_string());
        }
        Ok(())
    }

    async fn preload_model(&self, model: &str, keep_alive: &str) -> Result<(), String> {
        Self::preload_model(self, model, keep_alive).await
    }

    async fn check_health(&self) -> bool {
        let base = self.config.base_url.trim_end_matches('/');
        // 尝试 Ollama 版本接口
        if let Ok(resp) = self.client.get(format!("{}/api/version", base)).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        // 尝试 tags 接口
        if let Ok(resp) = self.client.get(format!("{}/api/tags", base)).send().await {
            if resp.status().is_success() {
                return true;
            }
        }
        false
    }

    fn provider_type(&self) -> &'static str {
        "ollama"
    }

    async fn chat_stream_realtime(
        &self,
        messages: &[ChatMessage],
        options: &ChatOptions,
        on_chunk: Arc<dyn Fn(super::provider::ChatChunk) + Send + Sync>,
    ) -> Result<super::provider::ChatResponse, String> {
        let url = self.build_chat_url();
        let body = self.build_chat_body(messages, options, true);
        let model_name = options.model.clone();

        let response = self.stream_client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| self.map_http_error(&e, &model_name))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(self.map_api_error(status, &text, &model_name));
        }

        let mut full_content = String::new();
        let mut full_reasoning = String::new();
        let mut tool_calls_map: std::collections::BTreeMap<i32, (Option<String>, String, String)> = std::collections::BTreeMap::new();
        let mut finish_reason: Option<String> = None;
        let mut stream = response.bytes_stream();
        use futures::StreamExt;

        // Ollama 本地大模型（如 32B）加载可能需要 5-10 分钟
        // 首字节超时 600 秒，空闲超时 180 秒
        let first_byte_timeout = std::time::Duration::from_secs(600);
        let idle_timeout = std::time::Duration::from_secs(180);
        let mut first_chunk_received = false;
        let mut tool_call_parse_errors = 0;
        // 性能指标追踪
        let mut load_duration_ns: Option<u64> = None;
        let mut prompt_eval_duration_ns: Option<u64> = None;
        let mut eval_duration_ns: Option<u64> = None;
        let mut eval_count: Option<u64> = None;
        let mut prompt_eval_count: Option<u64> = None;

        loop {
            let timeout_duration = if first_chunk_received {
                idle_timeout
            } else {
                first_byte_timeout
            };

            let chunk_result = match tokio::time::timeout(timeout_duration, stream.next()).await {
                Ok(Some(result)) => result,
                Ok(None) => break,
                Err(_) => {
                    if !first_chunk_received {
                        return Err(format!(
                            "模型加载超时（{} 秒内未收到响应）。\n\
                             模型 {} 可能仍在加载到内存/GPU 中。\n\
                             建议：\n\
                             1. 请确保已运行 'ollama pull {}' 下载模型\n\
                             2. 模型较大时首次加载需要更长时间，请耐心等待\n\
                             3. 检查系统内存/GPU 是否充足\n\
                             4. 可以使用更小的模型或更低的量化级别",
                            first_byte_timeout.as_secs(), model_name, model_name
                        ));
                    } else {
                        return Err(format!(
                            "Ollama 流式输出空闲超时（{} 秒内无数据）。\n\
                             模型可能在处理复杂任务时暂停了输出。",
                            idle_timeout.as_secs()
                        ));
                    }
                }
            };

            let chunk_bytes = chunk_result.map_err(|e| format!("Stream read error: {}", e))?;
            first_chunk_received = true;
            let chunk_str = String::from_utf8_lossy(&chunk_bytes);

            // Ollama 流式是 JSONL 格式（每行一个 JSON）
            for line in chunk_str.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                if let Ok(json) = serde_json::from_str::<Value>(line) {
                    // 提取性能指标（首次 chunk 和 done chunk 中包含）
                    if load_duration_ns.is_none() {
                        if let Some(ld) = json["load_duration"].as_u64() {
                            load_duration_ns = Some(ld);
                            let load_ms = ld as f64 / 1_000_000.0;
                            tracing::info!(
                                "[Ollama] Model '{}' loaded in {:.2}ms",
                                model_name, load_ms
                            );
                        }
                    }
                    if let Some(ped) = json["prompt_eval_duration"].as_u64() {
                        prompt_eval_duration_ns = Some(ped);
                    }
                    if let Some(ed) = json["eval_duration"].as_u64() {
                        eval_duration_ns = Some(ed);
                    }
                    if let Some(ec) = json["eval_count"].as_u64() {
                        eval_count = Some(ec);
                    }
                    if let Some(pec) = json["prompt_eval_count"].as_u64() {
                        prompt_eval_count = Some(pec);
                    }

                    // 当 done=true 时，输出完整的性能统计
                    if json["done"].as_bool().unwrap_or(false) {
                        let mut perf_parts = Vec::new();
                        if let Some(ld) = load_duration_ns {
                            perf_parts.push(format!("load={:.2}ms", ld as f64 / 1_000_000.0));
                        }
                        if let (Some(pec), Some(ped)) = (prompt_eval_count, prompt_eval_duration_ns) {
                            let prompt_tokens_per_sec = if ped > 0 {
                                (pec as f64) / (ped as f64 / 1_000_000_000.0)
                            } else { 0.0 };
                            perf_parts.push(format!(
                                "prompt_eval={} tokens ({:.2} tok/s)",
                                pec, prompt_tokens_per_sec
                            ));
                        }
                        if let (Some(ec), Some(ed)) = (eval_count, eval_duration_ns) {
                            let tokens_per_sec = if ed > 0 {
                                (ec as f64) / (ed as f64 / 1_000_000_000.0)
                            } else { 0.0 };
                            perf_parts.push(format!(
                                "eval={} tokens ({:.2} tok/s)",
                                ec, tokens_per_sec
                            ));
                        }
                        if !perf_parts.is_empty() {
                            tracing::info!(
                                "[Ollama] Model '{}' performance: {}",
                                model_name,
                                perf_parts.join(", ")
                            );
                        }
                    }

                    if let Some(chunk) = self.parse_ollama_chunk(&json) {
                        // 工具调用格式校验
                        if let Some(tc_deltas) = &chunk.tool_calls {
                            for delta in tc_deltas {
                                if let Some(func) = &delta.function {
                                    if let Some(args) = &func.arguments {
                                        // 校验 arguments 是否为有效 JSON
                                        if let Err(e) = serde_json::from_str::<Value>(args) {
                                            tool_call_parse_errors += 1;
                                            tracing::warn!(
                                                "[Ollama] Tool call arguments parse error #{}: {}. \
                                                Function: {:?}, Raw: {}",
                                                tool_call_parse_errors, e,
                                                func.name, args
                                            );
                                        }
                                    }
                                }
                            }
                        }

                        if let Some(content) = &chunk.content {
                            if !content.is_empty() {
                                full_content.push_str(content);
                            }
                        }
                        if let Some(reasoning) = &chunk.reasoning_content {
                            if !reasoning.is_empty() {
                                full_reasoning.push_str(reasoning);
                            }
                        }
                        if let Some(tc_deltas) = &chunk.tool_calls {
                            for delta in tc_deltas {
                                let entry = tool_calls_map
                                    .entry(delta.index)
                                    .or_insert((None, String::new(), String::new()));
                                if let Some(id) = &delta.id {
                                    entry.0 = Some(id.clone());
                                }
                                if let Some(func) = &delta.function {
                                    if let Some(name) = &func.name {
                                        entry.1 = name.clone();
                                    }
                                    if let Some(args) = &func.arguments {
                                        entry.2.push_str(args);
                                    }
                                }
                            }
                        }
                        if let Some(fr) = &chunk.finish_reason {
                            finish_reason = Some(fr.clone());
                        }
                        on_chunk(chunk);
                    }
                }
            }
        }

        // 工具调用完成后的格式校验
        let tool_calls: Vec<super::provider::ToolCall> = tool_calls_map
            .into_iter()
            .map(|(idx, (id, name, arguments))| {
                // 验证 arguments 是否为有效 JSON
                if !arguments.is_empty() {
                    if let Err(e) = serde_json::from_str::<Value>(&arguments) {
                        tracing::warn!(
                            "[Ollama] Final tool call #{} has invalid JSON arguments: {}. \
                            Function: '{}', Raw arguments: '{}'",
                            idx, e, name, arguments
                        );
                    }
                }
                super::provider::ToolCall {
                    id: id.unwrap_or_else(|| format!("ollama_tc_{}", uuid::Uuid::new_v4())),
                    call_type: "function".to_string(),
                    function: super::provider::FunctionCall { name, arguments },
                }
            })
            .collect();

        if tool_call_parse_errors > 0 {
            tracing::warn!(
                "[Ollama] Total tool call argument parse errors: {} during stream",
                tool_call_parse_errors
            );
        }

        Ok(super::provider::ChatResponse {
            role: "assistant".to_string(),
            content: if full_content.is_empty() { None } else { Some(full_content) },
            reasoning_content: if full_reasoning.is_empty() { None } else { Some(full_reasoning) },
            tool_calls: if tool_calls.is_empty() { None } else { Some(tool_calls) },
            finish_reason,
        })
    }
}
