# AI Signal Daily

一个面向 AI 从业者的日报网站原型。核心思路是把“新闻聚合”升级成“信号过滤”：

1. 抓取官方博客、论文、GitHub、社区和中文技术媒体。
2. 先用低成本模型预筛 AI 相关性。
3. 按重要性、新颖性、可信度、行动价值和传播潜力打分。
4. 对同一事件做聚类，优先展示官方源。
5. 每天 9:30 推送 8-12 条中文简报。

## 一键启动

生成真实日报并启动本地网站：

```bash
python3 ai-daily/scripts/start.py
```

## 24 小时运行

后台常驻运行，并每天 09:30 自动更新：

```bash
bash ai-daily/scripts/start_24h.sh
```

查看日志：

```bash
tail -f ai-daily/runtime/daily.log
```

查看当前访问地址：

```bash
cat ai-daily/runtime/url.txt
```

停止后台服务：

```bash
bash ai-daily/scripts/stop_24h.sh
```

如果想自动打开浏览器：

```bash
python3 ai-daily/scripts/start.py --open
```

如果只想看已有日报、不重新调用模型：

```bash
python3 ai-daily/scripts/start.py --no-generate
```

## 本地预览

```bash
python3 ai-daily/scripts/serve.py
```

它会自动选择可用端口。然后打开终端显示的地址，例如：

```text
http://localhost:4321
```

## 生成真实日报

模型调用在本地脚本中执行，不会把 API key 暴露给浏览器。

```bash
export KIMI_API_KEY="你的 Kimi API key"
python3 ai-daily/scripts/generate_daily.py
```

如果模型响应慢，可以进一步缩小候选量：

```bash
python3 ai-daily/scripts/generate_daily.py --candidate-limit 24 --limit-per-source 4 --story-count 8 --max-age-days 7
```

也可以把配置写到 `ai-daily/.env`：

```bash
cp ai-daily/.env.example ai-daily/.env
```

只抓真实信息源、不调用模型：

```bash
python3 ai-daily/scripts/generate_daily.py --no-model
```

这会写入 `ai-daily/data.preview.js`，不会覆盖正式页面数据。若确实要覆盖：

```bash
python3 ai-daily/scripts/generate_daily.py --no-model --write-fallback
```

Kimi 中文开放平台 OpenAI-compatible API 的默认地址是：

```text
https://api.moonshot.cn/v1
```

如果你的 key 来自国际平台，可切到：

```bash
export KIMI_BASE_URL="https://api.moonshot.ai/v1"
export KIMI_MODEL="kimi-k2.5"
export KIMI_TEMPERATURE="1"
```

## 接入点

- `data.js`：替换为后端 API 返回的日报 JSON。
- `stories[].score`：建议由代码公式计算，不完全交给 LLM。
- `stories[].tier`：信源等级，当前支持 `T1`、`T1.5`、`T2`。
- `stories[].url`：每条热点的原始信息源链接，前端点击直达。
- `weeklyHot[]`：右侧“本周热度排行”，由脚本按热度规则排序，Codex、Anthropic/Claude、Copilot 等关键词会被加权。
- `--max-age-days`：默认只允许最近 7 天的候选进入日报和本周热度排行，避免旧信息混入。
- `sourceCatalog[]`：页面“信息源”板块展示的可点击信源列表。
- `archives[].url`：每篇历史日报的详情链接，可接静态页面、动态路由或外部发布链接。
- `subscribeForm`：后续接邮件、飞书、微信、Telegram 或 RSS。

## 推荐的数据结构

```json
{
  "title": "事件标题",
  "category": "模型",
  "tier": "T1",
  "source": "Official Blog",
  "url": "https://example.com",
  "score": 92,
  "tags": ["Agent", "产品发布"],
  "summary": "50-100 字中文摘要",
  "why": "为什么值得关注"
}
```
