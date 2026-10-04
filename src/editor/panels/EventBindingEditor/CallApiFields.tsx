import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { EventBindingForm } from "./useEventBindingForm";

/** 动作类型为「调用接口」时的表单分区（请求来源 / 地址 / 请求体 / 请求头 / 响应落地）。 */
export function CallApiFields({ form }: { form: EventBindingForm }) {
  const {
    sourceComp,
    sourceCompApi,
    bindCompApi, setBindCompApi,
    apiUrl, setApiUrl,
    apiMethod, setApiMethod,
    apiBody, setApiBody,
    apiAuth, setApiAuth,
    apiHeadersText, setApiHeadersText,
    apiResponsePath, setApiResponsePath,
    apiWriteVar, setApiWriteVar,
    sceneVarNames,
    apiRefreshSources, setApiRefreshSources,
    apiTargetComponents,
  } = form;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* 绑定源：本组件接口 / 自定义 URL */}
      <TextField
        select
        size="small"
        label="请求来源"
        value={bindCompApi ? "boundComp" : "custom"}
        onChange={(e) => {
          const v = e.target.value === "boundComp";
          setBindCompApi(v);
          if (v && sourceCompApi) {
            setApiUrl(sourceCompApi.url);
            setApiMethod(sourceCompApi.method);
          }
        }}
        fullWidth
        slotProps={{
          select: {
            native: false,
          },
        }}
      >
        <MenuItem value="custom">自定义地址</MenuItem>
        <MenuItem value="boundComp" disabled={!sourceCompApi}>
          {sourceCompApi
            ? `绑定本组件接口 (${sourceComp?.name ?? "当前组件"})`
            : "绑定本组件接口（未配置）"}
        </MenuItem>
      </TextField>

      {bindCompApi ? (
        // 绑定组件接口：只读摘要，url/method 跟随组件配置
        <Box sx={{ px: 0.5 }}>
          <Typography variant="body2" sx={{ fontSize: 11, color: "text.primary", wordBreak: "break-all", mb: 0.25 }}>
            {sourceCompApi?.url ?? "该组件未配置接口"}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: 10, color: "text.secondary" }}>
            {sourceCompApi?.method ?? "GET"}
            {sourceCompApi && sourceCompApi.interval > 0 ? ` · 每 ${sourceCompApi.interval}s 轮询` : ""} ·
            保存时取源组件接口地址，随编辑时刷新
          </Typography>
        </Box>
      ) : (
        <>
          <TextField
            size="small"
            label="接口地址"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            placeholder="https://api.example.com/xxx"
            fullWidth
            required
            helperText="事件触发时向该地址发起请求"
          />
          <TextField
            select
            size="small"
            label="请求方式"
            value={apiMethod}
            onChange={(e) => setApiMethod(e.target.value)}
            fullWidth
          >
            <MenuItem value="GET">GET</MenuItem>
            <MenuItem value="POST">POST</MenuItem>
          </TextField>
        </>
      )}
      <TextField
        size="small"
        label="请求体(JSON，可选)"
        value={apiBody}
        onChange={(e) => setApiBody(e.target.value)}
        placeholder='{"key": "value"}'
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "0.8rem" } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="caption" sx={{ fontSize: 11, color: "text.secondary", flex: 1 }}>
          自动注入认证 Token
        </Typography>
        <input
          type="checkbox"
          style={{ accentColor: "#1976d2", width: 16, height: 16, cursor: "pointer" }}
          checked={apiAuth}
          onChange={(e) => setApiAuth(e.target.checked)}
        />
      </Box>

      {/* 请求头 */}
      <TextField
        size="small"
        label="自定义请求头(每行 K: V)"
        value={apiHeadersText}
        onChange={(e) => setApiHeadersText(e.target.value)}
        placeholder={'X-Custom-Key: value\nContent-Type: application/json'}
        fullWidth
        multiline
        minRows={2}
        maxRows={4}
        slotProps={{ htmlInput: { spellCheck: false } }}
        sx={{ "& .MuiInputBase-input": { fontFamily: "monospace", fontSize: "0.78rem" } }}
      />

      {/* 响应路径 */}
      <TextField
        size="small"
        label="响应取值路径(可选)"
        value={apiResponsePath}
        onChange={(e) => setApiResponsePath(e.target.value)}
        placeholder="如 data.user / data.list"
        fullWidth
        helperText="留空则取整个响应体"
      />

      {/* 成功写入场景变量 */}
      <TextField
        select
        size="small"
        label="成功写入场景变量(可选)"
        value={apiWriteVar}
        onChange={(e) => setApiWriteVar(e.target.value)}
        fullWidth
        slotProps={{
          select: { native: false },
        }}
      >
        {sceneVarNames.length === 0 && <MenuItem value="" disabled>暂无场景变量，可直接输入新名称</MenuItem>}
        {sceneVarNames.map((name) => (
          <MenuItem key={name} value={name}>{name}</MenuItem>
        ))}
      </TextField>
      {sceneVarNames.length > 0 && (
        <TextField
          size="small"
          label="或输入新变量名"
          value={apiWriteVar}
          onChange={(e) => setApiWriteVar(e.target.value)}
          placeholder="customVarName"
          fullWidth
        />
      )}

      {/* 成功后刷新组件接口 */}
      <TextField
        select
        size="small"
        label="成功后刷新组件接口(可选)"
        value={apiRefreshSources}
        onChange={(e) => setApiRefreshSources(e.target.value as unknown as string[])}
        fullWidth
        slotProps={{ select: { native: false, multiple: true } }}
        helperText={apiTargetComponents.length === 0 ? "无可刷新（尚无组件绑定 API 数据源）" : "请求成功后重拉所选组件的接口数据"}
      >
        {apiTargetComponents.map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
    </Box>
  );
}