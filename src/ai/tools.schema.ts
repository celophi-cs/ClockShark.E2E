import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions in Anthropic API format.
 * These 15 tools are the agent's interface to Playwright.
 */
export const toolSchemas: Anthropic.Tool[] = [
  // ── Navigation ──
  {
    name: 'navigate',
    description:
      'Navigate to a URL. Use absolute paths like "/Login" (resolved against the base URL) or full URLs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: 'URL or path to navigate to' },
      },
      required: ['url'],
    },
  },
  {
    name: 'wait_for_url',
    description:
      'Wait until the page URL matches a pattern. The pattern is matched as a substring.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: { type: 'string', description: 'Substring or regex pattern the URL must contain' },
        timeout: { type: 'number', description: 'Max wait time in ms (default: 30000)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'wait_for_load',
    description:
      'Wait for the page to reach the "networkidle" state (no pending network requests for 500ms).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ── Observation ──
  {
    name: 'get_page_snapshot',
    description:
      'Get the current page state: URL, title, and the accessibility tree. Use this to understand what is on the page and find the right selectors. Call this after navigations and before deciding what to interact with.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_element_text',
    description: 'Get the inner text content of a specific element.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector (e.g. role=heading[name="Welcome"])',
        },
      },
      required: ['selector'],
    },
  },

  // ── Interaction ──
  {
    name: 'click',
    description:
      'Click an element. Waits for the element to be visible and enabled before clicking.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector (e.g. role=button[name="Submit"])',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'fill',
    description:
      'Clear an input field and type new text into it. Works for text inputs, textareas, and contenteditable elements.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector for the input element',
        },
        value: { type: 'string', description: 'Text to type into the field' },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'check',
    description: 'Check a checkbox or radio button. If already checked, does nothing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector for the checkbox/radio',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'select_option',
    description:
      'Select an option from a <select> dropdown by its value or visible label text.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector for the <select> element',
        },
        value: {
          type: 'string',
          description: 'The value attribute or visible label of the option to select',
        },
      },
      required: ['selector', 'value'],
    },
  },
  {
    name: 'press_key',
    description:
      'Press a keyboard key (e.g. "Enter", "Tab", "Escape", "ArrowDown").',
    input_schema: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description: 'Key to press (e.g. "Enter", "Tab", "Escape")',
        },
      },
      required: ['key'],
    },
  },

  // ── Assertion ──
  {
    name: 'assert_url',
    description:
      'Assert that the current page URL contains the given pattern. Fails the step if it does not match.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Substring the URL must contain',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'assert_visible',
    description:
      'Assert that an element matching the selector is visible on the page.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector',
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'assert_text',
    description:
      'Assert that an element contains the expected text (substring match).',
    input_schema: {
      type: 'object' as const,
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector or role selector',
        },
        expected: {
          type: 'string',
          description: 'Expected text content (substring match)',
        },
      },
      required: ['selector', 'expected'],
    },
  },

  // ── Utility ──
  {
    name: 'screenshot',
    description:
      'Take a screenshot of the current page. Use this only when you are stuck and need visual context to decide what to do next. Returns a base64 image.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'wait',
    description:
      'Wait for a specified number of milliseconds. Use sparingly — prefer waiting for specific elements or URLs instead.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ms: {
          type: 'number',
          description: 'Milliseconds to wait (max 10000)',
        },
      },
      required: ['ms'],
    },
  },
];
