import Anthropic from '@anthropic-ai/sdk';
import type { Page } from '@playwright/test';
import { toolSchemas } from './tools.schema.js';
import { executeTool } from './tools.js';
import type {
  ActionLogEntry,
  AgentResult,
  SpecFile,
  ToolName,
} from './types.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TURNS = 50; // safety limit on tool-use round-trips

function buildSystemPrompt(spec: SpecFile): string {
  return `You are a Playwright E2E test executor. Your job is to interact with a live web application and execute test steps described in a specification.

## Rules
- Call get_page_snapshot() at the start and after each navigation or significant action to understand the current page state.
- Use the accessibility tree from get_page_snapshot() to find the right selectors.
- Prefer role-based selectors (role=button[name="Submit"]) over CSS selectors.
- If an action fails, inspect the page snapshot and try an alternative selector or approach.
- Do NOT guess — always check the page state before acting.
- When all steps and assertions are complete, respond with a final text message summarizing success or failure.
- If you cannot complete a step after 3 attempts, respond with a failure message explaining what went wrong.

## Application Context
${spec.context || 'No additional context provided.'}

## Test Data
${spec.data || 'No test data variables. Generate any needed data (e.g., timestamps for unique emails).'}`;
}

function buildUserMessage(spec: SpecFile): string {
  return `Execute the following test steps and verify the assertions.

## Steps
${spec.steps}

## Assertions
${spec.assertions}

Begin by calling get_page_snapshot() to see the initial page state, then execute each step.`;
}

export interface AgentOptions {
  /** Override the model (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Called after each tool execution for progress reporting */
  onToolCall?: (entry: ActionLogEntry) => void;
}

/**
 * Run the AI agent against a spec using a live Playwright page.
 */
export async function runAgent(
  spec: SpecFile,
  page: Page,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const client = new Anthropic();
  const model = options.model ?? MODEL;
  const actionLog: ActionLogEntry[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: buildUserMessage(spec) },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystemPrompt(spec),
      tools: toolSchemas,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Check if the agent is done (no tool use)
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find((b) => b.type === 'text');
      const finalMessage = textBlock && 'text' in textBlock ? textBlock.text : '';

      // Determine success from the agent's final message
      const isSuccess =
        finalMessage.toLowerCase().includes('success') ||
        finalMessage.toLowerCase().includes('all steps') ||
        finalMessage.toLowerCase().includes('completed') ||
        finalMessage.toLowerCase().includes('passed');

      return {
        success: isSuccess,
        actionLog,
        error: isSuccess ? undefined : finalMessage,
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
      };
    }

    // Process tool use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ContentBlockParam & { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        b.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      // No tool calls and no end_turn — treat as done
      return {
        success: false,
        actionLog,
        error: 'Agent stopped without completing steps or using tools',
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
      };
    }

    // Add assistant's response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolBlock of toolUseBlocks) {
      const toolName = toolBlock.name as ToolName;
      const toolArgs = toolBlock.input as Record<string, unknown>;

      const result = await executeTool(toolName, toolArgs, page);

      const entry: ActionLogEntry = {
        tool: toolName,
        args: toolArgs,
        result,
        timestamp: Date.now(),
      };
      actionLog.push(entry);
      options.onToolCall?.(entry);

      // For screenshots, send as image content to Claude
      if (toolName === 'screenshot' && result.success && result.value) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: result.value,
              },
            },
          ],
        });
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolBlock.id,
          content: result.success
            ? (result.value ?? 'ok')
            : `ERROR: ${result.error}`,
          is_error: !result.success,
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Hit max turns
  return {
    success: false,
    actionLog,
    error: `Agent exceeded maximum turns (${MAX_TURNS})`,
    tokenUsage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
  };
}
