import { invoke } from "./invoke";
import type { MetricData } from "../../store";

export const metricApi = {
  async query(params: {
    sourceId: string;
    metricName: string;
    startTime: number;
    endTime: number;
    interval?: string;
  }): Promise<MetricData[]> {
    return invoke("query_metrics", params);
  },

  async getLatest(sourceId: string): Promise<Record<string, number>> {
    return invoke("get_latest_metrics", { sourceId });
  },

  async subscribe(params: {
    sourceId: string;
    metricNames: string[];
  }): Promise<void> {
    return invoke("subscribe_metrics", params);
  },
};