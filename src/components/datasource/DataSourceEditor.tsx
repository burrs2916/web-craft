import { useEffect, useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import MuiSelect from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SyncIcon from "@mui/icons-material/Sync";
import SendIcon from "@mui/icons-material/Send";
import { useDataSourceStore } from "../../store/datasourceStore";
import type { DataSourceType } from "../../types/dataSource";
import type { DatabaseType, GreptimeDBConnectionMode } from "../../types/database";
import { DATABASE_LABELS, GREPTIMEDB_CONNECTION_MODE_LABELS, GREPTIMEDB_CONNECTION_MODE_DEFAULTS, getDatabasePortDefaults, createDefaultDatabaseConfig, createDefaultDatabaseTest } from "../../types/database";
import type { MqttProtocol, MqttVersion } from "../../types/mqtt";
import { MQTT_PROTOCOL_LABELS, MQTT_VERSION_LABELS, MQTT_DEFAULT_PORTS, createDefaultMqttConfig } from "../../types/mqtt";
import { createDefaultWebSocketConfig } from "../../types/websocket";
import { useSceneStore } from "../../store/sceneStore";
import type { SceneDSL } from "../../types/scene";
import type { SceneComponent } from "../../types/editor";

interface DataSourceEditorProps {
  dsId: string;
  onClose?: () => void;
}

export default function DataSourceEditor({ dsId, onClose }: DataSourceEditorProps) {
  const {
    dataSources,
    updateDataSource,
    addHeader: addDsHeader,
    updateHeader: updateDsHeader,
    removeHeader: removeDsHeader,
    addResponseMapping: addDsMapping,
    updateResponseMapping: updateDsMapping,
    removeResponseMapping: removeDsMapping,
    testConnection,
    testDatabaseConnection,
    testMqttConnection,
    updateDatabaseConfig,
    updateDatabaseTest,
    updateMqttConfig,
    updateWebSocketConfig,
    addTestApi,
    updateTestApi,
    removeTestApi,
    executeTestApi,
  } = useDataSourceStore();

  const scenes = useSceneStore((s) => s.scenes);
  const loadScenes = useSceneStore((s) => s.loadScenes);
  useEffect(() => {
    if (scenes.length === 0) void loadScenes();
  }, [scenes.length, loadScenes]);

  // 引用关系：扫描所有场景的组件（editorComponents / globalComponents / views[].components）
  // 的 config.dataSourceId 与其 bindings[].sourceId，以及场景级 scene.bindings[].dataSource。
  const references = useMemo(() => {
    const seen = new Set<string>();
    const list: {
      sceneId: string;
      sceneName: string;
      componentId: string;
      componentName: string;
      componentType: string;
      scope: string;
    }[] = [];

    const pushRef = (
      scene: SceneDSL,
      componentId: string,
      componentName: string,
      componentType: string,
      scope: string,
    ) => {
      const key = `${scene.id}:${componentId}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ sceneId: scene.id, sceneName: scene.name, componentId, componentName, componentType, scope });
    };

    for (const scene of scenes) {
      const pools: { comps?: SceneComponent[]; scope: string }[] = [];
      if (scene.editorComponents) pools.push({ comps: scene.editorComponents, scope: "编辑器组件" });
      if (scene.globalComponents) pools.push({ comps: scene.globalComponents, scope: "全局组件" });
      if (scene.views) {
        for (const v of scene.views) pools.push({ comps: v.components, scope: `视图·${v.name}` });
      }
      for (const pool of pools) {
        if (!pool.comps) continue;
        for (const comp of pool.comps) {
          const ids = new Set<string>();
          const cfgId = comp.config?.dataSourceId as string | undefined;
          if (cfgId) ids.add(cfgId);
          for (const b of comp.bindings ?? []) {
            if (b.sourceId) ids.add(b.sourceId);
          }
          if (ids.has(dsId)) pushRef(scene, comp.id, comp.name, comp.type, pool.scope);
        }
      }
      for (const b of scene.bindings ?? []) {
        if (b.dataSource === dsId) {
          pushRef(scene, b.componentId, `场景绑定 → ${b.componentId}`, "binding", "场景绑定");
        }
      }
    }
    return list;
  }, [scenes, dsId]);

  const ds = dataSources.find((d) => d.id === dsId);
  if (!ds) return null;

  return (
    <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {ds.name ? `编辑: ${ds.name}` : "新建数据源"}
        </Typography>
        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TextField
          label="名称"
          size="small"
          fullWidth
          placeholder="输入数据源名称"
          value={ds.name}
          onChange={(e) => updateDataSource(ds.id, { name: e.target.value })}
          autoFocus={!ds.name}
        />

        <Box sx={{ display: "flex", gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>类型</InputLabel>
            <MuiSelect
              value={ds.type}
              label="类型"
              onChange={(e) => updateDataSource(ds.id, { type: e.target.value as DataSourceType })}
            >
              <MenuItem value="http">HTTP</MenuItem>
              <MenuItem value="websocket">WebSocket</MenuItem>
              <MenuItem value="mqtt">MQTT</MenuItem>
              <MenuItem value="database">数据库</MenuItem>
            </MuiSelect>
          </FormControl>
          <TextField
            label="超时(ms)"
            size="small"
            type="number"
            sx={{ flex: 1 }}
            value={ds.connection.timeout}
            onChange={(e) => updateDataSource(ds.id, {
              connection: { ...ds.connection, timeout: parseInt(e.target.value) || 10000 },
            })}
          />
        </Box>

        <TextField
          label="描述"
          size="small"
          fullWidth
          placeholder="可选，简要描述此数据源用途"
          value={ds.description || ""}
          onChange={(e) => updateDataSource(ds.id, { description: e.target.value })}
        />

        <Divider sx={{ my: 0.5 }} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
          连接配置
        </Typography>

        {ds.type !== "database" && ds.type !== "mqtt" && (
          <TextField
            label={ds.type === "websocket" ? "WebSocket URL" : "基础 URL"}
            size="small"
            fullWidth
            placeholder={
              ds.type === "websocket" ? "ws://example.com/ws"
                : "https://api.example.com"
            }
            value={ds.connection.url}
            onChange={(e) => updateDataSource(ds.id, {
              connection: { ...ds.connection, url: e.target.value },
            })}
          />
        )}

        {ds.type === "database" && (() => {
          const dbConfig = ds.connection.database || createDefaultDatabaseConfig();
          const dbTest = ds.connection.databaseTest || createDefaultDatabaseTest();
          return (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              数据库配置
            </Typography>

            <FormControl size="small" fullWidth>
              <InputLabel>数据库类型</InputLabel>
              <MuiSelect
                value={dbConfig.dbType}
                label="数据库类型"
                onChange={(e) => {
                  const newDbType = e.target.value as DatabaseType;
                  const newConnectionMode = newDbType === "greptimedb" ? "postgresql" as GreptimeDBConnectionMode : undefined;
                  const defaults = getDatabasePortDefaults(newDbType, newConnectionMode);
                  updateDatabaseConfig(ds.id, {
                    dbType: newDbType,
                    connectionMode: newConnectionMode,
                    port: defaults.port,
                    database: newDbType === "greptimedb" ? "public" : dbConfig.database,
                  });
                  updateDatabaseTest(ds.id, { query: defaults.query });
                }}
              >
                {Object.entries(DATABASE_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </MuiSelect>
            </FormControl>

            {dbConfig.dbType === "greptimedb" && (
              <FormControl size="small" fullWidth>
                <InputLabel>连接方式</InputLabel>
                <MuiSelect
                  value={dbConfig.connectionMode || "postgresql"}
                  label="连接方式"
                  onChange={(e) => {
                    const newMode = e.target.value as GreptimeDBConnectionMode;
                    const defaults = GREPTIMEDB_CONNECTION_MODE_DEFAULTS[newMode];
                    updateDatabaseConfig(ds.id, {
                      connectionMode: newMode,
                      port: defaults.port,
                    });
                    updateDatabaseTest(ds.id, { query: defaults.query });
                  }}
                >
                  {Object.entries(GREPTIMEDB_CONNECTION_MODE_LABELS).map(([key, label]) => (
                    <MenuItem key={key} value={key}>{label}</MenuItem>
                  ))}
                </MuiSelect>
              </FormControl>
            )}

            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="主机"
                size="small"
                sx={{ flex: 3 }}
                value={dbConfig.host}
                onChange={(e) => updateDatabaseConfig(ds.id, { host: e.target.value })}
              />
              <TextField
                label="端口"
                size="small"
                type="number"
                sx={{ flex: 1 }}
                value={dbConfig.port}
                onChange={(e) => updateDatabaseConfig(ds.id, { port: parseInt(e.target.value) || 0 })}
              />
            </Box>

            <TextField
              label="用户名"
              size="small"
              fullWidth
              value={dbConfig.username}
              onChange={(e) => updateDatabaseConfig(ds.id, { username: e.target.value })}
            />

            <TextField
              label="密码"
              size="small"
              fullWidth
              type="password"
              value={dbConfig.password}
              onChange={(e) => updateDatabaseConfig(ds.id, { password: e.target.value })}
            />

            <TextField
              label="数据库"
              size="small"
              fullWidth
              value={dbConfig.database}
              onChange={(e) => updateDatabaseConfig(ds.id, { database: e.target.value })}
              helperText={dbConfig.dbType === "greptimedb" ? "默认为 public" : undefined}
            />

            <TextField
              label={dbConfig.connectionMode === "http-promql" ? "测试查询 (PromQL)" : "测试查询"}
              size="small"
              fullWidth
              value={dbTest.query}
              onChange={(e) => updateDatabaseTest(ds.id, { query: e.target.value })}
              helperText={dbConfig.connectionMode === "http-promql" ? "PromQL 表达式，例如: up" : "用于测试连接的查询语句"}
            />
          </>
          );
        })()}

        {ds.type === "mqtt" && (() => {
          const mqttConfig = ds.connection.mqtt || createDefaultMqttConfig();
          return (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              Broker 配置
            </Typography>

            <FormControl size="small" fullWidth>
              <InputLabel>协议</InputLabel>
              <MuiSelect
                value={mqttConfig.protocol}
                label="协议"
                onChange={(e) => {
                  const newProtocol = e.target.value as MqttProtocol;
                  updateMqttConfig(ds.id, {
                    protocol: newProtocol,
                    port: MQTT_DEFAULT_PORTS[newProtocol],
                  });
                }}
              >
                {Object.entries(MQTT_PROTOCOL_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </MuiSelect>
            </FormControl>

            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="主机"
                size="small"
                sx={{ flex: 3 }}
                value={mqttConfig.host}
                onChange={(e) => updateMqttConfig(ds.id, { host: e.target.value })}
              />
              <TextField
                label="端口"
                size="small"
                type="number"
                sx={{ flex: 1 }}
                value={mqttConfig.port}
                onChange={(e) => updateMqttConfig(ds.id, { port: parseInt(e.target.value) || MQTT_DEFAULT_PORTS[mqttConfig.protocol] })}
              />
            </Box>

            <TextField
              label="用户名"
              size="small"
              fullWidth
              value={mqttConfig.username}
              onChange={(e) => updateMqttConfig(ds.id, { username: e.target.value })}
            />

            <TextField
              label="密码"
              size="small"
              fullWidth
              type="password"
              value={mqttConfig.password}
              onChange={(e) => updateMqttConfig(ds.id, { password: e.target.value })}
            />

            <TextField
              label="Client ID"
              size="small"
              fullWidth
              value={mqttConfig.clientId}
              onChange={(e) => updateMqttConfig(ds.id, { clientId: e.target.value })}
              helperText="留空将自动生成"
            />

            <FormControl size="small" fullWidth>
              <InputLabel>MQTT 版本</InputLabel>
              <MuiSelect
                value={mqttConfig.version}
                label="MQTT 版本"
                onChange={(e) => updateMqttConfig(ds.id, { version: e.target.value as MqttVersion })}
              >
                {Object.entries(MQTT_VERSION_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>{label}</MenuItem>
                ))}
              </MuiSelect>
            </FormControl>

            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="Keep Alive (秒)"
                size="small"
                type="number"
                sx={{ flex: 1 }}
                value={mqttConfig.keepAlive}
                onChange={(e) => updateMqttConfig(ds.id, { keepAlive: parseInt(e.target.value) || 60 })}
              />
              <FormControl size="small" sx={{ flex: 1 }}>
                <InputLabel>Clean Session</InputLabel>
                <MuiSelect
                  value={mqttConfig.cleanSession ? "true" : "false"}
                  label="Clean Session"
                  onChange={(e) => updateMqttConfig(ds.id, { cleanSession: e.target.value === "true" })}
                >
                  <MenuItem value="true">是</MenuItem>
                  <MenuItem value="false">否</MenuItem>
                </MuiSelect>
              </FormControl>
            </Box>

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              重连配置
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={mqttConfig.reconnect}
                  onChange={(e) => updateMqttConfig(ds.id, { reconnect: e.target.checked })}
                  size="small"
                />
              }
              label={<Typography variant="caption">自动重连</Typography>}
            />

            {mqttConfig.reconnect && (
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField
                  label="重连间隔 (ms)"
                  size="small"
                  type="number"
                  sx={{ flex: 1 }}
                  value={mqttConfig.reconnectInterval}
                  onChange={(e) => updateMqttConfig(ds.id, { reconnectInterval: parseInt(e.target.value) || 5000 })}
                />
                <TextField
                  label="最大重试次数"
                  size="small"
                  type="number"
                  sx={{ flex: 1 }}
                  value={mqttConfig.reconnectAttempts}
                  onChange={(e) => updateMqttConfig(ds.id, { reconnectAttempts: parseInt(e.target.value) || 10 })}
                />
              </Box>
            )}
          </>
          );
        })()}

        {ds.type === "websocket" && (() => {
          const wsConfig = ds.connection.websocket || createDefaultWebSocketConfig();
          return (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              连接通道配置
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  checked={wsConfig.reconnect}
                  onChange={(e) => updateWebSocketConfig(ds.id, { reconnect: e.target.checked })}
                  size="small"
                />
              }
              label={<Typography variant="body2">自动重连</Typography>}
            />

            {wsConfig.reconnect && (
              <TextField
                label="重连间隔 (ms)"
                size="small"
                fullWidth
                type="number"
                value={wsConfig.reconnectInterval}
                onChange={(e) => updateWebSocketConfig(ds.id, { reconnectInterval: parseInt(e.target.value) || 5000 })}
              />
            )}
          </>
          );
        })()}

        {ds.type === "http" && (
          <Accordion
            disableGutters
            sx={{ "&:before": { display: "none" }, border: "none", boxShadow: "none", mt: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 32, "&.Mui-expanded": { minHeight: 32 } }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                公共请求头
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addDsHeader(ds.id)}>添加</Button>
              </Box>
              {ds.connection.headers.length === 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>暂无公共请求头</Typography>
              )}
              {ds.connection.headers.map((header) => (
                <Box key={header.id} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                  <TextField
                    size="small"
                    placeholder="Key"
                    value={header.key}
                    onChange={(e) => updateDsHeader(ds.id, header.id, { key: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    placeholder="Value"
                    value={header.value}
                    onChange={(e) => updateDsHeader(ds.id, header.id, { value: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <IconButton size="small" onClick={() => removeDsHeader(ds.id, header.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {ds.type === "http" && (
          <Accordion
            disableGutters
            sx={{ "&:before": { display: "none" }, border: "none", boxShadow: "none", mt: 0 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 32, "&.Mui-expanded": { minHeight: 32 } }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                公共响应映射
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0, pt: 0 }}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                <Button size="small" startIcon={<AddIcon />} onClick={() => addDsMapping(ds.id)}>添加</Button>
              </Box>
              {ds.responseMapping.length === 0 && (
                <Typography variant="caption" color="text.disabled" sx={{ display: "block", mb: 1 }}>暂无映射，将使用原始响应数据</Typography>
              )}
              {ds.responseMapping.map((mapping) => (
                <Box key={mapping.id} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                  <TextField
                    size="small"
                    placeholder="源路径 (如 data.list)"
                    value={mapping.sourcePath}
                    onChange={(e) => updateDsMapping(ds.id, mapping.id, { sourcePath: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    placeholder="目标键"
                    value={mapping.targetKey}
                    onChange={(e) => updateDsMapping(ds.id, mapping.id, { targetKey: e.target.value })}
                    sx={{ flex: 1 }}
                  />
                  <IconButton size="small" onClick={() => removeDsMapping(ds.id, mapping.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {ds.type === "http" && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
                测试 API
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={() => addTestApi(ds.id, { name: `API ${ds.testApis.length + 1}` })}
              >
                添加
              </Button>
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: -1 }}>
              使用公共请求头，请求成功即视为连接正常
            </Typography>

            {ds.testApis.length === 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ display: "block", textAlign: "center", py: 1 }}>
                暂无测试 API，点击"添加"创建
              </Typography>
            )}

            {ds.testApis.map((api) => (
              <Paper key={api.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                  <FormControl size="small" sx={{ minWidth: 90 }}>
                    <MuiSelect
                      value={api.method}
                      onChange={(e) => updateTestApi(ds.id, api.id, { method: e.target.value as "GET" | "POST" | "PUT" | "DELETE" })}
                      sx={{ height: 32, fontSize: "0.8rem" }}
                    >
                      <MenuItem value="GET">GET</MenuItem>
                      <MenuItem value="POST">POST</MenuItem>
                      <MenuItem value="PUT">PUT</MenuItem>
                      <MenuItem value="DELETE">DELETE</MenuItem>
                    </MuiSelect>
                  </FormControl>
                  <TextField
                    size="small"
                    placeholder="路径 (如 /api/system/health)"
                    value={api.path}
                    onChange={(e) => updateTestApi(ds.id, api.id, { path: e.target.value })}
                    sx={{ flex: 1, "& .MuiInputBase-input": { py: 0.5, fontSize: "0.8rem" } }}
                  />
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => executeTestApi(ds.id, api.id)}
                    disabled={!ds.connection.url || !api.path}
                    title="执行测试"
                  >
                    <SendIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => removeTestApi(ds.id, api.id)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                {api.method !== "GET" && (
                  <TextField
                    size="small"
                    placeholder='请求体 JSON (如 {"key": "value"})'
                    value={api.body || ""}
                    onChange={(e) => updateTestApi(ds.id, api.id, { body: e.target.value })}
                    multiline
                    rows={2}
                    fullWidth
                    sx={{ "& .MuiInputBase-input": { fontSize: "0.75rem" } }}
                  />
                )}
              </Paper>
            ))}
          </>
        )}

        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: "flex", gap: 1, mt: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => {
              if (ds.type === "database") {
                testDatabaseConnection(ds.id);
              } else if (ds.type === "mqtt") {
                testMqttConnection(ds.id);
              } else {
                testConnection(ds.id);
              }
            }}
            disabled={
              ds.status === "connecting" ||
              (ds.type === "database"
                ? !ds.connection.database?.host
                : ds.type === "mqtt"
                ? !ds.connection.mqtt?.host
                : !ds.connection.url)
            }
          >
            {ds.status === "connecting" ? "连接中..." : "测试连接"}
          </Button>
          {ds.status !== "disconnected" && (
            <Chip
              size="small"
              label={
                ds.status === "connected" ? "已连接"
                  : ds.status === "connecting" ? "连接中"
                  : ds.status === "failed" ? "连接失败"
                  : ds.status === "error" ? "错误"
                  : "未知"
              }
              color={
                ds.status === "connected" ? "success"
                  : ds.status === "connecting" ? "warning"
                  : "error"
              }
              sx={{ height: 22, fontSize: "0.65rem" }}
            />
          )}
          {ds.lastError && (
            <Typography variant="caption" color="error.main" sx={{ flexBasis: "100%" }}>
              {ds.lastError}
            </Typography>
          )}
        </Box>

        {ds.lastData !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
              最近响应数据
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 1,
                mt: 0.5,
                maxHeight: 200,
                overflow: "auto",
                bgcolor: (theme) => theme.vars
                  ? `rgba(${theme.vars.palette.background.defaultChannel} / 0.5)`
                  : "action.hover",
              }}
            >
              <Typography variant="caption" component="pre" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all", m: 0 }}>
                {JSON.stringify(ds.lastData, null, 2)}
              </Typography>
            </Paper>
          </Box>
        )}

        <Divider sx={{ my: 1 }} />
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary" }}>
            被以下场景引用
          </Typography>
          {references.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
              暂无场景/组件引用此数据源
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mt: 0.5 }}>
              {references.map((ref, i) => (
                <Paper
                  key={`${ref.sceneId}-${ref.componentId}-${i}`}
                  variant="outlined"
                  sx={{ p: 1 }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 600,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ref.sceneName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {ref.componentName}
                        <Box component="span" sx={{ fontFamily: "monospace", ml: 0.5 }}>{ref.componentType}</Box>
                      </Typography>
                    </Box>
                    <Chip size="small" label={ref.scope} sx={{ height: 20, fontSize: "0.65rem", flexShrink: 0 }} />
                  </Box>
                </Paper>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
