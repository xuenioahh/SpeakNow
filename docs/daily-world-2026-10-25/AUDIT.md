# Daily Conversation：逐场审计与空间映射

审计依据：现有 `immersiveScenarios.js`、`scenarios.js`、原 `buildRoom.js`、实际浏览器截图。12 个房间均为真实程序化几何体；未找到任何 GLB/FBX/OBJ 人物资源。原有“纸片感”来自不完整、无关节的人体形状，并非把人物照片贴在 Plane 上。所有现有任务目标均保留。

| Scene | 原人物 | 原镜头 | 共同问题与处理 |
|---|---|---|---|
| Airport | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Bank | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Hotel | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Restaurant | None；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Shopping | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Hospital | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| University | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Office | One incomplete attendant；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Phone Call | None；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Car Rental | None；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Museum | None；无骨骼 | 共用 3 个远景轨道镜头 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |
| Café | One incomplete attendant; conditional floating friend；无骨骼 | 3 个手工镜头，但店员移动、朋友显隐 | 固定三位角色、独立镜头、空间标签与字幕；共用现有语音链路 |

三个交谈点均在同一房间中常驻。表中站位为世界坐标（米），Y=0 是角色根节点；脚底加地板厚度偏移。Phone 场景人物是电话任务的虚拟角色扮演对象，不是声称电话客服实际站在用户家里。

| Scene / Conversation | 原任务目标 | 人物 / 站点 / 姿态 | NPC位置 | 镜头位置 → 目标 |
|---|---|---|---|---|
| Airport / Check departures | Practice flight BA123 to New York is delayed. The display shows 16:40 at gate B12. | Alex · Airport Gate Agent / Departure desk / standing | -1, 0, -1.3 | -0.8, 1.65, 3.5 → -1, 1.35, -1.3 |
| Airport / Ask about connections | Have your travel details ready and explain why your connection matters. | Sam · Airport Gate Agent / Connections desk / standing | 0.85, 0, -1.3 | 0.68, 1.65, 3.5 → 0.85, 1.35, -1.3 |
| Airport / Check your baggage | Find out what happens to checked bags if your itinerary changes. | Jamie · Airport Gate Agent / Baggage station / standing | 2.65, 0, 0.25 | 2.12, 1.65, 3.5 → 2.65, 1.35, 0.25 |
| Bank / Compare accounts | Ask the teller to explain interest, minimum balances, and fees. These are fictional practice accounts. | Alex · Bank Teller / Account information / standing | -1.15, 0, -1.3 | -0.9199999999999999, 1.65, 3.5 → -1.15, 1.35, -1.3 |
| Bank / Open an account | You have recently moved and want to understand the application process. | Sam · Bank Teller / Application desk / standing | 0.8, 0, -1.3 | 0.6400000000000001, 1.65, 3.5 → 0.8, 1.35, -1.3 |
| Bank / Check identification | Confirm the documents required before completing the application. | Jamie · Bank Teller / Document check / standing | 2.65, 0, 0.25 | 2.12, 1.65, 3.5 → 2.65, 1.35, 0.25 |
| Hotel / Call the receptionist | You have lost your room key. Start with a polite request for help. | Alex · Hotel Receptionist / Reception / standing | -1.15, 0, -1.45 | -0.9199999999999999, 1.65, 3.5 → -1.15, 1.35, -1.45 |
| Hotel / Replace your key | The receptionist needs to verify your name and room number. | Sam · Hotel Receptionist / Key desk / standing | 0.85, 0, -1.45 | 0.68, 1.65, 3.5 → 0.85, 1.35, -1.45 |
| Hotel / Confirm checkout | For this practice stay, the displayed checkout time is 11:00. | Jamie · Hotel Receptionist / Guest services / standing | 2.65, 0, 0.35 | 2.12, 1.65, 3.5 → 2.65, 1.35, 0.35 |
| Restaurant / Explore the menu | Tell the waiter about your nut allergy before choosing your meal. | Alex · Restaurant Waiter / Menu service / standing | -2.25, 0, 0.15 | -1.7, 1.65, 3.7 → -2.25, 1.35, 0.15 |
| Restaurant / Check ingredients | A menu alone cannot confirm allergy safety. Ask the waiter to check with the kitchen. | Sam · Restaurant Waiter / Kitchen liaison / standing | 0.3, 0, -1.7 | 0.24, 1.65, 3.5 → 0.3, 1.35, -1.7 |
| Restaurant / Choose a drink | Ask for a recommendation and clarify the size before ordering. | Jamie · Restaurant Waiter / Drinks service / standing | 2.5, 0, -0.7 | 2, 1.65, 3.5 → 2.5, 1.35, -0.7 |
| Shopping / Show the defect | You bought this laptop last week. Explain the problem with its display. | Alex · Sales Associate / Technical service / standing | -1.05, 0, -1.05 | -2.65, 1.65, 3.4 → -1.05, 1.35, -1.05 |
| Shopping / Find your receipt | Your proof of purchase helps the associate check the return options. | Sam · Sales Associate / Returns desk / standing | 0.85, 0, -1.05 | 0.68, 1.65, 3.5 → 0.85, 1.35, -1.05 |
| Shopping / Compare alternatives | Decide whether you would prefer a replacement or a refund. | Jamie · Sales Associate / Product display / standing | 2.65, 0, 0.6 | 2.12, 1.65, 3.5 → 2.65, 1.35, 0.6 |
| Hospital / Describe symptoms | Your role-play symptoms: headaches for two weeks, worse in the morning, sometimes with dizziness. | Alex · Doctor / Consultation desk / standing | -0.6, 0, -1.3 | -0.48, 1.65, 3.5 → -0.6, 1.35, -1.3 |
| Hospital / Give more detail | Explain when the headaches happen, how long they last, and how they affect you. | Sam · Doctor / Examination area / standing | -2.25, 0, 1 | -1.7, 1.65, 3.8 → -2.25, 1.35, 1 |
| Hospital / Ask about next steps | Practise checking that you understood the doctor’s explanation. | Jamie · Doctor / Follow-up desk / standing | 2.55, 0, 0.3 | 2.04, 1.65, 3.5 → 2.55, 1.35, 0.3 |
| University / Plan your semester | You are a sophomore choosing courses for next semester. | Alex · Academic Advisor / Study planning / standing | -0.7, 0, -1.3 | -0.5599999999999999, 1.65, 3.5 → -0.7, 1.35, -1.3 |
| University / Explore electives | Ask how electives fit your interests and course requirements. | Sam · Academic Advisor / Elective books / standing | -2.35, 0, -0.8 | -1.8, 1.65, 3.3 → -2.35, 1.35, -0.8 |
| University / Check your schedule | Look for prerequisites and timetable conflicts before registering. | Jamie · Academic Advisor / Registration calendar / standing | 2.5, 0, 0.15 | 2, 1.65, 3.5 → 2.5, 1.35, 0.15 |
| Office / Choose your dates | You want to take two weeks off next month for a family trip. | Alex · Team Manager / Team calendar / standing | 0.4, 0, -1.3 | 0.32000000000000006, 1.65, 3.5 → 0.4, 1.35, -1.3 |
| Office / Discuss coverage | Make a clear plan for ongoing work while you are away. | Sam · Team Manager / Coverage discussion / standing | -2.15, 0, -0.6 | -1.8, 1.65, 3.3 → -2.15, 1.35, -0.6 |
| Office / Agree on a handover | Confirm who will cover your responsibilities and what approval is needed. | Jamie · Team Manager / Handover station / standing | 2.5, 0, 0.2 | 2, 1.65, 3.5 → 2.5, 1.35, 0.2 |
| Phone Call / Start your call | Introduce yourself and state the reason for calling. | Alex · Phone Support Representative / Support call / standing | -0.8, 0, -1.3 | -0.6400000000000001, 1.65, 3.5 → -0.8, 1.35, -1.3 |
| Phone Call / Query the charge | This practice bill includes an unfamiliar extra charge of $50. | Sam · Billing Representative / Billing discussion / standing | -2.2, 0, -0.7 | -1.7, 1.65, 3.3 → -2.2, 1.35, -0.7 |
| Phone Call / Confirm the resolution | Before ending the call, confirm the agreed action and timing. | Jamie · Phone Support Representative / Resolution desk / standing | 2.25, 0, 0.3 | 1.8, 1.65, 3.5 → 2.25, 1.35, 0.3 |
| Car Rental / Choose your car | You need a comfortable car for a week-long coastal road trip. | Alex · Rental Agent / Vehicle viewing / standing | -2.65, 0, -1.15 | -2.6, 1.65, 3.8 → -2.65, 1.35, -1.15 |
| Car Rental / Check the extras | Confirm navigation, mileage allowance, and the return time. | Sam · Rental Agent / Key desk / standing | 2, 0, -1.6 | 1.6, 1.65, 3.5 → 2, 1.35, -1.6 |
| Car Rental / Understand cover | Ask the rental agent to explain the insurance and any excess. | Jamie · Rental Agent / Cover information / standing | 2.65, 0, 0.85 | 2.8, 1.65, 3.9 → 2.65, 1.35, 0.85 |
| Museum / Notice the light | This illustrative study is a conversation starter about light and color, not a reproduction of a named artwork. | Alex · Museum Guide / Light study / standing | -2.45, 0, -1.35 | -2.3, 1.65, 3.6 → -2.45, 1.35, -1.35 |
| Museum / Look at the form | Compare the central sculpture’s shape with the paintings around it. | Sam · Museum Guide / Sculpture discussion / standing | 1.45, 0, 0.25 | 1.16, 1.65, 3.5 → 1.45, 1.35, 0.25 |
| Museum / Ask your guide | Ask your guide to name three Impressionist works and explain their techniques. | Jamie · Museum Guide / Landscape study / standing | 2.45, 0, -1.3 | 3.05, 1.65, 3.35 → 2.45, 1.35, -1.3 |
| Café / At the Counter | Order drinks for your group and explain the oat-milk preference. | Alex · Barista / Main counter / standing | 0.05, 0, -1.62 | 0.04000000000000001, 1.65, 3.5 → 0.05, 1.35, -1.62 |
| Café / At the Pickup Area | Ask the barista to check a mix-up with your order. | Sam · Pickup barista / Pickup counter / standing | 1.65, 0, -1.62 | 1.32, 1.65, 3.5 → 1.65, 1.35, -1.62 |
| Café / At the Table | Chat with a friend by the window about your morning plans. | Jamie · Friend at the café / Window table / seated | -2.25, 0, 1.15 | -1.7, 1.43, 3.8 → -2.25, 1.05, 1.15 |

全部角色：原创程序化模型，17 根骨骼、材质批次合并的 SkinnedMesh、立体头发和面部、独立眼睑、手与指形、完整腿和鞋。无外部模型、音频或动画版权依赖。已有房间保留；Café 增加与朋友姿态对应的椅子和桌子。骨骼驱动呼吸、倾听、实际请求期间的思考姿态、实际 TTS 播放期间的手势，以及播放结束的一次轻微回应。并非写实扫描人物，也没有现成表情 Blend Shapes。

语音：复用真实麦克风、MediaRecorder、Web Speech Recognition、VAD、SSE 对话。浏览器 SpeechSynthesis 没有 PCM/Viseme，只同步实际播放事件、分段字幕与手势；可解码的动态/已保存音频接入 AudioContext Analyser 与 PannerNode，只有真实输出能量驱动有限嘴部开合，不是音素级口型。动态 TTS 没有逐词时间戳时显示整段短回复，不伪造逐词时间。默认人物旁字幕，底部字幕/关闭为无障碍替代。

房间补齐右侧朝内墙面与踢脚线，避免交谈镜头右侧露出大片舞台外背景。俯视预览保留建筑模型式剖面；对话过程中墙面与家具的位置不变。
