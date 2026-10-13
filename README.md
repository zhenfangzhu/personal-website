# 朱振方 / Zhenfang Zhu

**个人网站 · Personal website**

[zhuzhenfang.com](https://zhuzhenfang.com/) · [Anthesis 研究网站](https://anthesis.ac.cn/) · [GitHub](https://github.com/zhenfangzhu)

我是朱振方，本科毕业于中国科学技术大学，Redding AI 联合创始人。这里记录我的自述、随笔与阅读笔记；关于 AI Agent、人的自主权，以及人与 AI 长期共同成长的研究，见 [Anthesis](https://anthesis.ac.cn/)。

I am Zhenfang Zhu, a graduate of the University of Science and Technology of China and a co-founder of Redding AI. This is my personal website, containing autobiographical writing, essays, and reading notes. My research on AI agents, human agency, and long-term human–AI growth is collected at [Anthesis](https://anthesis.ac.cn/en/).

## 阅读入口 / Read

- [个人主页 / Home](https://zhuzhenfang.com/)
- [关于我 / About](https://zhuzhenfang.com/about/)
- [回声：阅读与观看笔记 / Reading and viewing notes](https://zhuzhenfang.com/echoes/)
- [Anthesis 研究笔记 / Research notes](https://anthesis.ac.cn/notes.html)

## 本地预览 / Local preview

本仓库包含网站源码与内容，使用 HTML、CSS 和 JavaScript，发布于 GitHub Pages。使用 Python 3，在仓库根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8000/>。静态页面预览无需安装前端依赖；依赖外部服务的功能仍需联网及相应配置。

This repository contains the website source and content, published through GitHub Pages. To preview the static pages, run the command above with Python 3 from the repository root. Features backed by external services require network access and their corresponding configuration.

## 内容维护 / Content maintenance

| 路径 / Path | 用途 / Purpose |
| --- | --- |
| `index.html`、`zh/`、`en/` | 首页及语言版本 / Homepages and language variants |
| `about/` | 个人介绍 / About |
| `echoes/` | 阅读与观看笔记 / Reading and viewing notes |
| `static/`、`media/` | 样式、脚本与媒体资源 / Styles, scripts, and media |
| `scripts/` | 内容生成与部署通知工具 / Content generation and deployment notification tools |

维护回声内容时，请参考 [echoes/README.md](echoes/README.md)，修改源内容后生成页面，不直接编辑生成结果。仓库协作约定见 [AGENTS.md](AGENTS.md)。

For the notes publishing workflow, see [echoes/README.md](echoes/README.md). Edit the source content and regenerate pages rather than editing generated output.

## 反馈与联系 / Feedback and contact

页面问题、失效链接或文字更正可通过 [Issues](https://github.com/zhenfangzhu/zhuzhenfang.com/issues)反馈，并附上相关网址。

For website issues, broken links, or corrections, please open an issue with the relevant URL.

[Email](mailto:zhuzhenfang@ustc.edu) · [GitHub](https://github.com/zhenfangzhu) · [Anthesis](https://anthesis.ac.cn/)
