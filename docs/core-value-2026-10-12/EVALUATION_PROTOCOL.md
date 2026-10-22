# 核心价值试验：国际大学生的 5 分钟英语演讲

本协议用于采集真实证据，不是已完成的研究或已验证的量表。当前真实用户样本、独立教练评价和付款记录均尚未提供。模板与工程测试不能填写成真实数据。

## 唯一任务和假设

用户用英语向自己真实的课堂听众解释一个观点，目标长度约 5 分钟。

第一次录音 → 一个有原句依据的 AI 优先建议 → 用户自己重练 → 独立评价者判断是否更好。

固定核心观点、预期结果和听众。换听众属于另一项训练，不能作为这一任务的前后比较。无 PDF、摄像头或其他文件也可以完成任务。第一次演讲目标约 5 分钟，定向重练以 30–60 秒为宜；时长不是能力分数。

## 招募和同意

第一轮可从 10–15 名有真实近期课堂演讲任务的国际大学生开始，作为发现问题的探索性试点，不以小样本比例宣传普遍效果。募集与付款均需真人完成。

在录音前记录自愿参加和音频评阅同意。说明：录音与文字可能提交给配置的模型；人工评价者将听录音；可以停止参与；不会用于课程成绩。不要复制没有授权的同学或客户数据。

参与名单填写 `evaluation/consented-participants.json`，每项需要：

| 字段 | 含义 |
| --- | --- |
| participantId | 研究用假名，如运营方分配的短代码，非邮箱/姓名 |
| userId | 该参与者自己的真实 SpeakNow 用户 ID；仅保存在私有名单 |
| enrolledAt | 实际加入试点时间 |
| consentRecordedAt | 实际录音前同意时间 |
| consentEvidenceRef | 可核查的同意记录位置 |
| audioReviewConsent | 只有明确同意分享音频供评价才填 true |

邀请草稿（尚未发送）：

> We are testing whether one specific piece of presentation feedback helps international university students improve a real English presentation. You would record an initial attempt, review one suggested change, and record a short retry. Independent reviewers will compare the recordings. The tool’s effectiveness has not yet been established. Participation is voluntary and unrelated to course grades. May we discuss the task and recording-review consent with you?

评价者邀请草稿（尚未发送）：

> Could you independently review pairs of student presentation recordings for clarity, audience suitability, persuasiveness and actionability? The first review will hide the order and AI judgement. We also need an original-only assessment of the most useful priority. We are testing the system, rather than asking you to endorse it. Please tell us your relevant coaching or domain experience and any relationship with the product team.

没有联系人或参与安排时，不宣称已邀请、已访谈或已有专家认可。

## 采集

1. 用户自己填写核心观点、真实听众和希望达到的结果。
2. 保存实际第一次录音与对应转写，不用准备稿代替实际表达。
3. 在线模型可用时生成反馈。模型无法确定优先问题时允许无首要建议；这类案例也进入优先级评测。
4. 用户针对首要建议自己重练。不要让模型代写的文字代替 After 录音。
5. 保留两次独立记录和原报告；不覆盖 Before。
6. 记录转写来源。纯打字不能证明口头表达效果；混合/改写文本在独立音频校对前暂不进入主要效果样本，保留排除原因并检查口音/转写偏差造成的选择偏差。

导出命令需要在与服务端相同、且已授权的存储环境中运行。它只读取名单中的用户，不遍历无关账户，不调用模型：

```sh
node scripts/core-value/export.mjs docs/core-value-2026-10-12/evaluation/consented-participants.json /private/tmp/speaknow-consented-study
```

导出文件应保持私有。假名并不自动去除录音/文字中的姓名或身份信息；分享给评价者前核查同意与内容。保留原始来源与排除记录，避免修改文字后仍声称是原始转写。

## 独立人工评价

每对至少两名具相关经历、未参与这次表达的评价者。先做盲化比较并锁定，然后做不看 AI 的原始优先级判断。若同一人评两部分，比较必须先锁定，防止先看到原始版本而识别顺序。

| 维度 | 1 分锚点 | 3 分锚点 | 5 分锚点 |
| --- | --- | --- | --- |
| Message clarity | 无法辨认主旨 | 主旨可辨但部分含糊 | 主旨与要点清楚且一致 |
| Audience suitability | 知识背景明显不匹配 | 基本可理解，仍有解释缺口 | 对目标听众给出恰当背景、术语和例子 |
| Persuasiveness | 关键主张没有合适支持 | 有相关理由但支持有限 | 理由、证据和限制适合既定目标 |
| Actionability | 需要行动时无法理解下一步 | 下一步或 takeaway 大致可辨 | 与目标一致的明确行动或 takeaway |

当目标只是告知且某维度不适用时，用 null 并写原因，不强迫制造 persuasion 或 CTA 问题。评价者独立选择 A、B、tie 或 insufficient，并解释；更长、更多词或更接近模型建议本身不是更好的证据。

```sh
node scripts/core-value/evaluate.mjs blind /private/tmp/speaknow-consented-study/dataset.json /private/tmp/speaknow-blind
```

只给评价者 `blind-packet.json` 与中性名称录音。保留 private-mapping 与 AI 输出给研究负责人。文件中的随机顺序不是完美盲化，内容本身仍可能暴露改写痕迹。

用 `forms/blind-rating.template.json` 收集真实评分，去掉 templateOnly 字段，将记录数组写入 human-ratings.json。未填的模板不能当真实评分导入。

```sh
node scripts/core-value/evaluate.mjs lock /private/tmp/speaknow-consented-study/dataset.json human-ratings.json locked-ratings.json /private/tmp/speaknow-blind/private-mapping.json
```

锁定将数据、顺序与评分绑定到摘要，用于发现事后改动；它不是评价者身份认证或防造假系统。

## Moment Surgeon 校准

单独导出所有符合条件的原始演讲，包括模型没有首要建议的案例：

```sh
node scripts/core-value/evaluate.mjs priority-blind /private/tmp/speaknow-consented-study/dataset.json /private/tmp/speaknow-priority-blind
```

不展示 AI 选择。评价者自行选择原句、问题类别、重要程度、可改善程度和理由。没有强优先项时填 `No strong priority`。不要逼迫评价者填写问题。

用 priority-review 模板收集：practiceId、raterId、independentBeforeAi、category、originalQuote、importance、fixability、reason。非空优先问题的引文必须来自原文。重要程度与可改善程度是人的主观 1–5 量表，绝不是产品自动能力分。

```sh
node scripts/core-value/evaluate.mjs lock-priorities /private/tmp/speaknow-consented-study/dataset.json priority-reviews.json locked-priorities.json
node scripts/core-value/evaluate.mjs report /private/tmp/speaknow-consented-study/dataset.json locked-ratings.json /private/tmp/speaknow-blind/private-mapping.json locked-priorities.json
```

查看四维变化、评价者是否一致、AI 标 Improved 中有多少被人工偏好 After，以及优先类别一致率。保留分歧，不把它们改成 Improved。类别相同不代表选中了同一句或最重要的问题；应结合原句、重要程度与理由逐例复核。

单次 Before/After 改善也可能来自重复练习。要宣传 SpeakNow 的因果效果或优于替代工具，还需要预先安排练习次数/时间相当的对照和后续新任务，不能只靠 AI 与人工标签一致。

## 商业记录

| 指标 | 本轮定义 |
| --- | --- |
| Activation | 第一次原始练习的录音、转写与反馈均保存；主要统计先保留未编辑转写来源 |
| Value Moment | 完成反馈后的录音定向重练；不等于已证明改善 |
| D7 | 激活后第 7–8 天窗口内另一次完成练习；只纳入观察窗口结束的用户 |
| Payment | 实际提供方案后完成付款并有核查证据；意愿、点击和模拟支付不算 |

```sh
node scripts/core-value/evaluate.mjs metrics /private/tmp/speaknow-consented-study/dataset.json offers.json
```

仅针对真实试点，提供一个实际可交付方案：$5 Task Pass、$10 Monthly 或 $15 Monthly。分别统计方案，任务通行证与月订阅不应当成同一种购买直接比较。记录实际拒绝及原因、待决定；不知道就留 pending，而不是推测。

购买记录必须有正确金额、交易 ID、支付凭证位置和核查者；运营者应与支付渠道核对到账/状态。本工具只校验记录完整性，不连接支付机构，也不会证明一张凭证真实。不要记录卡号或支付密钥。尚未给出真实渠道，因此本轮没有发起收款或添加虚假 checkout。

模板在 `forms/payment-offer.template.json`。实际提供且可交付后才记录 offeredAt；尚未提供的计划不能充当销售漏斗。退款等情况须保留真实记录，不能当成持续付费证明。

## 就绪判断

- Not Ready：工程可运行但真实效果、专家评价、实际支付或关键连接仍缺失。
- Prototype Validated：实际核心路径与独立目标用户试点均有可复核结果，且没有用模型自评代替效果。
- Early Product Market Fit：还需要多个观察期的真实重复使用、续用/付款与可重复获客证据。

评测脚本不会自动宣布 Product Market Fit，也不会因为一小批高评分就上调公司成熟度。
