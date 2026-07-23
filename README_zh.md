# Tabularium

Tabularium 是一个开放的、基于文件的知识工作空间，适用于人类和 AI。
它将 Markdown、电子表格、日历、Office 文档、图表、书签和数据分析整合到统一的浏览器界面中。

## 快速开始

```bash
git clone https://github.com/BeesNestInc/tabularium.git
cd tabularium
npm run setup
npm start
```

打开 http://localhost:8888。

## 功能

- **知识库 API**: 文件树浏览、Markdown/各种文件查看与编辑
- **多根目录**: 将多个目录合并为一个树形结构
- **SQL 执行**: 内联 DuckDB / PostgreSQL 查询
- **Markdown 渲染**: Prism.js 语法高亮、Mermaid 图表
- **draw.io 图表**: 在浏览器中编辑、导出 SVG
- **CSV**: 内联电子表格编辑
- **WOPI 集成**: 通过 Collabora Online 编辑 Office 文档
- **书签管理**: 保存 URL，自动获取图标/OGP 缩略图
- **日历**: 查看和编辑 iCal/YAML 日历文件

## 文档

- [API 参考](documents/en/api.md)
- [配置](documents/en/configuration.md)
- [依赖库](documents/en/dependencies.md)
- [使用指南](documents/en/usage.md)

## 语言

| 区域设置 | 语言 | 自动检测 |
|---|---|---|
| `en` | [English](README.md) | `Accept-Language: en` |
| `ja` | [日本語](README_ja.md) | `Accept-Language: ja` |
| `zh` | 简体中文 | `Accept-Language: zh` |

## 项目结构

```
tabularium/
├── server/               # 服务端（Node.js + Fastify）
├── client/               # SPA（Svelte + Vite）
├── documents/            # 文档（en/ja）
├── public/               # SPA 构建输出
└── package.json
```

## 许可证

AGPL-3.0-or-later
