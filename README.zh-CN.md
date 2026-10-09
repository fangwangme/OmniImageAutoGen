# OmniImageAutoGen

[English](README.md) | [简体中文](README.zh-CN.md)

一个用于 ChatGPT 和 Gemini 批量生图的 Chrome 扩展。选择一个平台、加载 JSON 任务文件后，扩展会在同一会话内串行生成图片，通过网站原生下载入口获取图片，并按指定名称保存到 `Output/<platform>/`。

![Screenshot](docs/images/image-zh.png)

## 功能

- 支持 ChatGPT 和 Gemini，每次运行一个平台。
- 新建会话并自动捕获链接，或继续指定链接的已有会话。
- 校验 JSON 必填字段、保留文件名，以及安全化后忽略大小写的重名。
- 跳过已有输出，重跑时只处理缺失图片。
- 获取原图，并按目标扩展名真正转码为 PNG/JPEG。
- Gemini 自动选择页面比例；ChatGPT 使用提示词中的比例。
- 单张图片重试、仅下载重试及任务 watchdog。
- 显示阶段进度、已用与剩余时间，日志支持复制和清空。
- 设置自动保存，支持 English/简体中文及系统亮色、暗色主题。
- 字体随扩展本地打包，界面不加载远程资源。

## 安装

从 [Releases](https://github.com/fangwangme/OmniImageAutoGen/releases) 下载 ZIP 并解压，在 Chrome 的 `chrome://extensions/` 开启**开发者模式**，加载已解压的目录。

从源码构建：

```bash
git clone https://github.com/fangwangme/OmniImageAutoGen.git
cd OmniImageAutoGen
bun install
bun run build
```

在 `chrome://extensions/` 点击**加载已解压的扩展程序**，选择 `.local/dist`。点击扩展图标打开侧边栏。

## 运行前准备

1. 在 Chrome 中登录所选平台。
2. 关闭 Chrome 下载设置中的**下载前询问每个文件的保存位置**。
3. 打开扩展**设置**。将**源文件夹**设为 Chrome 自动下载的目录，将**输出文件夹**设为最终图片目录。
4. 授予两个目录读写权限。界面只显示目录名称，例如 `Downloads`、`Output`。
5. 按需调整语言、比例和超时；修改后自动保存。

输出目录下会分别创建 `chatgpt/` 和 `gemini/` 子目录。下载源文件仅在输出写入并核验成功后删除。重置会保留目录句柄和已输出的图片。

## 使用

准备 JSON 数组：

```json
[
  { "name": "sunset_beach.png", "prompt": "Editorial illustration, 16:9. A beach at sunset." },
  { "name": "mountain_lake.jpg", "prompt": "Editorial illustration, 16:9. A mountain lake." }
]
```

每项的 `name` 和 `prompt` 必须是非空字符串。`timestamp`、`subtitle_ref` 等额外字段会被忽略。发送格式为 `name: <安全文件名>\nprompt: <原始 prompt>`，prompt 保持原样。

1. 选择 **ChatGPT** 或 **Gemini**。
2. 选择**新建会话**或**已有会话**。新建会话从平台首页开始；Gemini 会沿用当前活动标签页的账号前缀，例如 `/u/<n>/`。已有会话需要所选平台的具体会话链接。
3. 选择 JSON 文件并修复列出的校验问题。
4. 检查目录权限，然后点击**开始**。
5. 查看生成、下载、保存阶段；点击**停止**可取消当前尝试。
6. 完成后可复制已捕获的会话链接，或点击**继续剩余**在该会话中重跑缺失图片。

扩展会在任务和重试之间重建标签页。已有文件名的比较忽略大小写。Gemini 的比例设置会操作页面控件；ChatGPT 的比例由 prompt 表达。

## 常见问题

- **未就绪：**修复就绪检查列出的会话链接、任务文件或目录权限问题。权限过期时点击**重新授权**。
- **下载超时：**确认源文件夹与 Chrome 下载目录一致，并关闭下载前询问保存位置。网站原图下载可能较慢，默认下载时限为 120 秒。
- **没有捕获会话链接：**打开网站会话，将具体会话链接填入**已有会话**。
- **连续生成失败：**检查网站当前界面和任务提示词，复制日志用于诊断。
- **全部图片已保存：**所选平台子目录中已有全部输出。
- **全部重置：**清空任务、设置和已存会话链接，取消运行；保留目录句柄及输出图片。

参阅[技术文档](docs/README.md)、[架构](docs/ARCHITECTURE.md)和[双平台规格](docs/specs/dual-platform.md)。

## 开发

```bash
bun run typecheck
bun run build
bun run test:bdd:quiet
```

构建产物位于 `.local/dist`，本地预览证据及发布包存放在 `.local/`。预览与手工验收步骤见[测试与质量](docs/testing-and-quality.md)。

## 许可与贡献

MIT License。欢迎在 [OmniImageAutoGen](https://github.com/fangwangme/OmniImageAutoGen) 提交 Issue 和 Pull Request。
