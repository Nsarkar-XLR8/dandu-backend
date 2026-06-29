#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = new Set(process.argv.slice(2));
const diffMode = args.has("--diff");

const SKIP_DIRS = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "out",
  "build",
]);

const SKIP_FILES = new Set(["package-lock.json", "tsconfig.tsbuildinfo"]);
const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".css",
  ".scss",
  ".html",
  ".yml",
  ".yaml",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".ico",
  ".pdf",
  ".mp4",
  ".webp",
]);

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "INFO"];
const SEVERITY_COLORS = {
  CRITICAL: "\x1b[31m",
  HIGH: "\x1b[33m",
  MEDIUM: "\x1b[34m",
  INFO: "\x1b[90m",
  reset: "\x1b[0m",
  heading: "\x1b[36m",
};

const RULES = [
  {
    id: "unsafe-eval",
    severity: "CRITICAL",
    title: "Dynamic code execution",
    desc: "Avoid eval-style execution in application code.",
    targets: { extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"] },
    patterns: [/\beval\s*\(/g, /\bnew\s+Function\s*\(/g],
  },
  {
    id: "unsafe-html",
    severity: "HIGH",
    title: "Unsafe HTML sink",
    desc: "Review raw HTML injection points carefully.",
    targets: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
    patterns: [/\bdangerouslySetInnerHTML\b/g, /\binnerHTML\s*=/g],
  },
  {
    id: "debug-logging",
    severity: "MEDIUM",
    title: "Debug logging left in code",
    desc: "Remove or gate console logging before release.",
    targets: {
      extensions: [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"],
      excludePaths: [/^scripts\/scan\.js$/],
    },
    patterns: [/\bconsole\.(log|debug|trace)\s*\(/g],
  },
  {
    id: "temporary-work",
    severity: "INFO",
    title: "Temporary marker",
    desc: "Follow up on TODO or FIXME markers.",
    targets: {
      extensions: [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs",
        ".md",
        ".css",
        ".scss",
        ".html",
        ".yml",
        ".yaml",
      ],
      excludePaths: [/^scripts\/scan\.js$/],
    },
    patterns: [
      /(?:\/\/|\/\*+|#|\*)\s*TODO\b/g,
      /(?:\/\/|\/\*+|#|\*)\s*FIXME\b/g,
    ],
  },
  {
    id: "localhost-reference",
    severity: "HIGH",
    title: "Localhost reference",
    desc: "Check for local-only URLs before shipping.",
    targets: {
      extensions: [
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs",
        ".md",
        ".css",
        ".scss",
        ".html",
        ".yml",
        ".yaml",
      ],
      fileNames: ["package.json"],
    },
    patterns: [/https?:\/\/localhost(?::\d+)?/g, /\blocalhost:\d+\b/g],
  },
  {
    id: "bypass-scan",
    severity: "MEDIUM",
    title: "Scanner bypass in npm scripts",
    desc: "Package scripts should not disable scanning by default.",
    targets: { fileNames: ["package.json"] },
    patterns: [/scan\.js\s+--no-/g, /\bSCAN_(?:DISABLE|SKIP)\b/g],
  },
];

function main() {
  const repoRoot = getRepoRoot();
  const files = diffMode
    ? collectDiffFiles(repoRoot)
    : collectAllFiles(repoRoot);
  const results = scanFiles(repoRoot, files);
  printReport(repoRoot, results);

  const hasCritical = results.findings.some(
    (finding) => finding.severity === "CRITICAL",
  );
  process.exitCode = hasCritical ? 1 : 0;
}

function getRepoRoot() {
  try {
    return execGit("git rev-parse --show-toplevel", process.cwd());
  } catch (error) {
    console.error(`Failed to resolve git root: ${error.message}`);
    process.exit(2);
  }
}

function collectAllFiles(repoRoot) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativePath = toRepoRelative(repoRoot, absolutePath);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }

        walk(absolutePath);
        continue;
      }

      if (entry.isFile() && shouldScanPath(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  walk(repoRoot);

  return files.sort();
}

function collectDiffFiles(repoRoot) {
  const files = new Set();

  const addRelativeFile = (relativePath) => {
    if (!relativePath) {
      return;
    }

    const normalized = relativePath.replace(/\\/g, "/");
    const absolutePath = path.join(repoRoot, normalized);

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return;
    }

    if (shouldScanPath(normalized)) {
      files.add(normalized);
    }
  };

  try {
    const tracked = execGit(
      "git diff --name-only --diff-filter=ACMRTUXB HEAD",
      repoRoot,
    );
    for (const file of splitLines(tracked)) {
      addRelativeFile(file);
    }
  } catch (error) {
    const statusOutput = execGit("git status --porcelain", repoRoot, true);
    for (const line of splitLines(statusOutput)) {
      const parsed = parsePorcelainPath(line);
      if (parsed) {
        addRelativeFile(parsed);
      }
    }
  }

  const untracked = execGit(
    "git ls-files --others --exclude-standard",
    repoRoot,
    true,
  );
  for (const file of splitLines(untracked)) {
    addRelativeFile(file);
  }

  return Array.from(files).sort();
}

function shouldScanPath(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  const baseName = path.basename(normalized);
  const extension = path.extname(baseName).toLowerCase();
  const segments = normalized.split("/");

  if (segments.some((segment) => SKIP_DIRS.has(segment))) {
    return false;
  }

  if (SKIP_FILES.has(baseName) || BINARY_EXTENSIONS.has(extension)) {
    return false;
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    return false;
  }

  if (extension === ".json" && baseName !== "package.json") {
    return false;
  }

  return true;
}

function scanFiles(repoRoot, files) {
  const findings = [];
  const perFileCounts = new Map();

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    const fileFindings = scanSingleFile(relativePath, absolutePath);

    perFileCounts.set(relativePath, fileFindings.length);

    for (const finding of fileFindings) {
      findings.push(finding);
    }
  }

  return {
    filesScanned: files.length,
    filesClean: Array.from(perFileCounts.values()).filter(
      (count) => count === 0,
    ).length,
    filesFlagged: Array.from(perFileCounts.values()).filter(
      (count) => count > 0,
    ).length,
    findings,
    perFileCounts,
  };
}

function scanSingleFile(relativePath, absolutePath) {
  const source = fs.readFileSync(absolutePath, "utf8");
  const fileName = path.basename(relativePath);
  const extension = path.extname(fileName).toLowerCase();
  const heuristicFindings = scanObfuscationHeuristics(relativePath, source, {
    fileName,
    extension,
  });

  if (fileName === "package.json") {
    return heuristicFindings.concat(scanPackageJson(relativePath, source));
  }

  return heuristicFindings.concat(
    scanText(relativePath, source, {
      fileName,
      extension,
      relativePath,
      baseLine: 1,
    }),
  );
}

function scanObfuscationHeuristics(relativePath, source, context) {
  if (
    ![".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"].includes(context.extension)
  ) {
    return [];
  }

  const lines = source.split(/\r?\n/);
  const maxLineLength = lines.reduce(
    (max, line) => Math.max(max, line.length),
    0,
  );
  const hasGlobalAccess = /\bglobal\s*\[/.test(source);
  const hasFromCharCode = /\bString\.fromCharCode\s*\(/.test(source);
  const hasSubstrDecoder = /\.substr\s*\(/.test(source);
  const decoderSignalCount = [
    hasGlobalAccess,
    hasFromCharCode,
    hasSubstrDecoder,
  ].filter(Boolean).length;

  if (
    !(decoderSignalCount >= 2 && source.length >= 4000 && maxLineLength >= 1500)
  ) {
    return [];
  }

  const longestLineIndex = lines.findIndex(
    (line) => line.length === maxLineLength,
  );

  return [
    {
      filePath: relativePath,
      severity: "CRITICAL",
      title: "Suspicious obfuscated payload",
      desc: "Review heavily obfuscated code and decoder chains immediately.",
      line: longestLineIndex >= 0 ? longestLineIndex + 1 : 1,
      snippet: `Large obfuscated script detected (${source.length} chars, longest line ${maxLineLength} chars).`,
      ruleId: "obfuscated-heuristic",
    },
  ];
}

function scanPackageJson(relativePath, source) {
  let parsed;

  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return [
      {
        filePath: relativePath,
        severity: "HIGH",
        title: "Invalid package.json",
        desc: "package.json could not be parsed.",
        line: 1,
        snippet: source.split(/\r?\n/, 1)[0] || "{",
      },
    ];
  }

  const scripts = parsed && typeof parsed === "object" ? parsed.scripts : null;
  if (!scripts || typeof scripts !== "object") {
    return [];
  }

  const findings = [];

  for (const [scriptName, scriptValue] of Object.entries(scripts)) {
    if (typeof scriptValue !== "string") {
      continue;
    }

    const line = findPackageScriptLine(source, scriptName);
    const scopedFindings = scanText(relativePath, scriptValue, {
      fileName: "package.json",
      extension: ".json",
      relativePath,
      baseLine: line,
      snippetSource: scriptValue,
    });

    for (const finding of scopedFindings) {
      findings.push({
        ...finding,
        snippet: `${scriptName}: ${scriptValue}`.trim(),
      });
    }
  }

  return findings;
}

function scanText(filePath, source, context) {
  const findings = [];

  for (const rule of RULES) {
    if (!matchesTarget(rule.targets, context)) {
      continue;
    }

    for (const pattern of rule.patterns) {
      for (const match of executeAll(pattern, source)) {
        const line =
          context.baseLine + countNewlines(source.slice(0, match.index));
        const snippet = getSnippet(
          source,
          match.index,
          context.snippetSource || source,
        );

        findings.push({
          filePath,
          severity: rule.severity,
          title: rule.title,
          desc: rule.desc,
          line,
          snippet,
          ruleId: rule.id,
        });
      }
    }
  }

  return dedupeFindings(findings);
}

function matchesTarget(targets, context) {
  const { extensions, fileNames, excludePaths } = targets || {};

  if (
    excludePaths &&
    excludePaths.some((pattern) => pattern.test(context.relativePath))
  ) {
    return false;
  }

  const hasExtensionTargets =
    Array.isArray(extensions) && extensions.length > 0;
  const hasFileTargets = Array.isArray(fileNames) && fileNames.length > 0;
  const extensionMatch =
    hasExtensionTargets && extensions.includes(context.extension);
  const fileMatch = hasFileTargets && fileNames.includes(context.fileName);

  if (hasExtensionTargets && hasFileTargets) {
    return extensionMatch || fileMatch;
  }

  if (hasExtensionTargets) {
    return extensionMatch;
  }

  if (hasFileTargets) {
    return fileMatch;
  }

  return true;
}

function executeAll(pattern, source) {
  const regex = cloneRegExp(pattern);
  const matches = [];

  if (!regex.global) {
    const single = regex.exec(source);
    if (single) {
      matches.push(single);
    }
    return matches;
  }

  let match;
  while ((match = regex.exec(source)) !== null) {
    matches.push(match);

    if (match[0] === "") {
      regex.lastIndex += 1;
    }
  }

  return matches;
}

function cloneRegExp(pattern) {
  const flags = pattern.flags.includes("g")
    ? pattern.flags
    : `${pattern.flags}g`;
  return new RegExp(pattern.source, flags);
}

function dedupeFindings(findings) {
  const seen = new Set();

  return findings.filter((finding) => {
    const key = [
      finding.filePath,
      finding.ruleId,
      finding.line,
      finding.snippet,
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getSnippet(source, matchIndex, snippetSource) {
  if (snippetSource !== source) {
    return trimSnippet(snippetSource);
  }

  const start = source.lastIndexOf("\n", matchIndex) + 1;
  const endIndex = source.indexOf("\n", matchIndex);
  const end = endIndex === -1 ? source.length : endIndex;
  return trimSnippet(source.slice(start, end));
}

function trimSnippet(value) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function countNewlines(text) {
  const matches = text.match(/\n/g);
  return matches ? matches.length : 0;
}

function findPackageScriptLine(source, scriptName) {
  const escapedName = escapeRegExp(scriptName);
  const matcher = new RegExp(`"${escapedName}"\\s*:`, "g");
  const match = matcher.exec(source);

  if (!match) {
    return 1;
  }

  return 1 + countNewlines(source.slice(0, match.index));
}

function parsePorcelainPath(line) {
  if (!line || line.length < 4) {
    return null;
  }

  const status = line.slice(0, 2);
  if (status.includes("D")) {
    return null;
  }

  const payload = line.slice(3).trim();
  if (!payload) {
    return null;
  }

  if (payload.includes(" -> ")) {
    return payload.split(" -> ").pop();
  }

  return payload;
}

function execGit(command, cwd, allowFailure = false) {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return "";
    }

    const stderr = error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || error.message);
  }
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toRepoRelative(repoRoot, absolutePath) {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
}

function supportsColor() {
  return Boolean(
    process.stdout && process.stdout.isTTY && !process.env.NO_COLOR,
  );
}

function printReport(repoRoot, results) {
  const grouped = new Map();
  const useColor = supportsColor();

  for (const finding of results.findings) {
    const bucket = grouped.get(finding.filePath) || [];
    bucket.push(finding);
    grouped.set(finding.filePath, bucket);
  }

  const orderedFiles = Array.from(grouped.keys()).sort();

  if (orderedFiles.length === 0) {
    console.log(
      `Scan completed with no findings (${diffMode ? "diff" : "full"} mode).`,
    );
  } else {
    for (const filePath of orderedFiles) {
      const absolutePath = path.join(repoRoot, filePath);
      console.log(colorize(useColor, "heading", `\n${filePath}`));
      console.log(
        colorize(useColor, "heading", `${"-".repeat(filePath.length)}`),
      );

      const fileFindings = grouped
        .get(filePath)
        .slice()
        .sort((a, b) => {
          const severityDelta =
            SEVERITY_ORDER.indexOf(a.severity) -
            SEVERITY_ORDER.indexOf(b.severity);
          return severityDelta !== 0 ? severityDelta : a.line - b.line;
        });

      for (const finding of fileFindings) {
        const badge = colorize(useColor, finding.severity, finding.severity);
        console.log(`  [${badge}] ${finding.title} (line ${finding.line})`);
        console.log(`  ${finding.snippet}`);
      }

      if (!fs.existsSync(absolutePath)) {
        console.log("  File no longer exists on disk.");
      }
    }
  }

  const summaryCounts = buildSeveritySummary(results.findings);
  console.log("\nSummary");
  console.log("-------");
  console.log(`Mode: ${diffMode ? "diff" : "full"}`);
  console.log(`Files scanned: ${results.filesScanned}`);
  console.log(`Files clean: ${results.filesClean}`);
  console.log(`Files flagged: ${results.filesFlagged}`);
  for (const severity of SEVERITY_ORDER) {
    console.log(`${severity}: ${summaryCounts[severity]}`);
  }
}

function buildSeveritySummary(findings) {
  const summary = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    INFO: 0,
  };

  for (const finding of findings) {
    summary[finding.severity] += 1;
  }

  return summary;
}

function colorize(enabled, tone, value) {
  if (!enabled) {
    return value;
  }

  return `${SEVERITY_COLORS[tone]}${value}${SEVERITY_COLORS.reset}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

main();