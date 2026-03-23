// src/workflow/helpers.ts

/**
 * Sugar for defining output extractors that pick fields from vars.
 *
 * Usage:
 *   defineWorkflow<BaseRollData, RollOutput>('roll', steps, output<RollOutput>('rolls', 'total'))
 *
 * Equivalent to:
 *   (vars) => ({ rolls: vars.rolls, total: vars.total })
 */
export function output<TOutput>(
  ...keys: (keyof TOutput)[]
): (vars: Record<string, unknown>) => TOutput {
  return (vars: Record<string, unknown>) => {
    const result = {} as Record<string, unknown>
    for (const key of keys) {
      result[key as string] = vars[key as string]
    }
    return result as TOutput
  }
}
