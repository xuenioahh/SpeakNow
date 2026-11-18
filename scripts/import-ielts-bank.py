#!/usr/bin/env python3
"""Import the user's two IELTS PDFs from retained page text; no generated questions.
Run after extract-bank-pdf.swift. Layout/OCR snapshots resolve highlighted text.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'shared/question-bank'
SOURCES = DEST / 'sources/ielts'
read = lambda name: json.loads((SOURCES / name).read_text())
short = read('part1-pages.json')
full = read('complete-pages.json')
sets = {}
merged = 0
notes = []


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


def key(text):
    return re.sub(r'[^a-z0-9\u4e00-\u9fff]', '', text.lower().replace('’', "'"))


def ident(text):
    return hashlib.sha256(text.encode()).hexdigest()[:12]


ALIASES = {
    'study': 'Studies · 学习', 'studies': 'Studies · 学习', 'work': 'Work · 工作',
    'home & accommodation': 'Home & Accommodation · 住所', 'home or accommodation': 'Home & Accommodation · 住所',
    'hometown': 'Hometown · 家乡', 'the area you live in': 'The area you live in · 居住区域',
    'feeling bored': 'Feeling bored · 无聊', 'computers/tablets': 'Computers / tablets · 电脑和平板',
    'collecting things': 'Collecting things · 收藏', 'lost and found': 'Lost and found · 失物招领',
    'street market': 'Street markets · 街头市场', 'street markets': 'Street markets · 街头市场',
    'opportunities': 'Opportunities · 机会', 'opportunity': 'Opportunities · 机会',
    'secondary school': 'Secondary school · 中学', 'paper': 'Paper · 纸',
    'fruit and vegetables': 'Fruit and vegetables · 果蔬', 'vegetables': 'Vegetables · 蔬菜',
    'politeness': 'Politeness · 礼貌', 'tiredness': 'Tiredness · 疲惫',
    'rubbish and recycling': 'Rubbish and recycling · 垃圾与回收', 'travelling': 'Travelling · 旅行',
    'advertisement': 'Advertisements · 广告', 'advertisements': 'Advertisements · 广告',
    'friends': 'Friends · 朋友', 'shoes': 'Shoes · 鞋', 'name': 'Names · 名字', 'names': 'Names · 名字',
    'mirrors': 'Mirrors · 镜子', 'watch': 'Watch · 手表', 'cars': 'Cars · 汽车',
    'websites': 'Websites · 网站', 'public parks and gardens': 'Parks and gardens · 公园', 'park and gardens': 'Parks and gardens · 公园',
    'shopping': 'Shopping · 购物', 'tidiness': 'Tidiness · 整洁', 'music': 'Music · 音乐',
    'teachers': 'Teachers · 老师', 'social media': 'Social media · 社交媒体', 'clothes': 'Clothes · 衣服',
    'films/cinemas': 'Films / cinemas · 电影', 'dream and ambition': 'Dream and ambition · 梦想',
    'outer space and stars': 'Outer space and stars · 外太空', 'space travel': 'Outer space and stars · 外太空',
    'art': 'Art · 艺术', 'singing': 'Singing · 唱歌', 'evening time': 'Evening time · 夜晚',
    'old buildings': 'Old buildings · 老建筑', 'sports programs': 'Sports programs · 体育节目',
    'science': 'Science · 科学', 'headphones': 'Headphones · 耳机', 'headphone': 'Headphones · 耳机',
    'comedy / jokes': 'Comedy / jokes · 喜剧', 'history': 'History · 历史', 'morning routines': 'Morning routines · 早晨习惯',
    'morning routine': 'Morning routines · 早晨习惯'
}


def add(part, title, category, question, page, source, raw=None, reference=None, cue=None, **extra):
    global merged
    question = clean(question)
    if not question or question == 'TBC':
        return None
    set_id = f'ielts-{part}-{ident(title)}'
    qid = f'{set_id}-{ident(question + key(" ".join(cue or [])))}'
    item = sets.setdefault(set_id, dict(setId=set_id, exam='ielts', taskType=f'ielts-{part}', setTitle=title,
        category=category, categories=[category], sourceDate='2026-09–12', sourceType='user-supplied-pdf', sourceVersion=1,
        sourceFingerprint='', questions=[]))
    if category not in item['categories']:
        item['categories'].append(category)
    ref = dict(sourceId=source, page=page)
    match = next((q for q in item['questions'] if key(q['questionText']) == key(question) and key(' '.join(q.get('cuePoints', []))) == key(' '.join(cue or []))), None)
    if match:
        merged += 1
        if ref not in match['sourceRefs']:
            match['sourceRefs'].append(ref)
        if reference and not match.get('referenceAnswer'):
            match['referenceAnswer'] = reference
        elif reference and key(reference) != key(match.get('referenceAnswer') or ''):
            if reference not in match.setdefault('referenceAlternatives', []):
                match['referenceAlternatives'].append(reference)
        return item
    item['questions'].append(dict(questionId=qid, setId=set_id, questionOrder=len(item['questions']) + 1,
        questionText=question, rawText=raw or question, sourceRefs=[ref], referenceAnswer=reference,
        audioSource=None, availability=dict(sourceAudio=False, referenceAnswer=bool(reference)),
        **({'cuePoints': cue} if cue else {}), **extra))
    return item


# The short PDF has topic headings and numbered questions; TBC placeholders stay out.
category = 'Required · 必考题'
topic = None
for page, text in enumerate(short, 1):
    text = re.sub(r'(?<=\S)\s+(?=\d+\.\s)', '\n', text)
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('2026'):
            continue
        if line == 'Part 1 新题':
            category = 'New · 新题'; continue
        if line == '旧题保留':
            category = 'Retained · 保留题'; continue
        match = re.match(r'^(\d+)\.\s*(.+)$', line)
        if match:
            question = match[2]
            if question == 'TBC':
                notes.append(dict(sourceId='ielts-part1-pdf', page=page, topic=topic, issue='TBC placeholder omitted'))
            else:
                add('part1', topic, category, question, page, 'ielts-part1-pdf')
        elif re.search('[A-Za-z]', line):
            name = re.sub(r'\s*非大陆$', '', line).lower()
            if name not in ALIASES:
                raise ValueError(f'Unknown short-PDF topic: {line}')
            topic = ALIASES[name]


# Repair only extraction errors confirmed against OCR/layout or the page image.
patches = {
  5: [('or\n1.Who', 'P1.Home or Accommodation\n1.Who')],
  7: [('万年老题之一', 'P1.Hometown\n万年老题之一'), ('1.Have you learned\nabout the of your\n?', '1.Have you learned anything about the history of your hometown?')],
  11: [('题目5.Is there anything you miss about your secondary\n', '题目5.Is there anything you miss about your secondary school?\n'), ('鞋子-新题', 'P1.Shoes 鞋子-新题')],
  12: [('礼貌-新题', 'P1.Politeness 礼貌-新题')],
  13: [('题目3.Have you met who was very polite ', '题目3.Have you met anyone who was very polite recently? ')],
  25: [('1.What kind of parks', 'P1.Park and Gardens\n1.What kind of parks'), ('()\nWere you', 'P1.Tidiness\n1.Were you')],
  26: [('()\n1.How often', 'P1.Headphone\n1.How often')],
  28: [('P1. ( )', 'P1.Social media'), ('1.Do you think car colours', 'P1.Cars\n1.Do you think car colours')],
  29: [('P1. ()', 'P1.Shopping')],
  30: [('1.What kind of clothes', 'P1.Clothes\n1.What kind of clothes')],
  32: [('1.Do you like science?', 'P1.Science\n1.Do you like science?')],
  43: [('4.How can the arts help spread in', '4.How can the arts help spread positive emotions in society?')],
  44: [('(by hand or Who this person is', '(by hand or\nWho this person is')],
  57: [('Isitgoodtoarriveearlyinanysituation?', 'Is it good to arrive early in any situation?')],
  58: [('2.Do many people grow s or at home in your ', '2.Do many people grow vegetables or flowers at home in your country? ')],
  59: [('1.Do Chinese people like to visit\n', "1.Do Chinese people like to visit others'homes?\n"),
       ('2.What do Chinese people do when they visit\n', '2.What do Chinese people do when they visit others?\n'),
       ('3.What kind of place do people in your\n', '3.What kind of place do people in your country like to live in?\n'),
       ('100long time', 'long time')],
  60: [('Whydosomepeopleprefersendinga messageinsteadofmakingacall?', 'Why do some people prefer sending a message instead of making a call?')],
  68: [('Describe a problem with phone.', 'Describe a problem with technology you have encountered,like a computer or a cell phone.'),
       ('What it was\nyou have enco\na computer or a cell\n', 'What it was\n')]
}

parts = []
positions = []
for page, text in enumerate(full, 1):
    if page < 3:
        continue
    for old, new in patches.get(page, []):
        if old not in text:
            raise ValueError(f'Expected correction no longer matches page {page}: {old!r}')
        text = text.replace(old, new, 1)
    # Footers contain displaced highlighted text; patched above before trimming.
    text = re.split(r'第\s*\d+\s*页', text, maxsplit=1)[0]
    text = re.sub(r'^2026[^\n]*(?:命中率!)?', lambda m: m[0].split('命中率!', 1)[1] if '命中率!' in m[0] else '', text)
    text = re.sub(r'P3有70%命中率!', '', text)
    text = re.sub(r'P1\.Work or Study[^\n]*', '', text)
    # This heading's Study suffix is on the following line, so retain it.
    text = re.sub(r'(?<!\n)(P1\.)', r'\n\1', text)
    positions.append((sum(len(x) for x in parts), page))
    parts.append(text + '\n')
body = ''.join(parts)


def page_at(offset):
    return max((p for start, p in positions if start <= offset), default=3)


def english(text):
    # Chinese translations and source-only metadata never become spoken prompts.
    return clean(re.split(r'[\u4e00-\u9fff]', text, maxsplit=1)[0]).replace('? ?', '?')


QSTART = r'(?:题目\s*)?(\d+)\s*[.．]\s*((?:Do|Did|Does|What|When|Where|Why|Who|How|Would|Will|Are|Is|Have|Has|Can|Should|Which|Were|Some|Many|On|In)\b)'
ANSWER = r'(?:考官答案|参\s*考\s*答\s*案|回\s*答)\s*[:：]?|Answer\s*(?:\([^)]*\))?\s*[:：]'


def parse_numbered(text, offset, part, title, category):
    matches = list(re.finditer(QSTART, text))
    for n, m in enumerate(matches):
        segment = text[m.start(2):matches[n + 1].start() if n + 1 < len(matches) else len(text)]
        answer_match = re.search(ANSWER, segment)
        front = segment[:answer_match.start()] if answer_match else segment
        # The direct PDF text keeps question wraps in the same segment.
        front = re.split(r'答案版|纯题目|Part\s*[23]|P2\.', front)[0]
        lines = front.strip().splitlines()
        question_lines = []
        for line in lines:
            value = english(line)
            if value:
                question_lines.append(value)
            if '?' in value or re.search(r'[\u4e00-\u9fff]', line):
                break
            if len(question_lines) == 1 and len(lines) > 1 and re.match(r'^(?:Yes|No|I[ \'’]|Honestly|In |There |People|Most |Some |The |It |Not )', lines[1]):
                break
        question = clean(' '.join(question_lines))
        if not question or len(question) > 500:
            notes.append(dict(page=page_at(offset + m.start()), issue='Rejected malformed question', raw=question[:200])); continue
        reference = None
        if not answer_match:
            rest = lines[len(question_lines):]
            rest = [line for line in rest if not re.search(r'[\u4e00-\u9fff]', line)]
            inferred = clean(' '.join(rest))
            if inferred and not re.search(r'Part\s*[23]|P2\.|答案版|纯题目', inferred):
                reference = inferred
        if answer_match:
            value = segment[answer_match.end():]
            value = re.split(r'答案版|纯题目|Part\s*[23]|P[12]\.|9-12月', value)[0]
            value = clean(value)
            # Do not import responses damaged by highlighted PDF extraction.
            if value and not re.search(r'[\u4e00-\u9fff]', value):
                reference = value
        add(part, title, category, question, page_at(offset + m.start()), 'ielts-complete-pdf', raw=clean(' '.join(lines[:len(question_lines)])), reference=reference)


p2_start = body.index('Describe a person you only met once')
p1_body = body[:p2_start]
headings = list(re.finditer(r'P1\.\s*([A-Za-z][A-Za-z /&-]*)', p1_body))
for i, m in enumerate(headings):
    name = m[1].strip().lower()
    title = ALIASES.get(name)
    if not title:
        raise ValueError(f'Unknown complete-PDF topic: {name}')
    end = headings[i+1].start() if i+1 < len(headings) else len(p1_body)
    segment = p1_body[m.end():end]
    # A repeated shoe answer in the Politeness section is a source error.
    if name == 'politeness':
        segment = re.sub(r'题目1\.Would you choose to wear sneakers.*?(?=题目2\.)', lambda match: ' ' * len(match[0]), segment, flags=re.S)
    category = 'Required · 必考题' if page_at(m.start()) < 9 else 'New · 新题' if page_at(m.start()) < 23 else 'Retained · 保留题'
    parse_numbered(segment, m.end(), 'part1', title, category)

# Part 2 cues, their sample answers, and their actual related Part 3 questions.
starts = list(re.finditer(r'Describe\s+[^\n]+|A high-rise building you like or dislike\.', body[p2_start:]))
# Only prompt starts immediately followed by a cue marker (or the truncated handcraft prompt).
starts = [m for m in starts if re.search(r'You should say|Some instructions|Who this person is', body[p2_start+m.end():p2_start+m.end()+170]) or 'You should say' in m[0] or 'Some instructions' in m[0]]
part2_titles = [
 'A person you met once · 想继续了解的人', 'A noisy place · 吵闹的地方', 'Saving money · 攒钱买东西',
 'A noisy place · 吵闹的地方', 'A natural place · 自然之地', 'A happy person · 开心的人',
 'An older person · 想见的老人', 'An enjoyable evening · 美好夜晚', 'Interviewing a famous person · 采访名人',
 'A person who makes objects · 手工达人', 'A childhood skill · 童年新技能', 'A photographer · 喜欢拍照的人',
 'Helping someone · 帮助他人', 'An organized person · 有条理的人', 'Waiting · 等待特殊事情',
 'A gift · 送礼物', 'A power cut · 家里停电', 'Special food · 节日食物', 'A technology problem · 电子产品故障',
 'A good place to live · 宜居之地', 'A high-rise building · 高楼', 'A live sports match · 现场比赛',
 'A successful business · 事业成功的人', 'Growing plants · 种植物的人', 'An important decision · 重要决定',
 'Local news · 当地新闻', 'Getting up early · 早起经历', 'Growing plants at home · 在家种植物',
 'An animal story · 动物故事', 'A home to visit · 喜欢拜访的家', 'A changed plan · 改变计划',
 'Waiting for a reply · 很久未回复的信息', 'A boring place · 无聊的地方', 'Local news · 当地新闻',
 'A medical professional · 医疗行业的人', 'A business person · 仰慕的商人', 'Special food · 节日食物',
 'A live sports match · 现场比赛', 'Changing a decision · 改变决定', 'A technology problem · 电子产品故障',
 'A celebrity advertisement · 名人广告'
]
if len(starts) != len(part2_titles):
    raise ValueError(f'Part2 section alignment changed: {len(starts)} vs {len(part2_titles)}: {[m[0] for m in starts]}')

for i, m in enumerate(starts):
    start = p2_start + m.start()
    end = p2_start + starts[i+1].start() if i+1 < len(starts) else len(body)
    segment = body[start:end]
    prompt_end = re.search(r'You should say\s*:?|Some instructions[^\n]*:?|(?=Who this person is)', segment)
    if not prompt_end:
        raise ValueError(f'No cue start: {segment[:200]}')
    prompt = clean(segment[:prompt_end.start()])
    if '(by hand or' in prompt:
        notes.append(dict(page=page_at(start), issue='Source has a truncated parenthesis; retained raw text and used complete main clause'))
        prompt = prompt.split('(by hand or')[0].strip()
    marker_end = prompt_end.end()
    after = segment[marker_end:]
    part3 = re.search(r'Part\s*3[^\n]*', after)
    answer = re.search(ANSWER, after)
    # A cue ends at its final "And..." line, before translations, answers, and topic headings.
    cue_end = min([x.start() for x in [part3, answer] if x] + [len(after)])
    cue_text = after[:cue_end]
    cues = []
    for line in cue_text.splitlines():
        line = english(line).split('P2.')[0].strip()
        if not line or re.match(r'^(?:P2\.|Part|9-12|\d+\.)', line):
            continue
        if not re.match(r'^(Who|When|What|Where|Why|How|And|Whether|Is|Explain)', line):
            continue
        split = re.split(r'(?<=\S)\s+(?=(?:Who |When |What |Where |Why |How |And |Whether |Explain ))', line)
        cues.extend(split)
        if re.search(r'\bAnd (?:explain |how )', line):
            break
    reference = None
    if answer:
        reference = clean(after[answer.end():part3.start() if part3 else len(after)])
        reference = re.split(r'P2\.|Part\s*2', reference)[0].strip()
        if re.search(r'[\u4e00-\u9fff]', reference):
            reference = None
    title = part2_titles[i]
    category = 'New · 新题' if page_at(start) < 50 else 'Retained · 保留题'
    item = add('part2', title, category, prompt, page_at(start), 'ielts-complete-pdf', raw=clean(segment[:marker_end] + cue_text), reference=reference, cue=cues)
    discussion = after[part3.end():] if part3 else ''
    if discussion:
        parse_numbered(discussion, start+marker_end+part3.end(), 'part3', title, category)
        if not re.search(QSTART, discussion):
            # Some source discussions are bulleted or unnumbered.
            for line in discussion.splitlines():
                line = english(line.lstrip('·• '))
                if re.match(r'^(?:What|Why|How|Do|Is|Should|Many)\b', line) and '?' in line:
                    for question in re.findall(r'[^?]+\?', line):
                        add('part3', title, category, question, page_at(start + marker_end + part3.end()), 'ielts-complete-pdf')
    # The source provides these discussions only in Chinese. Preserve those prompts.
    chinese = {
        1: ['什么地方在你们国家比较吵闹', '你认为吵的地方一定比安静的好吗', '遇到吵闹的行为人们会采取什么行为?', '吵闹和安静的环境哪个比较好', '为什么吵闹的地方会吵闹?', '为什么安静的地方会有利于你反省?'],
        11: ['人们喜欢拍什么照片?', '你认为什么地方都可以拍照片吗?', '有些人拍照时不介意别人入镜，你怎么看?'],
        12: ['喜欢帮助他人吗', '父母教孩子帮助他人重要吗', '只有父母教自己孩子行吗']
    }
    for question in chinese.get(i, []):
        add('part3', title, category, question, page_at(start), 'ielts-complete-pdf', sourceLanguage='zh')
    related_id = f'ielts-part3-{ident(title)}'
    if related_id in sets:
        item['relatedSetId'] = related_id
        sets[related_id]['relatedSetId'] = item['setId']

# Fingerprints depend on retained input text, so reruns are reproducible without WeChat temp files.
for item in sets.values():
    item['sourceFingerprint'] = hashlib.sha256(json.dumps(item['questions'], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    for q in item['questions']:
        q['availability']['referenceAnswer'] = bool(q['referenceAnswer'])
        q['sourceRefs'].sort(key=lambda ref: (ref['sourceId'], ref['page']))
    if item['taskType'] == 'ielts-part2':
        assert all(q.get('cuePoints') for q in item['questions']), item['setTitle']

result = dict(version=1, season='2026 September–December', sets=list(sets.values()))
(DEST/'ielts-catalogue.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
report = dict(sources=[dict(sourceId='ielts-part1-pdf', name='2026 9-12 Part 1 新题+老题.pdf', pages=9),
    dict(sourceId='ielts-complete-pdf', name='9-12月雅思口语题库更新_20260907174139.pdf', pages=69)],
    counts={part:dict(sets=sum(s['taskType']==f'ielts-{part}' for s in sets.values()),
        questions=sum(len(s['questions']) for s in sets.values() if s['taskType']==f'ielts-{part}')) for part in ['part1','part2','part3']},
    duplicatesMerged=merged, referenceAnswers=sum(bool(q['referenceAnswer']) for s in sets.values() for q in s['questions']),
    notes=notes+[dict(page=12, issue='Misplaced shoe answer in Politeness was excluded; no replacement answer invented')])
(DEST/'ielts-import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(report, ensure_ascii=False, indent=2))
