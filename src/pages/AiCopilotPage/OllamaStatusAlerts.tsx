/**
 * Ollama 本地服务状态提示条（无法连接 / 模型未加载）。
 * 从 AiCopilotPage.tsx 迁出，仅做代码搬迁。
 */
import type { Dispatch, SetStateAction } from 'react';
import { Box, Typography, Alert, Button } from '@mui/material';
import { WarningCircleIcon, ClockIcon } from '@phosphor-icons/react';
import type { EndpointDto, ModelDto, OllamaStatusDto } from '../../proto/agent';
import type { OllamaStatusState } from './types';

export function OllamaStatusAlerts({
  isOllamaModel,
  ollamaStatus,
  setOllamaStatus,
  currentEndpoint,
  boundModel,
  checkOllamaStatus,
}: {
  isOllamaModel: boolean;
  ollamaStatus: OllamaStatusState | null;
  setOllamaStatus: Dispatch<SetStateAction<OllamaStatusState | null>>;
  currentEndpoint: EndpointDto | null | undefined;
  boundModel: ModelDto | null | undefined;
  checkOllamaStatus: (baseUrl: string, modelName?: string) => Promise<OllamaStatusDto>;
}) {
  return (
    <>
      {/* Ollama 服务状态检测提示 */}
      {isOllamaModel && ollamaStatus && !ollamaStatus.checking && !ollamaStatus.available && (
        <Box sx={{ mx: 2, mt: 1, mb: 0.5 }}>
          <Alert
            severity="warning"
            icon={<WarningCircleIcon size={18} />}
            sx={{
              fontSize: 12,
              '& .MuiAlert-message': { p: 0 },
              '& .MuiAlert-icon': { p: 0, mr: 1 },
            }}
            action={
              <Button
                size="small"
                variant="outlined"
                color="warning"
                sx={{ fontSize: 11, py: 0.25 }}
                onClick={async () => {
                  if (!currentEndpoint || !boundModel) return;
                  setOllamaStatus({ checking: true, available: false, modelLoaded: false, version: '', error: null });
                  try {
                    const status = await checkOllamaStatus(currentEndpoint.baseUrl, boundModel.refKey);
                    setOllamaStatus({
                      checking: false,
                      available: status.serviceAvailable,
                      modelLoaded: status.modelLoaded,
                      version: status.version,
                      error: status.error,
                    });
                  } catch (err) {
                    setOllamaStatus({
                      checking: false,
                      available: false,
                      modelLoaded: false,
                      version: '',
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
                }}
              >
                重新检测
              </Button>
            }
          >
            <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
              无法连接到 Ollama 本地服务
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              请确保 Ollama 已启动（运行 <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama serve</code>），
              并确认模型 <strong>{boundModel?.name}</strong> 已通过 <code style={{ fontFamily: 'monospace', fontSize: 10 }}>ollama pull {boundModel?.refKey}</code> 下载。
            </Typography>
          </Alert>
        </Box>
      )}
      {/* Ollama 服务可用但模型未加载提示 */}
      {isOllamaModel && ollamaStatus && !ollamaStatus.checking && ollamaStatus.available && !ollamaStatus.modelLoaded && (
        <Box sx={{ mx: 2, mt: 1, mb: 0.5 }}>
          <Alert
            severity="info"
            icon={<ClockIcon size={18} />}
            sx={{
              fontSize: 12,
              '& .MuiAlert-message': { p: 0 },
              '& .MuiAlert-icon': { p: 0, mr: 1 },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 500, display: 'block' }}>
              Ollama 服务正常（v{ollamaStatus.version}）
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              模型 <strong>{boundModel?.name}</strong> 尚未加载到内存，首次对话可能需要较长加载时间。
            </Typography>
          </Alert>
        </Box>
      )}
    </>
  );
}