/**
 * 长耗时命令倒计时：从流式/最终消息中检测 LONG_RUNNING 标记，启动倒计时并在结束时
 * 自动让 Agent 检查结果；支持用户手动跳过，切换会话时清除状态。
 *
 * 从 AiCopilotPage/index.tsx 迁出，仅做代码搬迁。
 * sendMessage 通过 ref 注入，避免与流式 hook 形成循环依赖。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { appendEnvOpsLog } from '../../../core/services/agent.service';
import type { LongRunningTask } from '../types';

export function useLongRunningCountdown({
  conversationId,
  sendMessageRef,
}: {
  conversationId: string | null;
  sendMessageRef: MutableRefObject<((msg: string) => Promise<void>) | null>;
}) {
  const [longRunningTask, setLongRunningTask] = useState<LongRunningTask | null>(null);
  const longRunningTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longRunningDetectedRef = useRef(false); // 流式检测去重

  // 倒计时 debug log 便捷函数
  const logCountdown = useCallback((event: string, detail: string) => {
    const runId = conversationId ?? 'unknown';
    appendEnvOpsLog('DEBUG', runId, 'countdown', event, detail).catch(() => {});
    console.log(`[countdown][${event}] ${detail}`);
  }, [conversationId]);

  // 从消息中检测 LONG_RUNNING 标记
  const detectLongRunning = useCallback((content: string, source: 'stream' | 'final' = 'final') => {
    if (longRunningDetectedRef.current) return; // 已经检测到过，跳过
    const match = content.match(/LONG_RUNNING:\s*wait\s+(\d+)\s+(.+)/i);
    if (match) {
      const seconds = parseInt(match[1], 10);
      const description = match[2].trim();
      if (seconds > 0 && seconds < 3600) { // 合理范围：1秒~1小时
        longRunningDetectedRef.current = true;
        logCountdown('detected', `source=${source} seconds=${seconds} description=${description}`);
        setLongRunningTask({
          description,
          totalSeconds: seconds,
          remainingSeconds: seconds,
          active: true,
        });
      }
    }
  }, [logCountdown]);

  // 倒计时逻辑：每秒减 1，到 0 时自动触发 Agent 检查结果
  useEffect(() => {
    if (!longRunningTask?.active) return;
    if (longRunningTask.remainingSeconds <= 0) return;

    logCountdown('start', `description=${longRunningTask.description} totalSeconds=${longRunningTask.totalSeconds}`);

    longRunningTimerRef.current = setInterval(() => {
      setLongRunningTask((prev) => {
        if (!prev || !prev.active) return prev;
        const next = prev.remainingSeconds - 1;
        if (next <= 0) {
          // 倒计时结束，清除定时器
          if (longRunningTimerRef.current) {
            clearInterval(longRunningTimerRef.current);
            longRunningTimerRef.current = null;
          }
          logCountdown('completed', `description=${prev.description} totalSeconds=${prev.totalSeconds}`);
          // 自动发送消息让 Agent 检查结果并继续
          const autoMsg = `⏱️ 等待时间已到（${prev.totalSeconds}秒）。请检查「${prev.description}」的执行结果，确认是否成功。如果成功了就继续下一步；如果失败了，分析原因并修复。`;
          setTimeout(() => sendMessageRef.current?.(autoMsg), 100);
          return { ...prev, remainingSeconds: 0, active: false };
        }
        return { ...prev, remainingSeconds: next };
      });
    }, 1000);

    return () => {
      if (longRunningTimerRef.current) {
        clearInterval(longRunningTimerRef.current);
        longRunningTimerRef.current = null;
      }
    };
  }, [longRunningTask?.active, longRunningTask?.description, longRunningTask?.totalSeconds, logCountdown]);

  // 手动跳过等待
  const handleSkipWait = useCallback(() => {
    if (longRunningTimerRef.current) {
      clearInterval(longRunningTimerRef.current);
      longRunningTimerRef.current = null;
    }
    if (longRunningTask) {
      logCountdown('skipped', `description=${longRunningTask.description} remaining=${longRunningTask.remainingSeconds}s`);
      const autoMsg = `⏭️ 用户跳过了等待。请检查「${longRunningTask.description}」的执行结果，确认是否成功。如果成功了就继续下一步；如果失败了，分析原因并修复。`;
      setLongRunningTask(null);
      longRunningDetectedRef.current = false; // 重置检测标记，允许后续再次检测
      setTimeout(() => sendMessageRef.current?.(autoMsg), 100);
    }
  }, [longRunningTask, logCountdown]);

  // 秒数格式化为 mm:ss
  const formatTimeLeft = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 切换会话时清除倒计时状态
  useEffect(() => {
    if (longRunningTask?.active) {
      const prevDesc = longRunningTask.description;
      const prevRemain = longRunningTask.remainingSeconds;
      const prevRunId = conversationId ?? 'unknown';
      appendEnvOpsLog('DEBUG', prevRunId, 'countdown', 'cleared_on_switch', `description=${prevDesc} remaining=${prevRemain}s`).catch(() => {});
      console.log(`[countdown][cleared_on_switch] description=${prevDesc} remaining=${prevRemain}s`);
    }
    setLongRunningTask(null);
    longRunningDetectedRef.current = false;
    if (longRunningTimerRef.current) {
      clearInterval(longRunningTimerRef.current);
      longRunningTimerRef.current = null;
    }
  }, [conversationId]);

  return { longRunningTask, detectLongRunning, handleSkipWait, formatTimeLeft, longRunningDetectedRef };
}