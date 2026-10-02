import { toolInputSchemas } from '../../schemas/index.js';

/**
 * Upper bound on the issues spelled out in one error message, so a large batch
 * of malformed items cannot produce an unbounded message.
 */
const MAX_REPORTED_ISSUES = 10;

/**
 * Render a Zod issue path as `entities[0].name`.
 *
 * @param path Path segments from a Zod issue
 * @returns The path as text, or `arguments` for the root
 */
function formatPath(path: readonly PropertyKey[]): string {
  let text = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      text += `[${segment}]`;
    } else {
      text += text ? `.${String(segment)}` : String(segment);
    }
  }
  return text || 'arguments';
}

/**
 * Report whether the value an issue points at is absent from the arguments.
 * Only presence is inspected; the value itself never reaches the message.
 *
 * @param args The original tool arguments
 * @param path Path segments from a Zod issue
 * @returns True when the value at the path is undefined
 */
function isMissing(args: unknown, path: readonly PropertyKey[]): boolean {
  if (path.length === 0) {
    return false;
  }
  let current: unknown = args;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') {
      return false;
    }
    current = (current as Record<PropertyKey, unknown>)[segment];
  }
  return current === undefined;
}

/**
 * Gate a tool call on its input schema.
 *
 * This checks the arguments and returns nothing: the caller keeps using the
 * ORIGINAL arguments object, so unknown keys survive and no default or coercion
 * is applied. On failure it throws before any storage call, in the same way
 * `handleCallToolRequest` rejects other bad requests (a plain `Error`, which
 * the MCP server returns to the client as a JSON-RPC error).
 *
 * The message names the tool and, per issue, the argument path and what was
 * expected. It never contains argument values, which can hold user data.
 *
 * @param name The tool name
 * @param args The tool arguments as received
 * @throws Error if the tool has no schema (unknown tool) or the arguments are invalid
 */
export function assertValidToolInput(name: string, args: Record<string, unknown>): void {
  const schema = toolInputSchemas.get(name);
  if (!schema) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const result = schema.safeParse(args);
  if (result.success) {
    return;
  }

  const { issues } = result.error;
  const details = issues.slice(0, MAX_REPORTED_ISSUES).map(issue => {
    const path = formatPath(issue.path);
    return isMissing(args, issue.path)
      ? `Missing required parameter: ${path}`
      : `${path}: ${issue.message}`;
  });
  if (issues.length > MAX_REPORTED_ISSUES) {
    details.push(`and ${issues.length - MAX_REPORTED_ISSUES} more`);
  }

  throw new Error(`Invalid arguments for tool ${name}: ${details.join('; ')}`);
}
