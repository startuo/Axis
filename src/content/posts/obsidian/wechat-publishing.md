---
title: 微信公众号全自动发布方案
published: 2026-07-08T00:00:00.000Z
updated: 2026-07-08T00:00:00.000Z
description: 适用场景：个人订阅号（未认证）+ AI 生成内容 + 定时触发 + 混合审核模式
tags:
  - 自动化
  - 微信公众号
  - Python
  - AI
  - 内容生产
  - 方案设计
category: 内容生产
lang: zh_CN
draft: false
image: /images/obsidian/wechat-publishing.png
---

> 适用场景：个人订阅号（未认证）+ AI 生成内容 + 定时触发 + 混合审核模式

---

## 一、关键现实约束（必须先看清）

个人订阅号（未认证）状态下，微信公众平台 API 权限按账号类型分级开放：

| 能力 | 个人订阅号（未认证） | 认证订阅号 | 认证服务号 |
|---|---|---|---|
| 获取 access_token | ✅ | ✅ | ✅ |
| 上传临时/永久素材（图片） | ✅ | ✅ | ✅ |
| 自动回复 / 自定义菜单 | ✅ | ✅ | ✅ |
| 数据统计（基础） | ✅ | ✅ | ✅ |
| **草稿箱 draft/add** | ❌ | ✅ | ✅ |
| **群发 freepublish/submit** | ❌ | ✅（每天1次） | ✅（每月4次） |
| 客服消息 | ❌ | ✅ | ✅ |
| 模板消息 | ❌ | ❌ | ✅ |
| 网页授权获取用户信息 | ❌ | ✅ | ✅ |
| 微信支付 | ❌ | ❌ | ✅ |

**结论**：个人订阅号未认证状态下，`draft/add`（创建草稿）和 `freepublish/submit`（提交群发）这两个核心接口都用不了。**严格意义上的"API 全自动发布"在合规路径下走不通**。可走的有四条路：

| 路径 | 自动化程度 | 合规性 | 适合的情况 |
|---|---|---|---|
| A. 内容全自动化 + 发布人工点一下 | 高（90%） | ✅ 合规 | ★ 短期最推荐 |
| B. 浏览器自动化模拟后台操作 | 高（95%） | ⚠️ 灰色地带，有封号风险 | 不推荐 |
| C. 升级为认证订阅号 | 完全自动化 | ✅ 合规 | ★ 长期最推荐 |
| D. 迁移到视频号/小红书等更开放平台 | 完全自动化 | ✅ 合规 | 备选 |

下文重点展开 **A（短期）** 和 **C（长期）** 两条线。

---

## 二、推荐架构

整体流水线分两个阶段落地。**阶段一**在个人订阅号状态下跑通"内容生产 + 审核 + 半自动发布"，**阶段二**升级认证后无缝切换到"全自动发布"。

```
┌─────────────────────────────────────────────────────────────┐
│  阶段一：个人订阅号（半自动）                                  │
│                                                               │
│  [定时调度器]                                                 │
│       │                                                       │
│       ▼                                                       │
│  [选题模块]  ← 热点API / RSS / 主题词表                       │
│       │                                                       │
│       ▼                                                       │
│  [AI 生成]  ← LLM API（GPT/Claude/通义/GLM）                  │
│       │                                                       │
│       ▼                                                       │
│  [配图生成]  ← AI 图片 API / 素材库匹配                       │
│       │                                                       │
│       ▼                                                       │
│  [内容审核队列]                                                │
│       │  ┌── 通知推送到 飞书/钉钉/邮件（含预览链接）          │
│       │  └── 你点"通过" -> 进入待发布队列                      │
│       ▼                                                       │
│  [素材上传]  ← 微信 media/uploadimg API（个人号也能用）       │
│       │                                                       │
│       ▼                                                       │
│  [生成排版 HTML]  ← 自建模板引擎                              │
│       │                                                       │
│       ▼                                                       │
│  [推送发布清单]  ← 邮件/飞书给你一份"复制粘贴+点发布"指南     │
│       │                                                       │
│       ▼                                                       │
│  人工登录 mp.weixin.qq.com -> 粘贴 -> 发布                     │
└─────────────────────────────────────────────────────────────┘

                          │
                          │ 升级认证后切换
                          ▼

┌─────────────────────────────────────────────────────────────┐
│  阶段二：认证订阅号（全自动）                                  │
│                                                               │
│  [审核通过的内容]                                              │
│       │                                                       │
│       ▼                                                       │
│  [素材上传]  ← media/uploadimg                                │
│       │                                                       │
│       ▼                                                       │
│  [草稿创建]  ← draft/add ★认证后可用                          │
│       │                                                       │
│       ▼                                                       │
│  [群发提交]  ← freepublish/submit ★认证后可用                 │
│       │                                                       │
│       ▼                                                       │
│  [发布回执]  ← 通知 + 日志归档                                │
└─────────────────────────────────────────────────────────────┘
```

两条线的代码差异只在**最后两步**（草稿创建、群发提交），所以一次性把阶段一的代码写好，升级认证后改两个函数即可。

---

## 三、完整需求清单

### 3.1 账号与凭证类

| 项目 | 用途 | 获取方式 | 阶段一是否必需 |
|---|---|---|---|
| 微信公众号（个人订阅号） | 发布载体 | mp.weixin.qq.com 注册 | ✅ |
| AppID | API 调用身份 | 公众号后台 -> 设置 -> 开发 -> 基本配置 | ✅ |
| AppSecret | API 调用密钥 | 同上 | ✅ |
| IP 白名单 | 调用 API 的服务器 IP 必须在白名单内 | 后台 -> 基本配置 -> IP 白名单 | ✅ |
| 公众号认证（300元/年） | 解锁 draft/freepublish 接口 | 需企业/个体户主体 | ❌（阶段二必需） |
| LLM API Key | AI 生成文章 | OpenAI/Anthropic/阿里通义/智谱 | ✅ |
| AI 图片 API Key | 生成封面/插图 | DALL-E / 通义万相 / 智谱 CogView | ✅（可选） |
| 飞书/钉钉机器人 Webhook | 审核通知推送 | 飞书/钉钉群机器人配置 | ✅ |
| 邮箱 SMTP 密码 | 备用通知通道 | 邮箱服务商 | ✅（可选） |

### 3.2 服务器与运行环境类

| 项目 | 推荐配置 | 说明 |
|---|---|---|
| 服务器 | 1 核 2G 云服务器（阿里云/腾讯云轻量，约 50 元/月）或本地 NAS/树莓派 | 长期跑定时任务，IP 固定便于加白名单 |
| 操作系统 | Ubuntu 22.04 LTS | 长期支持版 |
| Python | 3.12+ | 主语言 |
| Node.js | 22+（可选，仅当用某些前端工具链） | 非必需 |
| 数据库 | SQLite（轻量起步）-> PostgreSQL（量大后） | 存文章、素材、发布记录 |
| 进程管理 | systemd 或 pm2 | 守护定时任务 |
| 日志 | loguru + logrotate | 滚动归档 |

### 3.3 Python 依赖包

```
# 核心
requests              # HTTP 调用
httpx                 # 异步 HTTP（可选）
wechatpy              # 微信公众号 Python SDK（推荐，封装完整）
python-dotenv         # 环境变量管理

# AI 调用
openai                # OpenAI / 兼容 OpenAI 协议的国产模型
anthropic             # Claude
zhipuai               # 智谱 GLM
dashscope             # 通义千问

# 内容处理
markdown              # Markdown -> HTML
pygments              # 代码高亮
beautifulsoup4        # HTML 解析
lxml                  # HTML 解析后端
pillow                # 图片处理

# 数据与调度
sqlalchemy            # ORM
apscheduler           # 定时任务调度
pytz                  # 时区

# 通知
yagmail               # 邮件发送
requests              # 飞书/钉钉 Webhook 直接 requests 即可

# 工具
python-dotenv
pydantic              # 配置校验
tenacity              # 重试
```

### 3.4 代码模块清单

```
wechat-publisher/
├── .env                      # 凭证配置（不入版本库）
├── .env.example              # 凭证示例
├── requirements.txt
├── config.py                 # 配置加载
├── main.py                   # 入口
│
├── scheduler/
│   └── jobs.py               # 定时任务定义（apscheduler）
│
├── content/
│   ├── topic_picker.py       # 选题：热点/RSS/主题词
│   ├── article_generator.py  # AI 文章生成
│   ├── image_generator.py    # AI 配图生成
│   └── html_formatter.py     # 排版模板引擎
│
├── review/
│   ├── queue.py              # 审核队列（SQLite）
│   └── notifier.py           # 飞书/钉钉/邮件通知
│
├── wechat/
│   ├── token.py              # access_token 获取与缓存
│   ├── material.py           # 素材上传（media/uploadimg）
│   ├── draft.py              # 草稿创建（阶段二启用）
│   └── publish.py            # 群发提交（阶段二启用）
│
├── db/
│   ├── models.py             # SQLAlchemy 模型
│   └── session.py            # 会话管理
│
├── templates/
│   ├── article.html.j2       # 文章 HTML 模板
│   └── digest.html.j2        # 摘要模板
│
└── logs/
    └── app.log
```

### 3.5 微信后台必做配置

1. **AppID / AppSecret**：在「设置 -> 开发 -> 基本配置」获取，AppSecret 只显示一次，必须保存
2. **IP 白名单**：把跑代码的服务器公网 IP 加进去，否则 access_token 接口会报 40164
3. **服务器配置（可选）**：阶段二启用 webhook 回调时需要，阶段一不需要
4. **自动回复**：阶段一可以作为辅助发布通道（关键词回复推送文章链接）

---

## 四、详细操作步骤

### 阶段一：个人订阅号状态下跑通半自动

#### 步骤 1：注册并配置公众号

1. 访问 https://mp.weixin.qq.com 注册个人订阅号（用个人微信号，每个身份证可注册 1 个）
2. 完成主体信息填写、绑定管理员微信号
3. 进入「设置 -> 开发 -> 基本配置」：
   - 记录 AppID
   - 生成并记录 AppSecret（**只显示一次，立刻保存到密码管理器**）
   - 在「IP 白名单」添加你的服务器公网 IP
4. 在「设置 -> 公众号设置」完善名称、头像、简介、自动回复

#### 步骤 2：准备服务器

```bash
# Ubuntu 22.04
sudo apt update && sudo apt install -y python3.12 python3.12-venv git

# 创建项目目录
mkdir -p ~/wechat-publisher && cd ~/wechat-publisher

# 创建虚拟环境
python3.12 -m venv venv
source venv/bin/activate

# 安装依赖
pip install wechatpy openai anthropic zhipuai dashscope \
            markdown beautifulsoup4 lxml pillow \
            sqlalchemy apscheduler pytz yagmail \
            pydantic tenacity python-dotenv loguru
```

#### 步骤 3：配置凭证

创建 `.env` 文件：

```bash
# 微信公众号
WECHAT_APP_ID=wx_your_appid
WECHAT_APP_SECRET=your_app_secret

# LLM（按你选的填一组）
OPENAI_API_KEY=sk-xxx
# ANTHROPIC_API_KEY=sk-ant-xxx
# ZHIPUAI_API_KEY=xxx
# DASHSCOPE_API_KEY=xxx

# AI 图片（可选）
DALLE_API_KEY=sk-xxx
# TONGYI_WANXIANG_KEY=xxx

# 通知
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=xxx
SMTP_HOST=smtp.qq.com
SMTP_USER=you@qq.com
SMTP_PASS=your_smtp_password
NOTIFY_EMAIL=you@example.com

# 调度
SCHEDULE_HOUR=8
SCHEDULE_MINUTE=0
```

`.env` 文件权限设为 600，并加入 `.gitignore`。

#### 步骤 4：实现核心模块

**4.1 access_token 获取与缓存**

```python
# wechat/token.py
import time
import threading
import requests
from config import config

_token_cache = {"value": None, "expires_at": 0}
_lock = threading.Lock()

def get_access_token() -> str:
    with _lock:
        if _token_cache["value"] and time.time() < _token_cache["expires_at"] - 300:
            return _token_cache["value"]
        url = "https://api.weixin.qq.com/cgi-bin/token"
        params = {
            "grant_type": "client_credential",
            "appid": config.WECHAT_APP_ID,
            "secret": config.WECHAT_APP_SECRET,
        }
        resp = requests.get(url, params=params, timeout=10).json()
        if "access_token" not in resp:
            raise RuntimeError(f"获取 access_token 失败: {resp}")
        _token_cache["value"] = resp["access_token"]
        _token_cache["expires_at"] = time.time() + resp["expires_in"]
        return resp["access_token"]
```

**4.2 上传图片素材**（个人订阅号也能用）

```python
# wechat/material.py
import requests
from .token import get_access_token

def upload_image(image_path: str) -> str:
    """上传图片到素材库，返回 URL（用于图文消息内嵌图）"""
    token = get_access_token()
    url = f"https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token={token}"
    with open(image_path, "rb") as f:
        resp = requests.post(url, files={"media": f}, timeout=30).json()
    if "url" not in resp:
        raise RuntimeError(f"上传图片失败: {resp}")
    return resp["url"]  # 这个 URL 可直接用在图文正文里
```

**4.3 AI 生成文章**

```python
# content/article_generator.py
from openai import OpenAI
from config import config

client = OpenAI(api_key=config.OPENAI_API_KEY)

def generate_article(topic: str, style: str = "通俗易懂") -> dict:
    prompt = f"""你是一个公众号作者。请按以下要求写一篇文章：
主题：{topic}
风格：{style}
要求：
1. 标题吸引人但不标题党
2. 开头 1 段引入
3. 正文分 3-5 个小节，每节有小标题
4. 结尾 1 段总结 + 互动引导
5. 字数 1500-2000

输出 JSON：{{"title": "...", "digest": "...", "content": "..."}}
"""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    return resp.choices[0].message.content  # JSON 字符串，调用方解析
```

**4.4 排版模板**

`templates/article.html.j2`：

```html
<section style="padding: 16px; font-size: 16px; line-height: 1.75; color: #333;">

  <h2 style="color: #1a1a1a; border-left: 4px solid #07c160; padding-left: 10px;">
    {{ section_title }}
  </h2>

  <p style="margin: 16px 0;">{{ paragraph }}</p>

  {% if image_url %}
  <p style="text-align: center; margin: 20px 0;">
    <img src="{{ image_url }}" style="max-width: 100%; border-radius: 8px;">
  </p>
  {% endif %}

</section>
```

**4.5 审核通知**

```python
# review/notifier.py
import requests
from config import config

def notify_feishu(title: str, preview_url: str, content_md: str):
    payload = {
        "msg_type": "interactive",
        "card": {
            "header": {"title": {"tag": "plain_text", "content": f"📝 待审核：{title}"}},
            "elements": [
                {"tag": "div", "text": {"tag": "lark_md", "content": content_md[:500] + "..."}},
                {
                    "tag": "action",
                    "actions": [
                        {"tag": "button", "text": {"tag": "plain_text", "content": "预览"},
                         "url": preview_url, "type": "primary"},
                    ],
                },
            ],
        },
    }
    requests.post(config.FEISHU_WEBHOOK, json=payload, timeout=10)
```

**4.6 调度器**

```python
# scheduler/jobs.py
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from config import config

def daily_publish_job():
    from content.topic_picker import pick_topic
    from content.article_generator import generate_article
    from content.image_generator import generate_cover
    from review.queue import enqueue_for_review
    from review.notifier import notify_feishu

    topic = pick_topic()
    article = generate_article(topic)
    cover = generate_cover(article["title"])
    enqueue_for_review(article, cover)
    notify_feishu(article["title"], preview_url="...", content_md=article["content"])

def start():
    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(
        daily_publish_job,
        CronTrigger(hour=config.SCHEDULE_HOUR, minute=config.SCHEDULE_MINUTE),
        id="daily_publish",
    )
    scheduler.start()
```

**4.7 入口**

```python
# main.py
from scheduler.jobs import start

if __name__ == "__main__":
    start()
```

#### 步骤 5：人工发布环节（阶段一特有）

每天定时任务跑完后，你会收到飞书/钉钉通知，里面有：

1. 文章标题和摘要
2. 预览链接（你自建的简易 Web 预览页，部署在同一服务器）
3. 排版好的 HTML 全文（可直接复制）

**人工操作流程**（约 2 分钟）：

1. 登录 https://mp.weixin.qq.com（手机扫码）
2. 点「创作 -> 图文消息 -> 新建图文」
3. 把 AI 生成的标题、封面图、摘要、HTML 正文粘贴进去
4. 点「保存并发送」（个人订阅号需要管理员手机确认）

#### 步骤 6：守护进程

```bash
# 用 systemd 守护
sudo tee /etc/systemd/system/wechat-publisher.service << 'EOF'
[Unit]
Description=WeChat Publisher
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/wechat-publisher
ExecStart=/home/ubuntu/wechat-publisher/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now wechat-publisher
sudo systemctl status wechat-publisher
```

---

### 阶段二：升级认证后切换全自动

#### 步骤 7：升级公众号

1. 个人订阅号无法直接认证。需要：
   - 选项 A：用个体工商户/企业营业执照注册新的订阅号，申请微信认证（300元/年）
   - 选项 B：迁移个人订阅号到企业主体（通过「公众号迁移」功能，迁移后变为可认证状态）
2. 完成认证后，在「设置 -> 开发 -> 接口权限」确认「群发」「草稿箱」接口已开通

#### 步骤 8：启用 draft 和 freepublish 模块

```python
# wechat/draft.py
import requests
from .token import get_access_token

def add_draft(article: dict, thumb_media_id: str) -> str:
    """创建草稿，返回 media_id"""
    token = get_access_token()
    url = f"https://api.weixin.qq.com/cgi-bin/draft/add?access_token={token}"
    payload = {
        "articles": [{
            "title": article["title"],
            "author": article.get("author", ""),
            "digest": article["digest"],
            "content": article["html_content"],
            "thumb_media_id": thumb_media_id,
            "need_open_comment": 0,
            "only_fans_can_comment": 0,
        }]
    }
    resp = requests.post(url, json=payload, timeout=30).json()
    if "media_id" not in resp:
        raise RuntimeError(f"创建草稿失败: {resp}")
    return resp["media_id"]
```

```python
# wechat/publish.py
import requests
from .token import get_access_token

def submit_freepublish(media_id: str) -> int:
    """提交群发，返回 publish_id"""
    token = get_access_token()
    url = f"https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token={token}"
    resp = requests.post(url, json={"media_id": media_id}, timeout=30).json()
    if "publish_id" not in resp:
        raise RuntimeError(f"群发提交失败: {resp}")
    return resp["publish_id"]
```

注意：封面图（thumb）必须上传为**永久素材**（`media/upload` 而非 `media/uploadimg`），返回 `media_id` 而非 URL。

```python
# wechat/material.py 增加
def upload_permanent_image(image_path: str) -> str:
    """上传永久素材，返回 media_id（用作封面）"""
    token = get_access_token()
    url = f"https://api.weixin.qq.com/cgi-bin/material/add_material?access_token={token}&type=image"
    with open(image_path, "rb") as f:
        resp = requests.post(url, files={"media": f}, timeout=30).json()
    if "media_id" not in resp:
        raise RuntimeError(f"上传永久素材失败: {resp}")
    return resp["media_id"]
```

#### 步骤 9：把人工审核环节改为「自动通过」或「Webhook 触发」

把 `daily_publish_job` 的尾部从「enqueue + 通知」改成：

```python
thumb_media_id = upload_permanent_image(cover)
draft_media_id = add_draft(article, thumb_media_id)
publish_id = submit_freepublish(draft_media_id)
notify_feishu(f"✅ 已自动发布：{article['title']}", ...)
```

如果想保留人工审核但自动发布，可以在飞书卡片上加「通过/拒绝」按钮，点击后触发你自建的 Webhook 接口，Webhook 内部调用 `add_draft + submit_freepublish`。

#### 步骤 10：处理群发频率限制

- 认证订阅号每天 1 次群发额度，避免设置每小时跑的定时任务
- 代码里加锁，防止当天重复提交
- 监控 `freepublish/submit` 的错误码 45009（reach max daily limit）

---

## 五、风险提示

1. **个人订阅号无法升级认证**：个人主体注册的订阅号不能直接做微信认证，必须迁移到企业/组织主体。迁移费用 300 元（迁移公证费另算，约 200-500 元）

2. **浏览器自动化方案不要用**：用 Playwright/Selenium 模拟登录 mp.weixin.qq.com 看似能绕过 API 限制，但：
   - 个人订阅号后台只能扫码登录，无法完全无人值守
   - 微信有行为检测，频繁自动化操作会触发风控甚至封号
   - 违反《微信公众平台运营规范》，封号不可申诉

3. **access_token 安全**：每 2 小时过期，必须缓存；多实例部署时用 Redis 共享 token，否则并发刷新会导致旧 token 失效

4. **IP 白名单**：服务器换 IP 必须同步更新白名单，否则 API 报 40164

5. **内容合规**：AI 生成的内容必须过一遍微信的内容审核规则，避免政治、医疗、金融等敏感领域无资质发布。建议在生成环节加关键词过滤

6. **群发额度**：认证订阅号每天 1 次、服务号每月 4 次，超出会被限制。代码里必须做配额管理

7. **图文消息字数**：单条图文正文建议 20000 字以内，超出会被截断

8. **图片大小**：单张图片 ≤ 10MB，建议先压缩到 1MB 以内再上传

---

## 六、最快跑通的最小可行版本（MVP）

如果只想先验证流程，2 天内能跑起来的极简版：

1. 一台云服务器（或本地电脑 + cron）
2. 注册个人订阅号，拿到 AppID/AppSecret，加 IP 白名单
3. 写一个 Python 脚本，每天定时：
   - 调用 LLM API 生成一篇 1500 字文章
   - 把 Markdown 转成 HTML
   - 用 SMTP 发到自己邮箱（标题、摘要、HTML 全文、封面图附件）
4. 收到邮件后，登录公众号后台粘贴发布

这个版本连微信 API 都不用调，先验证"AI 生成 -> 人工发布"的节奏，跑顺了再加素材上传、审核通知、草稿/群发 API。

---

## 七、参考文档

- 微信公众平台开发文档：https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html
- 草稿箱接口：https://developers.weixin.qq.com/doc/offiaccount/Draft_Box/Add_draft.html
- 群发接口：https://developers.weixin.qq.com/doc/offiaccount/Publish/Submit.html
- 素材管理：https://developers.weixin.qq.com/doc/offiaccount/Asset_Management/Adding_Permanent_Assets.html
- wechatpy 文档：https://wechatpy.readthedocs.io/

---

## 八、行动建议

基于个人订阅号 + AI 生成 + 定时触发的场景，建议按这个顺序推进：

1. **本周**：跑通 MVP 版本（步骤六），验证 AI 生成质量
2. **下周**：按阶段一完整方案搭起来，把素材上传和审核通知做掉，每天省下登录后台的时间
3. **下个月**：决定是否注册个体工商户（成本低）-> 用企业主体注册认证订阅号 -> 切换到阶段二全自动
4. **可选**：如果内容方向适合视频号，可以考虑同步分发到视频号（开放接口更友好）

最关键的决策点是：**愿不愿意为"全自动"付出 300 元/年认证费 + 个体户注册成本**。如果愿意，走阶段二；如果不愿意，阶段一的半自动已经能解决 90% 的工作量。

---

原笔记来源：微信公众号全自动发布方案
