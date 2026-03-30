// src/workflow/helpers.ts

/**
 * Sugar for defining output extractors that pick fields from vars.
 *
 * Usage:
 *   defineWorkflow<Data, Out>('name', steps, output<Out>('fieldA', 'fieldB'))
 *
 * Equivalent to:
 *   (vars) => ({ fieldA: vars.fieldA, fieldB: vars.fieldB })
 */
export function output<TOutput>(
  ...keys: (keyof TOutput)[]
): (vars: Record<string, unknown>) => TOutput {
  return (vars: Record<string, unknown>) => {
    const result = {} as Record<string, unknown>
    for (const key of keys) {
      const k = key as string
      if (!(k in vars)) {
        throw new Error(`output(): key "${k}" not found in workflow vars`)
      }
      result[k] = vars[k]
    }
    return result as TOutput
  }
}
