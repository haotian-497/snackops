# 售后分类

判定类型：破损 / 缺件 / 退货 / 换货 / 退款 / 仅咨询。

## 必须
- query_orders 读取售后状态与商品
- query_logistics 读取签收时间
- 对照对应品类售后政策的 damageRule / missingItemRule / exchangeRule / refundRule

## 输出
type, withinWindow, evidenceNeeded, nextAction
不得超出政策承诺补偿。证据不足时列出需拍摄内容并建议转人工，而不是直接答应。
