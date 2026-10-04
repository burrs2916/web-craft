import type { LogAnalysisReport } from "../../services/logMonitorApi";
import type { TimeRange } from "./types";

// ═══════════════════════════════════════════════════════════════════
// 分析洞察报告 → Markdown 生成（导出用）
// ═══════════════════════════════════════════════════════════════════

export interface ReportMeta {
  scopeMode: "scene" | "global";
  sceneDeviceIds: string[];
  timeRange: TimeRange;
  dustThreshold: number;
  sprayWindowSec: number;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function buildReportMarkdown(r: LogAnalysisReport, meta: ReportMeta): string {
  const s = r.summary;
  const c = r.correlation;
  const lines: string[] = [];
  lines.push(`# 日志分析洞察报告`);
  lines.push("");
  lines.push(`- **生成时间**：${fmtTime(new Date().toISOString())}`);
  lines.push(
    `- **分析区间**：${fmtTime(meta.timeRange.from)} ~ ${fmtTime(meta.timeRange.to)}`,
  );
  lines.push(
    `- **作用域**：${
      meta.scopeMode === "global"
        ? "全矿"
        : meta.sceneDeviceIds.length > 0
          ? `本场景 ${meta.sceneDeviceIds.length} 台设备`
          : "未绑定数据源"
    }`,
  );
  lines.push(
    `- **粉尘报警阈值**：${meta.dustThreshold} mg/m³　**关联窗口**：${meta.sprayWindowSec}s`,
  );
  lines.push("");
  lines.push(`## 一、综合健康评分`);
  lines.push("");
  lines.push(`- **健康评分**：${r.health_score} / 100`);
  lines.push(`- **等级**：${r.health_level}`);
  lines.push("");
  lines.push(`## 二、异常摘要`);
  lines.push("");
  lines.push(`| 指标 | 数值 |`);
  lines.push(`| --- | --- |`);
  lines.push(`| 故障次数 | ${s.fault_count} |`);
  lines.push(`| 故障涉及设备 | ${s.fault_devices} 台 |`);
  lines.push(`| 重要告警 | ${s.alarm_count} 条 |`);
  lines.push(`| 粉尘超标时长 | ${s.dust_exceed_minutes} min |`);
  lines.push(`| 粉尘平均浓度 | ${s.dust_avg} mg/m³ |`);
  lines.push(`| 粉尘峰值浓度 | ${s.dust_peak} mg/m³ |`);
  lines.push(`| 指令成功率 | ${s.cmd_success_rate}% |`);
  lines.push(`| 指令总数 | ${s.total_ops} |`);
  lines.push("");
  lines.push(`## 三、粉尘—喷雾关联分析`);
  lines.push("");
  lines.push(`- 粉尘超标时刻事件数：${c.dust_exceed_events}`);
  lines.push(`- 窗口内触发喷雾次数：${c.spray_triggered_within_window}`);
  lines.push(
    `- 关联命中率：${c.hit_rate === null ? "无超标事件（N/A）" : `${c.hit_rate}%`}`,
  );
  lines.push("");
  lines.push(`## 四、设备健康榜`);
  lines.push("");
  lines.push(
    `- **最需关注**：${r.device_health.most_attention.length > 0 ? r.device_health.most_attention.join("、") : "无"}`,
  );
  lines.push(
    `- **最稳定**：${r.device_health.most_stable.length > 0 ? r.device_health.most_stable.join("、") : "无"}`,
  );
  lines.push("");
  lines.push(`## 五、决策建议`);
  lines.push("");
  if (r.recommendations.length === 0) {
    lines.push(`- 无`);
  } else {
    for (const rec of r.recommendations) lines.push(`- ${rec}`);
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`*本报告由 WebCraft 日志监控视图自动生成*`);
  lines.push("");
  return lines.join("\n");
}