import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { ToolName, ToolResult } from './types.js';

/**
 * Parse a selector string into a Playwright locator.
 *
 * Supports two formats:
 *   - role=button[name="Submit"]  → page.getByRole('button', { name: 'Submit' })
 *   - #id, .class, input[name="x"]  → page.locator(selector)
 */
function resolveLocator(page: Page, selector: string) {
  const roleMatch = selector.match(
    /^role=(\w+)(?:\[name=["'](.+?)["']\])?$/,
  );
  if (roleMatch) {
    const [, role, name] = roleMatch;
    return name
      ? page.getByRole(role as Parameters<Page['getByRole']>[0], { name })
      : page.getByRole(role as Parameters<Page['getByRole']>[0]);
  }
  return page.locator(selector);
}

function ok(value?: string): ToolResult {
  return { success: true, value: value ?? 'ok' };
}

function fail(error: string): ToolResult {
  return { success: false, error };
}

/**
 * Execute a single tool call against a live Playwright Page.
 */
export async function executeTool(
  name: ToolName,
  args: Record<string, unknown>,
  page: Page,
): Promise<ToolResult> {
  try {
    switch (name) {
      // ── Navigation ──
      case 'navigate': {
        const url = args.url as string;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        return ok(`Navigated to ${page.url()}`);
      }

      case 'wait_for_url': {
        const pattern = args.pattern as string;
        const timeout = (args.timeout as number) ?? 30_000;
        await page.waitForURL(`**/*${pattern}*`, { timeout });
        return ok(`URL now matches: ${page.url()}`);
      }

      case 'wait_for_load': {
        await page.waitForLoadState('networkidle');
        return ok('Page reached networkidle');
      }

      // ── Observation ──
      case 'get_page_snapshot': {
        const ariaTree = await page.locator('body').ariaSnapshot();
        const result = {
          url: page.url(),
          title: await page.title(),
          ariaSnapshot: ariaTree,
        };
        return ok(JSON.stringify(result, null, 2));
      }

      case 'get_element_text': {
        const selector = args.selector as string;
        const locator = resolveLocator(page, selector);
        const text = await locator.innerText({ timeout: 10_000 });
        return ok(text);
      }

      // ── Interaction ──
      case 'click': {
        const selector = args.selector as string;
        const locator = resolveLocator(page, selector);
        await locator.click({ timeout: 10_000 });
        return ok(`Clicked: ${selector}`);
      }

      case 'fill': {
        const selector = args.selector as string;
        const value = args.value as string;
        const locator = resolveLocator(page, selector);
        await locator.fill(value, { timeout: 10_000 });
        return ok(`Filled "${selector}" with "${value}"`);
      }

      case 'check': {
        const selector = args.selector as string;
        const locator = resolveLocator(page, selector);
        await locator.check({ timeout: 10_000 });
        return ok(`Checked: ${selector}`);
      }

      case 'select_option': {
        const selector = args.selector as string;
        const value = args.value as string;
        const locator = resolveLocator(page, selector);
        // Try by value first, fall back to label
        try {
          await locator.selectOption({ value }, { timeout: 10_000 });
        } catch {
          await locator.selectOption({ label: value }, { timeout: 10_000 });
        }
        return ok(`Selected "${value}" in ${selector}`);
      }

      case 'press_key': {
        const key = args.key as string;
        await page.keyboard.press(key);
        return ok(`Pressed key: ${key}`);
      }

      // ── Assertion ──
      case 'assert_url': {
        const pattern = args.pattern as string;
        const currentUrl = page.url();
        if (currentUrl.includes(pattern)) {
          return ok(`URL "${currentUrl}" contains "${pattern}"`);
        }
        return fail(
          `URL assertion failed: "${currentUrl}" does not contain "${pattern}"`,
        );
      }

      case 'assert_visible': {
        const selector = args.selector as string;
        const locator = resolveLocator(page, selector);
        await expect(locator).toBeVisible({ timeout: 10_000 });
        return ok(`Element is visible: ${selector}`);
      }

      case 'assert_text': {
        const selector = args.selector as string;
        const expected = args.expected as string;
        const locator = resolveLocator(page, selector);
        await expect(locator).toContainText(expected, { timeout: 10_000 });
        return ok(`Element "${selector}" contains text "${expected}"`);
      }

      // ── Utility ──
      case 'screenshot': {
        const buffer = await page.screenshot({ fullPage: true });
        const base64 = buffer.toString('base64');
        return ok(base64);
      }

      case 'wait': {
        const ms = Math.min((args.ms as number) ?? 1000, 10_000);
        await page.waitForTimeout(ms);
        return ok(`Waited ${ms}ms`);
      }

      default:
        return fail(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
