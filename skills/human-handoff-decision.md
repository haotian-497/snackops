# 转人工决策

依据运营配置的 handoffRules 决定 stay_bot 或 human_takeover。

默认转人工：
- 连续两次 Tool 失败
- 投诉升级或要求主管
- 疑似中奖诈骗（先完成风险提醒）
- 售后判责证据不足

可继续机器人：库存、物流轨迹、券规则可被 Tool 证实。
输出 decision, ruleId, userMessage。转接时告知“正在为您转接人工”，不编造工号权限。
