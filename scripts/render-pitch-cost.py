import json,csv,hashlib,statistics
from pathlib import Path
from collections import defaultdict
root=Path('docs/pitch-cost-2026-11-05');d=json.loads((root/'receipts.json').read_text())
assert d['status']=='complete',d.get('error','collection running')
assert len(d['sessions'])==9
rates={'deepseek-flash':(.02,.04,1,2,4,8),'deepseek-v4-pro':(.15,.30,4.5,9,13.5,27)}
rows=[]
for r in d['receipts']:
 u=r['usage'];assert r['httpStatus']==200 and u
 i,o,h,m=[u[k]for k in ('prompt_tokens','completion_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens')]
 assert i==h+m and u['total_tokens']==i+o
 a,b,c,e,f,g=rates[r['model']]
 rows.append(dict(module=r['module'],sample=r['sample'],stage=r['stage'],model=r['model'],response_id=r['responseId'],input=i,output=o,hit=h,miss=m,low=(h*a+m*c+o*f)/1e6,high=(h*b+m*e+o*g)/1e6,cold_high=(i*e+o*g)/1e6))
assert len({r['response_id'] for r in rows})==len(rows)
for op in d['operations']:
 rr=rows[op['receiptStart']:op['receiptEnd']];cc=op['calls']
 assert sum(r['input']for r in rr)==sum(c['inputTokens']for c in cc)
 assert sum(r['output']for r in rr)==sum(c['outputTokens']for c in cc)
summary=[]
for mod in ['IELTS','TOEFL','Daily']:
 rr=[r for r in rows if r['module']==mod]
 x={k:sum(r[k]for r in rr)for k in ['input','output','hit','miss','low','high','cold_high']};x.update(module=mod,sessions=3,calls=len(rr),avg_input=x['input']/3,avg_output=x['output']/3,avg_low=x['low']/3,avg_high=x['high']/3,avg_cold_high=x['cold_high']/3)
 summary.append(x)
with (root/'summary.csv').open('w',encoding='utf-8-sig',newline='')as f:
 w=csv.DictWriter(f,fieldnames=list(summary[0]));w.writeheader();w.writerows(summary)
(root/'verified-summary.json').write_text(json.dumps({'checked':'raw response usage versus application requestContext; response IDs unique; cache splits and total_tokens reconciled','summary':summary,'rows':rows},ensure_ascii=False,indent=2))
lines=['# SpeakNow：路演用模型成本实测','',f"采集日期：{d['createdAt']}。9 组工程文本测试（每模块 3 组），共 {len(rows)} 次真实 DeepSeek 请求。所有请求均保留响应 ID、模型和 API 原始 usage。",'',
'**口径：以下是文本大模型推理成本估算，基于真实 Token 收据乘以官方单价；不是供应商扣款账单，也不是全产品每次使用的总成本。**','',
'| 场景（每次） | 样本数 | API 调用数/次 | 平均 Input Tokens | 平均 Output Tokens | 缓存实测成本/次（元，空闲–高峰） | 全部输入未命中缓存/次（元，高峰） |',
'|---|---:|---:|---:|---:|---:|---:|']
scopes={'IELTS':'IELTS：12 题考官过渡语＋完整反馈','TOEFL':'TOEFL：7 跟读＋4 访谈的整套反馈','Daily':'Daily：6 轮对话＋1 份反馈'}
for x in summary:lines.append(f"| {scopes[x['module']]} | 3 | {x['calls']/3:g} | {x['avg_input']:,.1f} | {x['avg_output']:,.1f} | {x['avg_low']:.6f}–{x['avg_high']:.6f} | {x['avg_cold_high']:.6f} |")
lines+=['','## 路演可用表述','',f"“我们已通过 DeepSeek API 原始 usage，对 IELTS、TOEFL 和日常对话各进行了三组工程实测。按当前高峰价格，并保守假设所有输入均未命中缓存，单次文本模型成本分别约为 {summary[0]['avg_cold_high']:.4f} 元、{summary[1]['avg_cold_high']:.4f} 元和 {summary[2]['avg_cold_high']:.4f} 元。Daily 样本为六轮对话加反馈；这些数字仅覆盖模型推理，语音和基础设施成本另计。”",'','## 样本定义与边界','',
'- IELTS：既有 demo 完整模拟题；12 条人工编写工程回答，12 次真实考官过渡语生成，加 1 次整套反馈。每次考官请求携带已有回答；反馈含实际生成的考官语句。','- TOEFL：既有 2026 模拟题；7 条跟读转写加 4 条访谈回答，合并调用一次真实反馈。题目为已有固定内容，没有假设每题都会调用考官模型。','- Daily：6 条人工编写用户回答，6 次有历史上下文的真实流式对话，再生成 1 次整段反馈。没有把六轮等同于六分钟。','- 每个场景重复测试 3 次相同输入骨架，AI 输出由服务实际生成。重复请求会增加缓存命中；样本不代表三位真人、真实用户分布或置信区间。','- 未采集实体麦克风、ASR、付费 TTS、摄像头计算、服务器、数据库、存储、带宽、税费和支付费。不能据此宣称总成本、毛利率、整场真人考试成本或分钟成本。','- 实际供应商重试均会留下独立回执。本轮请求情况见明细；未来长对话、较长答案或失败重试可能增加成本。未将已清空的内部测试历史当作全站累计使用量。','',
'## 累计 Token 与缓存','', '| 模块 | Input | Output | Cache hit | Cache miss |','|---|---:|---:|---:|---:|']
for x in summary:lines.append(f"| {x['module']} | {x['input']:,} | {x['output']:,} | {x['hit']:,} | {x['miss']:,} |")
lines+=['','## 价格与算法','',
'价格于 2026-11-05 核对：[DeepSeek 官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。单位：人民币/百万 Tokens。',
'','| 模型 | 命中输入（空闲/高峰） | 未命中输入（空闲/高峰） | 输出（空闲/高峰） |','|---|---:|---:|---:|','| deepseek-flash | 0.02 / 0.04 | 1 / 2 | 4 / 8 |','| deepseek-v4-pro | 0.15 / 0.30 | 4.5 / 9 | 13.5 / 27 |','',
'单次成本 =（prompt_cache_hit_tokens × 命中单价 + prompt_cache_miss_tokens × 未命中单价 + completion_tokens × 输出单价）÷ 1,000,000。Input = prompt_tokens；Output = completion_tokens。若 usage 有 reasoning_tokens，已包含于 completion_tokens，不额外叠加。',
'','“全未命中高峰”只替换输入缓存条件和单价，保留这批实际观测到的输入/输出 Token 数；这是保守价格情景，不是未来请求成本的上限。',
'','## 1,000 次同类任务的预算情景','', '| 场景 | 模型费（元，全未命中高峰） |','|---|---:|']
for x in summary:lines.append(f"| 1,000 次 {scopes[x['module']]} | {x['avg_cold_high']*1000:.2f} |")
lines+=['','上表只是样本单价乘以任务数，不包含用户量预测、语音或固定成本，不能直接作为 1,000 名用户的月成本。','', '## 可复核证据','',
'- [原始 API usage 回执](receipts.json)：保留原始字段、响应 ID、调用归属和应用记录。','- [逐次调用 CSV](calls.csv)：便于导入 Excel。','- [模块汇总 CSV](summary.csv)：适合路演图表取数。','- [校验后的明细](verified-summary.json)：API Token 总数与应用埋点逐项对账。', '- 采集脚本：`scripts/collect-pitch-cost.mjs`；报告脚本：`scripts/render-pitch-cost.py`。未记录密钥。']
(root/'路演成本统计.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
