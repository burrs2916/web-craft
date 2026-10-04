import { invoke } from "./invoke";

export const alertApi = {
  async listRules(): Promise<unknown[]> {
    return invoke("list_alert_rules");
  },

  async createRule(rule: {
    name: string;
    sourceId?: string;
    metricName: string;
    condition: string;
    severity: string;
  }): Promise<unknown> {
    return invoke("create_alert_rule", { rule });
  },

  async getHistory(params: { ruleId?: string; limit: number }): Promise<unknown[]> {
    return invoke("get_alert_history", params);
  },

  async acknowledge(alertId: number): Promise<void> {
    return invoke("acknowledge_alert", { alertId });
  },
};