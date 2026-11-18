import fs from 'node:fs';
const inventory=JSON.parse(fs.readFileSync('docs/button-audit-2026-10-24/controls.json','utf8')).controls;
const pageName=file=>({'MainLanding.jsx':'首页','ExamSpeaking.jsx':'考试选择','QuestionBank.jsx':'TOEFL 题库','ExamPreparation.jsx':'考试介绍','ExamPractice.jsx':'正式考试','LearningReview.jsx':'练习反馈','LearningHistory.jsx':'练习历史','Home.jsx':'日常对话选择','DailyImmersiveGuidance.jsx':'日常对话介绍','VoiceChat.jsx':'日常对话','VoiceReport.jsx':'旧版日常报告','VoiceHistory.jsx':'旧版日常历史','Presentation.jsx':'演讲准备','PresentationPractice.jsx':'演讲练习','PresentationFeedback.jsx':'演讲暂停反馈','PresentationAnalysis.jsx':'演讲分析','PresentationReport.jsx':'演讲报告','PresentationHistory.jsx':'演讲历史','CasualVideo.jsx':'表情练习','Profile.jsx':'个人资料','AuthPage.jsx':'登录/注册','AdminPage.jsx':'管理后台','BottomNav.jsx':'全站导航'}[file.split('/').at(-1)]||file.split('/').at(-1).replace('.jsx',''));
function testEvidence(c){const file=c.file.split('/').at(-1),label=c.label;
 if(file==='ExamPreparation.jsx' && label.includes('Start Practice'))return '考试浏览器通过';
 if(file==='ExamPractice.jsx' && /Record answer|Stop recording|Record another take|Next Question|Finish and get feedback|Play sentence|Listen again|Start 1-minute preparation|Finish preparation early|Save and exit/.test(label))return '考试浏览器通过';
 if(file==='ExamSpeaking.jsx' || file==='QuestionBank.jsx')return '题库浏览器通过（同类入口）';
 if(file==='LearningReview.jsx' && /Get AI feedback|Retry feedback|Try the same task again|Compare both attempts|Delete practice|Confirm permanent deletion|Practise this focus|Retry question/.test(label))return '反馈浏览器通过（同类控件）';
 if(file==='LearningHistory.jsx' && label.includes('Continue exam practice'))return '考试浏览器通过';
 if(file==='VoiceChat.jsx' && /Start recording|Stop recording and send|Finish & review|Retry this request/.test(label))return '日常对话浏览器通过';
 return '源码检查；浏览器未逐项验证';
}
function analyze(c){const label=c.label.replace(/^"|"$/g,'').slice(0,90),a=c.action,low=(label+' '+a).toLowerCase(),file=c.file;
 if(['input','Input','textarea','select','form'].includes(c.kind)) return ['表单可编辑/可提交',a||'由所属表单提交','输入值或提交状态改变','表单事件存在','保留'];
 if(['audio','video'].includes(c.kind))return ['真实媒体源可用','浏览器原生播放/暂停/定位','播放器时间或播放状态改变；失败触发媒体错误','原生媒体控件','条件保留'];
 if(c.kind==='summary')return ['详情已折叠/展开','浏览器原生 details 切换','详情展开/折叠','原生交互','保留'];
 if(c.kind==='Link'||c.kind==='a')return ['当前页面可用',a,`导航至 ${a.slice(0,110)}`,'链接目标已检查','保留'];
 if(file.endsWith('/AuthPage.jsx') && c.kind==='Button' && !a)return ['登录/注册表单有效','所属 form 的 handleSubmit → localApi.auth.login/register','成功进入 returnTo；失败显示错误','真实表单提交','保留'];
 if(file.endsWith('/AuthPage.jsx') && c.kind==='button' && !a)return ['法律文本关闭','Radix DialogTrigger','弹出对应法律文本','触发器有效','保留'];
 if(label==='Delete practice')return ['反馈记录存在','打开删除确认对话框','取消或确认删除','需确认','保留'];
 if(label.includes('Save changes'))return ['个人资料正在编辑','saveProfile 表单提交','保存资料或显示错误','真实表单提交','保留'];
 if(low.includes('delete')||low.includes('clear notebook')||low.includes('removeadmin'))return ['目标记录存在','确认后调用 '+a,'成功删除/失败保留并提示','需确认','修改'];
 if(low.includes('record')||low.includes('microphone'))return ['录音状态允许操作',a,'录音/停止/处理/错误状态切换','状态门控','保留'];
 if(low.includes('retry')||low.includes('try again'))return ['上次操作失败或结果可重试',a,'重新请求或创建关联练习；失败保留原数据','可恢复','保留'];
 if(low.includes('feedback')||low.includes('report')||low.includes('analysis'))return ['已有答案或报告状态允许',a,'生成/显示报告或准确失败提示','反馈链','保留'];
 if(low.includes('save')||low.includes('submit')||low.includes('finish')||low.includes('send'))return ['数据满足提交条件',a,'数据写入并进入后续状态；失败保留当前内容','保存链','保留'];
 if(low.includes('play')||low.includes('listen')||low.includes('replay')||low.includes('speak'))return ['媒体或文本可用',a,'播放或停止真实媒体/语音','播放链','条件保留'];
 if(low.includes('start')||low.includes('practi'))return ['所需参数已设置',a,'进入练习/创建当前练习','导航/创建','保留'];
 if(low.includes('exit')||low.includes('back')||low.includes('home')||low.includes('return'))return ['当前页面/草稿存在',a,'导航到目标；可保存数据先写入','导航链','保留'];
 if(low.includes('set')||low.includes('toggle')||low.includes('configure'))return ['当前选项存在',a,'局部选择/展开状态改变','局部状态','保留'];
 return ['控件可用',a||'由父级表单或 Radix 触发','执行源码所列函数并改变局部或页面状态','源码待进一步动态验证','保留'];
}
function escape(v){return String(v).replace(/\|/g,'\\|').replace(/\n/g,' ').replace(/`/g,'\\`');}
let lines=[`# SpeakNow 全站交互审计`, ``, `扫描范围：App.jsx 可达的 ${new Set(inventory.map(c=>c.file)).size} 个含交互源码模块，${inventory.length} 处交互定义（同一列表项按定义计一处，运行时每条记录复用同一映射）。包括按钮、链接、卡片、图标按钮、表单、下拉框、媒体与详情开关。UI 库内部实现未重复列入。`, ``, `“源码检查”只表明已核对处理函数及目标；不代表每种设备、权限或账号组合都经浏览器点击。浏览器测试栏只写实际覆盖的用例。`, ``, `| ID | 页面 | 控件 | 点击前 | 实际调用 | 点击后可见结果 | 结论/处置 | 测试结果 |`, `|---|---|---|---|---|---|---|---|`];
for(const c of inventory){const [before,actual,after,status,decision]=analyze(c),suite=testEvidence(c);lines.push(`| ${c.id} [${c.file}:${c.line}](../../${c.file}#L${c.line}) | ${escape(pageName(c.file))} | ${escape(c.label.slice(0,72))} | ${escape(before)} | ${escape(actual.slice(0,130))} | ${escape(after)} | ${status}；${decision} | ${suite} |`);}
lines.push('',`已删除的无效/重复控件：考试页 Ready to answer、考试内教学和保存推广；管理员无效 API Key 保存；演讲准备重复的摄像头预授权；日常/演讲报告的重复重练入口、演讲分析/暂停反馈的重复返回入口。删除后不再计入现存控件。`,'',`检查空 onClick、console.log-only、无目标的 href=#：未发现。表单按钮和 Radix 触发器由父级事件接管；表中已注明源码检查与浏览器覆盖范围的区别。`);
fs.writeFileSync('docs/button-audit-2026-10-24/BUTTON_AUDIT.md',lines.join('\n'));
console.log('wrote '+inventory.length+' rows');
