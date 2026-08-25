import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add rate limit and input validation to /api/forex-news/analyze
old_analyze = """
app.post("/api/forex-news/analyze", async (req, res) => {
  try {
    const { forexPair = "EUR/USD" } = req.body || {};
"""

new_analyze = """
app.post("/api/forex-news/analyze", async (req, res) => {
  try {
    const clientIp = Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : (req.headers["x-forwarded-for"] || req.ip || "127.0.0.1");
    if (!checkRateLimit(String(clientIp))) {
      return res.status(429).json({ success: false, errorType: "RATE_LIMIT_EXCEEDED", message: "Rate limit reached." });
    }

    const { forexPair = "EUR/USD" } = req.body || {};
    if (typeof forexPair !== "string" || forexPair.length > 20) {
      return res.status(400).json({ success: false, errorType: "INVALID_INPUT", message: "Invalid forex pair provided." });
    }
"""

content = content.replace(old_analyze.strip(), new_analyze.strip())

# Add rate limit to /api/forex-news/test-mode
old_test_mode = """
app.post("/api/forex-news/test-mode", async (req, res) => {
  try {
    const { testConfig, overrides } = req.body || {};
"""

new_test_mode = """
app.post("/api/forex-news/test-mode", async (req, res) => {
  try {
    const clientIp = Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : (req.headers["x-forwarded-for"] || req.ip || "127.0.0.1");
    if (!checkRateLimit(String(clientIp))) {
      return res.status(429).json({ success: false, errorType: "RATE_LIMIT_EXCEEDED", message: "Rate limit reached." });
    }
    const { testConfig, overrides } = req.body || {};
"""
content = content.replace(old_test_mode.strip(), new_test_mode.strip())

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write(content)
