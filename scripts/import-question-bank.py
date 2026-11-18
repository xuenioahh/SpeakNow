"""Import supplied sources without rewriting questions or inventing missing items.

Uses Python's standard library and macOS PDFKit (the adjacent Swift extractor).
Original extracted text, source hashes, locators, duplicates and anomalies are retained.
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'shared/question-bank'
SOURCES = OUT / 'sources'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(text):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', text)).strip()


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def save_json(path, value):
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as temporary:
        json.dump(value, temporary, ensure_ascii=False, indent=2)
        temporary.write('\n')
    Path(temporary.name).replace(path)


def category(text):
    for word, title in [('学术', 'Academic Skills'), ('校园', 'Campus Life'), ('社区', 'Community'),
                        ('兴趣', 'Interests'), ('生活', 'Everyday Life'), ('旅行', 'Travel'), ('职场', 'Work')]:
        if word in text:
            return title
    return normalized(text)


def repeat_sets(rows, source_id):
    result, group, question, section = [], None, None, ''
    for index, row in enumerate(rows, 1):
        line, page = row[:2]
        source_line = row[2] if len(row) > 2 else index
        line = line.strip()
        section_match = re.search(r'[一二三四五六七八九十]+、(.+)', line)
        heading = re.match(r'^(20\d{2}-\d{2}-\d{2})\s+(.+)$', line)
        numbered = re.match(r'^(\d{1,2})\.\s*(.+)$', line)
        if section_match:
            section = category(section_match[1])
            question = None
        elif heading:
            group = dict(taskType='repeat', setTitle=normalized(heading[2]), category=section, sourceDate=heading[1], questions=[])
            result.append(group)
            question = None
        elif numbered and group:
            question = dict(questionOrder=int(numbered[1]), rawText=numbered[2], referenceAnswer=None,
                            sourceRefs=[dict(sourceId=source_id, line=source_line, page=page)])
            group['questions'].append(question)
        elif line.startswith('核心词汇'):
            question = None
        elif line and question:
            question['rawText'] += '\n' + line
    for group in result:
        for question in group['questions']:
            question['questionText'] = normalized(re.sub(r'\s*/\s*', ' ', question['rawText']))
    return result


def interview_sets(text, source_id, anomalies):
    result = []
    for match in re.finditer(r'^## (\d+\.\d+)\s*[—–-]\s*([^\n]+)\n(.*?)(?=^## |\Z)', text, re.M | re.S):
        date, title, body = match.groups()
        group = dict(taskType='interview', setTitle=title.strip(), category=title.strip(), sourceDate=date, questions=[])
        for item in re.finditer(r'^### (\d+)\.\s*([^\n]+)\n(.*?)(?=^### |\Z)', body, re.M | re.S):
            order, original, answer_body = item.groups()
            question_text = normalized(original)
            if re.match(r'^\d+\s*[-–]\s*[A-Za-z]', question_text):
                anomalies.append(dict(kind='embedded-number-removed', setTitle=title, sourceDate=date, original=original))
                question_text = re.sub(r'^\d+\s*[-–]\s*', '', question_text)
            answer = normalized(' '.join(re.findall(r'^>\s*(.+)$', answer_body, re.M))) or None
            if not answer:
                anomalies.append(dict(kind='missing-reference-answer', setTitle=title, questionOrder=int(order)))
            group['questions'].append(dict(questionOrder=int(order), rawText=original, questionText=question_text,
                                          referenceAnswer=answer,
                                          sourceRefs=[dict(sourceId=source_id, line=text[:match.start(3) + item.start()].count('\n') + 1)]))
        result.append(group)
    return result


def main():
    global OUT, SOURCES
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeat-pdf', type=Path, default=ROOT.parent / '语言/repeat真题参考.pdf')
    parser.add_argument('--interview-docx', type=Path, default=ROOT.parent / '语言/TOEFL Interview Speaking Practice Bank—精简终审版.docx')
    parser.add_argument('--repeat-text', type=Path, action='append')
    parser.add_argument('--output-dir', type=Path, default=OUT)
    args = parser.parse_args()
    OUT = args.output_dir
    SOURCES = OUT / 'sources'
    texts = args.repeat_text or sorted((Path.home() / 'Downloads').glob('粘贴的文本*20260821-105335*.txt'))
    SOURCES.mkdir(parents=True, exist_ok=True)
    report = dict(sources=[], missingFiles=[], duplicateFilesSkipped=0, duplicateSetsRemoved=0,
                  duplicateQuestionsRemoved=0, anomalies=[])
    if not (args.repeat_pdf.parent / 'repeat真题参考(1).pdf').exists():
        report['missingFiles'].append('repeat真题参考(1).pdf')
    groups, file_hashes = [], set()
    for path in [args.repeat_pdf, *texts, args.interview_docx]:
        if not path.exists():
            report['missingFiles'].append(str(path))
            continue
        sha = digest(path.read_bytes())
        source_id = 'source-' + sha[:16]
        record = dict(sourceId=source_id, name=path.name, sha256=sha, bytes=path.stat().st_size)
        report['sources'].append(record)
        if sha in file_hashes:
            report['duplicateFilesSkipped'] += 1
            record['duplicateFile'] = True
            continue
        file_hashes.add(sha)
        if path.suffix.lower() == '.pdf':
            cache = SOURCES / 'repeat-pdf-pages.json'
            stamp = SOURCES / 'repeat-pdf.sha256'
            if not cache.exists() or not stamp.exists() or stamp.read_text().strip() != sha:
                extracted = subprocess.run(['swift', '-module-cache-path', '/private/tmp/speaknow-bank-swift-cache',
                                            str(ROOT / 'scripts/extract-bank-pdf.swift'), str(path)], check=True, capture_output=True)
                cache.write_bytes(extracted.stdout)
                stamp.write_text(sha + '\n')
            pages = json.loads(cache.read_text())
            rows = [(part, page, line_number) for page, body in enumerate(pages, 1) for line_number, line in enumerate(body.splitlines(), 1)
                    for part in re.split(r'(?<=\.)\s+(?=\d{1,2}\.\s*[A-Za-z])', line)]
            parsed = repeat_sets(rows, source_id)
            record['rawTextFile'] = 'sources/repeat-pdf-pages.json'
        elif path.suffix.lower() == '.txt':
            text = path.read_text(encoding='utf-8-sig')
            (SOURCES / 'repeat-text.txt').write_text(text)
            parsed = repeat_sets([(line, None) for line in text.splitlines()], source_id)
            record['rawTextFile'] = 'sources/repeat-text.txt'
        else:
            with zipfile.ZipFile(path) as archive:
                root = ET.fromstring(archive.read('word/document.xml'))
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            text = '\n'.join(''.join(node.text or '' for node in paragraph.findall('.//w:t', ns))
                             for paragraph in root.findall('.//w:p', ns))
            (SOURCES / 'interview-document.txt').write_text(text)
            parsed = interview_sets(text, source_id, report['anomalies'])
            record['rawTextFile'] = 'sources/interview-document.txt'
        record['parsedSets'] = len(parsed)
        record['parsedQuestions'] = sum(len(group['questions']) for group in parsed)
        groups.extend(parsed)

    # PDFKit can reorder separately positioned line endings. Apply only reviewed,
    # hash-bound exceptions, using the supplied text companion, never guessed text.
    verification_path = ROOT / 'shared/question-bank/sources/pdf-extraction-verification.json'
    verification = json.loads(verification_path.read_text())
    pdf_source = next((s for s in report['sources'] if s['sha256'] == verification['pdfSha256']), None)
    report['extractionConflictsResolved'] = []
    if pdf_source:
        for check in verification['sets']:
            matches = [g for g in groups if g['taskType'] == 'repeat' and
                       g['setTitle'] == check['setTitle'] and g['sourceDate'] == check['sourceDate']]
            pdf_group = next((g for g in matches if g['questions'][0]['sourceRefs'][0]['sourceId'] == pdf_source['sourceId']), None)
            companion = next((g for g in matches if g is not pdf_group), None)
            if pdf_group and companion:
                groups.remove(pdf_group)
                report['extractionConflictsResolved'].append(dict(**check, excludedExtractedQuestions=len(pdf_group['questions'])))
                for question in companion['questions']:
                    original = next((q for q in pdf_group['questions'] if q['questionOrder'] == question['questionOrder']), None)
                    if original:
                        question['sourceRefs'].append(dict(**original['sourceRefs'][0], verification='visually-checked-against-text-companion'))

    unique, seen, ids = [], {}, set()
    for group in groups:
        signature = json.dumps([group['taskType'], group['sourceDate'], group['setTitle'],
                                [(q['questionOrder'], q['questionText'], q['referenceAnswer']) for q in group['questions']]], ensure_ascii=False)
        if signature in seen:
            report['duplicateSetsRemoved'] += 1
            report['duplicateQuestionsRemoved'] += len(group['questions'])
            for prior, copy in zip(seen[signature]['questions'], group['questions']):
                prior['sourceRefs'].extend(copy['sourceRefs'])
            continue
        set_id = f"toefl-{group['taskType']}-{slug(group['sourceDate'])}-{slug(group['setTitle'])}"
        if set_id in ids:
            set_id += '-' + digest(signature.encode())[:8]
            report['anomalies'].append(dict(kind='distinct-content-same-heading', setId=set_id))
        ids.add(set_id)
        group['setId'] = set_id
        group['sourceType'] = 'third-party-recalled-practice'
        group['sourceVersion'] = 1
        group['sourceFingerprint'] = digest(signature.encode())
        orders = [q['questionOrder'] for q in group['questions']]
        if orders != list(range(1, len(orders) + 1)):
            report['anomalies'].append(dict(kind='nonconsecutive-question-order', setId=set_id, orders=orders))
        usual = 7 if group['taskType'] == 'repeat' else 4
        if len(orders) != usual:
            report['anomalies'].append(dict(kind='source-set-size', setId=set_id, actual=len(orders), usual=usual))
        for question in group['questions']:
            question.update(questionId=f"{set_id}-q{question['questionOrder']:02}", setId=set_id,
                            taskType=group['taskType'], setTitle=group['setTitle'], category=group['category'],
                            sourceDate=group['sourceDate'], sourceType=group['sourceType'], audioSource=None,
                            availability=dict(text=bool(question['questionText']), sourceAudio=False, generatedSpeech='browser-dependent'))
        seen[signature] = group
        unique.append(group)
    catalogue = dict(schemaVersion=1, sets=unique)
    for kind in ['repeat', 'interview']:
        selected = [s for s in unique if s['taskType'] == kind]
        report[kind] = dict(sets=len(selected), questions=sum(len(s['questions']) for s in selected),
                            withReferenceAnswer=sum(bool(q['referenceAnswer']) for s in selected for q in s['questions']),
                            withSourceAudio=0)
    report['totalQuestions'] = sum(len(s['questions']) for s in unique)
    report['withoutSourceAudio'] = report['totalQuestions']
    report['notes'] = ['Third-party recalled practice, not official ETS test items.',
                       'Interview dates have no stated year; month/day retained without inventing a year.',
                       'Same questions in different source groups are retained; only identical copies of entire source groups are merged.',
                       'References are user-supplied practice models; teaching notes are excluded from displayed answers.']
    if report.get('interview', {}).get('questions') != 288 or not report.get('repeat', {}).get('questions'):
        save_json(OUT / 'last-import-failure.json', report)
        raise SystemExit('Source counts did not match the supplied bank. Existing catalogue is unchanged; inspect last-import-failure.json.')
    save_json(OUT / 'catalogue.json', catalogue)
    save_json(OUT / 'import-report.json', report)
    print(json.dumps({k: v for k, v in report.items() if k not in ['anomalies', 'sources']}, ensure_ascii=False, indent=2))
    print('Source anomalies:', len(report['anomalies']))


if __name__ == '__main__':
    main()
