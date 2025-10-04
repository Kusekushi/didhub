#!/usr/bin/env python3
"""Publish a JUnit XML summary into the GitHub Actions workflow summary file.

Usage: scripts/publish_junit_summary.py <junit-xml-path>

The script reads the JUnit XML, builds a small markdown summary and appends it to
the path in the environment variable GITHUB_STEP_SUMMARY. If that variable is not
set the script prints the summary to stdout instead.
"""
from __future__ import annotations
import sys
import os
from xml.etree import ElementTree as ET


def parse_junit(xml_path: str):
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception as e:
        return None, f"Could not parse JUnit XML: {e}"

    tests = int(root.attrib.get('tests', '0'))
    failures = int(root.attrib.get('failures', '0'))
    errors = int(root.attrib.get('errors', '0'))
    skipped = int(root.attrib.get('skipped', '0')) if root.attrib.get('skipped') else 0
    time = root.attrib.get('time', '')

    failed_cases = []
    if failures > 0 or errors > 0:
        for testcase in root.findall('.//testcase'):
            for child in testcase:
                if child.tag in ('failure', 'error'):
                    name = testcase.attrib.get('name', '')
                    classname = testcase.attrib.get('classname', '')
                    msg = child.attrib.get('message', '').strip()
                    text = (child.text or '').strip().splitlines()[0] if (child.text or '').strip() else ''
                    failed_cases.append((classname, name, msg, text))

    summary = {
        'tests': tests,
        'failures': failures,
        'errors': errors,
        'skipped': skipped,
        'time': time,
        'failed_cases': failed_cases,
    }
    return summary, None


def render_markdown(summary: dict) -> str:
    lines = []
    lines.append('# Server E2E Test Summary')
    lines.append('')
    lines.append(f"- Tests: **{summary['tests']}**")
    lines.append(f"- Failures: **{summary['failures']}**")
    lines.append(f"- Errors: **{summary['errors']}**")
    lines.append(f"- Skipped: **{summary['skipped']}**")
    if summary.get('time'):
        lines.append(f"- Time: {summary['time']}s")
    lines.append('')
    if summary['failed_cases']:
        lines.append('## Failed tests')
        for classname, name, msg, text in summary['failed_cases']:
            short = msg or text
            lines.append(f"- **{classname}::{name}** — {short}")
    lines.append('')
    return '\n'.join(lines)


def main(argv: list[str]):
    if len(argv) < 2:
        print('Usage: publish_junit_summary.py <junit-xml-path>')
        return 2
    xml_path = argv[1]
    if not os.path.exists(xml_path):
        print(f'JUnit XML not found: {xml_path}', file=sys.stderr)
        return 0

    summary, err = parse_junit(xml_path)
    if err:
        print(err, file=sys.stderr)
        return 0

    md = render_markdown(summary)
    summary_file = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary_file:
        try:
            with open(summary_file, 'a', encoding='utf-8') as fh:
                fh.write(md)
            print(f'Appended JUnit summary to {summary_file}')
        except Exception as e:
            print(f'Failed to write workflow summary: {e}', file=sys.stderr)
            print(md)
    else:
        # Fallback: print to stdout so logs will contain the summary
        print(md)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
