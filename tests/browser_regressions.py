"""Build current sources and run every focused browser regression.

Usage: python3 tests/browser_regressions.py <artifact-directory> [--jobs 2]
The historical e2e.py flow was retired after all 203 call sites received dispositions.
"""
import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]


def run_suite(suite, output, timeout):
    directory = output / suite.stem
    directory.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with (directory / 'suite.log').open('w') as log:
        process = subprocess.Popen(
            [sys.executable, '-u', str(suite), str(directory)], cwd=ROOT,
            stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(process.pid, signal.SIGKILL)
            code = process.wait()
            log.write(f'\nSuite exceeded {timeout}s; process group terminated.\n')
    return dict(suite=suite.name, exit_code=code, timed_out=timed_out,
                seconds=round(time.monotonic() - started, 2),
                log=str(directory / 'suite.log'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--timeout', type=int, default=300)
    args = parser.parse_args()
    if args.jobs < 1 or args.timeout < 1:
        parser.error('jobs and timeout must be positive')
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    summary = dict(build_exit_code=None, suites=[])
    summary_path = output / 'summary.json'
    try:
        with (output / 'build.log').open('w') as log:
            summary['build_exit_code'] = subprocess.run(
                ['node', 'build.js'], cwd=ROOT, stdout=log,
                stderr=subprocess.STDOUT).returncode
        if summary['build_exit_code']:
            return 1
        suites = sorted((ROOT / 'tests').glob('e2e-*.py'))
        if not suites:
            raise RuntimeError('No browser suites discovered')
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = {pool.submit(run_suite, suite, output, args.timeout): suite for suite in suites}
            for future in concurrent.futures.as_completed(futures):
                suite = futures[future]
                try:
                    result = future.result()
                except Exception as error:
                    result = dict(suite=suite.name, exit_code=1, error=str(error))
                summary['suites'].append(result)
                print(('PASS ' if result['exit_code'] == 0 else 'FAIL ') + suite.name, flush=True)
        return int(any(result['exit_code'] != 0 for result in summary['suites']))
    finally:
        summary['suites'].sort(key=lambda result: result['suite'])
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    sys.exit(main())
