export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow proper nouns (component names like BlueprintDockTab) in subject
    'subject-case': [0],
  },
}
