"""Shared browser setup for local system Chromium and pinned Playwright in CI."""
import os
import re
import shutil


def launch_chromium(playwright, **options):
    executable = os.environ.get('PRISM_CHROMIUM') or shutil.which('chromium')
    return playwright.chromium.launch(headless=True, executable_path=executable, **options)


def browser_context(browser, **options):
    context = browser.new_context(**options)
    context.add_init_script('window.__PRP_TEST_MIRROR = true')
    # Fonts are presentation assets, not part of the app/provider contract.
    # Keep browser regressions independent of Google's availability.
    context.route(re.compile(r'https://fonts\.(?:googleapis|gstatic)\.com/'),
                  lambda route: route.fulfill(status=200, content_type='text/css', body=''))
    return context
