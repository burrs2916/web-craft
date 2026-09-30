/**
 * Ollama 本地模型状态：判断当前模型是否走 Ollama，并在进入页面时自动检测服务与模型加载状态。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 */
import { useEffect, useMemo, useState } from 'react';
import type { EndpointDto, ModelDto, OllamaStatusDto } from '../../../proto/agent';
import type { OllamaStatusState } from '../types';

export function useOllamaStatus({
  boundModel,
  endpoints,
  checkOllamaStatus,
}: {
  boundModel: ModelDto | null | undefined;
  endpoints: EndpointDto[];
  checkOllamaStatus: (baseUrl: string, modelName?: string) => Promise<OllamaStatusDto>;
}) {
  // Ollama 本地模型状态检测
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatusState | null>(null);

  // 判断当前模型是否为 Ollama 本地模型
  const isOllamaModel = useMemo(() => {
    if (!boundModel) return false;
    const endpoint = endpoints.find((e) => e.id === boundModel.endpointId);
    return endpoint?.apiType === 'ollama';
  }, [boundModel, endpoints]);

  // 获取当前模型对应的 endpoint
  const currentEndpoint = useMemo(() => {
    if (!boundModel) return null;
    return endpoints.find((e) => e.id === boundModel.endpointId) || null;
  }, [boundModel, endpoints]);

  // Ollama 模型：进入页面时自动检测服务状态
  useEffect(() => {
    if (!isOllamaModel || !currentEndpoint || !boundModel) return;

    let cancelled = false;
    const checkStatus = async () => {
      setOllamaStatus({ checking: true, available: false, modelLoaded: false, version: '', error: null });
      try {
        const status = await checkOllamaStatus(currentEndpoint.baseUrl, boundModel.refKey);
        if (cancelled) return;
        setOllamaStatus({
          checking: false,
          available: status.serviceAvailable,
          modelLoaded: status.modelLoaded,
          version: status.version,
          error: status.error,
        });
      } catch (err) {
        if (cancelled) return;
        setOllamaStatus({
          checking: false,
          available: false,
          modelLoaded: false,
          version: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    checkStatus();
    return () => { cancelled = true; };
  }, [isOllamaModel, currentEndpoint, boundModel, checkOllamaStatus]);

  return { isOllamaModel, currentEndpoint, ollamaStatus, setOllamaStatus };
}