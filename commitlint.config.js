export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "test",
        "docs",
        "chore",
        "ci",
        "perf",
        "style",
        "build",
        "revert",
      ],
    ],
    "scope-case": [2, "always", "kebab-case"],
    "subject-case": [2, "never", ["start-case", "pascal-case", "upper-case"]],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [0, "always", Infinity],
  },
};
